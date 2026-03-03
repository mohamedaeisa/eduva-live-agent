/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 * 
 * Compass Snapshot Builder
 * 
 * PURPOSE: Build precomputed, UI-ready Compass view from subject health.
 * 
 * ⚠️ NO FORMULAS HERE — only data projection
 * ⚠️ NO CALCULATIONS — reads pre-aggregated data
 * ⚠️ Triggered by subject aggregator, NOT by UI
 */

import { db } from '../firebaseConfig';
// 🔒 FIX: Import storage service to resolve actual file fingerprints
import { getLocalAtoms } from '../storageService';
import type {
    AtomSignals,
    SubjectHealth,
    CompassSnapshot,
    RadarSignal,
    RadarPriority,
    RadarSignalType,
    RecommendedAction,
    RecommendedActionType,
    WeakCluster,
    MaterialCoverage,
    MaterialAtomProgress,
    FileCoverage,
    FileAtomCoverage,
} from './types';
import { LIS_SCHEMA_VERSION } from './constants';
import { updateGrowthTimeline } from './timelineBuilder';

// ==================== COMPASS SNAPSHOT BUILDER ====================

/**
 * Builds complete Compass snapshot from subject health and atom signals.
 * 
 * This is PURE PROJECTION — no calculations, only formatting.
 * 
 * @param studentId - Student ID
 * @param subjectId - Subject ID (normalized)
 */
export async function buildCompassSnapshot(
    studentId: string,
    subjectId: string
): Promise<void> {
    console.log(`[LIS_COMPASS] Building snapshot for ${studentId}/${subjectId}`);

    // ========== FETCH PRE-AGGREGATED DATA ==========

    // 1. Subject Health (pre-calculated by subjectAggregator)
    const healthDoc = await db
        .collection('student_subject_health')
        .doc(`${studentId}_${subjectId}`)
        .get();

    if (!healthDoc.exists) {
        console.warn(`[LIS_COMPASS] No subject health found for ${subjectId}`);
        return;
    }

    const health = healthDoc.data() as SubjectHealth;

    // 2. All atom signals for this subject (pre-calculated by atomAggregator)
    const atomsSnapshot = await db
        .collection('student_atom_signals')
        .where('studentId', '==', studentId)
        .where('subject', '==', subjectId)
        .get();

    const atoms: AtomSignals[] = atomsSnapshot.docs.map(doc => doc.data() as AtomSignals);

    if (atoms.length === 0) {
        console.warn(`[LIS_COMPASS] No atoms found for ${subjectId}`);
        return;
        return;
    }

    // ========== RESOLVE FILE FINGERPRINTS (FIX) ==========
    // We need to map atomId -> fileHash (sourceDocumentId) to match training_sources
    const localAtoms = await getLocalAtoms(studentId);
    const atomFileMap = new Map<string, { fileHash: string, fileName?: string }>();

    localAtoms.forEach(a => {
        if (a.core && a.core.metadata && a.core.metadata.sourceDocumentId) {
            atomFileMap.set(a.atomId, {
                fileHash: a.core.metadata.sourceDocumentId,
                fileName: (a.core.metadata as any).sourceTitle // Use cached title if available
            });
        }
    });

    console.log(`[LIS_COMPASS] Resolved ${atomFileMap.size} atom-to-file mappings from local cache.`);

    const snapshotRef = db
        .collection('student_compass_snapshots')  // ✅ FIXED: plural to match UI
        .doc(`${studentId}_${subjectId}`);

    // We need to merge defined signals with previous ones to prevent flapping
    let previousSignals: RadarSignal[] = [];
    const prevSnapDoc = await snapshotRef.get();
    if (prevSnapDoc.exists) {
        const prevData = prevSnapDoc.data() as CompassSnapshot;
        if (prevData && Array.isArray(prevData.radarSignals)) {
            previousSignals = prevData.radarSignals;
        }
    }

    // ========== PROJECT DATA (NO CALCULATIONS) ==========

    // 3. Group atoms by file (Using resolved fingerprints)
    const fileGroups = await groupAtomsByFile(atoms, atomFileMap);

    // 4. Detect weak clusters
    const weakClusters = detectWeakClusters(atoms);

    // 5. Generate radar signals (Stateful)
    const newSignals = generateRadarSignals(atoms, health);
    const radarSignals = mergeSignals(previousSignals, newSignals);

    // 6. Determine recommended action
    const recommendedAction = determineRecommendedAction(atoms, health, weakClusters);

    // 7. Get Recent Learning Signals (Last 24h)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentLearningSignals = atoms
        .filter(a => a.updatedAt > oneDayAgo)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 50); // Cap at 50 to prevent bloat

    // ========== BUILD SNAPSHOT ==========

    const snapshot: CompassSnapshot = {
        // Identity
        studentId,
        subjectId,
        snapshotId: `${studentId}_${subjectId}_${Date.now()}`,
        generatedAt: Date.now(),

        // Top-Level Metrics (READ FROM HEALTH, NOT CALCULATED)
        contentCoverage: health.coverage,
        learningProgress: health.subjectMastery,
        healthScore: health.health,
        healthStatus: health.status,
        trendClassification: health.trendClassification,
        totalStudyTimeSec: health.totalStudyTimeSec,

        // Atom Counts
        totalAtoms: health.totalAtoms || 0,
        masteredAtoms: health.masteredAtoms || 0,
        weakAtoms: health.weakAtoms || 0,

        // Learning Materials
        materials: fileGroups,
        weakClusters,
        radarSignals,
        recentLearningSignals, // ✅ ADDED
        recommendedAction,

        // Version
        schemaVersion: LIS_SCHEMA_VERSION,
    };

    // ========== SAVE SNAPSHOT ==========

    await snapshotRef.set(snapshot);

    console.log(`[LIS_COMPASS] Snapshot saved: ${fileGroups.length} materials, ${radarSignals.length} signals, ${recentLearningSignals.length} recent updates`);

    // ========== TRIGGER TIMELINE UPDATE ==========

    await updateGrowthTimeline(studentId, subjectId, health);
}

// ==================== FILE GROUPING (PROJECTION) ====================

/**
 * Groups atoms by their source material (PDF, video, lesson, etc.).
 * 
 * This is PROJECTION — fetches material metadata, no calculations.
 */

async function groupAtomsByFile(
    atoms: AtomSignals[],
    lookupMap: Map<string, { fileHash: string, fileName?: string }>
): Promise<MaterialCoverage[]> {
    // Group by file (fetch from training_sources or atoms metadata)
    // FIX: Use lookupMap to invoke actual fileHash

    const fileMap = new Map<string, AtomSignals[]>();
    const fileNameMap = new Map<string, string>(); // Helper to track names

    for (const atom of atoms) {
        // Extract file ID from resolved map, or fallback to "unknown"
        const mapping = lookupMap.get(atom.atomId);
        const fileId = mapping?.fileHash || 'unknown_source';

        if (mapping?.fileName) {
            fileNameMap.set(fileId, mapping.fileName);
        }

        if (!fileMap.has(fileId)) {
            fileMap.set(fileId, []);
        }
        fileMap.get(fileId)!.push(atom);
    }

    // Project to MaterialCoverage format
    const materials: MaterialCoverage[] = [];

    for (const [fileId, fileAtoms] of fileMap.entries()) {
        const masteredCount = fileAtoms.filter(
            a => a.masteryLevel === 'STRONG'
        ).length;

        const coveragePercent = Math.round((masteredCount / fileAtoms.length) * 100);
        const masteryPercent = Math.round(
            fileAtoms.reduce((sum, a) => sum + a.mastery, 0) / fileAtoms.length
        );

        materials.push({
            materialId: fileId,
            materialName: fileNameMap.get(fileId) || `File ${fileId.substring(0, 6)}...`, // Use real name if available
            materialType: 'PDF', // TODO: Detect from source metadata
            coveragePercent,
            masteryPercent,
            atoms: fileAtoms.map(a => ({
                atomId: a.atomId,
                conceptTag: `Concept ${a.atomId.substring(0, 6)}`, // TODO: Fetch from global_atoms
                mastery: a.mastery,
                masteryLevel: a.masteryLevel,
                stability: a.stability,
            })),
        });
    }

    return materials;
}

// ==================== WEAK CLUSTER DETECTION (PROJECTION) ====================

/**
 * Detects clusters of weak/partial atoms.
 * 
 * This is PROJECTION — groups weak atoms, no recalculation.
 */
function detectWeakClusters(atoms: AtomSignals[]): WeakCluster[] {
    const weakAtoms = atoms.filter(
        a => a.masteryLevel === 'WEAK' || a.masteryLevel === 'PARTIAL'
    );

    if (weakAtoms.length === 0) return [];

    // Group by first 6 chars of atomId (topic/chapter proxy)
    const clusterMap = new Map<string, AtomSignals[]>();

    for (const atom of weakAtoms) {
        const topic = atom.atomId.substring(0, 6);
        if (!clusterMap.has(topic)) {
            clusterMap.set(topic, []);
        }
        clusterMap.get(topic)!.push(atom);
    }

    // Project to WeakCluster format
    const clusters: WeakCluster[] = [];

    for (const [topic, clusterAtoms] of clusterMap.entries()) {
        if (clusterAtoms.length < 2) continue; // Ignore single weak atoms

        const avgMastery = Math.round(
            clusterAtoms.reduce((sum, a) => sum + a.mastery, 0) / clusterAtoms.length
        );

        clusters.push({
            topic: `Topic ${topic}`, // TODO: Fetch topic name from curriculum
            atomIds: clusterAtoms.map(a => a.atomId),
            avgMastery,
        });
    }

    // Sort by severity (lowest mastery first)
    return clusters.sort((a, b) => a.avgMastery - b.avgMastery);
}

// ==================== RADAR SIGNAL GENERATION (PROJECTION) ====================

/**
 * Generates radar signals from atom states and health.
 * 
 * This is PROJECTION — interprets states, no recalculation.
 */
function generateRadarSignals(
    atoms: AtomSignals[],
    health: SubjectHealth
): RadarSignal[] {
    const signals: RadarSignal[] = [];

    // Signal 1: REPAIR if many weak atoms
    const weakAtoms = atoms.filter(a => a.masteryLevel === 'WEAK');
    if (weakAtoms.length >= 3) {
        signals.push({
            signalId: `repair_${Date.now()}`,
            type: 'REPAIR',
            priority: 'HIGH',
            title: 'Weak Areas Detected',
            description: `${weakAtoms.length} concepts need repair`,
            actionLabel: 'Start Repair Mode',
            atomIds: weakAtoms.map(a => a.atomId),
        });
    }

    // Signal 2: EXPAND if good mastery but low coverage
    if (health.subjectMastery >= 70 && health.coverage < 50) {
        signals.push({
            signalId: `expand_${Date.now()}`,
            type: 'EXPAND',
            priority: 'MEDIUM',
            title: 'Ready to Expand',
            description: 'Strong foundation, explore new topics',
            actionLabel: 'Expand Knowledge',
            atomIds: atoms.filter(a => a.masteryLevel === 'UNKNOWN').map(a => a.atomId),
        });
    }

    // Signal 3: CHALLENGE if strong mastery
    const strongAtoms = atoms.filter(a => a.masteryLevel === 'STRONG');
    if (strongAtoms.length >= 5) {
        signals.push({
            signalId: `challenge_${Date.now()}`,
            type: 'CHALLENGE',
            priority: 'LOW',
            title: 'Challenge Yourself',
            description: `${strongAtoms.length} concepts mastered`,
            actionLabel: 'Take Challenge',
            atomIds: strongAtoms.map(a => a.atomId),
        });
    }

    // Signal 4: CELEBRATE if improving trend
    if (health.trendClassification === 'improving') {
        signals.push({
            signalId: `celebrate_${Date.now()}`,
            type: 'CELEBRATE',
            priority: 'LOW',
            title: 'Great Progress!',
            description: 'Your learning is trending up',
            actionLabel: 'View Progress',
            atomIds: [],
        });
    }

    return signals;
}

// ==================== SIGNAL MERGING (STATEFUL) ====================

/**
 * Merges previous and new signals to prevent flapping.
 * Keeps persistent signals until they expire or are overridden.
 */
function mergeSignals(prev: RadarSignal[], current: RadarSignal[]): RadarSignal[] {
    const merged = new Map<string, RadarSignal>();

    // 1. Add new signals first (they take precedence for updates)
    for (const sig of current) {
        // Use type as key to ensure only one signal of each type exists active
        merged.set(sig.type, sig);
    }

    // 2. Retain CELEBRATE signals for 3 days if not replaced
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const sig of prev) {
        if (sig.type === 'CELEBRATE') {
            // Check if signal is stale using timestamp in ID (e.g., celebrate_123456789)
            const parts = sig.signalId.split('_');
            const ts = parseInt(parts[1] || '0');

            if (now - ts < threeDaysMs && !merged.has('CELEBRATE')) {
                // Keep the celebration alive!
                merged.set('CELEBRATE', sig);
            }
        }
    }

    return Array.from(merged.values());
}

// ==================== RECOMMENDED ACTION (PROJECTION) ====================

/**
 * Determines the single most important recommended action.
 * 
 * This is PROJECTION — priority logic, no recalculation.
 */
function determineRecommendedAction(
    atoms: AtomSignals[],
    health: SubjectHealth,
    weakClusters: WeakCluster[]
): RecommendedAction {
    // Priority 1: REPAIR if critical health or weak clusters
    if (health.status === 'CRITICAL' || weakClusters.length > 0) {
        const weakAtomIds = atoms.filter(a => a.masteryLevel === 'WEAK').map(a => a.atomId);
        return {
            type: 'REPAIR',
            label: 'Repair Weak Areas',
            atomIds: weakAtomIds,
            rationale: 'Focus on strengthening foundational concepts',
        };
    }

    // Priority 2: EXPAND if good health but low coverage
    if (health.coverage < 60) {
        const unknownAtomIds = atoms.filter(a => a.masteryLevel === 'UNKNOWN').map(a => a.atomId);
        return {
            type: 'EXPAND',
            label: 'Explore New Topics',
            atomIds: unknownAtomIds,
            rationale: 'Build broader subject knowledge',
        };
    }

    // Priority 3: CHALLENGE if high mastery
    if (health.subjectMastery >= 80) {
        const strongAtomIds = atoms.filter(a => a.masteryLevel === 'STRONG').map(a => a.atomId);
        return {
            type: 'CHALLENGE',
            label: 'Test Your Mastery',
            atomIds: strongAtomIds,
            rationale: 'Push to higher-order thinking',
        };
    }

    // Default: REVIEW
    return {
        type: 'REVIEW',
        label: 'Review & Practice',
        atomIds: atoms.map(a => a.atomId),
        rationale: 'Continue building understanding',
    };
}

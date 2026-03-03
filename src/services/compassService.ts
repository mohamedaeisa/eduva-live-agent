
import {
  SubjectCompassData, FileCoverage, AtomCoverage, WeakCluster,
  CompassAction, AtomViewModel, AtomCore, SubjectHealthState, StudentAtomSummary, NodeWithMastery
} from '../types';
import { DashboardState } from '../components/dashboard/types';
import { getLocalAtoms, getLocalTrainingSources } from './storageService';
import { fetchAtomsForSession } from './hydrationService';
import { getStudentAtomSignals } from './telemetryBrainService'; // Updated import
import { db } from './firebaseConfig';
import { logger } from '../utils/logger';
import { normalizeSubjectName } from '../utils/subjectUtils';
import { AtomSignals } from './lis/types';

export const computeFileCoverage = async (
  materialId: string,
  materialName: string | undefined,
  atoms: AtomCore[],
  signals: AtomSignals[], // Changed from StudentAtomSummary[]
  status?: string
): Promise<FileCoverage> => {
  const safeMaterialName = materialName || 'Linked Material';

  const atomCoverages: AtomCoverage[] = atoms.map(atom => {
    const signal = signals.find(s => s.atomId === atom.atomId);

    // Default to UNKNOWN / 0 if no signal found
    let level: AtomCoverage['masteryLevel'] = signal ? signal.masteryLevel : 'UNKNOWN';
    const score = signal ? signal.mastery / 100 : 0; // Convert 0-100 to 0-1

    return {
      atomId: atom.atomId,
      conceptTag: atom.metadata.conceptTag,
      masteryLevel: level,
      masteryScore: Math.round(score * 100)
    };
  });

  // Calculate coverage based on atoms that have been attempted (not UNKNOWN)
  const attemptedAtoms = atomCoverages.filter(a => a.masteryLevel !== 'UNKNOWN');
  const coveragePercent = atoms.length > 0
    ? Math.round((attemptedAtoms.length / atoms.length) * 100)
    : 0;

  // 🔒 NEW: Load curriculum map for this file
  let curriculumMap: FileCoverage['curriculumMap'] = undefined;

  try {
    const mapSnap = await db.collection('global_curriculum_maps')
      .where('docFingerprint', '==', materialId)
      .limit(1)
      .get();

    if (!mapSnap.empty) {
      const mapData = mapSnap.docs[0].data();
      const nodes = mapData.nodes || [];

      // 🔥 LOCAL-FIRST: Check local atoms first, fallback to global_atoms
      logger.orchestrator(`[COMPASS_MAP] Checking atoms: local=${atoms.length}`);

      let atomsByNode = new Map<string, AtomCoverage[]>();

      // Try local atoms first
      if (atomCoverages.length > 0 && atoms.length > 0) {
        logger.orchestrator(`[COMPASS_MAP] Using ${atomCoverages.length} local atoms`);
        atomCoverages.forEach(atom => {
          const sourceAtom = atoms.find(a => a.atomId === atom.atomId);
          const nodeId = sourceAtom?.metadata.curriculumNodeId;
          if (nodeId) {
            if (!atomsByNode.has(nodeId)) atomsByNode.set(nodeId, []);
            atomsByNode.get(nodeId)!.push(atom);
          }
        });
      }

      // Fallback to global_atoms if no local atoms found
      if (atomsByNode.size === 0) {
        logger.orchestrator(`[COMPASS_MAP] No local atoms, querying global_atoms...`);

        const globalAtomsSnap = await db.collection('global_atoms')
          .where('originDocFingerprint', '==', materialId)
          .get();

        logger.orchestrator(`[COMPASS_MAP] Found ${globalAtomsSnap.docs.length} in global_atoms`);

        globalAtomsSnap.docs.forEach(doc => {
          const atomData = doc.data();
          const nodeId = atomData.metadata?.curriculumNodeId;
          const atomId = atomData.atomId || doc.id;

          if (nodeId) {
            const signal = signals.find(s => s.atomId === atomId);
            const level = signal ? signal.masteryLevel : 'UNKNOWN';
            const score = signal ? signal.mastery / 100 : 0;

            const atomCoverage: AtomCoverage = {
              atomId,
              conceptTag: atomData.metadata?.conceptTag || 'Unknown',
              masteryLevel: level,
              masteryScore: Math.round(score * 100)
            };

            if (!atomsByNode.has(nodeId)) atomsByNode.set(nodeId, []);
            atomsByNode.get(nodeId)!.push(atomCoverage);
          }
        });
      }

      // Build NodesWithMastery
      const nodesWithMastery: NodeWithMastery[] = nodes.map((node: any) => {
        const nodeAtoms = atomsByNode.get(node.nodeId) || [];
        const atomCount = nodeAtoms.length;

        // Calculate node mastery (weighted average of atom scores)
        const attemptedNodeAtoms = nodeAtoms.filter(a => a.masteryLevel !== 'UNKNOWN');
        const nodeMastery = attemptedNodeAtoms.length > 0
          ? Math.round(attemptedNodeAtoms.reduce((sum, a) => sum + a.masteryScore, 0) / attemptedNodeAtoms.length)
          : 0;

        return {
          nodeId: node.nodeId,
          title: node.title,
          parentId: node.parentId,
          examWeight: node.examWeight || 1,
          atoms: nodeAtoms,
          nodeMastery,
          atomCount
        };
      });

      curriculumMap = {
        mapId: mapData.mapId,
        nodes: nodesWithMastery,
        rootNodes: mapData.rootNodes || []
      };

      // 🔍 ENHANCED DEBUG LOGGING
      const nodesWithAtomsList = nodesWithMastery.filter(n => n.atomCount > 0);
      const nodesWithoutAtoms = nodesWithMastery.filter(n => n.atomCount === 0);

      console.log('[COMPASS_DEBUG] ========= NODE-ATOM MAPPING =========');
      console.log(`[COMPASS_DEBUG] Total nodes in map: ${nodes.length}`);
      console.log(`[COMPASS_DEBUG] Nodes WITH atoms: ${nodesWithAtomsList.length}`);
      console.log(`[COMPASS_DEBUG] Nodes WITHOUT atoms: ${nodesWithoutAtoms.length}`);

      console.log('[COMPASS_DEBUG] --- Nodes WITH atoms ---');
      nodesWithAtomsList.forEach(n => {
        console.log(`  ✅ ${n.title}: ${n.atomCount} atoms, nodeId: ${n.nodeId.substring(0, 8)}...`);
      });

      console.log('[COMPASS_DEBUG] --- Nodes WITHOUT atoms ---');
      nodesWithoutAtoms.forEach(n => {
        console.log(`  ❌ ${n.title}: 0 atoms, nodeId: ${n.nodeId.substring(0, 8)}...`);
      });

      // Log all unique nodeIds found in atoms
      const atomNodeIds = new Set<string>();
      atomsByNode.forEach((_, nodeId) => atomNodeIds.add(nodeId));
      console.log(`[COMPASS_DEBUG] Unique nodeIds from atoms: ${atomNodeIds.size}`);
      console.log('[COMPASS_DEBUG] ======================================');

      logger.orchestrator(`[COMPASS_MAP] Built map: ${nodes.length} nodes, ${nodesWithAtomsList.length} w/ atoms (${atomCoverages.length > 0 ? 'LOCAL' : 'GLOBAL'})`);
    }
  } catch (err: any) {
    logger.warn('ORCHESTRATOR', `[COMPASS_MAP] Failed to load map for ${materialId}: ${err.message}`);
  }

  return {
    materialId,
    materialName: safeMaterialName,
    coveragePercent,
    atoms: atomCoverages,
    status,
    curriculumMap
  };
};

export const detectWeakClusters = (atoms: AtomCoverage[]): WeakCluster[] => {
  const groups: Record<string, string[]> = {};

  atoms.forEach(a => {
    const normTag = (a.conceptTag || '').trim().toLowerCase();
    // Include PARTIAL to capture "Needs Focus" items as potential clusters, ignore UNKNOWN
    if (a.masteryLevel === 'WEAK' || a.masteryLevel === 'PARTIAL') {
      if (!groups[normTag]) groups[normTag] = [];
      groups[normTag].push(a.atomId);
    }
  });

  return Object.entries(groups)
    .filter(([_, ids]) => ids.length >= 2)
    .map(([topicKey, ids]) => {
      const displayTag = atoms.find(a => (a.conceptTag || '').trim().toLowerCase() === topicKey)?.conceptTag || topicKey;
      return { topic: displayTag, atomIds: ids };
    });
};

export const resolveCompassAction = (
  fsmState: DashboardState,
  health: SubjectHealthState,
  weakClusters: WeakCluster[]
): CompassAction => {
  // ONLY recommend REPAIR if there are actual weak clusters to fix.
  // CRITICAL status due to low coverage (0%) should NOT trigger repair.
  if (weakClusters.length > 0) {
    return {
      id: 'repair_1',
      label: 'Improve Mastery', // Renamed from Execute Repair
      description: health.cause || 'Address critical knowledge gaps detected in your matrix.',
      type: 'REPAIR',
      atomIds: weakClusters[0].atomIds,
      scope: 'SUBJECT',
      scopeId: health.subjectId
    };
  }

  if (fsmState === 'FLOW' && health.confidenceScore > 80) {
    return {
      id: 'challenge_1',
      label: 'Unlock Challenge',
      description: 'Push your limits with advanced level 3 concepts.',
      type: 'CHALLENGE',
      scope: 'SUBJECT',
      scopeId: health.subjectId
    };
  }

  return {
    id: 'smart_1',
    label: 'Smart Practice',
    description: 'A balanced session to stabilize your existing knowledge.',
    type: 'SMART',
    scope: 'SUBJECT',
    scopeId: health.subjectId
  };
};

export const buildSubjectCompassData = async (
  subjectId: string,
  userId: string,
  fsmState: DashboardState
): Promise<SubjectCompassData> => {
  const normalizedSub = normalizeSubjectName(subjectId);

  const [healthSnap, historySnap, atomSignals, initialLocalAtoms, trainingSources] = await Promise.all([
    db.collection('student_decisions').doc(userId).collection('subjects').doc(normalizedSub).get(),
    db.collection('student_decision_history')
      .where('studentId', '==', userId)
      .where('subjectId', '==', normalizedSub)
      .orderBy('lastEvaluatedAt', 'desc')
      .limit(10)
      .get(),
    getStudentAtomSignals(userId), // Updated Fetch
    getLocalAtoms(userId),
    getLocalTrainingSources(userId)
  ]);

  const subjectSources = trainingSources.filter(s => normalizeSubjectName(s.subject) === normalizedSub);
  // 🔥 REFACTOR: Source-Centric Loading (User-Agnostic Content)
  let subjectAtoms: AtomViewModel[] = [];
  const sourcesNeedingHydration: typeof subjectSources = [];

  // 1. Fetch atoms for each source file (using fingerprint to share content across users)
  // This complies with: "knowledge matrix should not be linked to studentid, only finger print of the file"
  const results = await Promise.all(subjectSources.map(async s => {
    // getLocalAtoms ignores userId if contentId is provided
    const atoms = await getLocalAtoms(userId, s.fileHash);
    return { source: s, atoms };
  }));

  results.forEach(({ source, atoms }) => {
    if (atoms.length === 0) sourcesNeedingHydration.push(source);
    else subjectAtoms.push(...atoms);
  });

  // 2. Hydrate missing files
  if (sourcesNeedingHydration.length > 0) {
    logger.orchestrator(`[COMPASS_HYDRATION] Hydrating ${sourcesNeedingHydration.length} missing sources for ${normalizedSub}...`);
    logger.orchestrator(`[COMPASS_HYDRATION] Targets: ${sourcesNeedingHydration.map(s => s.fileName).join(', ')}`);

    await Promise.all(sourcesNeedingHydration.map(s => fetchAtomsForSession(userId, s.fileHash)));

    // 3. Re-fetch fresh atoms (still using fingerprint)
    const freshResults = await Promise.all(
      sourcesNeedingHydration.map(async s => getLocalAtoms(userId, s.fileHash))
    );

    let freshCount = 0;
    freshResults.forEach(atoms => {
      if (atoms.length > 0) {
        subjectAtoms.push(...atoms);
        freshCount += atoms.length;
      }
    });

    logger.orchestrator(`[COMPASS] Hydration Complete. Loaded ${freshCount} fresh atoms. Total Subject Atoms: ${subjectAtoms.length}`);
  }

  // Safety filter for subject alignment (just in case hash collision across subjects, unlikely but safe)
  subjectAtoms = subjectAtoms.filter(a => normalizeSubjectName(a.core.metadata.subject) === normalizedSub);

  const filenameMap = new Map<string, string>();
  trainingSources.forEach(s => {
    if (s.fileHash) filenameMap.set(s.fileHash, s.fileName);
  });

  let brainHealth: SubjectHealthState | null = null;
  if (healthSnap.exists) {
    brainHealth = healthSnap.data() as SubjectHealthState;
  }

  const historicalScores = historySnap.docs
    .map(d => (d.data() as any).confidenceScore)
    .reverse();

  const fileMap: Record<string, { name: string, atoms: AtomCore[], status: string }> = {};

  subjectSources.forEach(s => {
    fileMap[s.fileHash] = { name: s.fileName, atoms: [], status: s.status };
  });

  subjectAtoms.forEach(a => {
    const fid = a.core.metadata.sourceDocumentId;
    const fname = filenameMap.get(fid) || 'Linked Material';
    if (!fileMap[fid]) {
      fileMap[fid] = { name: fname, atoms: [], status: 'Completed' };
    }
    fileMap[fid].atoms.push(a.core);
  });

  // 🔒 UPDATED: Use Promise.all since computeFileCoverage is now async
  const fileCoverages = await Promise.all(
    Object.entries(fileMap).map(([id, data]) =>
      computeFileCoverage(id, data.name, data.atoms, atomSignals, data.status)
    )
  );

  const allAtomCoverages = fileCoverages.flatMap(f => f.atoms);
  const weakClusters = detectWeakClusters(allAtomCoverages);

  // Total Coverage = Percentage of Atoms with ANY attempt (Mastery Health is separate)
  const touchedAtoms = allAtomCoverages.filter(a => a.masteryLevel !== 'UNKNOWN');
  const totalCoverage = allAtomCoverages.length > 0
    ? Math.round((touchedAtoms.length / allAtomCoverages.length) * 100)
    : 0;

  const finalHealth: SubjectHealthState = brainHealth || {
    subjectId: normalizedSub,
    studentId: userId,
    confidenceScore: totalCoverage,
    overallStatus: totalCoverage >= 70 ? 'GOOD' : totalCoverage >= 40 ? 'NEEDS_ATTENTION' : 'CRITICAL',
    trend: 'STABLE',
    primaryRiskTopic: weakClusters[0]?.topic || null,
    cause: 'Initial Analysis',
    sparkline: historicalScores.length > 0 ? historicalScores : [totalCoverage],
    hoursLogged: 0,
    lastEvaluatedAt: Date.now()
  };

  // CLOUD AUTHORITATIVE WEAKNESS DETECTION
  // SCOPED: Filter to atoms belonging to this subject only
  const subjectAtomIds = new Set(subjectAtoms.map(a => a.atomId));

  const allWeakAtomIds = atomSignals
    .filter(s => {
      // Use explicit mastery status from LIS 2.0
      return (s.masteryLevel === 'WEAK' || s.masteryLevel === 'PARTIAL') && subjectAtomIds.has(s.atomId);
    })
    .map(s => s.atomId);

  return {
    subjectId: normalizedSub,
    subjectName: normalizedSub,
    meta: {
      grade: String(subjectAtoms[0]?.core.metadata.gradeLevel || 10),
      activeSince: new Date(finalHealth.lastEvaluatedAt).toLocaleDateString(),
      totalTimeSpentMinutes: (() => {
        if (subjectAtoms.length === 0) return 0;

        const totalSeconds = atomSignals
          .filter(s => subjectAtomIds.has(s.atomId)) // Only count atoms from this subject
          .reduce((acc, s) => acc + (s.totalActiveTimeSec || 0), 0);

        const totalMinutes = Math.round(totalSeconds / 60);

        // Data integrity check: Cap at reasonable maximum (1000 hours = 60000 minutes)
        // If time is unreasonably high, it indicates corrupted telemetry data
        const MAX_REASONABLE_MINUTES = 60000; // 1000 hours

        if (totalMinutes > MAX_REASONABLE_MINUTES) {
          logger.error('ORCHESTRATOR', `[COMPASS] Detected unreasonably high time for ${normalizedSub}: ${totalMinutes} min (${Math.floor(totalMinutes / 60)}h). Capping at ${MAX_REASONABLE_MINUTES} min. This suggests corrupted telemetry data.`);
          return MAX_REASONABLE_MINUTES;
        }

        return totalMinutes;
      })()
    },
    health: {
      coveragePercent: totalCoverage,
      weakClustersCount: weakClusters.length,
      momentum: finalHealth.trend === 'UP' ? 'HIGH' : finalHealth.trend === 'DOWN' ? 'LOW' : 'MEDIUM'
    },
    materials: fileCoverages,
    insight: finalHealth.cause,
    recommendedAction: resolveCompassAction(fsmState, finalHealth, weakClusters),
    failureState: weakClusters.length >= 3 ? 'OVERLOAD' : 'NORMAL',
    allWeakAtomIds
  };
};

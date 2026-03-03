
import { db } from './firebaseConfig';
import { getDB, clearDatabase } from './idbService';
import {
    HistoryItem, QuizResult, LibraryItem,
    AtomCore, LocalTrainingSource, AtomViewModel, LibraryFolder, NoteRecord, ExamData, StudyNoteData, QuizData, Flashcard, FileRecord,
    MicroLoopSession
} from '../types';
import { ExamResult, GrowthSnapshot } from './scoring/types';
import firebase from 'firebase/compat/app';
import { logger } from '../utils/logger';

const QUIZ_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

export const GLOBAL_COLLECTIONS = [
    // Core Collections
    'users',
    'history',
    'results',
    'library',
    'training_sources',
    'global_atoms',
    'temp_global_atoms',
    'folders',

    // Parent Module Collections
    'parent_profiles',
    'parent_nudges',
    'parent_feed',
    'parent_student_overview',
    'parent_subject_overview',
    'parent_subject_progress_report',

    // Student Activity & Telemetry
    'student_raw_activity',
    'student_decisions',
    'student_decision_history',
    'student_decision_evidence',
    'student_atom_summary',
    'telemetry_events',
    'student_growth_mirror_delta',
    'student_radar_snapshot',
    'student_recommendation_history',



    // Quiz & Assessment
    'quiz_sessions',
    'quiz_results',
    'exam_results',
    'student_growth_mirror_delta',

    // New Telemetry & Signals
    'student_atom_signals',
    'student_compass_snapshots',
    'student_growth_timeline',
    'student_subject_health',
    'student_decisions',
    'telemetry_processed_keys',

    // Add more collections as they are created
    'analytics_sessions',
    'billing_events',
    'classrooms',
    'contact_inquiries',
    'discounts',
    'journey_events',
    'journey_sync_state',
    'mail',
    'plans',
    'subscriptions',
    'telemetry_events',
    'telemetry_processed_keys',
    'usage_counters',
    'webhook_events'
].sort();
export const LOCAL_STORES = [
    { id: 'history', label: 'Growth Mirror' },
    { id: 'library', label: 'Document Library' },
    { id: 'local_atoms', label: 'Trained Knowledge Atoms' },
    { id: 'training_sources', label: 'Training Registry' },
    { id: 'results', label: 'Assessment Results' },
    { id: 'folders', label: 'Folder Structure' }
];

// Helper to remove undefined values which Firestore rejects
export const sanitizeForFirestore = (obj: any): any => {
    if (obj === undefined) return null;
    return JSON.parse(JSON.stringify(obj));
};

// --- CLOUD FETCH DEDUPLICATION ---
const _inflightFetches = new Map<string, Promise<any>>();

const deduplicatedCloudFetch = <T>(key: string, fetcher: () => Promise<T>): Promise<T> => {
    if (_inflightFetches.has(key)) {
        return _inflightFetches.get(key)!;
    }
    const promise = fetcher().finally(() => {
        _inflightFetches.delete(key);
    });
    _inflightFetches.set(key, promise);
    return promise;
};

// --- FOLDER MANAGEMENT (With Cloud Sync & Trace Logging) ---

export const createFolder = async (folder: LibraryFolder) => {
    const idb = await getDB();
    logger.db(`[FOLDER_TRACE] Creating Folder: "${folder.name}"`, { id: folder.id, parentId: folder.parentId });

    try {
        await idb.put('folders', folder as any);

        if (db) {
            const safeFolder = sanitizeForFirestore(folder);
            db.collection('folders').doc(folder.id).set(safeFolder).then(() => {
                logger.db(`[FOLDER_TRACE] Cloud Sync Success: ${folder.id}`);
            }).catch(e => {
                logger.error('DB', "[FOLDER_TRACE] Cloud Sync Failed", e);
            });
        }
    } catch (e: any) {
        logger.error('DB', `[FOLDER_TRACE] Creation Failed: ${e.message}`, e);
        throw e;
    }
};

export const renameFolder = async (folderId: string, newName: string) => {
    const idb = await getDB();
    const folder = await idb.get('folders', folderId);
    if (folder) {
        const oldName = folder.name;
        folder.name = newName;
        logger.db(`[FOLDER_TRACE] Renaming Folder: "${oldName}" -> "${newName}" (ID: ${folderId})`);
        await idb.put('folders', folder);
        if (db) {
            db.collection('folders').doc(folder.id).update({ name: newName })
                .then(() => logger.db(`[FOLDER_TRACE] Cloud Rename Success: ${newName}`))
                .catch(e => logger.error('DB', "Folder Rename Cloud Sync Failed", e));
        }
    } else {
        logger.error('DB', `[FOLDER_TRACE] Rename Failed: Folder ${folderId} not found in IDB`);
    }
};

export const moveLibraryItem = async (itemId: string, folderId: string | null) => {
    const idb = await getDB();
    const item = await idb.get('library', itemId);
    if (item) {
        item.folderId = folderId;
        // Strip data just in case we are moving a legacy item
        const { data, ...safeItem } = item;
        await idb.put('library', safeItem as any);

        if (db) {
            db.collection('library').doc(itemId).update({ folderId }).catch(e => logger.error('DB', "Library Move Cloud Sync Failed", e));
        }
    }
};

export const moveFolder = async (folderId: string, parentId: string | null) => {
    const idb = await getDB();
    const folder = await idb.get('folders', folderId);
    if (folder) {
        folder.parentId = parentId;
        await idb.put('folders', folder);
        if (db) {
            db.collection('folders').doc(folderId).update({ parentId }).catch(e => logger.error('DB', "Folder Move Cloud Sync Failed", e));
        }
    }
};

export const deleteFolder = async (id: string) => {
    const idb = await getDB();
    logger.db(`[FOLDER_TRACE] Deleting Folder: ${id}`);
    await idb.delete('folders', id);
    if (db) {
        db.collection('folders').doc(id).delete().catch(e => logger.error('DB', "Folder Delete Cloud Sync Failed", e));
    }
};

/**
 * Cascades a subject rename across all TrainingSource records for a user.
 * Called from ProfileScreen when the user renames a subject.
 */
export const renameSubjectCascade = async (userId: string, oldSubject: string, newSubject: string): Promise<number> => {
    const idb = await getDB();
    logger.db(`[SUBJECT_RENAME] Cascading rename: "${oldSubject}" -> "${newSubject}" for user ${userId}`);

    const allSources = await idb.getAllFromIndex('training_sources', 'by_student', userId);
    const affected = allSources.filter(s => s.subject === oldSubject);

    logger.db(`[SUBJECT_RENAME] Found ${affected.length} sources to update.`);

    for (const source of affected) {
        const updated = { ...source, subject: newSubject, updatedAt: Date.now() };
        await idb.put('training_sources', updated);
        if (db) {
            db.collection('training_sources').doc(source.id)
                .update({ subject: newSubject, updatedAt: Date.now() })
                .catch(e => logger.error('DB', `[SUBJECT_RENAME] Cloud sync failed for ${source.id}`, e));
        }
    }

    logger.db(`[SUBJECT_RENAME] Done. ${affected.length} records updated.`);
    return affected.length;
};

/**
 * Returns how many TrainingSource records exist for a given subject.
 * Used by ProfileScreen to warn before deleting a subject.
 */
export const getTrainedCountForSubject = async (userId: string, subject: string): Promise<number> => {
    const idb = await getDB();
    const allSources = await idb.getAllFromIndex('training_sources', 'by_student', userId);
    return allSources.filter(s => s.subject === subject).length;
};


export const getAllUserFolders = async (userId: string): Promise<LibraryFolder[]> => {
    const idb = await getDB();
    let localFolders = await idb.getAllFromIndex('folders', 'by_user', userId);

    // Cloud Hydration if online and local is empty (First Load / New Device)
    if (db && localFolders.length === 0) {
        try {
            const cloudFolders = await deduplicatedCloudFetch(`folders:${userId}`, async () => {
                const snap = await db.collection('folders').where('userId', '==', userId).get();
                return snap.docs.map(d => d.data() as LibraryFolder);
            });

            if (cloudFolders.length > 0) {
                const tx = idb.transaction('folders', 'readwrite');
                for (const f of cloudFolders) {
                    await tx.store.put(f as any);
                }
                await tx.done;
                localFolders = cloudFolders;
                logger.db(`[FOLDER_TRACE] Hydrated ${cloudFolders.length} folders from cloud.`);
            }
        } catch (e) {
            console.warn("Folder Cloud Fetch Failed", e);
        }
    }

    return localFolders;
};

// --- Standard Exports (Pass-throughs) ---

export const saveToHistory = async (item: Omit<HistoryItem, 'id' | 'userId'>, userId: string) => {
    const id = `hist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    let cleanedData = item.data;
    if (item.type === 'quiz' || item.type === 'adaptive-quiz') {
        const { questions, ...metaOnly } = item.data || {};
        cleanedData = { ...metaOnly, atomCount: questions?.length || 0 };
    }

    const fullItem = { ...item, data: cleanedData, id, userId, timestamp: Date.now() };
    const idb = await getDB();
    await idb.put('history', fullItem as any);
    if (db) {
        const safePayload = sanitizeForFirestore(fullItem);
        db.collection('history').doc(id).set(safePayload).catch(e => logger.error('DB', "History Sync Failed", e));
    }
    return id;
};

export const getCachedQuiz = async (
    atomIds: string[],
    difficulty: string,
    questionTypes: string[],
    masteryBand: string
): Promise<any | null> => {
    const typesKey = [...questionTypes].sort().join(',');
    const key = `quiz:${atomIds.sort().join(',')}:${difficulty}:${typesKey}:${masteryBand}`;
    const cached = localStorage.getItem(`cache_${key}`);
    if (cached) {
        try {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < QUIZ_CACHE_TTL) {
                return data;
            }
        } catch (e) {
            return null;
        }
    }
    return null;
};

export const setQuizCache = (
    atomIds: string[],
    difficulty: string,
    questionTypes: string[],
    masteryBand: string,
    data: any
) => {
    const typesKey = [...questionTypes].sort().join(',');
    const key = `quiz:${atomIds.sort().join(',')}:${difficulty}:${typesKey}:${masteryBand}`;
    const payload = JSON.stringify({
        data,
        timestamp: Date.now()
    });
    localStorage.setItem(`cache_${key}`, payload);
};

export const getHistory = async (userId: string): Promise<HistoryItem[]> => {
    const idb = await getDB();
    const items = await idb.getAllFromIndex('history', 'by_user', userId);
    return items.sort((a, b) => b.timestamp - a.timestamp);
};

export const saveQuizResult = async (result: Omit<QuizResult, 'userId'>, userId: string) => {
    const idb = await getDB();
    const fullResult = { ...result, userId };
    await idb.put('results', fullResult as any);
    if (db) {
        const safeResult = sanitizeForFirestore(fullResult);
        db.collection('results').add(safeResult).catch(e => logger.error('DB', "Result Sync Failed", e));
    }
};

export const getQuizResults = async (userId: string): Promise<QuizResult[]> => {
    const idb = await getDB();
    return await idb.getAllFromIndex('results', 'by_user', userId);
};

export const getLibraryItems = async (userId: string): Promise<LibraryItem[]> => {
    const idb = await getDB();
    let items = await idb.getAllFromIndex('library', 'by_user', userId);

    // Cloud Hydration for Library Metadata
    if (db && items.length === 0) {
        try {
            const cloudItems = await deduplicatedCloudFetch(`library:${userId}`, async () => {
                const snap = await db.collection('library').where('userId', '==', userId).get();
                return snap.docs.map(d => d.data() as LibraryItem);
            });

            if (cloudItems.length > 0) {
                const tx = idb.transaction('library', 'readwrite');
                for (const i of cloudItems) {
                    await tx.store.put(i);
                }
                await tx.done;
                items = cloudItems;
                logger.db(`[LIB_TRACE] Hydrated ${cloudItems.length} private items for student ${userId}.`);
            }
        } catch (e) {
            console.warn("Library Hydration Failed", e);
        }
    }

    return items.sort((a, b) => b.timestamp - a.timestamp);
};

export const saveToLibrary = async (item: LibraryItem) => {
    const idb = await getDB();
    const { data, ...safeItem } = item;
    await idb.put('library', safeItem as any);
    if (db) {
        const payload = sanitizeForFirestore(safeItem);
        db.collection('library').doc(item.id).set(payload).catch(e => logger.error('DB', "Library Sync Failed", e));
    }
};

export const deleteFromLibrary = async (id: string) => {
    const idb = await getDB();
    await idb.delete('library', id);
    if (db) {
        db.collection('library').doc(id).delete().catch(e => logger.error('DB', "Library Delete Failed", e));
    }
};

import { sha256 } from '../utils/hashUtils';

export const saveLocalAtoms = async (atoms: AtomCore[], feature: string) => {
    const idb = await getDB();
    const storeName = 'local_atoms' as any;

    // Group by Source Document to optimize duplicate checks
    const atomsByDoc = new Map<string, AtomCore[]>();
    atoms.forEach(a => {
        const docId = a.metadata.sourceDocumentId || 'unknown';
        if (!atomsByDoc.has(docId)) atomsByDoc.set(docId, []);
        atomsByDoc.get(docId)!.push(a);
    });

    // v1.3 PILLAR 3: TASHKEEL-AWARE CANONICALIZATION
    // Normalized Key: Strips AL, Diacritics, Alef Variants
    const { normalizeArabicKey } = await import('../utils/arabicNormalization');
    let skippedCount = 0;

    // Helper to generate key: hash(normalized title + subject + grade)
    const computeKey = async (title: string, subject: string, grade: any) => {
        const normalizedTitle = normalizeArabicKey(title);
        const raw = `${normalizedTitle}|${subject?.toLowerCase().trim()}|${String(grade).toLowerCase().trim()}`;
        return await sha256(raw);
    };

    // 3. Process Per-Document (Isolated Transactions to prevent time-out/auto-commit issues)
    for (const [docId, docAtoms] of atomsByDoc) {
        // Create a FRESH transaction for each document batch to avoid "Transaction has finished" error
        const tx = idb.transaction(storeName, 'readwrite');
        // Cast to any to bypass strict typing if index list isn't inferred correctly
        const index = (tx.store as any).index('by_content');

        // 1. Check Collisions (in this specific tx)
        // Ensure getAll receives keys or range. docId is string, usually fine if index matches.
        const existing = await index.getAll(docId);

        const existingKeys = new Set<string>();

        // Pre-calculate existing keys
        for (const ex of existing) {
            const key = ex.conceptKey || await computeKey(
                ex.metadata.conceptTag,
                ex.metadata.subject,
                ex.metadata.gradeLevel
            );
            existingKeys.add(key);
        }

        // 2. Insert New Atoms
        for (const atom of docAtoms) {
            const newKey = await computeKey(
                atom.metadata.conceptTag,
                atom.metadata.subject,
                atom.metadata.gradeLevel
            );

            if (existingKeys.has(newKey)) {
                console.log(`[DEDUP] Skipped duplicate atom: "${atom.metadata.conceptTag}" (Key: ${newKey.substring(0, 8)}...)`);
                skippedCount++;
                continue;
            }

            // Enrich and Save
            (atom as any).conceptKey = newKey;
            existingKeys.add(newKey);
            await tx.store.put(atom);
        }

        // Commit this batch
        await tx.done;
    }
    if (skippedCount > 0) logger.db(`[DEDUP] Successfully skipped ${skippedCount} duplicate atoms.`);
};

export const saveAtoms = saveLocalAtoms;

// 🧹 ONE-TIME CLEANUP UTILITY
export const runDuplicateCleanup = async (userId: string) => {
    const idb = await getDB();
    const logger = (msg: string) => console.log(`[CLEANUP] ${msg}`);

    logger("Starting deep scan for duplicates...");
    const allAtoms = (await idb.getAllFromIndex('local_atoms', 'by_user', userId)) as AtomCore[];

    // Group by Concept Key
    const groups = new Map<string, AtomCore[]>();
    for (const atom of allAtoms) {
        // Re-compute key to be sure
        const key = (atom as any).conceptKey || await sha256(
            `${atom.metadata.conceptTag?.toLowerCase().trim()}|${atom.metadata.subject?.toLowerCase().trim()}|${String(atom.metadata.gradeLevel).trim().toLowerCase()}`
        );
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(atom);
    }

    let deletedCount = 0;
    const tx = idb.transaction('local_atoms', 'readwrite');

    for (const [key, group] of groups) {
        if (group.length > 1) {
            // DUPLICATES FOUND
            // Strategy: Keep highest trust/mastery, then oldest
            // We assume oldest ID is roughly oldest creation, but valid timestamp checks are better if available.
            // AtomCore doesn't enforce 'createdAt' in signature but usually has it or we use alphabetical ID as proxy?
            // Actually, we use 'trustScore' as proxy for quality.

            // Sort: Descending Quality/Age
            group.sort((a, b) => (b.trustScore || 0) - (a.trustScore || 0));

            const [keeper, ...victims] = group;
            logger(`Merging ${group.length} atoms for "${keeper.metadata.conceptTag}". Keeping ID: ${keeper.atomId}`);

            for (const victim of victims) {
                await tx.store.delete(victim.atomId);
                deletedCount++;
            }
        }
    }

    await tx.done;
    logger(`Cleanup Complete. Removed ${deletedCount} duplicate atoms.`);
    return { totalScanned: allAtoms.length, deleted: deletedCount };
};

export const getLocalAtoms = async (userId: string, contentId?: string): Promise<AtomViewModel[]> => {
    const idb = await getDB();
    let all: AtomCore[];
    if (contentId) {
        // v1.3 Refinement: Query by fingerprint ONLY (ignore userId)
        // This allows Student 2 to reuse atoms hydrated by Student 1 on the same device.
        all = (await idb.getAllFromIndex('local_atoms', 'by_content', contentId)) as AtomCore[];
    } else {
        all = (await idb.getAllFromIndex('local_atoms', 'by_user', userId)) as AtomCore[];
    }
    const masteryMap = (await db.collection('users').doc(userId).get()).data()?.gamification?.masteryMap || {};
    return all.map(core => ({
        atomId: core.atomId,
        core,
        studentState: {
            masteryScore: masteryMap[core.atomId] || 0.5, // Default to neutral if missing
            localStatus: 'trained',
            knowledgeGap: false,
        }
    }));
};

export const getAtomsForContent = async (contentId: string, feature: string): Promise<AtomCore[]> => {
    const idb = await getDB();
    const atoms = (await idb.getAllFromIndex('local_atoms', 'by_content', contentId)) as AtomCore[];
    return atoms.sort((a, b) => a.metadata.narrativeSequence - b.metadata.narrativeSequence);
};

export const saveLocalTrainingSource = async (source: LocalTrainingSource) => {
    const idb = await getDB();
    await idb.put('training_sources', source);
    const { data, ...safeSource } = source;
    if (db) {
        const payload = sanitizeForFirestore(safeSource);
        db.collection('training_sources').doc(source.id).set(payload, { merge: true }).catch(e => logger.error('DB', "Cloud Source Sync Failed", e));
    }
};

export const getLocalTrainingSources = async (userId: string): Promise<LocalTrainingSource[]> => {
    const idb = await getDB();
    let localSources = await idb.getAllFromIndex('training_sources', 'by_student', userId);

    // Cloud Hydration for Files/Sources
    if (db && localSources.length === 0) {
        try {
            const cloudSources = await deduplicatedCloudFetch(`sources:${userId}`, async () => {
                const snap = await db.collection('training_sources').where('studentId', '==', userId).get();
                return snap.docs.map(d => d.data() as LocalTrainingSource);
            });

            if (cloudSources.length > 0) {
                const tx = idb.transaction('training_sources', 'readwrite');
                for (const s of cloudSources) {
                    await tx.store.put(s);
                }
                await tx.done;
                localSources = cloudSources;
                logger.db(`[SOURCE_TRACE] Hydrated ${cloudSources.length} private sources for student ${userId}.`);
            }
        } catch (e) {
            console.warn("Source Hydration Failed", e);
        }
    }
    return localSources;
};

export const deleteLocalTrainingSource = async (id: string) => {
    const idb = await getDB();
    await idb.delete('training_sources', id);
    if (db) {
        db.collection('training_sources').doc(id).delete().catch(e => logger.error('DB', "Cloud Source Delete Failed", e));
    }
};

export const deleteLocalAtomsByContent = async (contentId: string) => {
    const idb = await getDB();
    const atoms = await idb.getAllFromIndex('local_atoms', 'by_content', contentId);
    const tx = idb.transaction('local_atoms', 'readwrite');
    for (const a of atoms) {
        await tx.store.delete(a.atomId);
    }
    await tx.done;
};

export const saveChunkStatus = async (chunk: any) => {
    const idb = await getDB();
    await idb.put('pdf_chunks', chunk);
};

export const getCompletedChunks = async (contentId: string, feature: string) => {
    const idb = await getDB();
    const all = await idb.getAllFromIndex('pdf_chunks', 'by_content', contentId);
    return all.filter(c => c.feature === feature && c.status === 'COMPLETE');
};

export const getLibraryItemByContentId = async (contentId: string, userId: string): Promise<LibraryItem | null> => {
    const idb = await getDB();
    const all = await idb.getAllFromIndex('library', 'by_user', userId);
    return all.find(i => i.contentId === contentId) || null;
};

export const nukeAllLocalData = async () => {
    await clearDatabase();
    localStorage.clear();
    return { success: true, steps: ["Storage wiped", "IDB cleared"] };
};

export const nukeGlobalData = async (onLog: (m: string) => void, cols: string[]) => {
    for (const col of cols) {
        onLog(`Purging collection: ${col}`);
        const snap = await db.collection(col).get();
        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
    return true;
};

export const getLocalStoreStats = async () => {
    const idb = await getDB();
    const stats: Record<string, number> = {};
    for (const store of LOCAL_STORES) {
        stats[store.id] = await idb.count(store.id as any);
    }
    return stats;
};

export const deleteLocalStores = async (storeIds: string[]) => {
    const idb = await getDB();
    for (const id of storeIds) {
        await idb.clear(id as any);
    }
};

export const getFileRecord = async (contentId: string): Promise<FileRecord | null> => {
    const idb = await getDB();
    return await idb.getFromIndex('files', 'by_content', contentId) || null;
};

export const hydrateNote = async (record: NoteRecord): Promise<StudyNoteData> => {
    const idb = await getDB();
    const sections = [];
    for (const aid of record.atomIds) {
        const atom = (await idb.get('local_atoms', aid)) as AtomCore;
        if (atom) {
            sections.push({
                heading: atom.metadata.conceptTag,
                keyPoints: [atom.coreRepresentation.definition, atom.coreRepresentation.keyRule],
                definitions: atom.assessmentMetadata.essentialKeywords.map(k => ({ term: k, definition: 'Primary Keyword' })),
                examFacts: atom.extendedRepresentation.proTips || [],
                trustScore: atom.trustScore,
                pageRefs: atom.metadata.sourcePageRefs,
                mnemonic: atom.extendedRepresentation.realWorldAnalogy
            });
        }
    }
    return {
        title: record.title,
        summary: `Complete synthesis of ${record.atomIds.length} concept atoms.`,
        sections,
        timestamp: record.createdAt,
        contentId: record.contentId,
        mode: 'fullNotes',
        atomIds: record.atomIds
    };
};

export const hydrateExam = async (contentId: string, subject: string, grade: string, duration: string, difficulty: string): Promise<ExamData> => {
    return {
        schoolName: 'EDUVA ACADEMY',
        subject,
        grade,
        duration,
        sections: []
    };
};

export const hydrateQuiz = async (contentId: string): Promise<QuizData> => {
    return {
        title: 'Quiz',
        topic: 'Assessment',
        questions: [],
        timestamp: Date.now()
    };
};

export const updateMasteryBatch = async (userId: string, updates: { atomId: string, isCorrect: boolean }[]) => {
    const profile = await db.collection('users').doc(userId).get();
    const masteryMap = profile.data()?.gamification?.masteryMap || {};

    for (const upd of updates) {
        const current = masteryMap[upd.atomId] || 0.5;
        masteryMap[upd.atomId] = upd.isCorrect ? Math.min(1, current + 0.1) : Math.max(0, current - 0.15);
    }

    await db.collection('users').doc(userId).set({ gamification: { masteryMap } }, { merge: true });
};

export const getDecayingAtoms = async (userId: string, subject: string): Promise<AtomViewModel[]> => {
    const all = await getLocalAtoms(userId);
    return all.filter(a => a.core.metadata.subject === subject).slice(0, 5);
};

export const updateFlashcard = async (card: Flashcard, userId: string) => {
    const idb = await getDB();
    await idb.put('flashcards', { ...card, userId } as any);
};

// ------------------------------------------------------------------
// STAGE 5: RESULTS & ANALYSIS PERSISTENCE
// ------------------------------------------------------------------

export const saveExamResult = async (result: ExamResult) => {
    const idb = await getDB();
    // 1. Local Persistence (Immutable Truth)
    await idb.put('exam_results', result);

    // 2. Cloud Sync (Async)
    if (db) {
        const safeResult = sanitizeForFirestore(result);
        db.collection('exam_results').doc(result.examSessionId).set(safeResult)
            .then(() => {
                // 3. ATOMIC WRITE-BACK (Fix for Mastery Bug)
                // We fire-and-forget this to prevent UI blocking, but it's critical for analytics.
                recordAtomLevelStats(result).catch(e => logger.error('DB', "[Storage] Atomic Write-Back Failed", e));
            })
            .catch(e => logger.error('DB', `[Storage] Failed to sync ExamResult ${result.examSessionId}`, e));
    }
};

/**
 * Persists granular performance data per Atom.
 * Critical for "Growth Mirror" and adaptive weighting.
 */
export const updateStudentAtomSummary = async (
    payload: {
        studentId: string,
        atomId: string,
        correct: boolean,
        responseTime: number,
        bloomLevel?: number
    }
) => {
    if (!db) return;

    // 🛡️ SCHEMA GUARD (Prevent Poison Data)
    if (payload.atomId.startsWith('exam_') || payload.atomId.startsWith('sess_') || payload.atomId.includes('bp_')) {
        throw new Error(`INVALID_ATOM_ID_WRITE: Pivot attempt detected. ID: ${payload.atomId}`);
    }

    const docId = `${payload.studentId}_${payload.atomId}`;
    const ref = db.collection('student_atom_summary').doc(docId);

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(ref);
            const data = doc.data() || {
                studentId: payload.studentId,
                atomId: payload.atomId,
                attempts: 0,
                correct: 0,
                totalTime: 0,
                avgTime: 0,
                masteryScore: 0.5, // Start neutral
                bloomCeiling: 0,
                updatedAt: Date.now()
            };

            // 1. Update Core Stats
            data.attempts = (data.attempts || 0) + 1;
            if (payload.correct) data.correct = (data.correct || 0) + 1;
            data.totalTime = (data.totalTime || 0) + payload.responseTime;
            data.avgTime = data.totalTime / data.attempts;

            // 2. Bloom Ceiling Update (Ratchet)
            if (payload.correct && payload.bloomLevel) {
                data.bloomCeiling = Math.max(data.bloomCeiling || 0, payload.bloomLevel);
            }

            // 3. Mastery Formula v1 (Simple & Stable)
            const accuracy = data.correct / data.attempts;

            // Time Factor: expectedTime = 12s (12000ms)
            // factor = clamp(expected/actual, 0.5, 1.2)
            // If avgTime is 0 (first run/bug), default to 1
            const actualTime = data.avgTime || 12000;
            const timeRatio = 12000 / Math.max(1000, actualTime); // Cap floor at 1s to prevent infinity
            const timeFactor = Math.max(0.5, Math.min(1.2, timeRatio));

            // Mastery = accuracy * timeFactor (Clamped 0-1)
            data.masteryScore = Math.max(0, Math.min(1, accuracy * timeFactor));

            data.lastTested = Date.now();
            data.updatedAt = new Date().toISOString();

            t.set(ref, data, { merge: true });
        });
    } catch (e) {
        logger.error('DB', `[Storage] Failed to update atom summary for ${payload.atomId}`, e);
    }
};

/**
 * Loops through ExamResult items and updates their individual atom records.
 */
/**
 * Loops through ExamResult items and updates their individual atom records.
 */
export const recordAtomLevelStats = async (result: ExamResult) => {
    if (!result.itemMap) return;

    const updates = Object.entries(result.itemMap).map(async ([atomId, itemData]) => {
        // Fix for Type Change: itemData is now object { status, time, bloom }
        if (itemData.status === 'FAILED') return;

        // Determine correctness
        const isCorrect = itemData.status === 'CORRECT';

        await updateStudentAtomSummary({
            studentId: result.userId,
            atomId: atomId,
            correct: isCorrect,
            responseTime: itemData.time,
            bloomLevel: itemData.bloom
        });
    });

    await Promise.all(updates);
};

export const cleanupAtomSummary = async () => {
    if (!db) return;
    const snap = await db.collection('student_atom_summary').get();
    let deleted = 0;
    const batch = db.batch();

    snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.atomId && (data.atomId.startsWith('exam_') || data.atomId.startsWith('sess_'))) {
            batch.delete(doc.ref);
            deleted++;
        }
    });

    if (deleted > 0) {
        await batch.commit();
        console.log(`[CLEANUP] Purged ${deleted} invalid exam-level records from atom summary.`);
    }
};

export const getExamResultsHistory = async (userId: string): Promise<ExamResult[]> => {
    const idb = await getDB();
    const results = await idb.getAllFromIndex('exam_results', 'by_user', userId);
    return results.sort((a, b) => b.finishedAt - a.finishedAt);
};

export const saveGrowthSnapshot = async (snapshot: GrowthSnapshot) => {
    // For V1 of Mirror, we simply log this or store it in a generic 'snapshots' store if needed.
    // The requirement says "Persist (local + backend)".
    // We'll reuse 'history' store with a specific type or create a new store if schema allows.
    // Given explicitly 'GrowthSnapshot', let's assume we might want a new store in V6, 
    // but for now, we can piggyback or just fire-and-forget to cloud if local isn't critical yet?
    // User plan: "Persist (local + backend)".
    // Let's treat it as a special history item for now to reuse existing hooks or just cloud text?
    // Actually, 'student_growth_mirror_delta' collection was mentioned.

    if (db) {
        const safeSnapshot = sanitizeForFirestore(snapshot);
        db.collection('student_growth_mirror_delta').add(safeSnapshot)
            .catch(e => logger.error('DB', `[Storage] Failed to sync GrowthSnapshot`, e));
    }
};

// ------------------------------------------------------------------
// INTELLIGENT EXAM SELECTION HELPERS
// ------------------------------------------------------------------

/**
 * Efficiently retrieves the set of Atom IDs used in the last N exams.
 * Used to ensure rotation and prevent repetition.
 */
export const getRecentExamAtomUsage = async (
    userId: string,
    subject: string,
    lookback: number = 5
): Promise<{ usedAtomIds: Set<string>; lastExamTimestamp: number }> => {
    const idb = await getDB();
    let historyResults: ExamResult[] = [];

    // TIER 1: CLOUD FIRST (Global Memory)
    if (db) {
        try {
            const snap = await db.collection('exam_results')
                .where('studentId', '==', userId) // Index needed usually, but small volume ok for now
                .orderBy('finishedAt', 'desc')
                .limit(lookback)
                .get();

            if (!snap.empty) {
                historyResults = snap.docs.map(d => d.data() as ExamResult);
                logger.db(`[UsageTrace] Loaded ${historyResults.length} exams from Global Cloud.`);

                // CACHE WARMING: Save to Local IDB for future fast access & offline support
                const tx = idb.transaction('exam_results', 'readwrite');
                for (const res of historyResults) {
                    tx.store.put(res);
                }
                await tx.done;
                logger.db(`[UsageTrace] Cached ${historyResults.length} global exams to Local IDB.`);
            }
        } catch (e) {
            console.warn("[UsageTrace] Cloud history fetch failed, falling back to local.", e);
        }
    }

    // TIER 2: LOCAL FALLBACK (If Cloud Empty/Failed)
    if (historyResults.length === 0) {
        const allLocal = await idb.getAllFromIndex('exam_results', 'by_user', userId);
        historyResults = allLocal
            .sort((a: ExamResult, b: ExamResult) => b.finishedAt - a.finishedAt)
            .slice(0, lookback);
        logger.db(`[UsageTrace] Loaded ${historyResults.length} exams from Local DB.`);
    }

    const usedAtomIds = new Set<string>();
    let lastExamTimestamp = 0;

    if (historyResults.length > 0) {
        lastExamTimestamp = historyResults[0].finishedAt;
        // Collect atom IDs from the 'items' map of each result
        for (const result of historyResults) {
            // ExamResult.items is { [atomId]: ExamItemResult }
            Object.keys(result.itemMap || {}).forEach(atomId => usedAtomIds.add(atomId));
        }
    }

    logger.db(`[UsageTrace] Identified ${usedAtomIds.size} unique atoms used in recent history.`);

    return { usedAtomIds, lastExamTimestamp };
};

// ------------------------------------------------------------------
// STAGE 6: MICRO-LOOPS PERSISTENCE
// ------------------------------------------------------------------

export const saveMicroLoopSession = async (session: MicroLoopSession) => {
    const idb = await getDB();
    await idb.put('micro_loop_sessions', session);

    // Cloud Sync (Optional but recommended for consistency)
    if (db) {
        db.collection('micro_loop_sessions').doc(session.id).set(sanitizeForFirestore(session))
            .catch(e => logger.error('DB', `[Storage] Failed to sync MicroLoop ${session.id}`, e));
    }
};

/**
 * Finalizes a Micro-Loop session and performs the critical Mastery Write-Back.
 * This is where the correction cycle closes.
 */
export const completeMicroLoopSession = async (
    session: MicroLoopSession,
    results: { correctCount: number; totalCount: number }
) => {
    // 1. Update Session Status
    const completedSession: MicroLoopSession = {
        ...session,
        status: 'COMPLETED',
        completedAt: Date.now(),
        outcome: results.correctCount === results.totalCount ? 'RESOLVED' : (results.correctCount > 0 ? 'PARTIAL' : 'FAILED')
    };

    await saveMicroLoopSession(completedSession);

    // 2. MASTERY WRITE-BACK (The Logic Hook)
    // We treat these questions as "High Value" practice attempts.
    if (!db) return;

    const atomId = session.atomId;
    const studentId = session.userId;

    const docId = `${studentId}_${atomId}`;
    const ref = db.collection('student_atom_summary').doc(docId);

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(ref);
            const data = doc.data() || {
                studentId,
                atomId,
                attempts: 0,
                correct: 0,
                totalTime: 0,
                avgTime: 0,
                masteryScore: 0.5,
                bloomCeiling: 0,
                updatedAt: Date.now()
            };

            // Aggregated Updates
            data.attempts = (data.attempts || 0) + results.totalCount;
            data.correct = (data.correct || 0) + results.correctCount;

            // Assume 15s per question for loops if not tracked strictly (micro loops are fast)
            const estimatedTime = results.totalCount * 15000;
            data.totalTime = (data.totalTime || 0) + estimatedTime;
            data.avgTime = data.totalTime / data.attempts;

            // Mastery Recalc (Boosted)
            const accuracy = data.correct / data.attempts;

            // Standard Formula
            const timeRatio = 12000 / Math.max(1000, data.avgTime || 12000);
            const timeFactor = Math.max(0.5, Math.min(1.2, timeRatio));
            let newMastery = Math.max(0, Math.min(1, accuracy * timeFactor));

            // CONFIDENCE BOOST Logic
            // If the loop was RESOLVED (100% on scaffolding), nudge mastery up if it's lagging.
            if (completedSession.outcome === 'RESOLVED') {
                // Ensure at least 0.6 if resolved
                newMastery = Math.max(newMastery, 0.6);
            }

            data.masteryScore = newMastery;
            data.lastTested = Date.now();
            data.updatedAt = new Date().toISOString();

            t.set(ref, data, { merge: true });
        });
        logger.db(`[MicroLoop] Mastery Write-Back Complete: ${atomId} (Outcome: ${completedSession.outcome})`);

    } catch (e) {
        logger.error('DB', `[MicroLoop] Mastery Write-Back Failed`, e);
    }
};

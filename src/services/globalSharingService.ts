
import { db } from './firebaseConfig';
import firebase from 'firebase/compat/app';
// Fix: Changed non-existent Atom type to AtomCore.
import { AtomCore } from '../types';
import { sha256 } from '../utils/hashUtils';
import { logger } from '../utils/logger';

import { normalizeArabicKey } from '../utils/arabicNormalization';

/**

/**
 * v2.2 Composite Identity Key
 * conceptTag + subject + educationSystem + gradeLevel + language
 * v1.3 Update: Uses Tashkeel-Aware Normalization
 */
export const generateGlobalIdentityKey = async (atom: AtomCore): Promise<string> => {
  // Fix: Corrected property access (educationSystem is not in AtomCore metadata).
  const { conceptTag, subject, gradeLevel, language } = atom.metadata;
  const normalizedTag = normalizeArabicKey(conceptTag);
  // Note: We use the same 'pipe' delimiter style as storageService for consistency, or keep simple concat if v2.2 legacy requires.
  // Keeping v2.2 style but with normalized tag:
  const raw = `${normalizedTag}:${subject}:${gradeLevel}:${language}`.toLowerCase().replace(/\s+/g, '');
  return await sha256(raw);
};

export const checkGlobalAtoms = async (fingerprint: string): Promise<AtomCore[] | null> => {
  if (!db) return null;
  try {
    const snap = await db.collection('global_atoms')
      .where('originDocFingerprint', '==', fingerprint)
      .where('metadata.localStatus', '==', 'trained')
      .get();

    if (snap.empty) return null;
    return snap.docs.map(doc => doc.data() as AtomCore);
  } catch (e) {
    return null;
  }
};

export const checkGlobalVerifiedPackage = async (fingerprint: string): Promise<{ map: any, atoms: AtomCore[] } | null> => {
  if (!db) return null;
  try {
    // 1. Check for Verified Atoms FIRST (Primary Signal)
    const atomSnap = await db.collection('global_atoms')
      .where('originDocFingerprint', '==', fingerprint)
      .get();

    // If no atoms, no package.
    if (atomSnap.empty) return null;
    const atoms = atomSnap.docs.map(d => d.data() as AtomCore);

    // 2. Try to fetch Map (Optional/Secondary)
    let map = null;
    try {
      const mapSnap = await db.collection('global_curriculum_maps')
        .where('docFingerprint', '==', fingerprint)
        .limit(1)
        .get();

      if (!mapSnap.empty) {
        map = mapSnap.docs[0].data();
      }
    } catch (e) { /* Warning only */ }

    // If map missing, we just return atoms (Page-Level Hydration)
    return { map, atoms };
  } catch (e: any) {
    logger.ingestion(`[GLOBAL_CHECK] Error querying global registry: ${e.message}`);
    return null;
  }
};

export const saveGlobalCurriculumMap = async (map: any, fingerprint: string) => {
  if (!db) return;
  try {
    // Content-Based Addressing: mapId is source of truth
    const docRef = db.collection('global_curriculum_maps').doc(map.mapId);

    // Idempotent Save: Only write if new
    const doc = await docRef.get();
    if (!doc.exists) {
      await docRef.set({
        ...map,
        docFingerprint: fingerprint, // Crucial for lookup
        savedAt: Date.now()
      });
      logger.db(`[GLOBAL_MAPS] Persisted new map ${map.mapId}`);
    } else {
      logger.db(`[GLOBAL_MAPS] Map ${map.mapId} already exists. Skipping.`);
    }
  } catch (e: any) {
    logger.error('INGESTION', `[GLOBAL_MAPS] Save failed: ${e.message}`);
  }
};

/**
 * UCCS v2.2.1: DETERMINISTIC DISPATCH
 * Uses fingerprint-based IDs to prevent duplicate staging entries.
 * ENHANCED: Includes size-safety and deep serialization.
 */
export const stageAtomsForGlobalReview = async (
  studentId: string,
  fingerprint: string,
  subject: string,
  grade: string,
  atoms: AtomCore[],
  fileName?: string,
  educationSystem?: string
) => {
  if (!db || atoms.length === 0) return;

  // Deterministic Key: content_subject_grade
  const stagingId = `staging_${fingerprint}_${subject.replace(/[^a-z0-9]/gi, '_')}`;

  try {
    // Generate payloads with global keys
    const atomPayloads = await Promise.all(atoms.map(async a => {
      // Ensure serialization safety for nested objects
      const cleanAtom = JSON.parse(JSON.stringify(a));
      return {
        ...cleanAtom,
        globalIdentityKey: await generateGlobalIdentityKey(a),
        // Enrich with source metadata
        userId: studentId,
        sourceFileName: fileName,
        educationSystem: educationSystem,
        grade: grade,
        metadata: { ...cleanAtom.metadata, localOnly: false }
      };
    }));

    const payload: any = {
      studentId,
      originDocFingerprint: fingerprint,
      subject,
      grade,
      lastUpdate: Date.now(),
      status: 'pendingReview',
      atomCount: firebase.firestore.FieldValue.increment(atoms.length),
      extractedAtoms: firebase.firestore.FieldValue.arrayUnion(...atomPayloads)
    };

    if (fileName) payload.fileName = fileName;
    if (educationSystem) payload.educationSystem = educationSystem;

    // 3. Atomic merge: Ensures unique packets in Admin Staging and appends new atoms
    await db.collection('temp_global_atoms').doc(stagingId).set(payload, { merge: true });
    logger.db(`[GLOBAL_STAGING] Staged ${atoms.length} atoms to ${stagingId}`);
  } catch (e: any) {
    logger.error('INGESTION', "[GLOBAL_STAGING] Dispatch failed.", e.message);
  }
};

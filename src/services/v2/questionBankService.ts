import { db } from '../firebaseConfig';
import { getDB } from '../idbService';
import { UniversalQuestion } from './typesV2';
import { sha256 } from '../../utils/hashUtils';
import firebase from 'firebase/compat/app';

/**
 * v2.0 QKEY Protocol (LOCKED)
 * Formula: atomId + eduType + grade + difficulty + bloom + questionType
 */
export const generateQKey = async (input: {
  atomId: string;
  eduType: string;
  grade: number;
  difficulty: string;
  bloom: string;
  questionType: string;
}): Promise<string> => {
  const raw = `${input.atomId}_${input.eduType}_${input.grade}_${input.difficulty}_${input.bloom}_${input.questionType}`;
  return await sha256(raw);
};

export const getLocalQuestion = async (qkey: string): Promise<UniversalQuestion | null> => {
    const idb = await getDB();
    const item = await idb.get('question_bank', qkey) || null;
    if (item) {
        // Update access metadata locally
        item.lastUsedAt = Date.now();
        await idb.put('question_bank', item);
    }
    return item;
};

export const getGlobalQuestion = async (qkey: string): Promise<UniversalQuestion | null> => {
    if (!db) return null;
    try {
        const doc = await db.collection('global_question_bank').doc(qkey).get();
        if (!doc.exists) return null;
        
        const data = doc.data() as UniversalQuestion;
        if (data.analytics.flaggedCount > 5) return null; // Safety gate
        
        return data;
    } catch (e) {
        return null;
    }
};

export const saveQuestionToBanks = async (question: UniversalQuestion) => {
    const idb = await getDB();
    const saveItem = { ...question, lastUsedAt: Date.now() };
    
    // 1. Save Local (IndexedDB)
    await idb.put('question_bank', saveItem);
    
    // 2. Save Global (Firestore)
    if (db) {
        db.collection('global_question_bank').doc(question.qkey).set(saveItem, { merge: true })
            .catch(e => console.warn("[UCCS_BANK] Global sync failed", e));
    }
};

export const incrementGlobalReuse = async (qkey: string) => {
    if (!db) return;
    const ref = db.collection('global_question_bank').doc(qkey);
    try {
        await ref.update({
            'analytics.reuseCount': firebase.firestore.FieldValue.increment(1),
            'analytics.downloadCount': firebase.firestore.FieldValue.increment(1),
            'lastUsedAt': Date.now()
        });
    } catch (e) {
        console.warn("[UCCS_BANK] Metrics increment failed", e);
    }
};

export const updateQuestionAccuracy = async (qkey: string, isCorrect: boolean) => {
    if (!db) return;
    const ref = db.collection('global_question_bank').doc(qkey);
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(ref);
            if (!doc.exists) return;
            const data = doc.data() as UniversalQuestion;
            
            const prevTotal = data.analytics.reuseCount || 0;
            const newTotal = prevTotal + 1;
            const prevCorrect = (data.analytics.correctRate || 0) * prevTotal;
            const newCorrect = prevCorrect + (isCorrect ? 1 : 0);
            
            transaction.update(ref, {
                'analytics.correctRate': newCorrect / newTotal,
                'lastUsedAt': Date.now()
            });
        });
    } catch (e) {
        console.warn("[UCCS_BANK] Metrics accuracy update failed", e);
    }
};

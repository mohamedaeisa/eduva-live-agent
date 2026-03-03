
import { Type } from "@google/genai";
import { GenerationRequest, StudyNoteData, NoteRecord } from '../../types';
import { ensureAtoms } from './ingestionService';
import { getFileRecord, getAtomsForContent, hydrateNote } from '../storageService';
import { getParentProfile, getFinalPromptModifier, getActiveStudentNudges } from '../parentService';
import { auth } from '../firebaseConfig';

export const NOTE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    atoms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          atomIndex: { type: Type.NUMBER },
          conceptTag: { type: Type.STRING },
          content: { type: Type.STRING },
          isFact: { type: Type.BOOLEAN },
          definitions: { 
            type: Type.ARRAY, 
            items: { type: Type.OBJECT, properties: { term: { type: Type.STRING }, definition: { type: Type.STRING } } } 
          },
          relationships: { type: Type.ARRAY, items: { type: Type.STRING } },
          mnemonic: { type: Type.STRING },
          summaryTakeaway: { type: Type.STRING }
        },
        required: ['atomIndex', 'conceptTag', 'content', 'isFact']
      }
    }
  },
  required: ['atoms']
};

export const generateStudyNotes = async (req: GenerationRequest, onStatus?: (msg: string) => void): Promise<StudyNoteData> => {
  const { contentId } = await ensureAtoms(req, onStatus);
  
  const fileRec = await getFileRecord(contentId);
  const atoms = await getAtomsForContent(contentId, 'notes');
  
  const record: NoteRecord = { 
    id: `note_${Date.now()}`, 
    contentId, 
    fileId: fileRec?.id, 
    title: (req.topic || req.fileName || 'Study Guide'), 
    atomIds: atoms.map(a => a.atomId), 
    createdAt: Date.now() 
  };
  
  const hydrated = await hydrateNote(record);
  return {
      ...hydrated,
      sourceMissionId: req.sourceMissionId,
      struggleAtoms: req.struggleAtoms
  };
};

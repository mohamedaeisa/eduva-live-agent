
import { 
  generateStudyNotes as notesGen, 
} from './ai/notesService';
import { 
  generateQuiz as quizGen, 
  generateGapCloserQuiz as gapGen 
} from './ai/quizService';
import { 
  generateExamPaper as examGen 
} from './ai/examService';
import { 
  generateAvatarResponse as avatarGen,
  analyzeWeakness as weaknessGen,
  generateExplanation as explainerGen
} from './ai/tutorService';
import { 
  checkHomework as hwGen
} from './ai/utilityService';
import {
  generateCheatSheet as sheetGen
} from './ai/cheatSheetService';
import { sha256 } from '../utils/hashUtils';
import { getAtomsForContent } from './storageService';
import { GenerationRequest, StudyNoteData, QuizData, Language, ExamData, UserProfile } from '../types';

/**
 * AI API GATEWAY
 * Routes incoming UI requests to specific microservice endpoints.
 */

export const generateStudyNotes = (req: GenerationRequest, onStatus?: (msg: string) => void) => notesGen(req, onStatus);
export const generateQuiz = (req: GenerationRequest, onStatus?: (msg: string) => void) => quizGen(req, onStatus);
export const generateExamPaper = (req: GenerationRequest, onStatus?: (msg: string) => void) => examGen(req, onStatus);
export const generateGapCloserQuiz = (req: GenerationRequest, mistakes: any[], onStatus?: (msg: string) => void) => gapGen(req, mistakes, onStatus);
export const generateAvatarResponse = (messages: any[], language: Language) => avatarGen(messages, language);
export const analyzeWeakness = (topic: string, mistakes: any[], language: Language) => weaknessGen(topic, mistakes, language);
export const generateExplanation = (topic: string, mode: 'ELI5' | 'Deep', language: Language) => explainerGen(topic, mode, language);
export const generateCheatSheet = (req: GenerationRequest, onStatus?: (msg: string) => void) => sheetGen(req, onStatus);
export const checkHomework = (req: GenerationRequest, onStatus?: (msg: string) => void) => hwGen(req, onStatus);

// Re-export storage actions for centralized gateway access in App layer
export { saveToHistory } from './storageService';

// Direct Legacy Redirects
export const analyzeStudyMaterial = (req: GenerationRequest, onStatus?: (msg: string) => void) => notesGen(req, onStatus);
export const generateLazyGuide = (req: GenerationRequest, onStatus?: (msg: string) => void) => notesGen(req, onStatus);
export const generateFlashcards = async (req: GenerationRequest, onStatus?: (msg: string) => void) => { 
    const q = await quizGen(req, onStatus); 
    // Fix: Using 'question' as per QuizQuestion definition in types.ts (qu.stem does not exist)
    return { topic: req.topic, cards: q.questions.map(qu => ({ id: Math.random().toString(), front: qu.question, back: qu.correctAnswer, nextReview: 0, interval: 0, repetitions: 0, easeFactor: 2.5 })) }; 
};
export const generatePodcast = async (req: GenerationRequest, onStatus?: (msg: string) => void) => {
    if (onStatus) onStatus("Designing audio script architecture...");
    return { title: 'AI Podcast', topic: req.topic, script: 'AI Audio Script...', timestamp: Date.now() };
};

export const checkFileCacheStatus = async (file: any): Promise<boolean> => {
  const contentId = file.contentId || await sha256(file.data.substring(0, 5000));
  const atoms = await getAtomsForContent(contentId, 'notes');
  return atoms.length > 0;
};

export const generateAiTwinProfile = async (user: UserProfile, history: any[], results: any[]) => ({ learningStyle: 'Visual', predictedGrades: {}, killList: [], dailySchedule: [] });

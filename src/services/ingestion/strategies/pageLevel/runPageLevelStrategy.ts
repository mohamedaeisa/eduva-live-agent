import { IngestionConfig } from '../../../../types/ingestion';
import { extractAtomsFromDocument } from '../../../ai/atomExtractionService';
import { AtomCore, GenerationRequest, UserProfile } from '../../../../types';
import { auth } from '../../../firebaseConfig';

// Mock User Builder for legacy service compatibility
// The legacy service requires a UserProfile object.
const buildMockUser = (id: string): UserProfile => ({
    id,
    name: 'Student',
    email: '',
    role: 'STUDENT' as any,
    preferences: {} as any,
    gamification: {} as any,
    dailyStats: {} as any,
    joinedAt: Date.now(),
    lastLoginAt: Date.now()
} as UserProfile);

export async function runPageLevelStrategy(config: IngestionConfig): Promise<AtomCore[]> {
    // Map IngestionConfig to GenerationRequest for the extraction service
    const req: GenerationRequest = {
        subject: config.subject,
        topic: 'Ingestion', // Placeholder
        mode: 'atom_extraction',
        language: config.language,
        difficulty: 'Medium' as any,
        detailLevel: 'Detailed' as any,
        quizType: 'Mix' as any,
        questionCount: 0,
        contentId: config.documentId,
    };

    const userId = auth.currentUser?.uid || 'system_ingestion';
    const user = buildMockUser(userId);

    // Issue 8 fix: Removed redundant ensureAtoms() call.
    // Previously this called ensureAtoms() (which internally calls extractAtomsFromDocument)
    // AND then called extractAtomsFromDocument again — doubling the entire extraction work.
    // extractAtomsFromDocument already has full cache/resume logic built-in.
    return extractAtomsFromDocument(req, user, undefined, config.mode || 'RESUME');
}

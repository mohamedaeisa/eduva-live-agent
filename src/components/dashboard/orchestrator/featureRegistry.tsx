import React from 'react';
import { FeatureId } from '../types';

// Import Existing Modules (Wrapping them)
import AdaptiveQuizModuleV2 from '../../v2/AdaptiveQuizModuleV2';
import LibraryDashboard from '../../LibraryDashboard';
import StudyNotesAssembler from '../../StudyNotesAssembler';
import NoteDisplay from '../../NoteDisplay';
import SubjectCompass from '../../SubjectCompass';

// Registry Map
export const FEATURE_REGISTRY: Record<FeatureId, React.FC<any>> = {
  adaptive_quiz: AdaptiveQuizModuleV2,
  library: LibraryDashboard,
  study_assembler: StudyNotesAssembler,
  notes: NoteDisplay, 
  exam: () => <div>Exam Module Placeholder</div>, 
  stats: () => <div>Stats Placeholder</div>,
  gamification: () => <div>Gamification Placeholder</div>,
  subject_compass: SubjectCompass
};

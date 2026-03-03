
export enum Language {
  ENGLISH = 'English',
  ARABIC = 'Arabic'
}

export enum EducationSystem {
  NEIS = 'NEIS',
  STANDARD = 'Standard',
  IGCSE = 'IGCSE',
  IB = 'IB'
}

export type ExamMode = 'STANDARD' | 'PRACTICE' | 'CHALLENGE' | 'ADAPTIVE';

export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
  REMEDIAL = 'Remedial'
}

export enum QuizType {
  MCQ = 'MCQ',
  TRUE_FALSE = 'TrueFalse',
  FILL_IN_BLANK = 'FillInTheBlank',
  MIX = 'Mix'
}

export enum DetailLevel {
  BRIEF = 'Brief',
  DETAILED = 'Detailed',
  COMPLETE = 'Complete'
}

export enum AppView {
  HOME = 'HOME',
  DASHBOARD = 'DASHBOARD',
  QUIZ = 'QUIZ',
  NOTES = 'NOTES',
  EXAM = 'EXAM',
  PARENT_DASHBOARD = 'PARENT_DASHBOARD',
  ADMIN = 'ADMIN',
  LIBRARY = 'LIBRARY',
  PROFILE = 'PROFILE',
  SETTINGS = 'SETTINGS',
  GAMIFICATION = 'GAMIFICATION',
  BRIDGE = 'BRIDGE',
  ARENA = 'ARENA',
  SUMMARY = 'SUMMARY',
  STUDY_NOTES_ASSEMBLER = 'STUDY_NOTES_ASSEMBLER',
  ADAPTIVE_QUIZ = 'ADAPTIVE_QUIZ',
  CLASSROOM = 'CLASSROOM',
  LIVING_DASHBOARD = 'LIVING_DASHBOARD',
  STUDENT_HISTORY = 'STUDENT_HISTORY',
  MY_PRIVATE_TEACHER = 'MY_PRIVATE_TEACHER',
  PRICING = 'PRICING',
  BILLING = 'BILLING', // Legacy alias if needed
  BILLING_HISTORY = 'BILLING_HISTORY',
  MOCK_CHECKOUT = 'MOCK_CHECKOUT',
  CONTACT_US = 'CONTACT_US'
}

export enum UserRole {
  STUDENT = 'STUDENT',
  PARENT = 'PARENT',
  TEACHER = 'TEACHER',
  ADMIN = 'ADMIN'
}

export enum AuthorityLevel {
  MONITOR = 'MONITOR',
  CO_PILOT = 'CO_PILOT',
  COMMANDER = 'COMMANDER'
}

export enum InteractionState {
  ISSUED = 'ISSUED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  STUDYING = 'STUDYING',
  IN_PROGRESS = 'IN_PROGRESS',
  VERIFYING = 'VERIFYING',
  COMPLETED = 'COMPLETED',
  IGNORED = 'IGNORED',
  ACTION_SKIPPED = 'ACTION_SKIPPED',
  STALLED = 'STALLED'
}

export enum SignalType {
  WIN = 'WIN',
  STUCK = 'STUCK',
  IMPROVING = 'IMPROVING',
  ACTIVE = 'ACTIVE',
  NEUTRAL = 'NEUTRAL',
  CELEBRATION = 'CELEBRATION',
  SUPPORT = 'SUPPORT'
}

export type ParentSignalType = 'NEUTRAL' | 'CELEBRATION' | 'SUPPORT' | 'FIX' | 'CHALLENGE';

export type ParentActionType = 'TALK' | 'FOUNDATION_REPAIR' | 'EXAM' | 'IMPROVE' | 'PRACTICE' | 'MONITOR';

export interface DailyActivity {
  date: string;
  filesProcessed: number;
  actionsPerformed: number;
}

export interface UserPreferences {
  defaultYear: string;
  defaultCurriculum: EducationSystem;
  defaultLanguage: Language;
  defaultSubject: string;
  subjects: string[];
  theme: 'light' | 'dark';
  enableNotifications: boolean;
  enableVibration: boolean;
  aiModel?: string;
  enableSounds?: boolean;
  masteryMap?: Record<string, number>;
}

export interface GamificationProfile {
  xp: number;
  level: number;
  streak: number;
  lastStudyDate: number;
  earnedBadges: string[];
  masteryMap?: Record<string, number>;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  linkCode?: string;
  preferences: UserPreferences;
  joinedAt: number;
  lastLoginAt: number;
  dailyStats: DailyActivity;
  gamification: GamificationProfile;
  activeMission?: any;
  photoURL?: string;

  // Monetization (PA8.1)
  linkedParentId?: string;
  plan?: {
    id: 'FREE' | 'PRO' | 'ULTRA' | 'ULTRA_SIBLINGS';
    status: 'active' | 'past_due' | 'canceled' | 'none';
    startDate?: number;
    expiryDate?: number;
  };
}

export interface UserStats {
  totalHistory: number;
  quizCount: number;
  notesCount: number;
  flashcardsCount: number;
  podcastCount: number;
  homeworkCount: number;
  examCount: number;
}

export interface SessionData {
  sessionId: string;
  userId: string | null;
  userName: string;
  email: string | null;
  startTime: number;
  lastActiveAt: number;
  visitCount: number;
  sessionNumber: number;
  timezone: string;
  language: string;
  userAgentFull: string;
  darkModeEnabled: boolean;
  browser: string;
  os: string;
  deviceType: string;
  deviceModel: string;
  screenResolution: string;
  ipAddress: string | null;
  city: string | null;
  country: string | null;
  batteryLevel: number | null;
  isCharging: boolean | null;
  cpuCores: number | null;
  deviceMemory: number | null;
  networkSpeedEstimate: string | null;
  isAdBlockEnabled: boolean;
  loginMethod: string;
  cookieEnabled: boolean;
  localStorageAvailable: boolean;
  vpnOrProxyDetected: boolean;
  campaignSource: string | null;
  campaignMedium: string | null;
  campaignName: string | null;
  landingPage: string;
  initialReferrer: string;
  uploadedFilesCount: number;
  pdfPageCount: number;
  summaryRequests: number;
  quizRequests: number;
  studyDurationToday: number;
  isSubscribed: boolean;
  pagesVisited: string[];
  durationSeconds: number;
  scrollDepth: number;
  clickEventsCount: number;
  zoomLevel: number;
  isTouch: boolean;
  orientation: string;
  actionsLog: SessionAction[];
  featuresUsed: Record<string, number>;
  isFirstTimeUser: boolean;
  totalAiLatency: number;
  aiRequestCount: number;
  aiErrorCount: number;
  totalTokensUsed: number;
}

// ==========================================
// MONETIZATION MODULE TYPES (PA8.1/PA8.2)
// ==========================================

export interface Plan {
  id: string;             // e.g., "FREE", "PRO", "ULTRA"
  name: string;
  price: number;
  currency: string;
  billingCycle: 'MONTHLY' | 'YEARLY';
  limits: {
    quizzes: number;      // -1 for infinity
    exams: number;        // -1 for infinity
    ai_minutes: number;   // -1 for infinity
    notes: number;
    linked_accounts: number;
    trainedmaterial: number;
    pageLimit: number;
  };
  features: {
    parentModule: boolean;
    whatToStudyBasic: boolean;
    whatToStudyAdvanced: boolean;
    radar: boolean;
  };
  marketingFeatures?: string[]; // Configurable display text for features
  isActive: boolean;
}

export interface Subscription {
  id: string;
  ownerUid: string;       // Payer (Parent or Student)
  planId: string;
  provider: 'STRIPE' | 'FAWRY' | 'MANUAL' | 'FAKE_GATEWAY';
  providerSubId: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  currentPeriodEnd: number;
  beneficiaries: string[]; // List of student UIDs covered by this subscription
  createdAt: number;
}

export interface UsageCounter {
  studentUid: string;
  month: string;          // Format: "YYYY-MM"
  quizzesUsed: number;
  notesUsed: number;
  aiSecondsUsed: number;
  examsUsed: number;
  trainedMaterialUsed?: number;
  lastActivityTs: number;
}

export interface BillingResponse {
  checkoutUrl?: string;
  error?: string;
  message?: string;
}

export interface BillingEvent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  timestamp: number;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
  provider?: string;
  providerOrderId?: string;
  providerTransactionId?: string;
  planId?: string;
}

// ... existing monetization types
export interface EntitlementResult {
  allowed: boolean;
  remaining: number; // -1 if unlimited
  reason?: 'quota_exceeded' | 'plan_restriction' | 'expired';
}

export interface Discount {
  id: string;             // Unique Code, e.g., "SUMMER50"
  code: string;           // Display Code
  type: 'PERCENTAGE' | 'FIXED';
  value: number;          // 50 (percent) or 100 (EGP)
  expiryDate: number;     // Timestamp
  isActive: boolean;
  appliesToPlans?: string[]; // IDs of plans this applies to (optional, default all)
  usageLimit?: number;    // Max global uses
  usageCount?: number;    // Current uses
}

// End Monetization Types

export interface SessionAction {
  name: string;
  timestamp: number;
  details?: string;
  latencyMs?: number;
  topic?: string;
  isError?: boolean;
  model?: string;
  estimatedTokens?: number;
  metadata?: any;
}

export interface AtomMetadata {
  conceptTag: string;
  subject: string;
  language: string;
  narrativeSequence: number;
  sourceDocumentId: string;
  updatedAt: number;
  userId: string;
  gradeLevel: number;
  relatedConceptTags?: string[];
  sourcePageRefs?: number[];
  localStatus?: string;
  localOnly?: boolean;
  approvedBy?: string;
  approvedAt?: number;

  // Phase 3 R3 vNext linkage
  curriculumNodeId?: string;

  // Phase 3 R3 v1.1 P2: Enhanced Metadata
  curriculumMapId?: string;        // Link to parent map for full traceability
  extractionVersion?: string;      // e.g. "R3_v1.1" - tracks prompt/logic version
  aiModelUsed?: string;            // e.g. "gemini-3-flash-preview" - reproducibility
  contentHash?: string;            // SHA-256 of definition + keyRule for dedup
  validatedAt?: number;            // Timestamp of last LEL-X/schema validation
}

export interface CoreRepresentation {
  definition: string;
  keyRule: string;
  formula: string;
  primaryExample: string;
}

export interface ExtendedRepresentation {
  fullExplanation: string;
  analogy: string;
  misconceptions: string[];
  realWorldAnalogy: string;
  proTips: string[];
}

export interface AssessmentMetadata {
  difficultyCeiling: number;
  highestBloomObserved: number;
  essentialKeywords: string[];
  cognitiveLoad: 'low' | 'medium' | 'high';
  prerequisiteConceptTags: string[];
}

export interface AtomCore {
  atomId: string;
  trustScore: number;
  metadata: AtomMetadata;
  coreRepresentation: CoreRepresentation;
  extendedRepresentation: ExtendedRepresentation;
  assessmentMetadata: AssessmentMetadata;
  globalIdentityKey?: string;
  adminMeta?: any;
}

export interface AtomStudentState {
  masteryScore: number;
  localStatus: string;
  knowledgeGap: boolean;
}

export interface AtomViewModel {
  atomId: string;
  core: AtomCore;
  studentState: AtomStudentState;
}

export interface ResolvedAtom {
  atom: AtomCore;
  resolvedRelationships: {
    relatedAtomIds: string[];
    prerequisiteAtomIds: string[];
  }
}

export interface GenerationRequest {
  year?: string;
  curriculum?: EducationSystem;
  subject: string;
  topic: string;
  mode: 'quiz' | 'notes' | 'exam-generator' | 'study-with-me' | 'podcast' | 'lazy' | 'flashcards' | 'homework' | 'atom_extraction' | 'qa_runner' | 'cheatSheet' | 'fullNotes' | 'adaptive-quiz';
  language: Language;
  difficulty: Difficulty;
  detailLevel: DetailLevel;
  quizType: QuizType;
  questionCount: number;
  studyMaterialFile?: string;
  studyMaterialUrl?: string;
  fileName?: string;
  selectedDocumentIds?: string[];
  documentConfigs?: Record<string, any>;
  quizMode?: 'PRACTICE' | 'EXAM';
  sourceMissionId?: string;
  struggleAtoms?: string[];
  strictFormat?: boolean;
  contentId?: string;
  metadata?: {
    scope?: 'FILE' | 'SUBJECT';
    scopeId?: string;
    origin?: string;
    [key: string]: any;
  };
  customContext?: any;
  model?: string;
}

/** @deprecated Use QuizQuestionV2 */
export interface QuizQuestion {
  id: string | number;
  atomId?: string;
  type: string;
  difficulty: string;
  topic: string;
  cognitiveLevel?: string;
  question: string; // The stem
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

export interface QuizQuestionV2 {
  id: string;
  atomId: string;
  difficulty: number;
  questionType: string;
  stem: string;
  explanation: string;
  options?: string[];
  correctIndex?: number;
  answer?: string;
  pairs?: [string, string][];
  userAnswer?: any;
}

export interface QuestionRuntime extends QuizQuestionV2 {
  sessionId: string;
  questionId: string;
  timeLimitSec: number;
  allowHints: boolean;
  hints: any[];
  // Compatibility fields for QRO_SCHEMA
  type?: string;
  questionText?: string;
  // UI helpers
  conceptTag: string;
  difficultyLevel: number;
  validation: any;
  feedbackVisuals?: any;
}

export interface QuizData {
  title: string;
  topic: string;
  questions: QuizQuestion[];
  timestamp: number;
  contentId?: string;
  timeEstimate?: string;
  sourceMissionId?: string;
  struggleAtoms?: string[];
  fileName?: string;
}

export interface StudyNoteSection {
  heading: string;
  keyPoints: string[];
  definitions: { term: string; definition: string }[];
  examFacts: string[];
  trustScore?: number;
  pageRefs?: number[];
  mnemonic?: string;
  rememberThis?: string;
  examHint?: string;
  miniQuestion?: { question: string; answer: string };
  actionableTraps?: string[];
  linkedConcepts?: string[];
  difficultyBadge?: string;
  visualFlow?: string[];
}

export interface StudyWithMeData {
  title: string;
  summary: string;
  summaryMarkdown?: string;
  sections: StudyNoteSection[];
  timestamp: number;
  contentId: string;
  mode: string;
  atomIds: string[];
  sourceMissionId?: string;
  struggleAtoms?: string[];
  mermaidCode?: string;
  keyConcepts?: { term: string, definition: string }[];
}

export type StudyNoteData = StudyWithMeData;

export interface CheatSheetData {
  topic: string;
  content: string;
  timestamp: number;
  contentId: string;
}

export interface ExamData {
  schoolName: string;
  subject: string;
  grade: string;
  duration: string;
  sections: {
    title: string;
    instructions: string;
    questions: {
      id?: string;
      number: string;
      text: string;
      marks: number;
      options?: string[];
      correctAnswer?: string;
      questionType?: string;
      multiSelect?: boolean;
      lines?: number;
      reused?: boolean;
    }[];
  }[];
}

export interface HomeworkData {
  title: string;
  feedback: string;
  timestamp: number;
  originalImage?: string;
}

export interface PodcastData {
  title: string;
  topic: string;
  script: string;
  timestamp: number;
  audioBase64?: string;
}

export interface SalesCoachData {
  transcript: { speaker: string; text: string; timestamp: string }[];
  sentimentGraph: { label: string; score: number }[];
  coaching: { strengths: string[]; missedOpportunities: string[] };
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReview: number;
}

export interface HistoryItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  timestamp: number;
  data: any;
  tags?: string[];
  version?: number;
  metadata?: any;
}

export interface QuizResult {
  id: string;
  userId?: string;
  topic: string;
  score: number;
  total: number;
  percentage: number;
  date: number;
}

export interface LibraryItem {
  id: string;
  name: string;
  contentId: string;
  userId: string;
  type: 'file' | 'url' | 'text';
  timestamp: number;
  folderId?: string | null;
  data?: string;
}

export interface LibraryFolder {
  id: string;
  name: string;
  parentId: string | null;
  userId: string;
  timestamp: number;
}

export interface LocalTrainingSource {
  id: string;
  studentId: string;
  fileHash: string;
  fileName: string;
  status: 'Pending' | 'Training' | 'Completed' | 'Failed';
  progress: number;
  createdAt: number;
  updatedAt: number;
  data?: string;
  subject: string;
  educationSystem: string;
  grade: string;
  trustScore?: number;
  error?: string;
  logs?: string[];
  retryMeta?: {
    autoRetryAttempted: boolean;
    lastFailureReason?: 'API' | 'TIMEOUT' | 'CRASH';
    lastFailureAt?: number;
  };
}

// v1.3: Enhanced chunk status types
export type ChunkStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PAUSED_QUOTA'        // Waiting for quota reset (retryable)
  | 'FAILED_TRANSIENT'    // Timeout, retry immediately
  | 'FAILED_LOGIC'        // 🔒 TERMINAL - never retry
  | 'FAILED';             // Legacy fallback

export interface ChunkState {
  id: string;
  docFingerprint: string;
  batchIndex: number;
  status: ChunkStatus;
  retryCount: number;
  atomCount: number;
  updatedAt: number;
  pageStart: number;
  pageEnd: number;
  error?: string;
  startedAt?: number;

  // v1.3: Error classification
  failureType?: string;   // From FailureType enum
  retryAfter?: number;    // Timestamp for scheduled retry
}

// Re-export parent aggregation types
export type { ParentStudentOverview, ParentSubjectOverview, ParentSubjectProgressReport, ParentRelationship } from './types/parentAggregation';

export interface NoteRecord {
  id: string;
  contentId: string;
  fileId?: string;
  title: string;
  atomIds: string[];
  createdAt: number;
}

export interface FileRecord {
  id: string;
  contentId: string;
  filename: string;
  userId: string;
}

export interface ParentPreferences {
  learningIntent: 'EXAMS' | 'SKILL_BUILDING' | 'BALANCED';
  guidancePhilosophy: 'STRICT' | 'BALANCED' | 'NURTURING';
  strictnessLevel: number;
  difficultyGrowthRate: number;
  hintTolerance: number;
  foundationRepairThreshold: number;
  rescheduleInterval: number;
  rescheduleUnit: 'MINUTES' | 'HOURS' | 'DAYS';
}

export interface ParentProfile {
  userId: string;
  linkedStudents: string[];
  preferences: ParentPreferences;
  studentMeta?: Record<string, { authorityLevel: AuthorityLevel }>;
}

export interface ParentNudge {
  id: string;
  parentId: string;
  studentId: string;
  subject: string;
  intent: 'REVISE' | 'FIX' | 'CHALLENGE';
  status: 'PENDING' | 'SENT' | 'WORKING' | 'COMPLETED' | 'STALLED' | 'RETRY';
  interactionState: InteractionState;
  createdAt: number;
  lastActivityAt: number;
  weekNumber: number;
  metadata?: any;
  completedAt?: number;
  resultScore?: number;
  resultTotal?: number;
  stalledReason?: string;
  parentAlert?: boolean;
}

export interface CoverageRule {
  id: string;
  studentId: string;
  subject: string;
  topic: string;
  status: 'REQUIRED' | 'OPTIONAL' | 'LOCKED';
}

export interface ParentWallet {
  subscriptionTier: 'FREE' | 'PRO' | 'ELITE';
  balanceCredits: number;
  renewalDate: number;
  boostActive: boolean;
  consumption: { feature: string; credits: number; count: number }[];
}

export interface ParentFeedEvent {
  id: string;
  parentId: string;
  studentId: string;
  subject: string;
  title: string;
  message: string;
  signalType: SignalType | ParentSignalType;
  severity: 'INFO' | 'ATTENTION' | 'SUCCESS';
  isWin: boolean;
  createdAt: number;
  likes: string[];
  comments: Comment[];
  interactionState: InteractionState;
  progressPhase?: string;
  nextScheduledAt?: number;
  rescheduleCount?: number;
  aiDecisionTrace?: AIDecisionTrace;
  masteryMission?: MasteryMission;
  fileName?: string;
  contentId?: string;
  itemType?: 'assignment' | 'announcement';
  studentAction?: string;
}

export interface AIDecisionTrace {
  explanation: string;
  reasoning: string[];
  resolvedConcepts?: string[];
  masteryLevel?: number;
}

export interface MasteryMission {
  missionStatus: string;
  targetGaps?: string[];
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

export interface ProgressSignal {
  id: string;
  studentId: string;
  signalType: SignalType;
  message: string;
  updatedAt: number;
}

export interface ParentSignalLog {
  parentId: string;
  studentId: string;
  subject: string;
  signalType: ParentSignalType;
  studentHealthAtTime: 'STABLE' | 'NEEDS_ATTENTION' | 'CRITICAL';
  contentId?: string;
  fileName?: string;
  timestamp: number;
}

export interface SubjectHealthState {
  subjectId: string;
  studentId: string;
  overallStatus: 'GOOD' | 'NEEDS_ATTENTION' | 'CRITICAL';
  confidenceScore: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  primaryRiskTopic: string | null;
  cause: string;
  sparkline: number[];
  hoursLogged: number;
  lastEvaluatedAt: number;
}

export interface SubjectHealthEvidence {
  id: string;
  studentId: string;
  subjectId: string;
  masteryScore: number;
  practiceScore: number;
  consistencyScore: number;
  detailedTopics: TopicMetric[];
  engagementSummary: {
    hoursPerWeek: number;
    quizCompletion: number;
    homeworkCompletion: number;
    practiceRatio: number;
  };
  lastEvaluatedAt: number;
}

export interface TopicMetric {
  name: string;
  score: number;
  status: 'GOOD' | 'ATTENTION' | 'RISK';
  action: string;
  contentId: string;
  sourceDocumentId: string;
}

export interface ParentSignal {
  parentId: string;
  studentId: string;
  subjectId: string;
  actionType: ParentActionType;
  impactScore: number;
  timestamp: number;
}

export interface StudentAtomSummary {
  studentId: string;
  atomId: string;
  attempts: number;
  correct: number;
  avgTime: number;
  lastTested: number;
  updatedAt: any;
  conceptTag?: string;
  masteryPct: number;
}

export interface RawActivityEvent {
  id: string;
  atomId: string;
  studentId: string;
  subject: string;
  conceptTag: string;
  actionName: string;
  timestamp: number;
  durationMs: number;
  retries: number;
  wasSkipped: boolean;
  isCorrect: boolean;
  fileName?: string;
  contentId?: string;
}

export interface AIExplanation {
  insight: string;
  rootCause: string;
  missingFoundations: string[];
  catchUpTime: string;
  actionTakenByAI: string;
  systemActions: SystemActionItem[];
  parentActionRecommended: string;
  technicalLog: string;
}

export interface SystemActionItem {
  label: string;
  status: string;
}

export interface UpgradeRecommendation {
  title: string;
  description: string;
  cta: string;
  urgency: string;
  isBoost?: boolean;
}

export interface ParentDailyBrief {
  id: string;
  date: string;
  studentName: string;
  sentiment: string;
  keySummary: string;
  conversationalCues: string[];
  generatedAt: number;
}

export interface ParentReward {
  id: string;
  parentId: string;
  studentId: string;
  status: string;
  createdAt: number;
}

export interface TelemetryEvent {
  id: string;
  userId: string;
  studentId: string;
  module: string;
  eventType: string;
  payload: any;
  timestamp: string;
}

export interface QuizSessionInit {
  identity: { sessionId: string; initiatedBy: string };
  scope: { conceptTags: string[]; subject: string };
  atomConstraint: { trainedOnly: boolean; allowedAtomIds: string[]; ghostAtomIds: string[] };
  uiPredictiveState: {
    recommendedDifficulty: string;
    estimatedDurationMin: number;
    incentivePromise: { xpPotential: number; streakAtRisk: boolean };
  };
  ladderConstraints: { startLevel: number; maxLevel: number; forcedRemediation: boolean };
  behaviorProfile: { defaultMood: string; modifiers: { timePenaltyDisabled: boolean; hintsUnlimited: boolean } };
}

export interface AtomProgress {
  atomId: string;
  status: 'NEW' | 'IN_PROGRESS' | 'MASTERED';
  highestLevelCleared: number;
  lastReview: number;
}

export interface QuizSessionV2 {
  sessionId: string;
  studentId: string;
  sourceDocId: string;
  subject: string;
  pools: { 1: QuizQuestionV2[], 2: QuizQuestionV2[], 3: QuizQuestionV2[], 4?: QuizQuestionV2[] };
  history: (QuizQuestionV2 & { userAnswer: any })[];
  currentLevel: 1 | 2 | 3 | 4;
  currentAtomIndex: number;
  atomProgress: Record<string, AtomProgress>;
  synthesizingAtoms: string[];
  totalAtoms: number;
  masteredAtoms: number;
  metrics: { streak: number; consecutiveWrong: number };
  status: 'IDLE' | 'ACTIVE' | 'TERMINAL';
  version: number;
  updatedAt: number;
  expiresAt: number;
  isHydrated: boolean;
  config: { levelQuestionCount: number; allowedTypes: string[] };
  metadata?: { origin?: string; scope?: string; scopeId?: string;[key: string]: any };
  ladderConstraints: { startLevel: number; maxLevel: number; forcedRemediation: boolean };
}

export interface QuestionResult {
  response: any;
  isCorrect: boolean;
  responseTimeSec: number;
  hintsUsedCount: number;
  masteryDelta: number;
  atomId?: string;
}

export interface FixStudyData {
  fixMissionId: string;
  studentId: string;
  contentId: string;
  conceptTag: string;
  subject: string;
  generatedAt: number;
  notesContent: string;
  language: Language;
  repairedType: 'ATOMIC' | 'STRATEGIC';
  struggleAtoms?: string[];
}

export interface RemedialContent {
  analogy: string;
  explanation: string;
  examples: { scenario: string; application: string }[];
  narrative?: StrategicStep[];
}

export interface StrategicStep {
  phase: string;
  title: string;
  content: string;
  projection: string;
}

export interface GeneratedQuestion {
  id: string;
  atomId: string;
  type: string;
  bloomLevel: number;
  stem: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  hintLadder: string[];
}

export interface AiRecommendationEvent {
  recommendationId: string;
  targetAtoms: string[];
  actionSuggested: string;
  reasoning: string;
  urgency: string;
  atoms: string[];
}

export interface Classroom {
  id: string;
  name: string;
  code: string;
  creatorId: string;
  members: string[];
  memberProfiles: { id: string, name: string }[];
  grade: string;
  curriculum: string;
  createdAt: number;
}

export interface ClassroomAssignment {
  id: string;
  itemType: 'assignment';
  classroomId: string;
  type: 'quiz' | 'notes';
  topic: string;
  dueDate?: number;
  createdBy: string;
  creatorId: string;
  createdAt: number;
  submissions: Record<string, { score: number; timestamp: number; completed: boolean; attempts?: number; grading?: ExamGrading }>;
  comments: Comment[];
  likes: string[];
}

export interface ClassroomAnnouncement {
  id: string;
  itemType: 'announcement';
  classroomId: string;
  text: string;
  createdBy: string;
  creatorId: string;
  createdAt: number;
  comments: Comment[];
  likes: string[];
}

export interface ExamGrading {
  totalScore: number;
}

export interface AiTwinProfile {
  learningStyle: string;
  predictedGrades: Record<string, string>;
  killList: string[];
  dailySchedule: { time: string; type: string; activity: string }[];
}

export interface StudyContext {
  // ...
}

export interface XpNotification {
  amount: number;
  message: string;
  levelUp: boolean;
}

export interface SubjectCompassData {
  subjectId: string;
  subjectName: string;
  meta: {
    grade: string;
    activeSince: string;
    totalTimeSpentMinutes: number;
  };
  health: {
    coveragePercent: number;
    weakClustersCount: number;
    momentum: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  materials: MaterialCoverage[];  // Renamed from files
  insight: string;
  recommendedAction: CompassAction;
  failureState: 'NORMAL' | 'OVERLOAD';
  allWeakAtomIds?: string[];
}

export interface NodeWithMastery {
  nodeId: string;
  title: string;
  parentId?: string;
  examWeight: number;
  atoms: AtomCoverage[];   // Atoms linked to this node
  nodeMastery: number;      // 0-100%, weighted average of atom scores
  atomCount: number;
}

// Learning material grouping (legacy format)
export interface MaterialCoverage {
  materialId: string;      // Renamed from fileId
  materialName: string;    // Renamed from fileName
  materialType?: 'PDF' | 'VIDEO' | 'LESSON' | 'UNKNOWN';  // Optional for legacy
  coveragePercent: number;
  atoms: AtomCoverage[];
  status?: string;
  curriculumMap?: {        // NEW: Optional curriculum map data
    mapId: string;
    nodes: NodeWithMastery[];
    rootNodes: string[];
  };
}

// Backward compatibility alias
export type FileCoverage = MaterialCoverage;

export interface AtomCoverage {
  atomId: string;
  conceptTag: string;
  masteryLevel: 'STRONG' | 'PARTIAL' | 'WEAK' | 'UNKNOWN';
  masteryScore: number;
}

export interface WeakCluster {
  topic: string;
  atomIds: string[];
}

export interface CompassAction {
  id: string;
  label: string;
  description: string;
  type: 'REPAIR' | 'CHALLENGE' | 'SMART' | 'REVIEW' | 'NEW';
  atomIds?: string[];
  scope?: 'FILE' | 'SUBJECT';
  scopeId?: string;
}

export interface DecisionAction {
  type: 'PROBE' | 'COMMIT';
  targetState?: 'mastery' | 'struggle' | 'disengaged';
}

export interface InterventionPlan {
  taskType: string;
  difficulty: Difficulty;
  tone: string;
  uiTheme: string;
  studentTitle: string;
  parentSubtitle: string;
}

export interface Challenge {
  id: string;
  quizData: QuizData;
  creatorName: string;
  creatorId: string;
  creatorScore: number;
  creatorTotal: number;
  timestamp: number;
}

export interface AppNotification {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
  actionLabel?: string;
}

export type ClassroomFeedItem =
  | (ClassroomAssignment & { itemType: 'assignment' })
  | (ClassroomAnnouncement & { itemType: 'announcement' });

export type DeltaSignal = 'UP' | 'SAME' | 'DOWN';
export type ContextLevel = 'HIGH' | 'MID' | 'LOW';
export type UnderstandingContext = 'RUSHING' | 'STEADY' | 'CAREFUL';
export type HeadlineKey = 'EFFICIENCY_DETECTED' | 'UNSTOPPABLE_RHYTHM' | 'CONSISTENCY_BUILDING' | 'RECHARGING_PAUSE' | 'NEED_FOCUS' | 'QUIET_WEEK' | 'STEADY_ROUTINE' | 'NEW_TERRITORY';

export interface GrowthMirrorDelta {
  studentId: string;
  period: 'WEEK';
  comparedTo: 'PREVIOUS_WEEK';
  generatedAt: string; // ISO

  deltas: {
    consistency: DeltaSignal;
    consistency_context: ContextLevel; // Internal
    understanding: DeltaSignal;
    understanding_context: UnderstandingContext; // Internal
    confidence: DeltaSignal;
  };

  subjects: Record<string, 'FORWARD' | 'STABLE' | 'BACKWARD'>;

  meta: {
    isRecharging: boolean;
    frontierBreached: string[];
  };

  headlineKey: HeadlineKey;
}

// ------------------------------------------------------------------
// EDUVA EXAM MODULE (RFC-001 CDE)
// ------------------------------------------------------------------

export type ExamIntent =
  | 'CORE_KNOWLEDGE'
  | 'APPLICATION'
  | 'EXPERIMENTAL_METHODOLOGY'
  | 'DATA_INTERPRETATION';

export interface ExamBlueprint {
  id: string;
  sourceType: 'SUBJECT' | 'MATERIAL';
  sourceId: string;
  intent: ExamIntent[];
  title: string;
  mode: ExamMode;
  config: {
    durationMinutes: number;
    allowBacktracking: boolean;
  };
  sections: {
    id: string;
    title: string;
    description: string;
    atomProfile: {
      type: 'MCQ' | 'TEXT' | 'SCENARIO';
      tags: string[];
      bloomLevel: 'RECALL' | 'APPLICATION' | 'ANALYSIS';
      complexity: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    count: number;
    marksPerQuestion: number;
  }[];
  totalMarks: number;
  totalQuestions: number;
}

export type ExamItemStatus = 'PENDING' | 'READY' | 'ANSWERED' | 'FAILED';

export interface ExamItem {
  order: number;
  atomId: string;
  sectionId: string;

  // Input: The Immutable Atom Snapshot
  atomSnapshot: any;

  // Output: The Materialized Question (AI Generated)
  question?: {
    text: string;
    options?: string[];
    correctAnswerIndex?: number;
    isFallback?: boolean;
  };

  status: ExamItemStatus;
  failureReason?: 'INSUFFICIENT_ATOMS' | 'AI_ERROR' | 'AI_BATCH_ERROR' | 'AI_MISSING_OUTPUT' | 'PAYLOAD_TOO_LARGE' | 'AI_GENERATION_FAILED';

  // Runtime State
  userAnswer?: any;
  flags: {
    flaggedForReview: boolean;
    timeSpentMs: number;
    interactionCount: number;
  };
}

export interface ExamSession {
  id: string;
  blueprint: ExamBlueprint;
  studentId: string;
  startedAt: number;
  status: 'INITIATED' | 'IN_PROGRESS' | 'SUBMITTED' | 'ABANDONED';

  // Pre-allocated items (Deterministic)
  items: ExamItem[];

  // Experience Intelligence State
  eiAuditLog: {
    event: 'SUCCESS_PRIMER_APPLIED' | 'ANTI_FREEZE_NUDGE';
    atomId?: string;
    timestamp: number;
    details?: any;
  }[];
}

// Telemetry Constants (For usage safety)
export const EXAM_EVENTS = {
  SESSION_START: 'EXAM_SESSION_START',
  SESSION_INITIALIZED: 'EXAM_SESSION_INITIALIZED',
  QUESTION_ANSWERED: 'EXAM_QUESTION_ANSWERED',
  COMPLETED: 'EXAM_COMPLETED',
  PAYLOAD_TOO_LARGE: 'EXAM_PAYLOAD_TOO_LARGE',
  BATCH_SPLIT: 'EXAM_BATCH_SPLIT',
  BATCH_BUDGET_EXCEEDED: 'EXAM_BATCH_BUDGET_EXCEEDED',
  MICRO_LOOP_START: 'EXAM_MICRO_LOOP_START',
  MICRO_LOOP_COMPLETE: 'EXAM_MICRO_LOOP_COMPLETE'
};

export interface MicroLoopSession {
  id: string;
  userId: string;
  sourceExamId?: string; // If triggered from exam
  atomId: string;	       // The single focus
  questions: ExamItem[]; // 3-5 items
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  outcome?: 'RESOLVED' | 'PARTIAL' | 'FAILED';
  startedAt: number;
  completedAt?: number;
}

export interface AtomBloomsParameters {
  cognitiveDimension: string;
  knowledgeDimension: string;
}

export interface AtomIngestionMetadata {
  sourceFile: string;
  pageNumber: number;
  contextSnippet: string;
  confidenceScore: number;
}

export interface Atom extends AtomCore {
  id: string; // Legacy ID alias?
  content: string; // The Definition
  type: string; // 'CONCEPT' | 'RULE' etc.
  bloomsParameters: AtomBloomsParameters;
  ingestionMetadata: AtomIngestionMetadata;
}

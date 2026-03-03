# 🗂️ LIS v2 Data Architecture — Complete Reference

## 📊 Overview: Local vs Global Storage

### **Local Storage (IndexedDB)**
- **Purpose:** Fast, offline-first access for UI rendering
- **Scope:** Single device, single user
- **Data:** Training sources, curriculum maps, atom content, quiz sessions
- **Persistence:** Survives page refresh, cleared on logout

### **Global Storage (Firestore)**
- **Purpose:** Cross-device sync, analytics, parent access
- **Scope:** All devices, all users
- **Data:** Learning state, progress, telemetry, snapshots
- **Persistence:** Permanent, backed up, queryable

---

## 🗄️ Complete Collection Inventory

### **Category 1: LIS v2 Collections (NEW)**

#### 1. `telemetry_events` 📝
**Type:** Firestore (Global)  
**Purpose:** Immutable event log (audit trail)

**Schema:**
```typescript
{
  id: string;                    // UUID
  idempotencyKey: string;        // Prevents duplicates
  studentId: string;
  eventType: 'quiz.completed' | 'quiz.question.answered' | 'exam.completed';
  timestamp: number;
  payload: {
    // Event-specific data
    subject: string;
    granularResults: Array<{
      atomId: string;
      isCorrect: boolean;
      responseTimeSec: number;
    }>;
  };
  metadata?: Record<string, any>;
}
```

**Document ID:** Auto-generated UUID  
**Indexes:** `studentId`, `eventType`, `timestamp`  
**Retention:** Permanent (for analytics)

---

#### 2. `student_atom_signals` 📊
**Type:** Firestore (Global)  
**Purpose:** Per-atom mastery tracking (replaces `student_atom_summary`)

**Schema:**
```typescript
{
  studentId: string;
  atomId: string;
  subject: string;              // lowercase, e.g., "ict"
  
  // Core Signals (from formulas.ts)
  knowledge: number;            // 0-1, EWMA of correctness
  fluency: number;              // Median response time (sec)
  depth: number;                // 1-4, highest Bloom level
  
  // Metadata
  attempts: number;
  lastSeenAt: number;           // Timestamp
  masteryLevel: 'UNKNOWN' | 'WEAK' | 'OK' | 'STRONG';
  
  // Stability
  stability: number;            // Days since last attempt
  isStable: boolean;            // stability >= 7 days
}
```

**Document ID:** `{studentId}_{atomId}`  
**Indexes:** `studentId + subject`, `studentId + masteryLevel`  
**Updated By:** `atomAggregator.ts` after each quiz/exam

---

#### 3. `student_subject_health` 📈
**Type:** Firestore (Global)  
**Purpose:** Subject-level progress summary (replaces `student_decisions`)

**Schema:**
```typescript
{
  studentId: string;
  subject: string;              // lowercase
  
  // Aggregated Metrics
  mastery: number;              // 0-1, weighted average
  coverage: number;             // 0-1, % of curriculum mapped
  weakAtomCount: number;        // Atoms with mastery < 0.3
  
  // Trend Analysis
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  trendValue: number;           // EWMA delta
  
  // Timestamps
  lastUpdatedAt: number;
  lastActivityAt: number;
}
```

**Document ID:** `{studentId}_{subject}`  
**Indexes:** `studentId`, `subject`  
**Updated By:** `subjectAggregator.ts` after atom updates

---

#### 4. `student_compass_snapshots` 🧭
**Type:** Firestore (Global)  
**Purpose:** Pre-computed Compass UI data (replaces runtime computation)

**Schema:**
```typescript
{
  studentId: string;
  subject: string;
  scope: 'SUBJECT' | 'FILE';
  scopeId?: string;             // File hash if scope=FILE
  
  // Phase Detection
  phase: 'EXPLORATION' | 'REMEDIATION' | 'REINFORCEMENT';
  
  // Atom-Level Data
  atoms: Record<string, {
    level: 'UNKNOWN' | 'WEAK' | 'OK' | 'STRONG';
    attempts: number;
    lastSeen: number;
  }>;
  
  // File Grouping
  files: Record<string, {
    atomCount: number;
    weakCount: number;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  }>;
  
  // UI Metrics
  metrics: {
    contentCoverage: number;    // 0-1
    learningProgress: number;   // 0-1
    weakAreas: number;
  };
  
  // Recommended Actions
  recommendedAction: {
    type: 'NEW' | 'REPAIR' | 'SMART';
    label: string;
    atomIds: string[];
  };
  
  lastUpdatedAt: number;
}
```

**Document ID:** `{studentId}_{subject}_{scope}` or `{studentId}_{subject}_{scopeId}`  
**Indexes:** `studentId + subject`  
**Updated By:** `compassBuilder.ts` after subject health changes

---

#### 5. `student_growth_timeline` 📅
**Type:** Firestore (Global)  
**Purpose:** Longitudinal progress tracking (for charts/graphs)

**Schema:**
```typescript
{
  studentId: string;
  subject: string;
  
  // Daily Snapshots
  dailySnapshots: Array<{
    date: string;               // YYYY-MM-DD
    mastery: number;
    coverage: number;
    activeMinutes: number;
  }>;
  
  // Weekly Aggregates
  weeklyAggregates: Array<{
    weekStart: string;          // YYYY-MM-DD
    avgMastery: number;
    totalMinutes: number;
    quizzesCompleted: number;
  }>;
  
  lastUpdatedAt: number;
}
```

**Document ID:** `{studentId}_{subject}`  
**Retention:** 90 days (rolling window)  
**Updated By:** `timelineBuilder.ts` daily

---

#### 6. `parent_signals` 👨‍👩‍👧
**Type:** Firestore (Global)  
**Purpose:** Interpreted signals for parent dashboard

**Schema:**
```typescript
{
  studentId: string;
  
  // Per-Subject Insights
  subjects: Record<string, {
    status: 'ON_TRACK' | 'NEEDS_ATTENTION' | 'STRUGGLING';
    statusLabel: string;        // Human-readable
    insights: string[];         // ["Mastered 15 concepts", ...]
    alerts: string[];           // ["Weak in Algebra", ...]
    recentWins: string[];       // ["Completed Chapter 3", ...]
  }>;
  
  // Overall Summary
  overallStatus: string;
  lastUpdatedAt: number;
}
```

**Document ID:** `{studentId}`  
**Updated By:** `parentPropagator.ts` after compass updates

---

### **Category 2: Legacy Collections (DEPRECATED)**

#### ❌ `student_atom_summary` (Deprecated)
**Replaced By:** `student_atom_signals`  
**Status:** Read-only, will be migrated  
**Migration Script:** `scripts/migrate-to-lis-v2.ts`

#### ❌ `student_decisions` (Deprecated)
**Replaced By:** `student_subject_health`  
**Status:** Read-only, will be migrated

---

### **Category 3: Local Storage (IndexedDB)**

#### 7. `training_sources` 💾
**Type:** IndexedDB (Local)  
**Purpose:** Ingested PDF/document metadata

**Schema:**
```typescript
{
  fileId: string;               // SHA-256 hash
  fileName: string;
  subject: string;
  status: 'Pending' | 'Processing' | 'Completed' | 'Failed';
  createdAt: number;
  curriculum: string;
  year: string;
}
```

**Persistence:** Local only, not synced

---

#### 8. `curriculum_maps` 🗺️
**Type:** IndexedDB (Local)  
**Purpose:** Subject curriculum structure

**Schema:**
```typescript
{
  subject: string;
  curriculum: string;
  year: string;
  structure: {
    units: Array<{
      id: string;
      name: string;
      topics: Array<{
        id: string;
        name: string;
        atomIds: string[];
      }>;
    }>;
  };
}
```

**Persistence:** Local only, rebuilt from training sources

---

#### 9. `atoms` 🧬
**Type:** IndexedDB (Local)  
**Purpose:** Atom content and metadata

**Schema:**
```typescript
{
  id: string;                   // SHA-256 hash
  subject: string;
  content: string;              // Full text
  type: 'fact' | 'concept' | 'procedure';
  bloomLevel: number;           // 1-4
  sourceFileId: string;
  metadata: {
    language: string;
    curriculum: string;
    year: string;
  };
}
```

**Persistence:** Local only, large content not synced

---

#### 10. `quiz_sessions` 🎯
**Type:** IndexedDB (Local)  
**Purpose:** Active quiz session state

**Schema:**
```typescript
{
  id: string;
  studentId: string;
  subject: string;
  scope: 'FILE' | 'SUBJECT';
  scopeId?: string;
  
  pools: {
    1: QuizQuestionV2[];        // Easy
    2: QuizQuestionV2[];        // Medium
    3: QuizQuestionV2[];        // Hard
  };
  
  history: QuizQuestionV2[];    // Answered questions
  currentLevel: 1 | 2 | 3;
  status: 'ACTIVE' | 'TERMINAL';
}
```

**Persistence:** Local only, cleared after completion

---

## 🔄 Data Flow Diagram

```
┌─────────────────┐
│  User Action    │
│  (Quiz/Exam)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  ingestEvent()          │  ← Entry Point
│  telemetryIngestion.ts  │
└────────┬────────────────┘
         │
         ├──► telemetry_events (Firestore)
         │
         ▼
┌─────────────────────────┐
│  updateAtomSignals()    │
│  atomAggregator.ts      │
└────────┬────────────────┘
         │
         ├──► student_atom_signals (Firestore)
         │
         ▼
┌─────────────────────────┐
│  updateSubjectHealth()  │
│  subjectAggregator.ts   │
└────────┬────────────────┘
         │
         ├──► student_subject_health (Firestore)
         │
         ▼
┌─────────────────────────┐
│  buildCompassSnapshot() │
│  compassBuilder.ts      │
└────────┬────────────────┘
         │
         ├──► student_compass_snapshots (Firestore)
         │
         ▼
┌─────────────────────────┐
│  updateGrowthTimeline() │
│  timelineBuilder.ts     │
└────────┬────────────────┘
         │
         ├──► student_growth_timeline (Firestore)
         │
         ▼
┌─────────────────────────┐
│  propagateParentSignals()│
│  parentPropagator.ts    │
└────────┬────────────────┘
         │
         └──► parent_signals (Firestore)
```

---

## 📍 Storage Decision Matrix

| Data Type | Storage | Reason |
|-----------|---------|--------|
| **Atom Content** | Local (IndexedDB) | Large text, offline access |
| **Curriculum Maps** | Local (IndexedDB) | Derived from local files |
| **Training Sources** | Local (IndexedDB) | File metadata, not synced |
| **Quiz Sessions** | Local (IndexedDB) | Temporary, device-specific |
| **Learning State** | Global (Firestore) | Cross-device sync |
| **Progress Metrics** | Global (Firestore) | Parent access, analytics |
| **Telemetry Events** | Global (Firestore) | Audit trail, compliance |
| **UI Snapshots** | Global (Firestore) | Pre-computed, fast reads |

---

## 🔧 Migration Path

### Phase 1: Dual-Write (Current)
- ✅ Write to **both** old and new collections
- ✅ Read from **new** collections (LIS v2)
- ✅ Old collections remain for rollback

### Phase 2: Migration Script
```bash
npm run migrate:lis-v2 -- --dry-run
npm run migrate:lis-v2 -- --execute
```

Migrates:
- `student_atom_summary` → `student_atom_signals`
- `student_decisions` → `student_subject_health`

### Phase 3: Deprecation
- 🔒 Mark old collections read-only
- 🗑️ Schedule deletion after 30 days

---

## 🎯 Quick Reference

**For UI Developers:**
- Read from: `student_compass_snapshots`
- Never compute in UI, always read pre-computed snapshots

**For Backend Developers:**
- Write to: `telemetry_events` via `ingestEvent()`
- Let aggregators handle the rest automatically

**For Analytics:**
- Query: `telemetry_events` (immutable audit log)
- Aggregate: `student_growth_timeline` (time-series)

**For Parents:**
- Read from: `parent_signals` (interpreted, no raw metrics)

---

**Last Updated:** 2026-01-20 @ 17:06  
**LIS Version:** v2.1.1

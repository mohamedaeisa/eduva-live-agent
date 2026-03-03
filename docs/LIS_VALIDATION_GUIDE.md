# 🔍 LIS Validation Guide — Post-Quiz Verification

## ✅ What Was Fixed

**Problem:** Quiz executed successfully but results weren't persisted to LIS collections.  
**Root Cause:** Missing `ingestEvent` call after quiz completion.  
**Fix:** Added proper `quiz.completed` event ingestion in `AdaptiveQuizModuleV2.tsx:1130-1157`.

---

## 🗂️ DB Collections to Check (In Order)

### 1️⃣ **`telemetry_events`** (Immutable Event Log)
**Purpose:** Raw event storage (audit trail)

**Query:**
```javascript
db.collection('telemetry_events')
  .where('studentId', '==', 'YOUR_USER_ID')
  .where('eventType', '==', 'quiz.completed')
  .orderBy('timestamp', 'desc')
  .limit(1)
  .get()
```

**Expected Result:**
```json
{
  "id": "uuid...",
  "studentId": "YOUR_USER_ID",
  "eventType": "quiz.completed",
  "timestamp": 1737389884000,
  "payload": {
    "subject": "ICT",
    "mode": "NEW",
    "scope": "FILE",
    "granularResults": [
      {
        "atomId": "02892c34...",
        "isCorrect": true,
        "responseTimeSec": 30,
        "bloomLevel": 2
      }
      // ... 24 more atoms
    ]
  }
}
```

✅ **Pass Criteria:** Event exists with correct `granularResults` array.

---

### 2️⃣ **`student_atom_signals`** (Atom-Level State)
**Purpose:** Per-atom mastery tracking

**Query:**
```javascript
db.collection('student_atom_signals')
  .where('studentId', '==', 'YOUR_USER_ID')
  .where('subject', '==', 'ict')  // lowercase!
  .limit(10)
  .get()
```

**Expected Result (Per Atom):**
```json
{
  "studentId": "YOUR_USER_ID",
  "atomId": "02892c34...",
  "subject": "ict",
  "knowledge": 0.2,      // EWMA updated
  "fluency": 30,         // Response time
  "depth": 2,            // Bloom level
  "attempts": 1,
  "lastSeenAt": 1737389884000,
  "masteryLevel": "WEAK" | "OK" | "STRONG"
}
```

✅ **Pass Criteria:** 
- At least 25 documents (one per atom from quiz)
- `knowledge` > 0 (not default 0)
- `attempts` = 1
- `lastSeenAt` matches quiz timestamp

---

### 3️⃣ **`student_subject_health`** (Subject Aggregation)
**Purpose:** Subject-level progress summary

**Query:**
```javascript
db.collection('student_subject_health')
  .doc('YOUR_USER_ID_ict')  // composite key!
  .get()
```

**Expected Result:**
```json
{
  "studentId": "YOUR_USER_ID",
  "subject": "ict",
  "mastery": 0.15,           // Weighted average
  "coverage": 0.25,          // 25 atoms / total curriculum
  "weakAtomCount": 20,       // Atoms with mastery < 0.3
  "trend": "IMPROVING",
  "lastUpdatedAt": 1737389884000
}
```

✅ **Pass Criteria:**
- `mastery` > 0
- `coverage` > 0
- `weakAtomCount` reflects quiz results
- `lastUpdatedAt` matches quiz timestamp

---

### 4️⃣ **`student_compass_snapshots`** (UI Projection)
**Purpose:** Pre-computed Compass UI data

**Query:**
```javascript
db.collection('student_compass_snapshots')
  .doc('YOUR_USER_ID_ict_SUBJECT')  // composite key!
  .get()
```

**Expected Result:**
```json
{
  "studentId": "YOUR_USER_ID",
  "subject": "ict",
  "scope": "SUBJECT",
  "phase": "EXPLORATION",
  "atoms": {
    "02892c34...": {
      "level": "WEAK",
      "attempts": 1,
      "lastSeen": 1737389884000
    }
    // ... 24 more atoms
  },
  "files": {
    "splitB4_ICT-Grade7...": {
      "atomCount": 25,
      "weakCount": 20,
      "status": "IN_PROGRESS"
    }
  },
  "metrics": {
    "contentCoverage": 0.25,
    "learningProgress": 0.15,
    "weakAreas": 20
  }
}
```

✅ **Pass Criteria:**
- `atoms` object has 25 entries
- `metrics.contentCoverage` > 0
- `metrics.learningProgress` > 0
- `files` contains the quiz file

---

## 🧪 Quick Validation Script

Run this in Firestore console:

```javascript
// Replace with your actual user ID
const userId = 'YOUR_USER_ID';
const subject = 'ict';

// 1. Check telemetry event
db.collection('telemetry_events')
  .where('studentId', '==', userId)
  .where('eventType', '==', 'quiz.completed')
  .orderBy('timestamp', 'desc')
  .limit(1)
  .get()
  .then(snap => {
    if (snap.empty) {
      console.error('❌ NO QUIZ EVENT FOUND');
    } else {
      const event = snap.docs[0].data();
      console.log('✅ Quiz Event:', event.payload.granularResults.length, 'results');
    }
  });

// 2. Check atom signals
db.collection('student_atom_signals')
  .where('studentId', '==', userId)
  .where('subject', '==', subject)
  .get()
  .then(snap => {
    console.log(`✅ Atom Signals: ${snap.size} atoms tracked`);
    if (snap.size > 0) {
      const sample = snap.docs[0].data();
      console.log('Sample:', sample.atomId, 'knowledge:', sample.knowledge);
    }
  });

// 3. Check subject health
db.collection('student_subject_health')
  .doc(`${userId}_${subject}`)
  .get()
  .then(doc => {
    if (!doc.exists) {
      console.error('❌ NO SUBJECT HEALTH');
    } else {
      const health = doc.data();
      console.log('✅ Subject Health:', health.mastery, 'mastery,', health.coverage, 'coverage');
    }
  });

// 4. Check compass snapshot
db.collection('student_compass_snapshots')
  .doc(`${userId}_${subject}_SUBJECT`)
  .get()
  .then(doc => {
    if (!doc.exists) {
      console.error('❌ NO COMPASS SNAPSHOT');
    } else {
      const snap = doc.data();
      console.log('✅ Compass Snapshot:', Object.keys(snap.atoms).length, 'atoms');
    }
  });
```

---

## 🔄 Expected Flow After Fix

1. **Quiz Completes** → `finishV2Session()` called
2. **LIS Ingestion** → `ingestEvent({ eventType: 'quiz.completed', ... })`
3. **Event Routing** → `processQuizCompleted()` in `telemetryIngestion.ts`
4. **Atom Aggregation** → `updateAtomSignals()` for each result
5. **Subject Aggregation** → `updateSubjectHealth()` triggered
6. **Snapshot Build** → `buildCompassSnapshot()` creates UI projection
7. **Compass Refresh** → UI reads snapshot, shows progress!

---

## 🎯 What Should Change in UI

After quiz completion and page refresh:

| Metric | Before | After |
|--------|--------|-------|
| **Content Coverage** | 0% | ~25% |
| **Learning Progress** | 0% | ~15% |
| **Weak Areas** | 0 | ~20 |
| **File Status** | NOT STARTED | IN PROGRESS |
| **Atom Levels** | All UNKNOWN | Mix of WEAK/OK |

---

## ⚠️ Troubleshooting

### If Compass Still Shows 0%:

1. **Check Browser Console** for LIS ingestion logs:
   - `[LIS_INGESTION] Processing quiz completion`
   - `[LIS_AGGREGATION] Updated atom signals`

2. **Verify Event Structure** in `telemetry_events`:
   - `granularResults` array exists
   - Each result has `atomId`, `isCorrect`, `responseTimeSec`

3. **Check Firestore Rules** allow writes to:
   - `student_atom_signals`
   - `student_subject_health`
   - `student_compass_snapshots`

4. **Force Snapshot Rebuild** (if needed):
   ```javascript
   // In browser console
   await buildCompassSnapshot('YOUR_USER_ID', 'ict', 'SUBJECT');
   ```

---

**Last Updated:** 2026-01-20 @ 16:55  
**Status:** ✅ Fix Applied, Ready for Testing

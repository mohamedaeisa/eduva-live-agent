# 🐛 Compass Atom Status Bug — Root Cause & Fix

## 🔴 The Problem

**Symptom:** Quiz completed successfully, but Compass still shows all atoms as "NOT STARTED"

![Compass showing NOT STARTED](file:///C:/Users/emoheis/.gemini/antigravity/brain/0beae37c-bbd3-49d5-b88d-c88cc06c5c26/uploaded_image_1768922854644.png)

---

## 🎯 Root Cause Analysis

### Issue #1: Collection Name Mismatch ✅ FIXED

**Location:** `services/lis/compassBuilder.ts:116`

**Problem:**
```typescript
// ❌ WRONG (was writing here)
.collection('student_compass_snapshot')  // singular

// ✅ CORRECT (UI reads from here)
.collection('student_compass_snapshots')  // plural
```

**Impact:** All compass snapshots were being written to the wrong collection, making them invisible to the UI.

**Fix Applied:**
```diff
- .collection('student_compass_snapshot')
+ .collection('student_compass_snapshots')  // ✅ FIXED
```

---

### Issue #2: Missing LIS Ingestion Call ✅ FIXED (Previously)

**Location:** `components/v2/AdaptiveQuizModuleV2.tsx:1130`

**Problem:** Quiz completion wasn't calling `ingestEvent()` to trigger LIS pipeline.

**Fix Applied:** Added proper `quiz.completed` event ingestion with granular results.

---

### Issue #3: Optimization (Batched & Stateful) ✅ ADDED

**Problem:**
1. Snapshot rebuilt 9x per quiz (inefficient).
2. Signals "flapped" (appeared/disappeared) between updates.

**Fix Applied:**
1. **Batched Aggregation:** Triggered `updateSubjectHealth` ONCE at `quiz.completed` instead of per-atom.
2. **Stateful Signals:** Added `mergeSignals()` in `compassBuilder.ts` to persist signals (e.g., CELEBRATE lasts 3 days).

---

## 🔄 Complete Data Flow (Optimized)

```
1. Quiz Completes
   ↓
2. ingestEvent({ eventType: 'quiz.completed', ... })
   ├─→ Writes to: telemetry_events
   ↓
3. processQuizCompleted()
   ├─→ For each atom result: updateAtomSignals()
   │   └─→ Writes to: student_atom_signals
   │
   └─→ AFTER batch: updateSubjectHealth() ✅ (ONCE)
       ├─→ Writes to: student_subject_health
       ↓
4. buildCompassSnapshot()
   ├─→ Reads previous snapshot (for signal persistence) ✅
   ├─→ Merges new signals
   ├─→ Writes to: student_compass_snapshots
   ↓
5. Compass UI Reads Snapshot
```

---

## 🧪 How to Verify the Fix

### Step 1: Complete Another Quiz
The fix is now in place. Complete a new quiz to trigger the corrected pipeline.

### Step 2: Check Browser Console
Look for these logs (in order):

```
[LIS_INGESTION] Processing quiz completion: {sessionId}, 25 results
[LIS_AGGREGATION] Updated atom signals: {atomId}
[LIS_SUBJECT] Processing 25 atoms for ict
[LIS_SUBJECT] Subject health updated: ict, health=0.15, trend=improving
[LIS_COMPASS] Building snapshot for {userId}/ict
[LIS_COMPASS] Snapshot saved: 1 files, 4 signals
```

### Step 3: Check Firestore
**Query:**
```javascript
db.collection('student_compass_snapshots')
  .doc('YOUR_USER_ID_ict')
  .get()
```

**Expected Result:**
```json
{
  "studentId": "YOUR_USER_ID",
  "subjectId": "ict",
  "contentCoverage": 0.25,
  "learningProgress": 0.15,
  "files": [{
    "fileId": "...",
    "atoms": [{
      "atomId": "02892c34...",
      "masteryLevel": "WEAK",  // ✅ NOT "UNKNOWN"!
      "mastery": 0.2
    }]
  }]
}
```

### Step 4: Refresh Compass UI
After quiz completion:
1. Navigate back to Compass
2. Refresh the page (or wait for auto-refresh)
3. **Expected:** Atoms should now show "WEAK" or "OK" instead of "NOT STARTED"

---

## 📊 What Should Change

| Metric | Before | After Quiz |
|--------|--------|------------|
| **Content Coverage** | 0% | ~25% |
| **Learning Progress** | 0% | ~15% |
| **Atom Status** | NOT STARTED | WEAK / OK |
| **File Status** | NOT STARTED | IN PROGRESS |

---

## 🔍 Debugging Commands

If Compass still shows "NOT STARTED" after quiz:

### 1. Check if snapshot exists
```javascript
db.collection('student_compass_snapshots')
  .where('studentId', '==', 'YOUR_USER_ID')
  .where('subjectId', '==', 'ict')
  .get()
  .then(snap => console.log('Snapshots found:', snap.size))
```

### 2. Check atom signals were written
```javascript
db.collection('student_atom_signals')
  .where('studentId', '==', 'YOUR_USER_ID')
  .where('subject', '==', 'ict')
  .get()
  .then(snap => {
    console.log('Atoms tracked:', snap.size);
    snap.docs.forEach(doc => {
      const data = doc.data();
      console.log(data.atomId, 'mastery:', data.mastery, 'level:', data.masteryLevel);
    });
  })
```

### 3. Force snapshot rebuild (if needed)
```javascript
// In browser console
const { buildCompassSnapshot } = await import('./services/lis/compassBuilder');
await buildCompassSnapshot('YOUR_USER_ID', 'ict');
```

---

## ✅ Status

- [x] Collection name mismatch fixed
- [x] LIS ingestion wired
- [x] Aggregation chain verified
- [ ] User testing (next quiz)

**Next Action:** Complete another quiz to verify the fix works end-to-end.

---

**Fixed:** 2026-01-20 @ 17:27  
**Files Modified:**
- `services/lis/compassBuilder.ts` (line 116)
- `components/v2/AdaptiveQuizModuleV2.tsx` (line 1130-1157)

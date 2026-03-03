# SubjectCompass.tsx — LIS Migration Implementation

## File: components/SubjectCompass.tsx

This document contains the exact code changes to apply.

---

## CHANGE 1: Update Imports (Lines 2-14)

**Replace:**
```typescript
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    UserProfile, Language, SubjectCompassData,
    CompassAction, FileCoverage, AtomCoverage, GenerationRequest, QuizType, Difficulty, DetailLevel
} from '../types';
import { buildSubjectCompassData } from '../services/compassService';
```

**With:**
```typescript
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    UserProfile, Language, SubjectCompassData,
    CompassAction, FileCoverage, AtomCoverage, GenerationRequest, QuizType, Difficulty, DetailLevel
} from '../types';
import { buildSubjectCompassData } from '../services/compassService'; // DEPRECATED: Keep for fallback
import { useCompassSnapshot } from '../hooks/useCompassSnapshot'; // ✅ LIS
```

---

## CHANGE 2: Add Feature Flag (After line 63, before component logic)

**Add at line 64:**
```typescript
const SubjectCompass: React.FC<SubjectCompassProps> = ({ user, appLanguage, subject, onBack, onSubmit }) => {
    // 🚩 FEATURE FLAG: Toggle LIS snapshot vs old buildSubjectCompassData
    const USE_LIS_SNAPSHOTS = true; // Set to false to rollback
    
    const { state: dashboardState, dispatch } = useDashboard();
    // ... rest of component
```

---

## CHANGE 3: Add LIS Data Fetching (After line 76)

**Add after `const syncCounter = useRef(0);`:**
```typescript
    const syncCounter = useRef(0);

    // ✅ LIS: Fetch precomputed snapshot
    const { 
        data: lisSnapshot, 
        loading: lisLoading, 
        error: lisError 
    } = useCompassSnapshot(user.id, subject);
```

---

## CHANGE 4: Replace useMemo Calculations (Lines 140-164)

**Replace the entire useMemo block:**
```typescript
    const { syllabusCoverage, masteryHealth, unknownAtomIds } = useMemo(() => {
        // ... all calculation logic ...
    }, [data]);
```

**With:**
```typescript
    // ✅ LIS: Read metrics from snapshot (NO calculations)
    const contentCoverage = USE_LIS_SNAPSHOTS 
        ? (lisSnapshot?.contentCoverage ?? 0)
        : (data ? Math.round((data.files.flatMap(f => f.atoms).filter(a => a.masteryLevel !== 'UNKNOWN').length / data.files.flatMap(f => f.atoms).length) * 100) : 0);
    
    const learningProgress = USE_LIS_SNAPSHOTS
        ? (lisSnapshot?.learningProgress ?? 0)
        : masteryHealth;
    
    const healthScore = USE_LIS_SNAPSHOTS
        ? (lisSnapshot?.healthScore ?? 0)
        : 0;
    
    const trendLabel = USE_LIS_SNAPSHOTS
        ? (lisSnapshot?.trendLabel ?? 'Steady')
        : 'Steady';
    
    // For old path, keep original calculations
    const { syllabusCoverage: oldCoverage, masteryHealth, unknownAtomIds: oldUnknown } = useMemo(() => {
        if (USE_LIS_SNAPSHOTS || !data) return { syllabusCoverage: 0, masteryHealth: 0, unknownAtomIds: [] };
        
        const allAtoms = data.files.flatMap(f => f.atoms);
        const total = allAtoms.length;
        const touched = allAtoms.filter(a => a.masteryLevel !== 'UNKNOWN');
        const unknown = allAtoms.filter(a => a.masteryLevel === 'UNKNOWN').map(a => a.atomId);
        
        const syl = total > 0 ? Math.round((touched.length / total) * 100) : 0;
        
        const scoreSum = touched.reduce((acc, a) => {
            if (a.masteryLevel === 'STRONG') return acc + 100;
            if (a.masteryLevel === 'PARTIAL') return acc + 60;
            if (a.masteryLevel === 'WEAK') return acc + 30;
            return acc + (a.masteryScore || 0);
        }, 0);
        
        const mast = touched.length > 0 ? Math.round(scoreSum / touched.length) : 0;
        
        return { syllabusCoverage: syl, masteryHealth: mast, unknownAtomIds: unknown };
    }, [USE_LIS_SNAPSHOTS, data]);
    
    // Unknown atoms for "Expand" action
    const unknownAtomIds = USE_LIS_SNAPSHOTS
        ? (lisSnapshot?.files.flatMap(f => f.atoms).filter(a => a.masteryLevel === 'UNKNOWN').map(a => a.atomId) ?? [])
        : oldUnknown;
```

---

## CHANGE 5: Update Loading/Error Handling

**Find lines where loading/error are checked, update:**
```typescript
    // Use LIS loading state when enabled
    const isLoading = USE_LIS_SNAPSHOTS ? lisLoading : (loading || isSyncing);
    const displayError = USE_LIS_SNAPSHOTS ? lisError : error;
```

---

## CHANGE 6: Update UI Metric References

**Find and replace these patterns throughout render:**

```typescript
// Coverage stat
- value={`${syllabusCoverage}%`}
+ value={`${contentCoverage}%`}

// Mastery stat
- value={`${masteryHealth}%`}  
+ value={`${learningProgress}%`}

// Add health stat (new)
+ <StatCard
+     icon="💚"
+     label="Health Score"
+     value={`${healthScore}%`}
+     colorClass="bg-gradient-to-br from-emerald-400 to-teal-500"
+     subtext={trendLabel}
+ />
```

---

## CHANGE 7: Update Data Access

**Find patterns and update:**
```typescript
// Files access
- {data?.files.map(...)}
+ {(USE_LIS_SNAPSHOTS ? lisSnapshot?.files : data?.files)?.map(...)}

// Weak clusters (if used)
- {data?.weakStats}
+ {USE_LIS_SNAPSHOTS ? lisSnapshot?.weakClusters : data?.weakStats}
```

---

## Testing After Changes

```bash
# 1. Restart dev server
npm run dev

# 2. Navigate to Compass screen
# 3. Check console for:
[LIS_UI] Fetching compass snapshot: {subject}
[LIS_UI] Snapshot loaded: X files

# 4. Verify:
- Coverage displays
- Mastery displays  
- Health displays
- Trend shows
- Files render
- No console errors

# 5. To rollback:
Set USE_LIS_SNAPSHOTS = false
Restart server
```

---

## Summary of Changes

| What | Old | New |
|------|-----|-----|
| Data source | `buildSubjectCompassData()` | `useCompassSnapshot()` |
| Coverage | Calculated in `useMemo` | Read from `lisSnapshot.contentCoverage` |
| Mastery | Calculated (score approx) | Read from `lisSnapshot.learningProgress` |
| Health | Not shown | Read from `lisSnapshot.healthScore` |
| Trend | Not shown | Read from `lisSnapshot.trendLabel` |
| Feature flag | None | `USE_LIS_SNAPSHOTS` toggle |

---

**Lines Changed:** ~100 (mostly calculation removal)  
**Risk:** Low (feature-flagged, fallback available)  
**Rollback:** Set flag to `false`

**Ready to apply to SubjectCompass.tsx**

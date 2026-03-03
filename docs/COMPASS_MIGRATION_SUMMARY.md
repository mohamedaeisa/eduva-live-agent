# SubjectCompass.tsx Migration Summary

## Current Implementation Analysis

**File:** `components/SubjectCompass.tsx` (771 lines)

**Data Flow:**
```
useEffect → buildSubjectCompassData() → setData(compassData)
  ↓
useMemo → calculate syllabusCoverage, masteryHealth
  ↓
render UI with calculated metrics
```

## Changes Required

### 1. Replace Imports (Line 2-7)
```diff
- import { useState, useEffect, useRef, useMemo } from 'react';
+ import { useState, useRef } from 'react';
- import { buildSubjectCompassData } from '../services/compassService';
+ import { useCompassSnapshot } from '../hooks/useCompassSnapshot';
```

### 2. Replace Data Fetching (Lines 67-137)
```diff
- const [data, setData] = useState<SubjectCompassData | null>(null);
- const [loading, setLoading] = useState(true);
- const [error, setError] = useState<string | null>(null);
- 
- useEffect(() => {
-   const load = async () => {
-     const compassData = await buildSubjectCompassData(subject, user.id, dashboardState.state);
-     setData(compassData);
-   };
-   load();
- }, [subject, user.id, dashboardState.state]);

+ // ✅ LIS: Read from precomputed snapshot
+ const { data: lisData, loading, error } = useCompassSnapshot(user.id, subject);
```

### 3. Remove Calculation Logic (Lines 140-164)
```diff
- const { syllabusCoverage, masteryHealth, unknownAtomIds } = useMemo(() => {
-   const allAtoms = data.files.flatMap(f => f.atoms);
-   const total = allAtoms.length;
-   const touched = allAtoms.filter(a => a.masteryLevel !== 'UNKNOWN');
-   
-   const syl = total > 0 ? Math.round((touched.length / total) * 100) : 0;
-   
-   const scoreSum = touched.reduce((acc, a) => {
-     if (a.masteryLevel === 'STRONG') return acc + 100;
-     if (a.masteryLevel === 'PARTIAL') return acc + 60;
-     if (a.masteryLevel === 'WEAK') return acc + 30;
-     return acc + (a.masteryScore || 0);
-   }, 0);
-   
-   const mast = touched.length > 0 ? Math.round(scoreSum / touched.length) : 0;
-   
-   return { syllabusCoverage: syl, masteryHealth: mast, unknownAtomIds: unknown };
- }, [data]);

+ // ✅ LIS: Read from snapshot (no calculations)
+ const contentCoverage = lisData?.contentCoverage ?? 0;
+ const learningProgress = lisData?.learningProgress ?? 0;
+ const healthScore = lisData?.healthScore ?? 0;
```

### 4. Update UI References
```diff
- value={`${syllabusCoverage}%`}
+ value={`${contentCoverage}%`}

- value={`${masteryHealth}%`}
+ value={`${learningProgress}%`}

+ value={`${healthScore}%`} subtext={lisData?.trendLabel}
```

### 5. Update Data Structure Access
```diff
- data.files
+ lisData?.files ?? []

- data.weakStats  
+ lisData?.weakClusters ?? []

- // Radar signals were separate
+ lisData?.radarSignals ?? []
```

## Implementation Strategy

**Recommended Approach: Feature Flag**

```typescript
// Add at top of component
const USE_LIS = true; // Feature flag

// Conditional data source
const compassData = USE_LIS
  ? lisData  // New LIS snapshot
  : data;    // Old buildSubjectCompassData

const coverage = USE_LIS
  ? lisData?.contentCoverage ?? 0
  : syllabusCoverage;
```

**Benefits:**
- Easy toggle for testing
- Safe rollback
- Side-by-side comparison
- Gradual rollout

## Files to Update

1. **SubjectCompass.tsx** (this file)
2. **StudentRadar.tsx** → Use `lisData?.radarSignals` (radar consolidated)
3. **Journey screens** → Use `useGrowthTimeline()`
4. **Parent View** → Use `useParentSignals()`

## Testing Checklist

- [ ] Compass loads without errors
- [ ] Coverage shows correctly
- [ ] Mastery shows correctly  
- [ ] Health score displays
- [ ] Trend indicator works
- [ ] File breakdown renders
- [ ] Weak clusters display
- [ ] Actions launch correctly
- [ ] Loading states work
- [ ] Error states work
- [ ] Telemetry still fires

## Rollback Plan

If issues occur:
1. Set `USE_LIS = false`
2. Restart dev server
3. Old path activates immediately

## Notes

- Keep old `buildSubjectCompassData()` import for now (fallback)
- lisData structure matches old data (files, atoms, etc.)
- Radar signals now in compass snapshot (no separate call)
- Unknown atom IDs for "Expand" action: extract from `lisData.files`

---

**Status:** Ready to implement  
**Risk:** Low (feature-flagged)  
**Estimated Lines Changed:** ~50-100 (mostly deletions)

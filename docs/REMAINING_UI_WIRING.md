# Remaining UI Wiring — Summary

## Status: SubjectCompass.tsx ✅ COMPLETE

**What's Done:**
- ✅ Feature-flagged migration
- ✅ useCompassSnapshot() integrated
- ✅ useMemo calculations removed
- ✅ Metrics updated (contentCoverage, learningProgress)
- ✅ Backward compatibility maintained

**Ready to test manually.**

---

## Remaining Components

### 1. Radar Components (Consolidated)

**Files Found:**
- `dashboard/components/HomeRadarContainer.tsx`
- `dashboard/components/StudentGuidanceRadar.tsx`

**Change Required:**
Since Radar signals are now in Compass snapshot (`lisSnapshot.radarSignals`), these components should:
- Read from `useCompassSnapshot()` if needed
- OR receive `radarSignals` as props from SubjectCompass
- Remove any separate radar service/collection reads

**Note:** Radar is consolidated — no separate LIS collection. Signals come from `student_compass_snapshot.radarSignals`.

---

### 2. Journey / Growth Mirror (NOT FOUND)

**Search Result:** No Journey component found  
**Likely Names:** GrowthMirror, Timeline, Progress, History

**When found, apply:**
```typescript
import { useGrowthTimeline } from '../hooks/useGrowthTimeline';

const { data, loading, error } = useGrowthTimeline(userId, subject);

// Use data.dailySnapshots for charts
// Use data.weeklyAggregates for trends
```

---

### 3. Parent View Components

**Files Found (13 components):**
- `ParentDashboard.tsx` ⭐ (Main entry point)
- `ParentCompass.tsx`
- `ParentSubjectDetail.tsx`
- `ParentSubjectProgressReportView.tsx`
- `ParentFeed.tsx`
- `ParentCompassDetails.tsx`
- Others (onboarding, controls, chat, etc.)

**Primary Target:** `ParentDashboard.tsx`

**Change Required:**
```typescript
import { useParentSignals } from '../hooks/useParentSignals';

const { data, loading, error } = useParentSignals(parentId);

// Display:
- data.overallStatus (label, emoji, trend)
- data.subjects (GREEN/YELLOW/RED badges)
- data.engagement (study time, consistency)
- data.alerts (warnings)
- data.recentWins (celebrations)

// NO raw metrics (mastery%, coverage%, etc.)
```

---

## Recommended Execution Order

### 1. ⏭️ Skip Radar (Already Integrated)
Radar signals are in Compass s napshot. If separate Radar components exist, they can:
- Be deprecated (radar merged into Compass)
- OR read from SubjectCompass state (no separate data fetch)

### 2. 🔍 Find Growth Mirror / Journey
```bash
# Search for possible component names
find components -name "*Growth*"
find components -name "*Timeline*"
find components -name "*Mirror*"
find components -name "*History*"
```

### 3. 🎯 Migrate ParentDashboard.tsx
Most important parent component. Apply `useParentSignals()` hook.

---

## Quick Reference: What Each Hook Provides

### useCompassSnapshot (✅ Applied)
```typescript
{
  contentCoverage: number;
  learningProgress: number;
  healthScore: number;
  files: FileCoverage[];
  radarSignals: RadarSignal[]; // ⭐ Radar data here
  weakClusters: WeakCluster[];
}
```

### useGrowthTimeline (Ready to use)
```typescript
{
  dailySnapshots: Array<{ date, mastery, coverage, health }>;
  weeklyAggregates: Array<{ weekStart, avgMastery, totalStudyTime }>;
}
```

### useParentSignals (Ready to use)
```typescript
{
  overallStatus: { label, emoji, trendLabel };
  subjects: Array<{ name, status, insight, recommendation }>;
  engagement: { weeklyStudyTime, consistencyLabel };
  alerts: Alert[];
  recentWins: Win[];
}
```

---

## Next Steps

1. **Test SubjectCompass** - Verify LIS integration works
2. **Search for Growth/Timeline components**
3. **Migrate ParentDashboard.tsx**
4. **Manual testing of all updated screens**
5. **Remove feature flags** once stable

---

**The infrastructure is complete. Remaining work is mechanical application.**

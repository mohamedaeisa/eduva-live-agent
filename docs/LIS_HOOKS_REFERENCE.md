# LIS UI Hooks — Complete Reference

All hooks follow the same pattern: **Read snapshots. No calculations.**

---

## 1. useCompassSnapshot

**Purpose:** Compass screen data  
**File:** `hooks/useCompassSnapshot.ts`

### Usage
```typescript
import { useCompassSnapshot } from '../hooks/useCompassSnapshot';

const { data, loading, error } = useCompassSnapshot(studentId, subject);
```

### Returns
```typescript
{
  contentCoverage: number;        // 0-100
  learningProgress: number;       // 0-100 (mastery)
  healthScore: number;            // 0-100
  healthStatus: 'GOOD' | 'NEEDS_ATTENTION' | 'CRITICAL';
  trendLabel: string;             // "Improving ↗"
  totalStudyTime: string;         // "2h 30m"
  
  files: FileCoverage[];          // File breakdown
  radarSignals: RadarSignal[];    // Action recommendations
  recommendedAction: Action;      // Primary action
  weakClusters: WeakCluster[];    // Struggling topics
}
```

---

## 2. useGrowthTimeline

**Purpose:** Journey / Growth Mirror screens  
**File:** `hooks/useGrowthTimeline.ts`

### Usage
```typescript
import { useGrowthTimeline } from '../hooks/useGrowthTimeline';

const { data, loading, error } = useGrowthTimeline(studentId, subject);
```

### Returns
```typescript
{
  dailySnapshots: Array<{
    date: string;              // "2026-01-20"
    mastery: number;
    coverage: number;
    health: number;
    studyTimeSec: number;
    questionsAnswered: number;
  }>;
  
  weeklyAggregates: Array<{
    weekStart: string;         // "2026-01-13" (Monday)
    avgMastery: number;
    avgCoverage: number;
    totalStudyTime: string;    // "5h 20m"
    totalQuestions: number;
    daysActive: number;
  }>;
  
  totalDays: number;
  totalWeeks: number;
  latestHealth: number;
  latestTrend: string;
}
```

---

## 3. useParentSignals

**Purpose:** Parent View screen  
**File:** `hooks/useParentSignals.ts`

### Usage
```typescript
import { useParentSignals } from '../hooks/useParentSignals';

const { data, loading, error } = useParentSignals(parentId);
```

### Returns
```typescript
{
  overallStatus: {
    label: string;             // "On Track"
    emoji: string;             // "✅"
    trendLabel: string;        // "Improving"
  };
  
  subjects: Array<{
    name: string;              // "Mathematics"
    status: 'GREEN' | 'YELLOW' | 'RED';
    insight: string;           // Human-readable explanation
    recommendation: string;    // Actionable guidance
  }>;
  
  engagement: {
    weeklyStudyTime: string;
    consistencyLabel: string;
    trendLabel: string;
  };
  
  alerts: Alert[];             // Issues requiring attention
  recentWins: Win[];           // Celebrations
}
```

---

## Common Pattern

### Structure
```typescript
export function useLISHook(id: string, context?: string) {
  const [data, setData] = useState<UIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // Fetch snapshot
    // Format for UI (projection only)
    // Set state
  }, [id, context]);
  
  return { data, loading, error };
}
```

### Rules
- ✅ Read from `services/lisSnapshotReader`
- ✅ Format/project data only
- ❌ No calculations
- ❌ No aggregations
- ❌ No formulas

---

## Migration Checklist

When updating a screen to use LIS hooks:

- [ ] Import appropriate hook
- [ ] Replace data fetching logic
- [ ] Remove all `useMemo` calculations
- [ ] Update UI to read `data.{field}`
- [ ] Remove score approximations
- [ ] Test loading/error states
- [ ] Verify metrics display correctly
- [ ] Add feature flag (if gradual rollout)

---

## Example: Before & After

### Before (Violates Constitution)
```typescript
const compassData = await buildSubjectCompassData(subject, userId);

const mastery = useMemo(() => {
  const atoms = compassData.files.flatMap(f => f.atoms);
  const scores = atoms.map(a => {
    if (a.masteryLevel === 'STRONG') return 100;
    if (a.masteryLevel === 'PARTIAL') return 60;
    return 30;
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}, [compassData]);
```

### After (Constitutional)
```typescript
const { data } = useCompassSnapshot(userId, subject);
const mastery = data?.learningProgress ?? 0;
```

---

## Troubleshooting

### "Data is null"
- LIS pipeline not triggered yet (student hasn't completed quiz)
- Migration not run (old data not converted)
- Subject name normalization mismatch

### "Metrics don't match old UI"
- Expected: LIS uses different formulas (cold-start, floors, etc.)
- Check: Directional correctness, not exact numbers
- Action: Update UI expectations, NOT LIS formulas

### "Loading never completes"
- Check: Firestore rules allow read access
- Check: Collection names match (`student_compass_snapshot`, etc.)
- Check: Network tab for failed requests

---

**All hooks are snapshot-only. Any calculation = constitutional violation.**

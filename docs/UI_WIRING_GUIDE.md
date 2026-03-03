# UI Wiring Guide: SubjectCompass.tsx

## Current State (Calculations in UI)

```typescript
// ❌ OLD: Calls buildSubjectCompassData + calculations in useMemo
const compassData = await buildSubjectCompassData(subject, user.id, dashboardState.state);

const { syllabusCoverage, masteryHealth, unknownAtomIds } = useMemo(() => {
  const allAtoms = data.files.flatMap(f => f.atoms);
  const total = allAtoms.length;
  const touched = allAtoms.filter(a => a.masteryLevel !== 'UNKNOWN');
  
  // CALCULATION: breadth
  const syl = total > 0 ? Math.round((touched.length / total) * 100) : 0;
  
  // CALCULATION: depth (score approximation)
  const scoreSum = touched.reduce((acc, a) => {
    if (a.masteryLevel === 'STRONG') return acc + 100;
    if (a.masteryLevel === 'PARTIAL') return acc + 60;
    if (a.masteryLevel === 'WEAK') return acc + 30;
    return acc + (a.masteryScore || 0);
  }, 0);
  
  const mast = touched.length > 0 ? Math.round(scoreSum / touched.length) : 0;
  
  return { syllabusCoverage: syl, masteryHealth: mast, unknownAtomIds: unknown };
}, [data]);
```

## New State (Read from LIS Snapshot)

```typescript
// ✅ NEW: Use hook to read precomputed snapshot
import { useCompassSnapshot } from '../hooks/useCompassSnapshot';

// Replace the entire useEffect + useMemo with:
const { data, loading, error } = useCompassSnapshot(user.id, subject);

// All metrics come directly from snapshot (NO calculations)
const contentCoverage = data?.contentCoverage ?? 0;  // Was: syllabusCoverage
const learningProgress = data?.learningProgress ?? 0; // Was: masteryHealth
const healthScore = data?.healthScore ?? 0;
const healthStatus = data?.healthStatus ?? 'GOOD';
const trendLabel = data?.trendLabel ?? 'Steady';
```

## Step-by-Step Migration

### 1. Replace Imports

```diff
- import { buildSubjectCompassData } from '../services/compassService';
+ import { useCompassSnapshot } from '../hooks/useCompassSnapshot';
```

### 2. Replace Data Fetching

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
- }, [subject, user.id]);

+ const { data, loading, error } = useCompassSnapshot(user.id, subject);
```

### 3. Remove useMemo Calculations

```diff
- const { syllabusCoverage, masteryHealth, unknownAtomIds } = useMemo(() => {
-   // ... 25 lines of calculation logic
- }, [data]);

+ // Metrics come directly from snapshot
+ const contentCoverage = data?.contentCoverage ?? 0;
+ const learningProgress = data?.learningProgress ?? 0;
```

### 4. Update UI References

```diff
 <StatCard 
   icon="📚" 
   label="Content Coverage"
-  value={`${syllabusCoverage}%`}
+  value={`${contentCoverage}%`}
 />

 <StatCard 
   icon="🎯" 
   label="Learning Progress"
-  value={`${masteryHealth}%`}
+  value={`${learningProgress}%`}
 />

+ <StatCard 
+   icon="💚" 
+   label="Health Score"
+   value={`${data?.healthScore ?? 0}%`}
+   subtext={data?.trendLabel}
+ />
```

### 5. Update Radar Signals

```diff
- // Radar was separate collection
- const radarSignals = await getRadarSignals(studentId, subject);

+ // Radar signals consolidated into compass snapshot
+ const radarSignals = data?.radarSignals ?? [];
```

## What Gets Removed

**Delete these entirely:**
- `buildSubjectCompassData()` call
- All `useMemo` calculations for coverage/mastery
- Score approximation logic (STRONG=100, PARTIAL=60, etc.)
- File status determination logic
- Weak cluster detection (now in snapshot)

**Keep these:**
- UI rendering logic
- Action handlers (handleLaunch)
- Telemetry tracking
- Translation/i18n

## Verification Checklist

- [ ] No `buildSubjectCompassData` import
- [ ] No `useMemo` with calculations
- [ ] No `correct / attempts` logic
- [ ] No score approximations
- [ ] All metrics from `data.{field}`
- [ ] Loading/error states preserved
- [ ] UI renders correctly

## Full Example (Simplified Component)

```typescript
import { useCompassSnapshot } from '../hooks/useCompassSnapshot';

const SubjectCompass: React.FC<SubjectCompassProps> = ({ user, subject, onSubmit }) => {
  // ✅ Single source of data
  const { data, loading, error } = useCompassSnapshot(user.id, subject);
  
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!data) return <EmptyState />;
  
  // ✅ All metrics from snapshot (no calculations)
  return (
    <div>
      {/* Top Stats */}
      <StatCard label="Coverage" value={`${data.contentCoverage}%`} />
      <StatCard label="Mastery" value={`${data.learningProgress}%`} />
      <StatCard label="Health" value={`${data.healthScore}%`} subtext={data.trendLabel} />
      
      {/* Files */}
      {data.files.map(file => (
        <FileCard key={file.fileId} file={file} />
      ))}
      
      {/* Radar Signals */}
      {data.radarSignals.map(signal => (
        <RadarSignal key={signal.type} signal={signal} />
      ))}
      
      {/* Recommended Action */}
      <ActionCard action={data.recommendedAction} onLaunch={handleLaunch} />
    </div>
  );
};
```

---

## Important Notes

**Constitutional Compliance:**
- ❌ Any calculation in UI = VIOLATION
- ✅ Read from `data.{field}` only

**Backward Compatibility:**
- Keep old compassService (mark deprecated)
- Feature flag to control which path
- Gradual rollout recommended

**Testing:**
- Verify metrics match (directional, not exact)
- Check loading states
- Confirm error handling

# EDUVA Learning Intelligence System
# Architectural Constitution (v1.0)

**Effective Date:** 2026-01-20  
**Status:** 🔒 FROZEN  
**Enforcement:** ALL code changes must comply

---

## 1. Core Truth

> Learning truth is append-only, derived, and replayable.

| Layer | Nature | Mutability |
|-------|--------|------------|
| **Events** | Facts | Immutable |
| **Aggregations** | Derived | Recomputable |
| **Snapshots** | Projections | Disposable |

**Implications:**
- Delete derived data → recompute from events → identical result
- No "magic numbers" hidden in any layer
- Every metric traces back to student actions

---

## 2. Absolute Laws (Non-Negotiable)

### Law 1: UI Never Calculates
```
❌ const mastery = (correct / attempts) * 100;  // IN UI
✅ const mastery = snapshot.mastery;             // FROM SNAPSHOT
```

### Law 2: Parents Never Influence Truth
```
❌ health += parentBoost;           // BREAKS CAUSALITY
✅ priority += parentEngagement;    // AFFECTS COMMUNICATION ONLY
```

### Law 3: Formulas Live in One File
```
services/lis/formulas.ts   ← SINGLE SOURCE OF TRUTH
```

### Law 4: Formula Changes Require Protocol
```
1. Version bump (schemaVersion: '2.x')
2. Event replay on test data
3. Before/after diff report
4. Approval from tech lead
```

### Law 5: Subject Isolation is Mandatory
```
❌ WHERE studentId = X                    // NO SUBJECT FILTER
✅ WHERE studentId = X AND subject = Y    // ALWAYS FILTERED
```

### Law 6: Time is Active-Only, Capped, Contextual
```
✅ activeTimeSec (capped at 180s)
✅ attemptType: 'first' | 'retry'
✅ mode: 'practice' | 'exam' | 'challenge'
❌ raw elapsed time without context
```

---

## 3. Ownership Boundaries

| Layer | Allowed To | NOT Allowed To |
|-------|------------|----------------|
| **Telemetry** | Emit facts only | Compute derived values |
| **Aggregation** | Compute truth from events | Read from UI state |
| **Snapshots** | Prepare UI-ready views | Invent new metrics |
| **UI** | Render snapshots | Calculate anything |
| **Parent Layer** | Interpret signals | Access raw atom data |

### Collection Access Matrix

| Collection | Write By | Read By |
|------------|----------|---------|
| `telemetry_events` | Client modules | LIS pipelines only |
| `student_atom_signals` | LIS aggregation | LIS snapshot builders |
| `student_subject_health` | LIS aggregation | LIS snapshot builders |
| `student_compass_snapshot` | LIS snapshot | Compass UI (read-only) |
| `parent_signals` | LIS parent propagator | Parent UI (read-only) |

---

## 4. Violation = Bug (Not Feature)

> **Any module computing learning metrics outside LIS is a bug.**

### What Constitutes a Violation

| Violation | Example | Correct Approach |
|-----------|---------|------------------|
| UI math | `coverage = atoms.filter(...).length / atoms.length` | Read `snapshot.coverage` |
| Parent access to atoms | `db.collection('student_atom_signals')` in parent service | Read `parent_signals` only |
| Formula duplication | Copy-paste mastery formula to another file | Import from `formulas.ts` |
| Unfiltered queries | Query all student atoms without subject | Always filter by subject |
| Raw time usage | Use `Date.now() - startTime` as-is | Use capped `activeTimeSec` |

### When You See a Violation

1. **Do not merge** the PR
2. **File a bug** with tag `[LIS-VIOLATION]`
3. **Educate** the author about this constitution
4. **Fix** before release

---

## 5. Module Tagging (For Tooling)

```typescript
// In any LIS core file:
/**
 * @module LIS
 * @layer core
 * @frozen v2.1.1
 */
```

### Future CI Enforcement (Recommended)

```yaml
# .github/workflows/lis-guard.yml
- name: Block UI imports of formulas
  run: |
    if grep -r "from.*lis/formulas" components/; then
      echo "❌ UI cannot import LIS formulas directly"
      exit 1
    fi

- name: Block parent access to atom collections
  run: |
    if grep -r "student_atom_signals\|student_atom_mastery" services/parent*; then
      echo "❌ Parent layer cannot access atom-level collections"
      exit 1
    fi
```

---

## 6. Amendment Process

This constitution can only be amended through:

1. **RFC document** explaining the change
2. **Impact analysis** on existing data
3. **Migration plan** for affected collections
4. **Tech lead approval**
5. **Version bump** to constitution

---

## Final Statement

> This constitution exists because learning data is sacred.
>
> If telemetry lies, Compass lies.  
> If Compass lies, parents lose trust.  
> If parents lose trust, EDUVA fails.
>
> Protect the truth layer. Everything else is negotiable.

---

*Signed: LIS v2.1.1 Freeze*

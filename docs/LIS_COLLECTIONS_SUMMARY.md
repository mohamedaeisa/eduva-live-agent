# 📊 LIS v2 Collections — Quick Reference Table

## 🆕 New LIS v2 Collections (Firestore - Global)

| Collection | Purpose | Document ID | Updated By | Read By |
|------------|---------|-------------|------------|---------|
| **`telemetry_events`** | Immutable event log | UUID | `ingestEvent()` | Analytics |
| **`student_atom_signals`** | Per-atom mastery | `{userId}_{atomId}` | `atomAggregator` | Compass, Radar |
| **`student_subject_health`** | Subject progress | `{userId}_{subject}` | `subjectAggregator` | Dashboard, Parent |
| **`student_compass_snapshots`** | UI-ready Compass data | `{userId}_{subject}_{scope}` | `compassBuilder` | SubjectCompass UI |
| **`student_growth_timeline`** | Historical progress | `{userId}_{subject}` | `timelineBuilder` | Growth charts |
| **`parent_signals`** | Parent dashboard | `{userId}` | `parentPropagator` | Parent view |

---

## ❌ Deprecated Collections (Being Phased Out)

| Collection | Replaced By | Status | Migration |
|------------|-------------|--------|-----------|
| **`student_atom_summary`** | `student_atom_signals` | Read-only | `migrate-to-lis-v2.ts` |
| **`student_decisions`** | `student_subject_health` | Read-only | `migrate-to-lis-v2.ts` |

---

## 💾 Local Storage (IndexedDB - Device Only)

| Store | Purpose | Synced? | Cleared On |
|-------|---------|---------|------------|
| **`training_sources`** | PDF metadata | ❌ No | Logout |
| **`curriculum_maps`** | Subject structure | ❌ No | Logout |
| **`atoms`** | Atom content (text) | ❌ No | Logout |
| **`quiz_sessions`** | Active quiz state | ❌ No | Completion |

---

## 🔄 Data Flow Summary

```
Quiz Completion
    ↓
ingestEvent() → telemetry_events (Firestore)
    ↓
atomAggregator → student_atom_signals (Firestore)
    ↓
subjectAggregator → student_subject_health (Firestore)
    ↓
compassBuilder → student_compass_snapshots (Firestore)
    ↓
Compass UI reads snapshot (no computation!)
```

---

## 🎯 Key Principles

### ✅ DO:
- **Write** to Firestore via `ingestEvent()`
- **Read** from pre-computed snapshots
- **Store** large content (PDFs, atoms) locally

### ❌ DON'T:
- **Compute** metrics in UI components
- **Sync** atom content to Firestore (too large)
- **Query** raw telemetry for UI rendering

---

## 📍 Storage Decision Rules

| If Data Is... | Store In... | Reason |
|---------------|-------------|--------|
| **Large (>1MB)** | IndexedDB | Firestore has 1MB doc limit |
| **Cross-device** | Firestore | Needs sync |
| **Temporary** | IndexedDB | Cleared after use |
| **Computed** | Firestore (snapshot) | Pre-compute once, read many |
| **Audit trail** | Firestore (events) | Immutable, compliance |

---

**See full details:** `docs/LIS_DATA_ARCHITECTURE.md`

# Phase 1 Data Model: Compare Refs (A vs B)

**Feature**: `042-compare-refs`
**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

All new types live in `shared/types.ts` (single source of truth — Constitution Principle III).
Existing types referenced are: `FileChange`, `FileChangeStatus`, `Commit`, `RefInfo`,
`ActiveToggleWidget` (already includes `'compare'`).

---

## 1. Sentinels

```ts
/** Well-known constant: the SHA of Git's empty tree object. Used as the synthetic
 *  parent for root commits in compare ranges (FR-016). */
export const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
```

`WORKING_TREE` and `HEAD` are encoded as discriminated-union variants on `SlotValue`, not as
string sentinels — they carry no extra data and do not need separate constants.

---

## 2. SlotValue (Ref entity from spec, with implementation kinds)

```ts
export type SlotValue =
  | { kind: 'workingTree' }
  | { kind: 'head' }
  | { kind: 'branch'; name: string; remote?: string }
  | { kind: 'tag'; name: string }
  | { kind: 'commit'; hash: string }                  // raw hash paste, resolved at fill time
  | { kind: 'expression'; text: string }              // typed `git rev-parse`-compatible string
  | { kind: 'emptyTree' };                            // synthetic — only emitted by "Compare these
                                                      //   commits" when oldest is a root commit
                                                      //   (FR-016). Not user-selectable.
```

**Validation rules**:

- `branch.name` MUST be non-empty.
- `tag.name` MUST be non-empty.
- `commit.hash` MUST pass `validateHash` (existing util) — full or short hash up to 40 hex chars.
- `expression.text` MUST be non-empty after trim. The string is passed to git verbatim at
  Compare-click time; no client-side parsing — git reports the error if it doesn't resolve
  (FR-007 / FR-035).

**Equality (used by FR-021 "A == B"):**

Two slot values are equal if their `kind` matches and:
- `branch`: same `name` AND same `remote`.
- `tag`: same `name`.
- `commit`: same `hash` (case-insensitive — git is hex-case-insensitive).
- `expression`: same `text` after trim.
- `workingTree`/`head`/`emptyTree`: kind alone.

For semantic A==B detection (e.g., slot A is `main` which currently points to the same hash as
the right-clicked commit, FR-014 + edge case in spec line 124), comparison is done on the
**resolved** hash captured by the most recent compare run, not on the structural equality above.

---

## 3. CompareSelection (the (A, B, mode) tuple)

```ts
export type CompareMode = 'two-dot' | 'three-dot';

export interface CompareSelection {
  /** Slot A (Base). null when not yet set. */
  a: SlotValue | null;
  /** Slot B (Target). null when not yet set. */
  b: SlotValue | null;
  /** User's explicit mode override; null means "use default per Decision 4." */
  modeOverride: CompareMode | null;
  /** Last successfully resolved hashes for A and B, used to drive graph A/B markers
   *  (Decision 9) and FR-014 same-as-A guard. Cleared whenever a slot is edited. */
  aResolvedHash: string | null;
  bResolvedHash: string | null;
  /** Recently-used items, most-recent first, max 8. Pushed each time a slot is filled. */
  recents: SlotValue[];
}

export const EMPTY_COMPARE_SELECTION: CompareSelection = {
  a: null, b: null, modeOverride: null,
  aResolvedHash: null, bResolvedHash: null, recents: [],
};
```

**State transitions**:

| From → To trigger | Action |
|---|---|
| User picks/types a value into slot A or B | `a` (or `b`) updated; `aResolvedHash`/`bResolvedHash` cleared; any showing `compareResult` cleared (FR-020); slot value pushed to `recents`. |
| User clicks ✕ on slot | Slot set to `null`; `compareResult` cleared. |
| User clicks ⇄ swap | `a` and `b` swap; resolved hashes swap; `compareResult` cleared (FR-020 spec scenario US2#4). |
| User flips mode toggle | `modeOverride` set; `compareResult` cleared (FR-020). |
| User clicks Compare | RPC `compareRefs` dispatched; on success, `compareResult` set, `aResolvedHash`/`bResolvedHash` populated. |
| User cancels in-flight compare | RPC `cancelCompare` dispatched; on backend ack, `compareResult` cleared (was already loading); slots **unchanged** (FR-025b). |
| `switchRepo` / `displayRepo` | `compareSelection` reset to `EMPTY_COMPARE_SELECTION` (FR-030). |
| Window reload / extension reactivation | Implicit (store re-initializes) (FR-031). |
| Single commit clicked in graph | `compareResult` cleared; `commitDetails` rendered instead (FR-023). Slot values are NOT cleared. |

---

## 4. CompareResult

```ts
export interface CompareResult {
  /** Snapshot of the slot values at the moment Compare was clicked. */
  a: SlotValue;
  b: SlotValue;
  /** Effective mode used for this result (after Decision 4 default + override). */
  mode: CompareMode;
  /** True iff a three-dot was requested but fell back to two-dot because no merge
   *  base existed (FR-012 inline notice). */
  fellBackToTwoDot: boolean;
  /** Resolved hashes used for the diff. For `workingTree` either side, the
   *  corresponding field is null. */
  aResolvedHash: string | null;
  bResolvedHash: string | null;
  /** File list — same shape as `CommitDetails.files`, so existing render code reuses. */
  files: FileChange[];
  /** Aggregate stats. */
  stats: { additions: number; deletions: number };
}
```

`FileChange.status` for compare results uses the same `FileChangeStatus` union:
`added | modified | deleted | renamed | copied | untracked | unknown`. Mode-only changes (FR
edge case "differ only in mode/permissions") map to `'modified'` (consistent with existing
single-commit behavior). Binary files use the same `additions/deletions === undefined` signal as
single-commit files; the renderer already shows "binary" when those are absent.

---

## 5. Compare panel UI state (transient, not persisted)

```ts
export interface ComparePanelUIState {
  /** True while a compare RPC is in flight. Drives the loading indicator (FR-025a)
   *  and the Cancel affordance (FR-025b). */
  loading: boolean;
  /** Inline error from the last Compare attempt (e.g., "Unknown ref: feature/missing")
   *  or null. Populated from RPC error response (FR-007 / FR-034 / FR-035). Cleared
   *  whenever a slot is edited. */
  inlineError: string | null;
}
```

---

## 6. Store integration (graphStore additions)

New Zustand store fields (added alongside existing `commitDetails`, `searchState`, etc.):

```ts
interface GraphStore {
  // ...existing fields...
  compareSelection: CompareSelection;
  compareResult: CompareResult | null;
  comparePanelUI: ComparePanelUIState;
  // ...existing setters...
  setSlotA: (value: SlotValue | null) => void;
  setSlotB: (value: SlotValue | null) => void;
  swapSlots: () => void;
  setCompareModeOverride: (mode: CompareMode | null) => void;
  clearCompareState: () => void;            // called on switchRepo / displayRepo
  beginCompare: () => void;                 // sets loading=true, clears compareResult
  endCompareSuccess: (result: CompareResult) => void;
  endCompareError: (message: string) => void;
  endCompareCancelled: () => void;          // loading=false, slots unchanged
}
```

---

## 7. Cross-cutting: dismissal rules

A "showing compare result" is `compareResult !== null`. It is dismissed (set to `null`) by:

- Any slot edit (set, clear, swap) — FR-020.
- Any mode toggle flip — FR-020.
- A single-commit selection in the graph — FR-023. (`selectedCommit` setter triggers
  `compareResult = null` as a side effect.)
- A repo switch — FR-030.
- A successful new Compare run replaces it (atomic from the user's POV).

The toolbar Compare-button color (FR-002) is computed from `(activeToggleWidget, slotsFilled)`:

```ts
function compareButtonColor(active: boolean, anySlotFilled: boolean): ButtonColor {
  if (active) return 'open';                 // light blue
  if (anySlotFilled) return 'pending';       // light yellow
  return 'idle';                             // default
}
```

---

## 8. Persistence summary

| Field | Where it lives | Survives panel close/open | Survives repo switch | Survives window reload |
|---|---|---|---|---|
| `compareSelection` | Zustand store | yes | **no** (cleared) | **no** |
| `compareResult` | Zustand store | yes (until input change) | no | no |
| `comparePanelUI` | Zustand store | yes (loading flag survives if a compare is genuinely still running) | no | no |
| `activeToggleWidget` | Zustand store, NOT persisted | yes | yes | no |

This explicitly does NOT add fields to `PersistedUIState` (which lives in VS Code globalState).

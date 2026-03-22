# Graph Line Overlap Issue

## Problem

Two different branch lines visually overlap on the same lane in the Speedy Git Graph, making it impossible to distinguish them. The correct rendering (verified against Git Graph extension) should show them on separate lanes.

**Screenshots:**
- `specs/git-wrong.png` — Speedy Git Graph showing the overlap
- `specs/git-correct.png` — Git Graph extension showing correct rendering

## Observed Behavior

Starting from commit `6797f6b` (local dev branch), the origin/dev branch line (commit `4f4146d`) overlaps with the 018-commit-files-enhancements branch line (commit `7e01dbd`). Both lines render on the same lane, making them indistinguishable.

## Root Cause

The `reReserveParent` mechanism in `webview-ui/src/utils/graphTopology.ts` mutates a merge commit's first-parent connection from same-lane to cross-lane. For merge commits, the `continuationLane` is computed as `toLane` (not `fromLane`), so the passing line shifts to the new `toLane` — which is already occupied by another branch.

### Actual Git History at Time of Issue

```
6797f6b (dev, shared parent)
├── 8eff5b9 → 05f722e → 596995b → 7e01dbd   (018 branch, newer commits)
├── 4f4146d (merge PR#50, parents=[6797f6b, 0905748])   (origin/dev)
    └── 0905748 → 3a73653 → 30c11bd → 4769815 → b30a78a   (019 branch)
```

Both `8eff5b9` (018 base) and `4f4146d` (origin/dev merge) have `6797f6b` as their parent.

### Step-by-Step Algorithm Trace

Processing order (newest first, `--date-order`):

| Row | Hash      | Lane | Parents              | Notes                          |
|-----|-----------|------|----------------------|--------------------------------|
| 0   | `7e01dbd` | 0    | `[596995b]`          | 018 tip, reserves 596995b on lane 0 |
| 1   | `4f4146d` | 1    | `[6797f6b, 0905748]` | Merge; lane 0 occupied → lane 1; reserves 6797f6b on lane 1 |
| 2   | `0905748` | 2    | `[3a73653]`          | 019 tip on lane 2              |
| 3   | `3a73653` | 2    | `[30c11bd]`          | 019 implement                  |
| 4   | `596995b` | 0    | `[05f722e]`          | 018 implement                  |
| 5   | `30c11bd` | 2    | `[4769815]`          | 019 plan                       |
| 6   | `05f722e` | 0    | `[8eff5b9]`          | 018 plan                       |
| 7   | `4769815` | 2    | `[b30a78a]`          | 019 spec doc                   |
| 8   | `8eff5b9` | 0    | `[6797f6b]`          | **BUG TRIGGER:** parent 6797f6b already on lane 1; lane 0 < lane 1 → `reReserveParent` fires |
| 9   | `b30a78a` | 2    | `[dd652d9, 6797f6b]` | Main merge                     |
| 10  | `6797f6b` | 0    | `[8b018f7]`          | Dev (now on lane 0 after re-reserve) |

**At Row 8 (`8eff5b9`):**

1. `8eff5b9` is on lane 0, parent is `6797f6b`
2. `6797f6b` is already reserved on **lane 1** (by `4f4146d`'s first parent)
3. Since lane 0 < lane 1, `reReserveParent` fires:
   - Moves `6797f6b` from lane 1 → lane 0
   - **Frees lane 1** (`activeLanes[1] = null`)
   - **Mutates** `4f4146d`'s first-parent connection: `toLane` changes from 1 → 0
4. `4f4146d`'s connection is now cross-lane: `fromLane=1, toLane=0`
5. Since `4f4146d` is a merge commit, `continuationLane = toLane = 0`
6. The dev passing line from `4f4146d` (row 1) to `6797f6b` (row 10) now goes through **lane 0**
7. The 018 branch is **also on lane 0** → both lines overlap on lane 0 between rows 2–8

## General Pattern That Triggers This Bug

```
BASE (shared parent)
├── Feature branch: BASE ← F1 ← F2 ← F3  (F3 = newest, processed first)
├── Merge commit M: parents=[BASE, X_tip]  (processed second, higher lane)
    └── Other branch: ancestor ← X1 ← X2 ← X_tip
```

**Required conditions:**

1. **Two branches share the same parent** (`BASE`)
2. One descendant is a **merge commit** (`M`), the other is a **regular branch** (feature)
3. The feature branch tip (`F3`) is **newer** than the merge → processed first → occupies a lower lane
4. The feature branch has **enough intermediate commits** that its base (`F1`) is processed after the merge
5. When `F1` is processed, its lane is lower than where `BASE` is reserved → `reReserveParent` fires
6. The merge's first-parent `continuationLane` shifts to the feature branch's lane

### Why the Continuation Lane Matters

In `computePassingLanes` (line 353–358 of `graphTopology.ts`):

```typescript
const continuationLane =
  conn.fromLane === conn.toLane
    ? conn.toLane
    : isMergeCommit
    ? conn.toLane    // ← merge uses toLane (the re-reserved lane = feature's lane)
    : conn.fromLane;
```

After `reReserveParent` changes the merge's `toLane`, the passing line shifts to the feature branch's lane, causing visual overlap.

## Affected Code

- `webview-ui/src/utils/graphTopology.ts`
  - `calculateTopology()` — main algorithm (line 47)
  - `reReserveParent()` — the function that causes the mutation (line 386)
  - `computePassingLanes()` — passing lane calculation affected by the mutation (line 313)

# Research: Rebase Branch on Branch Badge Context Menu

## R1: Root Cause — Why rebase is hidden on branch badges for ancestor branches

**Decision**: Remove the `mergedCommits` ancestor check from `BranchContextMenu.tsx` `canRebaseOnto` condition.

**Rationale**: The current `canRebaseOnto` condition (lines 91-97 of `BranchContextMenu.tsx`) includes:
```typescript
!mergedCommits.some((c) => c.hash === targetHash)
```
This hides the rebase option when the target branch's commit is an ancestor of HEAD (i.e., already merged). However, the commit-row `canRebase` condition in `CommitContextMenu.tsx` (line 107) does NOT have this restriction:
```typescript
const canRebase = !isHeadCommit && !rebaseInProgress && !loading && !!currentLocalBranch;
```
This creates the inconsistency the user reported: right-clicking a commit row shows rebase, but right-clicking the branch badge on the same row does not.

Git handles rebasing onto an ancestor gracefully with "Current branch is up to date" — there is no harm in allowing it.

**Alternatives considered**:
- Keep the `mergedCommits` check but show it as disabled with a tooltip → rejected: inconsistent with commit-row behavior and adds complexity for no benefit.

## R2: Missing guards — Detached HEAD and same-commit-as-HEAD

**Decision**: Add `!!headBranch` (detached HEAD check) and `targetHash !== headBranch.hash` (same-commit-as-HEAD check) to the `canRebaseOnto` condition.

**Rationale**: The commit-row `canRebase` checks:
- `!!currentLocalBranch` — hidden in detached HEAD state
- `!isHeadCommit` — hidden when the target is the HEAD commit

The branch badge condition currently checks neither. To achieve consistency (FR-006, FR-004), both must be added:
- `!!headBranch` serves the same role as `!!currentLocalBranch` (detached HEAD guard)
- `targetHash !== headBranch.hash` serves the same role as `!isHeadCommit` (same-commit guard)

**Alternatives considered**: None — these are direct equivalents of the commit-row guards adapted for the branch badge context.

## R3: cherry-pick/revert in-progress check scope

**Decision**: Do NOT add `cherryPickInProgress` or `revertInProgress` checks to the branch badge `canRebaseOnto`.

**Rationale**: FR-005 mentions hiding during cherry-pick/revert, but FR-007 mandates consistency with the commit-row behavior. The commit-row `canRebase` (line 107) only checks `!rebaseInProgress && !loading` — it does not check `cherryPickInProgress` or `revertInProgress`. For consistency, the branch badge should match. If cherry-pick/revert guards are desired, they should be added to both menus simultaneously in a separate change.

**Alternatives considered**:
- Add all three operation checks to branch badge → rejected: would create inconsistency with commit-row behavior, violating FR-007.

## R4: Condition comparison summary

### Current BranchContextMenu `canRebaseOnto` (lines 91-97):
```typescript
const canRebaseOnto =
  !isCurrentBranch &&       // not the current branch
  !rebaseInProgress &&      // no rebase in progress
  !loading &&               // not loading
  isBranch &&               // is a branch (not tag/stash)
  !!targetHash &&           // target has a hash
  !mergedCommits.some(…);   // NOT an ancestor of HEAD ← REMOVE THIS
```

### Target BranchContextMenu `canRebaseOnto`:
```typescript
const canRebaseOnto =
  !isCurrentBranch &&           // not the current branch (≈ !isHeadCommit adapted for branches)
  !rebaseInProgress &&          // no rebase in progress
  !loading &&                   // not loading
  isBranch &&                   // is a branch (not tag/stash)
  !!targetHash &&               // target has a hash
  !!headBranch &&               // FR-006: not detached HEAD (≈ !!currentLocalBranch)
  targetHash !== headBranch.hash; // FR-004: target is not the HEAD commit (≈ !isHeadCommit)
```

### Changes:
1. **Removed**: `!mergedCommits.some((c) => c.hash === targetHash)` — the ancestor restriction
2. **Added**: `!!headBranch` — detached HEAD guard
3. **Added**: `targetHash !== headBranch.hash` — same-commit-as-HEAD guard

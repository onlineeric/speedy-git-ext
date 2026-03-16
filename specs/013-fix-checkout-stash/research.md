# Research: Fix Checkout with Uncommitted Changes Behavior

**Feature Branch**: `013-fix-checkout-stash`
**Date**: 2026-03-16

## Research Task 1: Git Checkout Conflict Error Detection

**Question**: What stderr output does git produce when checkout is rejected due to conflicting uncommitted changes?

**Finding**: When `git checkout <target>` fails because uncommitted changes in the working tree conflict with the target, git outputs to stderr:

```
error: Your local changes to the following files would be overwritten by checkout:
    <file1>
    <file2>
Please commit your changes or stash them before you switch branches.
Aborting
```

The key detection string is: `"Your local changes to the following files would be overwritten by checkout"`

This applies to both branch checkout (`git checkout <branch>`) and commit checkout (`git checkout <hash>`).

**Decision**: Detect conflicts by checking if `GitError.stderr` (or `GitError.message`, since `GitExecutor` uses stderr as the error message) contains `"would be overwritten by checkout"`.

**Rationale**: This substring is stable across git versions (present since at least git 2.0) and is specific to checkout conflicts — it won't match other error types.

**Alternatives considered**:
- Checking exit code only → rejected: non-zero exit code is shared with all git errors (invalid ref, detached HEAD issues, etc.)
- Running `git checkout --dry-run` first → rejected: no such flag exists; `git stash --dry-run` doesn't exist either
- Pre-computing conflicts via `git diff` → rejected: would replicate git's internal logic, fragile, and slower

## Research Task 2: Current Checkout Flow Analysis

**Question**: What is the current implementation doing and what exactly needs to change?

**Finding**: The current flow in `WebviewProvider.ts`:

1. `checkoutBranch` handler (line 326): Calls `isDirtyWorkingTree()` → if dirty, sends `checkoutNeedsStash` → user must stash
2. `checkoutCommit` handler (line 353): Same pattern — dirty check → force stash
3. `stashAndCheckout` handler (line 373): Stash → checkout → optional pull
4. `stashAndCheckoutCommit` handler (line 396): Stash → checkout

**Required change**: Remove the `isDirtyWorkingTree()` pre-check from both `checkoutBranch` and `checkoutCommit` handlers. Attempt checkout directly. If the checkout fails with a conflict error, send the `checkoutNeedsStash` / `checkoutCommitNeedsStash` response. If it fails for other reasons, send a normal error.

**Decision**: Modify `checkoutBranch` and `checkoutCommit` handlers to attempt-first, detect-conflict-on-failure pattern.

**Rationale**: Matches git's native behavior. Simpler code (no pre-check). The stash-and-checkout flow and UI dialogs remain unchanged.

## Research Task 3: Error Code Design

**Question**: Should we add a new `GitErrorCode` for checkout conflicts?

**Finding**: The existing `GitErrorCode` enum in `shared/errors.ts` already has pattern-specific codes like `CHERRY_PICK_CONFLICT`, `REVERT_CONFLICT`, `REBASE_CONFLICT`. A `CHECKOUT_CONFLICT` code fits naturally.

**Decision**: Add `CHECKOUT_CONFLICT` to the `GitErrorCode` union type. Create a helper function `isCheckoutConflict(error: GitError): boolean` in `GitBranchService.ts` for clean detection.

**Rationale**: Follows existing patterns (e.g., `isBranchNotFullyMerged` helper at line 7 of `GitBranchService.ts`). Keeps error classification in the service layer.

**Alternatives considered**:
- Detecting in `WebviewProvider.ts` directly → rejected: mixes transport concerns with git domain logic
- Adding detection to `GitExecutor.ts` → rejected: too low-level; executor shouldn't know about checkout semantics

## Research Task 4: Impact on "Checkout with Pull" Flow

**Question**: Does the "checkout with pull" flow need changes?

**Finding**: The `checkoutBranch` handler supports an optional `pull` flag. Currently the pull happens after a successful checkout. With the new flow:

1. Attempt checkout directly (regardless of dirty tree)
2. If checkout succeeds → proceed with pull if requested → refresh UI
3. If checkout fails with conflict → send `checkoutNeedsStash` (with `pull` flag preserved)
4. User confirms stash → `stashAndCheckout` handler runs (unchanged)

**Decision**: The `checkoutBranch` handler change naturally covers the pull case. The `stashAndCheckout` handler doesn't need modification.

**Rationale**: The pull flag is already propagated through the `checkoutNeedsStash` message and preserved in `pendingCheckout` state.

## Research Task 5: Frontend Impact Assessment

**Question**: Does the webview UI need any changes?

**Finding**: The frontend already has:
- `pendingCheckout` / `pendingCommitCheckout` state in Zustand store
- Stash confirmation dialogs in `BranchContextMenu.tsx` and `App.tsx`
- `checkoutNeedsStash` / `checkoutCommitNeedsStash` response handlers in `rpcClient.ts`

The only change is *when* these are triggered (conflict-only instead of always-on-dirty). The trigger mechanism (backend sending the response message) and the UI rendering (dialogs) remain identical.

**Decision**: Zero frontend changes required.

**Rationale**: The frontend is already correctly designed — it shows a stash dialog when told to. The bug is entirely in the backend's decision logic.

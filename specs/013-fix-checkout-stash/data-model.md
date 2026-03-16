# Data Model: Fix Checkout with Uncommitted Changes Behavior

**Feature Branch**: `013-fix-checkout-stash`
**Date**: 2026-03-16

## Entity Changes

### No Schema Changes

`GitErrorCode` in `shared/errors.ts` is **not modified**. Instead, conflict detection uses a simple `isCheckoutConflict(error: GitError): boolean` helper in `GitBranchService.ts` that checks if `error.message` contains `"would be overwritten by checkout"`. This avoids adding an error code that would never be assigned by `GitExecutor`.

All existing message types (`checkoutBranch`, `checkoutCommit`, `checkoutNeedsStash`, `checkoutCommitNeedsStash`, `stashAndCheckout`, `stashAndCheckoutCommit`) remain unchanged. The fix only changes *when* certain messages are sent, not *what* is sent.

## State Transitions

### Checkout Flow (Updated)

```
checkoutBranch / checkoutCommit received
  │
  ├─ git checkout succeeds → send 'success' + refresh UI
  │
  └─ git checkout fails
       │
       ├─ isCheckoutConflict(error) === true
       │   → send 'checkoutNeedsStash' / 'checkoutCommitNeedsStash'
       │   → user sees stash dialog
       │       ├─ "Stash & Checkout" → stashAndCheckout / stashAndCheckoutCommit
       │       └─ "Cancel" → no-op
       │
       └─ other error → send 'error' (shown as error message)
```

# Quickstart: Fix Checkout with Uncommitted Changes Behavior

**Feature Branch**: `013-fix-checkout-stash`

## What This Changes

The checkout behavior in Speedy Git is being fixed to match native `git checkout` behavior. Currently, the extension forces users to stash all uncommitted changes before any checkout — even when the changes don't conflict with the target branch/commit. After this fix, checkout will proceed silently when there are no conflicts, and only prompt for stashing when git actually rejects the checkout.

## Files to Modify

| File | Change |
|------|--------|
| `shared/errors.ts` | Add `CHECKOUT_CONFLICT` to `GitErrorCode` |
| `src/services/GitBranchService.ts` | Add `isCheckoutConflict()` helper |
| `src/WebviewProvider.ts` | Rewrite `checkoutBranch` and `checkoutCommit` handlers to attempt-first pattern |

## Key Implementation Pattern

**Before** (current — always pre-checks):
```typescript
case 'checkoutBranch': {
  const dirty = await this.gitBranchService.isDirtyWorkingTree();
  if (dirty.value) {
    this.postMessage({ type: 'checkoutNeedsStash', ... });
    break;
  }
  // only checkout if clean
}
```

**After** (fixed — attempt first, handle conflict):
```typescript
case 'checkoutBranch': {
  const result = await this.gitBranchService.checkout(name, remote);
  if (!result.success && result.error.code === 'CHECKOUT_CONFLICT') {
    this.postMessage({ type: 'checkoutNeedsStash', ... });
    break;
  }
  if (!result.success) {
    this.postMessage({ type: 'error', ... });
    break;
  }
  // success path unchanged
}
```

## Validation

1. `pnpm typecheck` — zero errors
2. `pnpm lint` — zero errors
3. `pnpm build` — clean build
4. Manual smoke test scenarios:
   - Checkout branch with no uncommitted changes → succeeds (no regression)
   - Checkout branch with non-conflicting changes → succeeds silently, changes preserved
   - Checkout branch with conflicting changes → stash dialog appears
   - Same three scenarios for commit checkout (detached HEAD)
   - "Stash & Checkout" from dialog → stashes and checks out
   - "Cancel" from dialog → stays on current branch

# Data Model: Checkout Commit (Detached HEAD)

**Branch**: `012-checkout-commit-detached-head` | **Date**: 2026-03-16

## New Message Types

### Request: `checkoutCommit`

```typescript
{ type: 'checkoutCommit'; payload: { hash: string } }
```

| Field   | Type   | Source                   | Notes                              |
|---------|--------|--------------------------|------------------------------------|
| `hash`  | string | `Commit.hash` from store | Full 40-char SHA, trusted internal |

**Trigger**: User selects "Checkout this commit" and confirms the detached HEAD dialog.
**Backend behavior**: Check dirty working tree → if dirty, respond `checkoutCommitNeedsStash`; if clean, run `git checkout <hash>`, respond `success`, then call `sendInitialData()`.

---

### Request: `stashAndCheckoutCommit`

```typescript
{ type: 'stashAndCheckoutCommit'; payload: { hash: string } }
```

| Field   | Type   | Source                          | Notes         |
|---------|--------|---------------------------------|---------------|
| `hash`  | string | `pendingCommitCheckout.hash` in store | Same hash from original `checkoutCommit` |

**Trigger**: User confirms the stash-and-proceed dialog after receiving `checkoutCommitNeedsStash`.
**Backend behavior**: Run `GitStashService.stash()`, then `GitBranchService.checkoutCommit(hash)`, respond `success`, then `sendInitialData()`.

---

### Response: `checkoutCommitNeedsStash`

```typescript
{ type: 'checkoutCommitNeedsStash'; payload: { hash: string } }
```

| Field   | Type   | Notes                                             |
|---------|--------|---------------------------------------------------|
| `hash`  | string | Echo of the requested commit hash — used by frontend to complete flow after stash |

**Trigger**: Backend detects dirty working tree during `checkoutCommit` handling.
**Frontend behavior**: `rpcClient` dispatches to `store.setPendingCommitCheckout({ hash })`, which causes `CommitContextMenu` to render the stash confirmation dialog.

---

## New Frontend Store State

### `graphStore.ts` additions

```typescript
pendingCommitCheckout: { hash: string } | null   // default: null
setPendingCommitCheckout: (v: { hash: string } | null) => void
```

**Purpose**: Holds the commit hash for a pending commit checkout that was blocked by a dirty working tree, triggering the stash-and-checkout dialog in `CommitContextMenu`. Mirrors `pendingCheckout` for branch checkouts.

---

## New Backend Service Method

### `GitBranchService.checkoutCommit(hash: string): Promise<Result<string, GitError>>`

```
git checkout <hash>
```

**Input**: Full commit hash (trusted, no validation needed).
**Output**: `ok('Checked out commit <hash>')` on success, `err(GitError)` on failure.
**State change**: Repository enters detached HEAD state.

---

## State Transitions

```
User right-clicks commit row
        │
        ▼
"Checkout this commit" selected
        │
        ▼
ConfirmDialog: "Checkout commit <abbrevHash> will result in detached HEAD. Continue?"
     │             │
  Cancel         Confirm
     │             │
  (no-op)    → send checkoutCommit { hash }
                   │
          ┌────────┴─────────────┐
      dirty tree             clean tree
          │                      │
  checkoutCommitNeedsStash     success
          │                   + sendInitialData
  store.pendingCommitCheckout    │
          │               graph refreshed
  ConfirmDialog:                 │
  "Stash and checkout?"     HEAD → detached
       │        │
    Cancel    Confirm
       │        │
  clear state  stashAndCheckoutCommit { hash }
                    │
               stash() + checkoutCommit(hash)
                    │
               success + sendInitialData
                    │
          graph refreshed, HEAD → detached
```

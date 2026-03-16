# Message Contracts: Checkout Commit (Detached HEAD)

These are the new webview↔extension message types added by this feature.
They extend `shared/messages.ts` — both `RequestMessage` and `ResponseMessage` union types, and their exhaustive type-guard maps.

---

## Request Messages (webview → extension)

### `checkoutCommit`

```typescript
{ type: 'checkoutCommit'; payload: { hash: string } }
```

- **When sent**: After the user confirms the detached HEAD warning dialog in `CommitContextMenu`.
- **Expected responses**: `checkoutCommitNeedsStash` (dirty tree) OR `success` + graph refresh (clean tree) OR `error`.

---

### `stashAndCheckoutCommit`

```typescript
{ type: 'stashAndCheckoutCommit'; payload: { hash: string } }
```

- **When sent**: After the user confirms the stash-and-proceed dialog triggered by `checkoutCommitNeedsStash`.
- **Expected responses**: `success` + graph refresh OR `error`.

---

## Response Messages (extension → webview)

### `checkoutCommitNeedsStash`

```typescript
{ type: 'checkoutCommitNeedsStash'; payload: { hash: string } }
```

- **When sent**: Backend detects a dirty working tree during `checkoutCommit` handling.
- **Frontend action**: Dispatch `store.setPendingCommitCheckout({ hash })` → stash dialog appears in `CommitContextMenu`.

---

## Message Flow Diagram

```
Webview                              Extension Host
  │                                        │
  │── checkoutCommit { hash } ────────────►│
  │                                        │─ isDirtyWorkingTree()
  │                                        │
  │◄── checkoutCommitNeedsStash { hash } ──│  (if dirty)
  │    OR                                  │
  │◄── success ────────────────────────────│  (if clean)
  │◄── sendInitialData → commits/branches  │
  │                                        │
  │── stashAndCheckoutCommit { hash } ────►│  (if stash path chosen)
  │                                        │─ stash() + checkoutCommit(hash)
  │◄── success ────────────────────────────│
  │◄── sendInitialData → commits/branches  │
```

---

## Impact on Exhaustive Maps

Both `REQUEST_TYPES` and `RESPONSE_TYPES` maps in `shared/messages.ts` must include the new keys:

```typescript
// REQUEST_TYPES additions:
checkoutCommit: true,
stashAndCheckoutCommit: true,

// RESPONSE_TYPES additions:
checkoutCommitNeedsStash: true,
```

TypeScript strict mode will error at compile time if these are omitted after the union types are extended.

# Message Contracts: Commit Node Hover Tooltip

## New Message Types

### Request: `getWorktreeList`

Sent by webview on graph load to request all active worktrees.

```typescript
{ type: 'getWorktreeList' }
```

No payload. Returns the full list for bulk caching.

### Response: `worktreeList`

Sent by extension backend with parsed worktree data.

```typescript
{
  type: 'worktreeList';
  payload: {
    worktrees: WorktreeInfo[];
  }
}
```

**When sent**: In response to `getWorktreeList` request, and also proactively during `sendInitialData()` alongside commits and branches.

**Error handling**: If `git worktree list` fails, send empty array `{ worktrees: [] }`.

## Existing Message Types (reused, no changes)

### Request: `isCommitPushed`

Already exists in `shared/messages.ts`. Used by tooltip for sync status.

```typescript
{ type: 'isCommitPushed'; payload: { hash: string } }
```

### Response: `commitPushedResult`

Already exists. Tooltip reads `pushed` boolean to determine "Local Only" vs "Pushed to Remote".

```typescript
{ type: 'commitPushedResult'; payload: { hash: string; pushed: boolean } }
```

## Message Flow Diagram

```
Graph Load:
  Frontend → Backend: { type: 'getCommits', ... }
  Backend → Frontend: { type: 'commits', ... }
  Backend → Frontend: { type: 'worktreeList', payload: { worktrees: [...] } }

Tooltip Hover (sync status cache miss):
  Frontend → Backend: { type: 'isCommitPushed', payload: { hash: 'abc123' } }
  Backend → Frontend: { type: 'commitPushedResult', payload: { hash: 'abc123', pushed: true } }
```

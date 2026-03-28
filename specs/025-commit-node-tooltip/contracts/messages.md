# Message Contracts: Commit Node Hover Tooltip

## New Message Types

### Request: `getContainingBranches`

Sent by webview on tooltip hover to request all branches (local and remote) that contain the commit in their history.

```typescript
{ type: 'getContainingBranches'; payload: { hash: string } }
```

**When sent**: On first hover of a commit (cache miss in `containingBranchesCache`). Not sent on subsequent hovers of the same commit (cache hit).

### Response: `containingBranches`

Sent by extension backend with the list of branches containing the commit.

```typescript
{
  type: 'containingBranches';
  payload: {
    hash: string;
    branches: string[];  // e.g., ["main", "feature/login", "remotes/origin/main", "remotes/origin/dev"]
  }
}
```

**Backend command**: `git branch -a --contains <hash>` via `GitExecutor` (30s timeout).

**Branch name format**: Branch names with leading whitespace and `* ` prefix (current branch marker) stripped. The `remotes/` prefix is stripped from remote branches so `remotes/origin/main` becomes `origin/main`, matching the existing `RefInfo` remote format used by `CommitRow` badges.

**Error handling**: If `git branch -a --contains` fails or times out, send empty array `{ hash, branches: [] }` and the frontend displays "Branch info unavailable."

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

## Message Flow Diagram

```
Graph Load:
  Frontend → Backend: { type: 'getCommits', ... }
  Backend → Frontend: { type: 'commits', ... }
  Backend → Frontend: { type: 'worktreeList', payload: { worktrees: [...] } }

Tooltip Hover (containing branches cache miss):
  Frontend → Backend: { type: 'getContainingBranches', payload: { hash: 'abc123' } }
  Backend → Frontend: { type: 'containingBranches', payload: { hash: 'abc123', branches: ['main', 'remotes/origin/main', ...] } }
```

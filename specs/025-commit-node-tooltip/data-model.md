# Data Model: Commit Node Hover Tooltip

## New Types (added to `shared/types.ts`)

### WorktreeInfo

Represents a single git worktree entry parsed from `git worktree list --porcelain`.

```typescript
export interface WorktreeInfo {
  /** Absolute filesystem path of the worktree */
  path: string;
  /** Commit hash currently checked out in this worktree */
  head: string;
  /** Branch name (e.g., "refs/heads/main"), empty string if detached */
  branch: string;
  /** Whether this is the main working directory (not an additional worktree) */
  isMain: boolean;
  /** Whether the worktree HEAD is detached */
  isDetached: boolean;
}
```

**Identity**: Unique by `path` (each worktree has a unique filesystem path).
**Lifecycle**: Created on graph load, refreshed on graph data refresh. Immutable between refreshes.

### ExternalRef

Represents a recognized external reference (PR, issue) extracted from a commit message.

```typescript
export interface ExternalRef {
  /** Display text (e.g., "#42", "JIRA-123") */
  label: string;
  /** Full URL to open in browser, or null if base URL cannot be determined */
  url: string | null;
  /** Type of reference */
  type: 'pr-or-issue' | 'jira';
}
```

**Identity**: Unique by `label` within a commit message.
**Lifecycle**: Computed on demand from `commit.subject`. Pure function, no state.

## Modified Types

### GraphStore (Zustand — `webview-ui/src/stores/graphStore.ts`)

New state fields:

```typescript
// Worktree data (bulk-fetched on graph load)
worktreeList: WorktreeInfo[];
worktreeByHead: Map<string, WorktreeInfo>;  // commit hash → WorktreeInfo for O(1) lookup

// Tooltip hover state
hoveredCommitHash: string | null;
tooltipAnchorRect: DOMRect | null;  // bounding rect of hovered SVG circle

// Sync status cache (per-commit, session-scoped)
syncStatusCache: Map<string, 'pushed' | 'local' | 'loading' | 'error'>;
```

New actions:

```typescript
setWorktreeList(list: WorktreeInfo[]): void;
setHoveredCommit(hash: string | null, anchorRect: DOMRect | null): void;
setSyncStatus(hash: string, status: 'pushed' | 'local' | 'loading' | 'error'): void;
clearTooltipCaches(): void;  // called on graph data refresh
```

## Existing Types (no changes needed)

### Commit (`shared/types.ts`)

Already contains all needed fields for tooltip display:
- `abbreviatedHash` — tooltip header
- `refs: RefInfo[]` — branches, tags, HEAD, stashes
- `subject` — for external reference parsing

### RefInfo (`shared/types.ts`)

Already has `name`, `type` ('head' | 'branch' | 'remote' | 'tag' | 'stash'), and optional `remote` field. Sufficient for FR-005 and FR-006.

### RemoteInfo (`shared/types.ts`)

Already has `fetchUrl` used to detect GitHub repos via `GitHubAvatarService.parseGitHubRemote()`.

## Data Flow

```
Graph Load:
  Backend: git worktree list --porcelain → parse → WorktreeInfo[]
  Backend → Frontend: worktreeList message
  Frontend: store.setWorktreeList() → builds worktreeByHead map

Hover Event:
  GraphCell circle mouseenter → store.setHoveredCommit(hash, rect)
  CommitTooltip renders (reads hoveredCommitHash from store)

  Tooltip sections:
  1. Short hash: commit.abbreviatedHash (immediate)
  2. References: commit.refs (immediate)
  3. Sync status: check syncStatusCache
     - Cache hit → display cached value
     - Cache miss → store.setSyncStatus(hash, 'loading')
                   → rpcClient.isCommitPushed(hash)
                   → on response: store.setSyncStatus(hash, 'pushed' | 'local')
  4. Worktree: store.worktreeByHead.get(hash) (immediate, O(1))
  5. External refs: parseExternalRefs(commit.subject, remoteUrl) (immediate, pure)

Dismiss:
  Circle mouseleave → 150ms timer → store.setHoveredCommit(null, null)
  Graph scroll → store.setHoveredCommit(null, null) (immediate)
```

## Relationships

```
Commit ──1:N──> RefInfo          (existing)
Commit ──1:0..1──> WorktreeInfo  (via worktreeByHead map lookup on commit.hash)
Commit ──1:0..1──> SyncStatus    (via syncStatusCache lookup on commit.hash)
Commit ──1:N──> ExternalRef      (computed from commit.subject)
```

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

### ContainingBranchesResult

Represents the cached result of a `git branch -a --contains <hash>` query for a commit.

```typescript
export interface ContainingBranchesResult {
  /** List of branch names containing this commit (both local and remote) */
  branches: string[];
  /** Fetch status */
  status: 'loaded' | 'loading' | 'error';
}
```

**Identity**: Keyed by commit hash in the cache map.
**Lifecycle**: Fetched on first hover per commit, cached for session duration, cleared on graph data refresh.

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

// Containing branches cache (per-commit, session-scoped)
containingBranchesCache: Map<string, ContainingBranchesResult>;
```

New actions:

```typescript
setWorktreeList(list: WorktreeInfo[]): void;
setHoveredCommit(hash: string | null, anchorRect: DOMRect | null): void;
setContainingBranches(hash: string, result: ContainingBranchesResult): void;
clearTooltipCaches(): void;  // called on graph data refresh
```

## Existing Types (no changes needed)

### Commit (`shared/types.ts`)

Already contains all needed fields for tooltip display:
- `abbreviatedHash` — tooltip header
- `refs: RefInfo[]` — tags, stashes, HEAD (direct pointers only; containing branches come from async fetch)
- `subject` — for external reference parsing

### RefInfo (`shared/types.ts`)

Already has `name`, `type` ('head' | 'branch' | 'remote' | 'tag' | 'stash'), and optional `remote` field. Used for tags, stashes, and HEAD display in the tooltip. Branch display comes from the containing branches cache instead.

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
  2. References:
     a. Tags, stashes, HEAD: from commit.refs (immediate, filtered to non-branch types)
     b. Containing branches: check containingBranchesCache
        - Cache hit → display cached branches
        - Cache miss → store.setContainingBranches(hash, { branches: [], status: 'loading' })
                      → rpcClient.getContainingBranches(hash)
                      → on response: store.setContainingBranches(hash, { branches: [...], status: 'loaded' })
                      → on error: store.setContainingBranches(hash, { branches: [], status: 'error' })
  3. Worktree: store.worktreeByHead.get(hash) (immediate, O(1))
  4. External refs: parseExternalRefs(commit.subject, remoteUrl) (immediate, pure)

Dismiss:
  Circle mouseleave → 150ms timer → store.setHoveredCommit(null, null)
  Graph scroll → store.setHoveredCommit(null, null) (immediate)
```

## Relationships

```
Commit ──1:N──> RefInfo              (existing; used for tags, stashes, HEAD only)
Commit ──1:0..1──> WorktreeInfo      (via worktreeByHead map lookup on commit.hash)
Commit ──1:N──> ContainingBranches   (via containingBranchesCache; async, shows all branches containing commit)
Commit ──1:N──> ExternalRef          (computed from commit.subject)
```

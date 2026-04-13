# Data Model: Batch Initial Data

## New Types

### InitialDataPayload

Complete snapshot of all data needed to render the full graph view. Sent as a single message during initial load and full refresh.

```typescript
/** Payload for the batched initial data message */
export interface InitialDataPayload {
  /** Commit list; null when fingerprint unchanged (auto-refresh optimization) */
  commits: Commit[] | null;
  /** Total commits loaded before client-side filtering */
  totalLoadedWithoutFilter: number;
  /** Whether more commits are available for pagination */
  hasMore: boolean;
  /** Branch list */
  branches: Branch[];
  /** Stash entries */
  stashes: StashEntry[];
  /** Uncommitted changes summary */
  uncommittedChanges: UncommittedSummary;
  /** Remote repository info */
  remotes: RemoteInfo[];
  /** Commit authors for filter dropdown */
  authors: Author[];
  /** Worktree list */
  worktrees: WorktreeInfo[];
  /** Submodule list and navigation stack */
  submodules: Submodule[];
  submoduleStack: SubmoduleNavEntry[];
  /** Operation states */
  cherryPickState: CherryPickState;
  rebaseState: RebaseState;
  rebaseConflictInfo: RebaseConflictInfo | null;
  revertState: RevertState;
  /** Data source errors (empty if all succeeded) */
  errors: string[];
}
```

**Location**: `shared/messages.ts`

**Relationships**:
- All field types (`Commit`, `Branch`, `StashEntry`, etc.) already exist in `shared/types.ts`
- This is a composition of existing types, not new domain entities
- The `commits: null` case signals the frontend should reuse its existing commit data (fingerprint unchanged)

### New ResponseMessage Variants

```typescript
// Added to the ResponseMessage union in shared/messages.ts
| { type: 'initialData'; payload: InitialDataPayload }
```

**Note**: A single `initialData` message type is used for both initial load and refresh. The `commits: null` field distinguishes fingerprint-unchanged refreshes. This avoids unnecessary type proliferation.

## Existing Types (unchanged)

The following types from `shared/types.ts` are referenced by `InitialDataPayload` but require no modifications:

| Type | Location | Role in Payload |
|------|----------|-----------------|
| `Commit` | types.ts:48 | Array of commit objects |
| `Branch` | types.ts:106 | Array of branch info |
| `StashEntry` | types.ts:276 | Array of stash entries |
| `UncommittedSummary` | types.ts:156 | Staged/unstaged/conflict file counts and lists |
| `RemoteInfo` | types.ts:270 | Array of remote repositories |
| `Author` | types.ts:129 | Array of commit authors |
| `WorktreeInfo` | types.ts:348 | Array of worktree entries |
| `Submodule` | types.ts:35 | Array of submodule info |
| `SubmoduleNavEntry` | types.ts:43 | Navigation stack for submodule drill-down |
| `CherryPickState` | types.ts:302 | `'idle' \| 'in-progress'` |
| `RebaseState` | types.ts:391 | `'idle' \| 'in-progress'` |
| `RebaseConflictInfo` | types.ts:395 | Conflict details during rebase |
| `RevertState` | types.ts:304 | `'idle' \| 'in-progress'` |

## State Transitions

### Loading States

```
[Panel opens]
  → loading: true (sent before data fetch)
  → initialData message arrives
  → loading: false (sent after initialData)
  → Graph rendered (single visual update)

[Manual refresh]
  → isRefreshing: true (set in store when refresh triggered)
  → Current graph remains visible with spinner
  → initialData message arrives (may have commits: null if fingerprint unchanged)
  → isRefreshing: false
  → Graph updated in-place (single visual transition)

[Auto-refresh]
  → isRefreshing: true
  → initialData message arrives
  → isRefreshing: false
  → Graph updated silently

[Targeted update (e.g., stage file)]
  → Individual message (e.g., uncommittedChanges)
  → Only affected store fields updated
  → No full topology recomputation (unless uncommitted counts change)
```

## Validation Rules

- `commits` must be `null` or a non-empty array (empty array is valid for repos with no commits)
- `errors` array items should be human-readable strings identifying the failed data source
- All array fields default to `[]` on failure
- `totalLoadedWithoutFilter` must be ≥ 0
- Operation states (`cherryPickState`, `rebaseState`, `revertState`) default to `'idle'` on failure

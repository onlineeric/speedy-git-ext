# Phase 1 Data Model: Git Worktree Management

No persistent database. "Entities" are the cross-boundary types in `shared/` plus transient Zustand store shape. Single source of truth: `shared/types.ts` and `shared/messages.ts` (Principle III).

## Shared types (`shared/types.ts`)

### WorktreeInfo (modified — add `isCurrent`)

```ts
export interface WorktreeInfo {
  path: string;        // absolute folder path of the worktree
  head: string;        // HEAD commit SHA
  branch: string;      // full ref (e.g. refs/heads/feature-x) or '' when detached
  isMain: boolean;     // first entry in porcelain output
  isDetached: boolean; // detached HEAD (no branch)
  isCurrent: boolean;  // NEW — path matches the active repo cwd ("you are here")
}
```

- **Validation**: `isMain` = first porcelain block; `isCurrent` = normalized path equals normalized active `workspacePath`.
- **Relationship**: many `WorktreeInfo` may share one `head` (basis for the array-valued lookup).
- **Removability rule**: a row is removable iff `!isMain && !isCurrent`.

### UserSettings (modified — add `worktreeBasePath`)

```ts
worktreeBasePath: string; // default '../${repoName}.worktrees' — parent dir only; ref appended as leaf
```

Added to `DEFAULT_USER_SETTINGS` and the `ExtensionController` settings read list. Setting key `speedyGit.worktree.basePath` already exists in `package.json`.

### WorktreeBranchMode (new — webview-local + RPC payload)

```ts
type WorktreeBranchMode = 'existing' | 'new' | 'detached';
```

Drives the git command form (research R4). Not persisted.

## Store shape (`webview-ui/src/stores/graphStore.ts`)

### worktreeByHead (modified)

```ts
worktreeByHead: Map<string, WorktreeInfo[]>;  // was Map<string, WorktreeInfo>
```

Built in `setWorktreeList` and `setBatchData` by appending into the array per `head`. Consumers:
- `CommitTooltip` → `WorktreeSection` reads `worktreeByHead.get(hash)` (now array; render label per entry).
- Graph row badge → renders when `(worktreeByHead.get(hash) ?? []).length > 0`.
- `WorktreeBadgeMenu` → one "Open in new window" item per array entry.

### ActiveToggleWidget (modified — `shared/types.ts:432`)

```ts
type ActiveToggleWidget = 'search' | 'filter' | 'compare' | 'worktree' | null;
```

## RPC message map (`shared/messages.ts`)

| Request (webview → host) | Payload | Response | Notes |
|---|---|---|---|
| `getWorktreeList` *(existing)* | `{}` | `worktreeList { worktrees }` | now includes `isCurrent` |
| `resolveWorktreePath` *(new)* | `{ ref, branchMode, newBranchName? }` | `worktreePathResolved { path, leafName }` | non-blocking dialog seed |
| `addWorktree` *(new)* | `{ path, ref, branchMode, newBranchName?, force? }` | `success`/`error` → then `worktreeList` + graph refresh | |
| `removeWorktree` *(new)* | `{ path, force? }` | `success`/`error` → then `worktreeList` + graph refresh | branch delete is a separate `deleteBranch` call |
| `pruneWorktree` *(new)* | `{}` | `success`/`error` → then `worktreeList` + graph refresh | |
| `openWorktree` *(new)* | `{ path }` | none | `vscode.openFolder` forceNewWindow |
| `revealWorktree` *(new)* | `{ path }` | none | `revealFileInOS` |
| `deleteBranch` *(existing)* | reuse | `success`/`error` | called after remove when "also delete branch" checked |

Add new `type` strings to the `RequestMessage` / `ResponseMessage` unions and the request/response `type` guard maps (mirroring `getWorktreeList: true`, `worktreeList: true`).

## Backend service surface (`GitWorktreeService`)

```ts
listWorktrees(): Promise<Result<WorktreeInfo[]>>            // modified: sets isCurrent
addWorktree(opts: {
  path: string; ref: string; branchMode: WorktreeBranchMode;
  newBranchName?: string; force?: boolean;
}): Promise<Result<void>>
removeWorktree(path: string, opts?: { force?: boolean }): Promise<Result<void>>
pruneWorktrees(): Promise<Result<void>>
resolveWorktreePath(opts: {
  ref: string; branchMode: WorktreeBranchMode; newBranchName?: string;
}): Promise<Result<{ path: string; leafName: string }>>     // sanitize + token + main-anchor + collision
```

- All return `Result<T, GitError>` (Principle III).
- Branch deletion is **not** here — reuses `GitBranchService.deleteBranch(name, force)`.
- Lock/unlock intentionally absent (deferred per spec).

## Command construction (`webview-ui/src/utils/gitCommandBuilder.ts`)

For `CommandPreview`, quoting paths with spaces:
- `buildAddWorktreeCommand({ path, ref, branchMode, newBranchName })` →
  - existing: `git worktree add "<path>" <branch>`
  - new: `git worktree add -b <newName> "<path>" <ref>`
  - detached: `git worktree add --detach "<path>" <ref>`
- `buildRemoveWorktreeCommand({ path, force })` → `git worktree remove [--force] "<path>"`
- `buildPruneWorktreeCommand()` → `git worktree prune`

## Validation (`src/utils/gitValidation.ts`)

- New-branch name → reuse `validateRefName`.
- Target path → non-empty; reject when it collides with an existing worktree path (suffix applied during `resolveWorktreePath`).
- Sanitize ref → leaf name: replace `/` and filesystem-unsafe characters with `-`; collision → append `-2`, `-3`, …

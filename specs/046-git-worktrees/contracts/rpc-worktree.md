# RPC Contract: Worktree Operations

Webview ↔ extension host over `postMessage`. All new request `type`s added to the `RequestMessage` union and request-type guard map; responses reuse existing `success` / `error` / `worktreeList` plus one new `worktreePathResolved`. Backend git calls return `Result<T, GitError>`; failures map to the `error` response with a readable `message`.

---

## resolveWorktreePath (new)

Seed the create dialog's path field + preview. Non-blocking; dialog renders before it returns.

**Request**
```ts
{ type: 'resolveWorktreePath',
  payload: { ref: string; branchMode: 'existing' | 'new' | 'detached'; newBranchName?: string } }
```
**Response**
```ts
{ type: 'worktreePathResolved', payload: { path: string; leafName: string } }
```
- `path`: absolute target (basePath token expanded, `..` and `${repoName}` anchored to **main** worktree, sanitized leaf, collision suffix applied).
- On failure → `error` response.

---

## addWorktree (new)

**Request**
```ts
{ type: 'addWorktree',
  payload: { path: string; ref: string;
             branchMode: 'existing' | 'new' | 'detached';
             newBranchName?: string; force?: boolean } }
```
Backend command (research R4):
- `existing` → `git worktree add <path> <ref>`
- `new` → `git worktree add -b <newBranchName> <path> <ref>`
- `detached` → `git worktree add --detach <path> <ref>`

**Response**: `success` then host re-posts `worktreeList` + calls `sendInitialData()`. On failure → `error` (e.g. branch already checked out elsewhere → readable message naming the conflicting worktree). After success the host also runs `openWorktree(path)`.

---

## removeWorktree (new)

**Request**
```ts
{ type: 'removeWorktree', payload: { path: string; force?: boolean } }
```
- `force` required when the worktree is dirty (`git worktree remove --force <path>`).
- Host MUST reject removal of `isMain` or `isCurrent` worktrees (UI also disables it).

**Response**: `success` then re-post `worktreeList` + `sendInitialData()`. On failure → `error`.

**Branch deletion (separate, after success)**: when "also delete branch" is checked, webview sends the existing `deleteBranch` request with `force` per the nested checkbox. If response is `error` with code `BRANCH_NOT_FULLY_MERGED`, the dialog stays open for a force retry (worktree already gone).

---

## pruneWorktree (new)

**Request**
```ts
{ type: 'pruneWorktree', payload: {} }
```
Command: `git worktree prune`. Webview shows a `ConfirmDialog` listing stale entries (derived from worktree paths whose folders are missing) before sending.

**Response**: `success` then re-post `worktreeList` + `sendInitialData()`.

---

## openWorktree (new — fire-and-forget)

**Request**
```ts
{ type: 'openWorktree', payload: { path: string } }
```
Host: `vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path), { forceNewWindow: true })`. No response.

---

## revealWorktree (new — fire-and-forget)

**Request**
```ts
{ type: 'revealWorktree', payload: { path: string } }
```
Host: `vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path))`. No response.

---

## getWorktreeList (existing — modified payload)

`worktreeList` response now carries `WorktreeInfo[]` including the new `isCurrent` flag. No request-shape change.

---

## Error surfacing (all ops)

- Git refusal that a branch is checked out elsewhere → readable message naming the conflicting worktree (both create direction and the reverse checkout direction via `GitBranchService`).
- Dirty-remove without force → caught pre-emptively (dirty check) and gated behind the force confirmation.
- Never expose raw stderr (SC-003).

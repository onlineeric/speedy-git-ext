# RPC Contract — `fastForwardLocalBranch`

**Feature**: Fast-forward Local Branch from Remote
**Direction**: Webview → Extension host (request); Extension host → Webview (response via existing channels)

## Request

```ts
// In shared/messages.ts, RequestMessage union
{ type: 'fastForwardLocalBranch'; payload: { remote: string; branch: string } }
```

| Field     | Type   | Required | Notes                                                                 |
|-----------|--------|----------|-----------------------------------------------------------------------|
| `remote`  | string | yes      | Resolved remote name (e.g., `origin`). Must pass `validateRefName`.   |
| `branch`  | string | yes      | Local branch name to fast-forward. Must pass `validateRefName`.       |

**Caller** (webview): `rpcClient.fastForwardLocalBranch(remote, branch)` — sends the message via `acquireVsCodeApi().postMessage`.

**Allowlist**: `fastForwardLocalBranch: true` is added to the `RequestAllowlist` constant in `shared/messages.ts` (alongside `push`, `pull`, `fetch`).

## Backend handler

**File**: `src/WebviewProvider.ts` — new `case 'fastForwardLocalBranch'` in the RPC dispatch switch (alongside `case 'fetch'` at line ~1059).

**Behavior**:
1. Call `gitBranchService.fastForwardFromRemote(payload.remote, payload.branch)`.
2. On `Result.success`: post `{ type: 'success', payload: { message: result.value } }` and then `await sendInitialData(currentFilters)` to refresh the graph.
3. On failure: post `{ type: 'error', payload: { error: result.error } }`. Do not refresh.

**Service method**: `GitBranchService.fastForwardFromRemote(remote, branch): Promise<Result<string>>`

```text
1. Validate `remote` via validateRefName → return early on failure.
2. Validate `branch` via validateRefName → return early on failure.
3. args = ['fetch', remote, `${branch}:${branch}`]
4. Run via this.executor.execute({ args, cwd: this.workspacePath, timeout: 60000 }).
5. On success: return ok('Fast-forward completed').
6. On failure: return result (Result<never, GitError>).
```

**Underlying git command**: `git fetch <remote> <branch>:<branch>` (no `--force`, no `+` prefix).

## Response — success path

Reuses existing `success` envelope:

```ts
{ type: 'success'; payload: { message: 'Fast-forward completed' } }
```

Followed (in the same handler) by the standard initial-data broadcast that updates `commits`, `branches`, etc., causing the graph to redraw with the advanced branch tip.

## Response — error path

Reuses existing `error` envelope:

```ts
{ type: 'error'; payload: { error: GitError } }
```

Common error cases (verbatim git stderr surfaces in `GitError.message`):

| Trigger                                         | Sample stderr                                                  |
|-------------------------------------------------|----------------------------------------------------------------|
| Local branch has commits remote does not        | `! [rejected] <branch> -> <branch> (non-fast-forward)`         |
| Remote ref does not exist                       | `fatal: couldn't find remote ref refs/heads/<branch>`          |
| Remote unreachable / DNS / auth                 | `fatal: unable to access ...` / `Authentication failed`        |
| `branch` matches the currently checked-out branch (defensive) | `fatal: refusing to fetch into current branch refs/heads/<branch>` |
| Repo has no remotes                             | `fatal: '<remote>' does not appear to be a git repository`     |

The webview's existing error-toast handler (in `rpcClient.ts`) surfaces all of these unchanged.

## Validation contract

- The webview MUST resolve a non-empty remote string before sending the request (via `resolveDefaultRemote(branches)`).
- The webview MUST NOT send the request when the target branch is the currently checked-out branch — this is prevented at menu-visibility time, but the backend's defensive validation will still surface git's own rejection if it ever happens.
- The backend MUST validate both fields with `validateRefName` to prevent shell-metachar injection (consistent with all other ref-taking calls in the codebase).

## Telemetry / logging

`GitBranchService.fastForwardFromRemote` logs `Fast-forward local branch: <remote>/<branch>` via the existing `LogOutputChannel` (matches `pull` / `push` log style).

## Out of scope for this contract

- Force fetch (`+<branch>:<branch>`) — explicitly rejected by spec Q3.
- Multi-branch batch — explicitly rejected by spec Assumptions.
- Remote selection picker — explicitly rejected by spec Q2.

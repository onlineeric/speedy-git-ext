# RPC Contract — `revert` (re-shaped payload)

**Feature**: Revert Commit dialog with mode selection
**Branch**: `045-revert-mode-dialog`
**Date**: 2026-05-22

This contract supersedes the existing `revert` RPC payload defined at `shared/messages.ts:73`. The variant name (`'revert'`) is unchanged; only the `payload` shape changes.

## Direction

Webview → Extension host (via `acquireVsCodeApi().postMessage`).

## Request

### Old shape (removed)

```ts
| { type: 'revert'; payload: { hash: string; mainlineParent?: number } }
```

### New shape

```ts
| { type: 'revert'; payload: { hash: string; options: RevertOptions } }

// where:
type RevertMode = 'commit' | 'no-commit' | 'edit-message';

interface RevertOptions {
  mode: RevertMode;
  mainlineParent?: number; // required iff the target commit has >1 parent
  message?: string;        // required iff mode === 'edit-message'; non-empty after trim
}
```

### Field validation (extension-host side, in `GitRevertService.revert`)

| Field                       | Rule                                                                                       | On failure |
|-----------------------------|--------------------------------------------------------------------------------------------|------------|
| `hash`                      | `validateHash(hash)` from `src/utils/gitValidation.ts`                                     | Return `Result<...>` with `VALIDATION_ERROR` |
| `options.mode`              | Must be one of `'commit' | 'no-commit' | 'edit-message'`                                   | Throw at boundary (TypeScript-narrowed) |
| `options.mainlineParent`    | If provided: integer ≥ 1. The service still passes it through as `-m <N>` regardless of whether the commit is a merge commit — the webview is responsible for only sending it for merge commits. | git itself errors |
| `options.message`           | If `mode === 'edit-message'`: defined and `trim().length > 0`. Otherwise must be omitted/ignored. | Service errors with `VALIDATION_ERROR` |

### Preconditions (in order, short-circuit on first failure)

1. `validateHash(hash)` passes.
2. If `mode === 'edit-message'`: `options.message` is provided and non-empty after trim.
3. Working tree is clean (`isDirtyWorkingTree` returns `false`) — applies to **all three modes** per spec FR-016.
4. No revert is already in progress (`REVERT_HEAD` does not exist).
5. (At `WebviewProvider`) No other operation is in progress (`getOperationInProgressError()` returns null).

## Backend execution by mode

### Mode: `commit` (unchanged from today)

```
git revert --no-edit [-m <mainlineParent>] <hash>
```

- On success: returns `Result.ok("Reverted <abbrev> successfully.")`.
- On stderr-match for "nothing to commit" / "nothing to revert": returns the existing `COMMAND_FAILED` "already present" error.
- On `REVERT_HEAD` appearing OR `isConflictStderr` match: returns `REVERT_CONFLICT` (existing).

### Mode: `no-commit`

```
git revert --no-commit [-m <mainlineParent>] <hash>
```

- On success: returns `Result.ok("Reverted <abbrev> — changes staged. Commit when ready.")`.
- On stderr-match for "nothing to commit" / "nothing to revert": returns `COMMAND_FAILED` with the "already present" message.
- On `isConflictStderr` match (no `REVERT_HEAD` check — git does not set it for `--no-commit`): returns `REVERT_CONFLICT_NO_RECOVERY` (NEW).

### Mode: `edit-message`

```
# Step 1
git revert --no-commit [-m <mainlineParent>] <hash>

# Between steps
git diff --cached --quiet  # exit 0 => nothing staged => skip step 2 and return "nothing to revert"

# Step 2 (only if step 1 succeeded AND something is staged)
git commit -m "<message>"   # or -F - with stdin; see research.md D2
```

- Step 1 failure:
  - stderr "nothing to commit"/"nothing to revert" → `COMMAND_FAILED` "already present".
  - `isConflictStderr` match → `REVERT_CONFLICT_NO_RECOVERY`.
  - Other → propagate `result.error`.
- Empty-after-step-1: `git diff --cached --quiet` exits 0 → `COMMAND_FAILED` "already present".
- Step 2 failure (commit hook reject, signing failure, etc.): propagate `result.error` (`COMMAND_FAILED`) with git's stderr. **Inverse changes remain staged** for the user to recover manually.
- Step 2 success: returns `Result.ok("Reverted <abbrev> with custom message.")`.

## Responses (envelope unchanged)

All three modes produce one of these response sequences:

### Success

```ts
{ type: 'success'; payload: { message: string } }
// followed by:
sendInitialData(currentFilters);
{ type: 'revertState'; payload: { state: 'idle' } }
```

### Conflict (Commit now mode)

```ts
{ type: 'error'; payload: { error: GitError /* code: REVERT_CONFLICT */ } }
{ type: 'revertState'; payload: { state: 'in-progress' } }
```

The webview sets `revertInProgress = true`, which surfaces the `Continue Revert` / `Abort Revert` items on `CommitContextMenu`.

### Conflict (Stage only / Edit message modes)

```ts
{ type: 'error'; payload: { error: GitError /* code: REVERT_CONFLICT_NO_RECOVERY */ } }
{ type: 'revertState'; payload: { state: 'idle' } }
```

The webview shows the error toast. `revertInProgress` stays `false`. No Continue/Abort menu items.

### Other errors (validation, dirty tree, op-in-progress, empty revert, step-2 hook failure)

```ts
{ type: 'error'; payload: { error: GitError } }
{ type: 'revertState'; payload: { state: 'idle' } }
```

## Caller — webview RPC client signature

```ts
// rpcClient.ts (re-shaped)
revert(hash: string, options: RevertOptions): void;
```

(Previous signature `revert(hash: string, mainlineParent?: number)` is replaced.)

## Compatibility note

There is no on-disk persistence of `revert` RPC payloads, no external consumers of the message schema, and no backwards-compatibility constraint. The shape change is performed in one commit alongside the matching webview update — no shim, no fallback for the old shape (constitution II — no premature compatibility layers).

# Message Contracts: Uncommitted Changes Node

**Feature**: 036-uncommitted-node | **Date**: 2026-04-09

## New Messages

### Request: getUncommittedChanges

**Direction**: Webview → Extension Host
**Trigger**: During refresh cycle (`sendInitialData`) to fetch working tree state for the synthetic commit node. The details panel uses `getCommitDetails(UNCOMMITTED_HASH)` instead (see Modified Message Behaviors below).
**Payload**: None (`Record<string, never>`)

```
{
  type: 'getUncommittedChanges',
  payload: {}
}
```

### Response: uncommittedChanges

**Direction**: Extension Host → Webview
**Trigger**: Response to `getUncommittedChanges` request.
**Payload**: File change list with categorized counts.

```
{
  type: 'uncommittedChanges',
  payload: {
    files: FileChange[],
    stagedCount: number,
    unstagedCount: number,
    untrackedCount: number
  }
}
```

**Empty state**: When working tree is clean, returns `{ files: [], stagedCount: 0, unstagedCount: 0, untrackedCount: 0 }`.

## Modified Message Behaviors

### getCommitDetails (existing)

When called with `hash: UNCOMMITTED_HASH`:
- Backend calls `getUncommittedDetails()` instead of `getCommitDetails()`.
- Returns synthetic `CommitDetails` object with file changes and placeholder metadata.
- Stats field: `{ additions: 0, deletions: 0 }` (line-level stats not available from name-status).

### openDiff (existing, payload extended)

**Payload change**: Add optional `status?: FileChangeStatus` field to the `openDiff` payload. This allows the diff handler to determine the diff strategy for uncommitted files without re-fetching.

When called with `hash: UNCOMMITTED_HASH`:
- **Tracked files (staged/unstaged)**: `status` is `'modified'`, `'added'`, `'deleted'`, `'renamed'`, or `'copied'`. Left URI = `git-show://HEAD/...`, Right URI = `vscode.Uri.file(workspacePath/filePath)`.
- **Untracked files**: `status` is `'untracked'`. Left URI = empty content URI, Right URI = `vscode.Uri.file(workspacePath/filePath)`.
- Detection: check `payload.hash === UNCOMMITTED_HASH` and use `payload.status` to route diff strategy.

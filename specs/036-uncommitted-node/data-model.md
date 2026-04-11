# Data Model: Uncommitted Changes Node

**Feature**: 036-uncommitted-node | **Date**: 2026-04-09

## Entities

### UncommittedChanges (new, transient)

Represents the current working tree state. Not persisted — fetched on each refresh cycle.

| Field | Type | Description |
|-------|------|-------------|
| files | FileChange[] | All changed files (staged + unstaged + untracked), merged with unstaged taking precedence |
| stagedCount | number | Count of files from `git diff --cached` |
| unstagedCount | number | Count of files from `git diff` (excluding staged-only files) |
| untrackedCount | number | Count of files from `git ls-files --others` |
| hasChanges | boolean | `stagedCount + unstagedCount + untrackedCount > 0` |

**Source**: `GitDiffService.getUncommittedDetails()` already returns `FileChange[]`. Counts are derived from categorizing the returned files.

### Synthetic Commit (derived from UncommittedChanges)

Created in the webview store by converting UncommittedChanges into a Commit object.

| Field | Value |
|-------|-------|
| hash | `UNCOMMITTED_HASH` constant (`"UNCOMMITTED"`) |
| abbreviatedHash | `"---"` |
| parents | `[headCommitHash]` — the current HEAD commit hash |
| author | `"---"` |
| authorEmail | `""` |
| authorDate | `Date.now()` — always newest |
| subject | `buildUncommittedSubject(counts)` — dynamic categorized count |
| refs | `[{ name: 'Uncommitted Changes', type: 'uncommitted' }]` |

### Synthetic CommitDetails (for details panel)

Returned when details are requested for `UNCOMMITTED_HASH`.

| Field | Value |
|-------|-------|
| hash | `UNCOMMITTED_HASH` |
| abbreviatedHash | `"---"` |
| parents | `[headCommitHash]` |
| author | `"---"` |
| authorEmail | `""` |
| authorDate | `Date.now()` |
| committer | `"---"` |
| committerEmail | `""` |
| committerDate | `Date.now()` |
| subject | Dynamic categorized count |
| body | `""` |
| files | `FileChange[]` from getUncommittedDetails() |
| stats | `{ additions: 0, deletions: 0 }` — line-level stats not available from name-status output |

## Type Changes

### shared/types.ts

```
RefType: add 'uncommitted' to union
  'head' | 'branch' | 'remote' | 'tag' | 'stash' | 'uncommitted'

New constant:
  UNCOMMITTED_HASH = 'UNCOMMITTED'
```

**Guard rail**: `'UNCOMMITTED'` is not valid hex and fails `validateHash()`. All code paths that pass a commit hash to git operations must check for `UNCOMMITTED_HASH` and either skip or provide a working-directory alternative. See quickstart.md for the full guard rail pattern.

### shared/messages.ts

```
RequestMessage: add union member
  { type: 'getUncommittedChanges'; payload: Record<string, never> }

ResponseMessage: add union member
  { type: 'uncommittedChanges'; payload: { files: FileChange[]; stagedCount: number; unstagedCount: number; untrackedCount: number } }

REQUEST_TYPES map: add
  getUncommittedChanges: true

RESPONSE_TYPES map: add
  uncommittedChanges: true
```

## State Transitions

```
Working tree clean → File modified → hasChanges=true → Node appears at index 0
Node visible → All changes committed → hasChanges=false → Node removed
Node visible → Stash all → hasChanges=false → Node removed
Node visible → Branch filter excludes HEAD → Node hidden (not removed from data, just not injected)
Node visible → Author/date/text filter applied → Node stays visible
Fetch fails → hasChanges treated as false → Node not shown → Next refresh retries
```

## Relationships

```
UncommittedChanges --contains--> FileChange[] (1:N)
Synthetic Commit --parent--> HEAD Commit (1:1)
Synthetic Commit --rendered-by--> CommitRow/CommitTableRow (1:1)
Synthetic Commit --topology--> GraphNode (same lane as HEAD, dashed edge)
Synthetic Commit --details--> CommitDetailsPanel (via getUncommittedChanges message)
```

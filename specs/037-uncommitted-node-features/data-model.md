# Data Model: Uncommitted Node Features

## Entity Changes

### FileChange (extended)

Existing type with a new optional field:

```typescript
interface FileChange {
  path: string;
  oldPath?: string;
  status: FileChangeStatus;
  additions?: number;
  deletions?: number;
  stageState?: FileStageState;  // NEW — only set for uncommitted node files
}

type FileStageState = 'staged' | 'unstaged' | 'conflicted';
```

**Notes**:
- `stageState` is optional — only populated when the commit is `UNCOMMITTED_HASH`
- For regular commits, `stageState` remains `undefined`
- Untracked files have `status: 'untracked'` and `stageState: 'unstaged'`
- Partially staged files appear as two separate `FileChange` entries: one with `stageState: 'staged'` and one with `stageState: 'unstaged'`

### ConflictState (new)

```typescript
interface ConflictState {
  inConflict: boolean;
  conflictType?: 'merge' | 'rebase' | 'cherry-pick';
  conflictFiles: string[];  // file paths with unresolved conflicts
}
```

**Notes**:
- Returned by the new `getConflictState` RPC
- When `inConflict` is `false`, `conflictType` is `undefined` and `conflictFiles` is `[]`
- Conflict files also appear in the file changes list with `stageState: 'conflicted'`

### UncommittedSummary (modified)

The existing response payload is restructured:

```typescript
// BEFORE (current)
interface UncommittedSummaryPayload {
  files: FileChange[];
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
}

// AFTER (new)
interface UncommittedSummaryPayload {
  stagedFiles: FileChange[];     // files with stageState: 'staged'
  unstagedFiles: FileChange[];   // files with stageState: 'unstaged' (includes untracked)
  conflictFiles: FileChange[];   // files with stageState: 'conflicted'
  conflictType?: 'merge' | 'rebase' | 'cherry-pick';
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
}
```

**Notes**:
- `stagedFiles` and `unstagedFiles` replace the merged `files` array
- `conflictFiles` is empty when not in a conflict state
- Counts remain for summary display (uncommitted node subject text, etc.)

## State Transitions

### File Stage State Flow

```
[Working Tree Change]
        │
        ▼
   ┌─────────┐   stage    ┌────────┐
   │ unstaged │ ─────────► │ staged │
   └─────────┘             └────────┘
        ▲                      │
        │      unstage         │
        └──────────────────────┘
        │
        │  discard
        ▼
   [Clean / Removed]
```

### Conflict State Flow

```
[Normal State]
       │
       │  merge/rebase/cherry-pick with conflicts
       ▼
  ┌────────────┐
  │ conflicted │ ──► [User resolves in VS Code native editor]
  └────────────┘
       │
       │  (resolved externally, detected via file watcher refresh)
       ▼
  [Normal State]
```

## Zustand Store Changes

### New State Fields

```typescript
interface GraphStore {
  // EXISTING (modified)
  uncommittedFiles: FileChange[];  // kept for backward compat, now = stagedFiles + unstagedFiles + conflictFiles

  // NEW
  uncommittedStagedFiles: FileChange[];
  uncommittedUnstagedFiles: FileChange[];
  uncommittedConflictFiles: FileChange[];
  conflictType?: 'merge' | 'rebase' | 'cherry-pick';

  // EXISTING (unchanged)
  uncommittedCounts: { stagedCount: number; unstagedCount: number; untrackedCount: number };
  hasUncommittedChanges: boolean;
}
```

**Notes**:
- `uncommittedFiles` remains as the combined list for backward compatibility with graph topology computation
- The three new arrays provide the separated view for the details panel
- `conflictType` is stored at the top level for conditional section display

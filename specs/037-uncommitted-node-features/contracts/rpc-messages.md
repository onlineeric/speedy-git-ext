# RPC Message Contracts: Uncommitted Node Features

All new message types are added to `shared/messages.ts` following the existing `RequestMessage` / `ResponseMessage` discriminated union pattern.

## New Request Messages

### stageFiles

Stage one or more specific files.

```typescript
{ type: 'stageFiles'; payload: { paths: string[] } }
```

**Backend behavior**: Runs `git add -- <paths>`. Returns success/error. Calls `sendInitialData()` on success.

### unstageFiles

Unstage one or more specific files.

```typescript
{ type: 'unstageFiles'; payload: { paths: string[] } }
```

**Backend behavior**: Runs `git reset HEAD -- <paths>`. Returns success/error. Calls `sendInitialData()` on success.

### stageAll

Stage all changes (including untracked).

```typescript
{ type: 'stageAll'; payload: Record<string, never> }
```

**Backend behavior**: Runs `git add -A`. Returns success/error. Calls `sendInitialData()` on success.

### unstageAll

Unstage all staged changes.

```typescript
{ type: 'unstageAll'; payload: Record<string, never> }
```

**Backend behavior**: Runs `git reset HEAD`. Returns success/error. Calls `sendInitialData()` on success.

### discardFiles

Discard unstaged changes for specific files. Handles both tracked (checkout) and untracked (clean) files.

```typescript
{ type: 'discardFiles'; payload: { paths: string[]; includeUntracked: boolean } }
```

**Backend behavior**:
- Tracked files: `git checkout -- <tracked-paths>`
- Untracked files (if `includeUntracked`): `git clean -f -- <untracked-paths>`
- Returns success/error. Calls `sendInitialData()` on success.

### discardAllUnstaged

Discard all unstaged changes (tracked and untracked).

```typescript
{ type: 'discardAllUnstaged'; payload: Record<string, never> }
```

**Backend behavior**: Runs `git checkout -- .` then `git clean -fd`. Returns success/error. Calls `sendInitialData()` on success.

### stashWithMessage

Stash all changes with an optional message.

```typescript
{ type: 'stashWithMessage'; payload: { message?: string } }
```

**Backend behavior**:
- With message: `git stash push --include-untracked -m "<message>"`
- Without message: `git stash push --include-untracked`
- Returns success/error. Calls `sendInitialData()` on success.

### getConflictState

Check if the repo is in a conflict state and list conflicted files.

```typescript
{ type: 'getConflictState'; payload: Record<string, never> }
```

**Backend behavior**: Checks for `.git/MERGE_HEAD`, `.git/REBASE_HEAD`, `.git/CHERRY_PICK_HEAD`. Lists conflicted files via `git diff --name-only --diff-filter=U`. Returns response.

## New/Modified Response Messages

### uncommittedChanges (modified)

Updated payload structure with separated file arrays.

```typescript
{
  type: 'uncommittedChanges';
  payload: {
    stagedFiles: FileChange[];
    unstagedFiles: FileChange[];
    conflictFiles: FileChange[];
    conflictType?: 'merge' | 'rebase' | 'cherry-pick';
    stagedCount: number;
    unstagedCount: number;
    untrackedCount: number;
  }
}
```

### conflictState (new)

```typescript
{
  type: 'conflictState';
  payload: {
    inConflict: boolean;
    conflictType?: 'merge' | 'rebase' | 'cherry-pick';
    conflictFiles: string[];
  }
}
```

## Existing Messages Used

These existing response types are reused for mutation results:

- `{ type: 'success'; payload: { message: string } }` — after successful stage/unstage/discard/stash
- `{ type: 'error'; payload: { error: GitError | { message: string } } }` — after failed operations

## Message Flow Diagrams

### Stage File Flow

```
Frontend                    Backend
   │                           │
   │──stageFiles({paths})────►│
   │                           │── git add -- <paths>
   │                           │── sendInitialData()
   │◄──success({message})─────│
   │◄──uncommittedChanges(...)─│
   │◄──commits(...)────────────│
   │                           │
```

### Discard File Flow

```
Frontend                    Backend
   │                           │
   │  [User clicks discard]    │
   │  [Confirmation dialog]    │
   │  [User confirms]          │
   │──discardFiles({paths})──►│
   │                           │── git checkout -- <paths>
   │                           │── sendInitialData()
   │◄──success({message})─────│
   │◄──uncommittedChanges(...)─│
   │                           │
```

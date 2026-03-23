# Data Model: Push Branch Dialog

**Feature Branch**: `020-push-branch-dialog`
**Date**: 2026-03-24

## Entities

### PushForceMode (New — shared type)

A string literal union representing the three push modes.

| Value              | Git Flag              | Description                          |
|--------------------|-----------------------|--------------------------------------|
| `'none'`           | *(no flag)*           | Normal push, no force                |
| `'force-with-lease'` | `--force-with-lease` | Force push with remote ref check     |
| `'force'`          | `--force`             | Unconditional force push             |

### PushOptions (New — shared type)

The complete set of parameters for a push operation, used for dialog state and command construction.

| Field        | Type            | Default     | Description                                    |
|--------------|-----------------|-------------|------------------------------------------------|
| `remote`     | `string`        | `'origin'`  | Target remote name from configured remotes      |
| `branch`     | `string`        | *(current)*  | Branch name being pushed                        |
| `setUpstream`| `boolean`       | `true`      | Whether to add `-u` flag                        |
| `forceMode`  | `PushForceMode` | `'none'`    | Push mode determining force flag                |

### RemoteInfo (Existing — no changes)

| Field      | Type     | Description                |
|------------|----------|----------------------------|
| `name`     | `string` | Remote name (e.g., "origin") |
| `fetchUrl` | `string` | URL used for fetch         |
| `pushUrl`  | `string` | URL used for push          |

## Modified Contracts

### RequestMessage — `push` type (Modified)

**Before:**
```
{ type: 'push'; payload: { remote?: string; branch?: string; setUpstream?: boolean; force?: boolean } }
```

**After:**
```
{ type: 'push'; payload: { remote: string; branch: string; setUpstream?: boolean; forceMode?: PushForceMode } }
```

Changes:
- `remote` and `branch` become required (dialog always provides explicit values per FR-019)
- `force?: boolean` replaced by `forceMode?: PushForceMode` to support three modes
- Default `forceMode` is `'none'` (handled by backend if omitted)

### ResponseMessage — No new types needed

The existing `success` and `error` response types are sufficient. The dialog will use a promise-based pattern to await the response.

## State Changes

### graphStore (No changes)

The push dialog uses local component state, not store state. The existing `remotes: RemoteInfo[]` field is read for the remote dropdown. No new store fields needed.

### PushDialog Component State (Local)

| Field         | Type            | Default     | Description                              |
|---------------|-----------------|-------------|------------------------------------------|
| `setUpstream` | `boolean`       | `true`      | Checkbox state for `--set-upstream / -u`  |
| `forceMode`   | `PushForceMode` | `'none'`    | Selected push mode radio value            |
| `selectedRemote` | `string`     | `'origin'`  | Selected remote from dropdown             |
| `isPushing`   | `boolean`       | `false`     | Loading state while push is in progress   |

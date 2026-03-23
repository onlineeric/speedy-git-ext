# Message Contracts: Push Branch Dialog

**Feature Branch**: `020-push-branch-dialog`
**Date**: 2026-03-24

## Modified Messages

### RequestMessage: `push` (Modified)

**Location**: `shared/messages.ts`

```typescript
// Before
| { type: 'push'; payload: { remote?: string; branch?: string; setUpstream?: boolean; force?: boolean } }

// After
| { type: 'push'; payload: { remote: string; branch: string; setUpstream?: boolean; forceMode?: PushForceMode } }
```

**Field changes**:
- `remote`: `string?` → `string` (required — dialog always provides explicit remote)
- `branch`: `string?` → `string` (required — dialog always provides explicit branch)
- `force?: boolean` → `forceMode?: PushForceMode` (supports three modes instead of boolean)

### ResponseMessage: No changes

Existing `success` and `error` response types are reused:
- `{ type: 'success'; payload: { message: string } }` — push completed
- `{ type: 'error'; payload: { error: GitError | { message: string } } }` — push failed

## New Shared Types

**Location**: `shared/types.ts`

```typescript
export type PushForceMode = 'none' | 'force-with-lease' | 'force';
```

## RPC Client Changes

**Location**: `webview-ui/src/rpc/rpcClient.ts`

```typescript
// Existing method updated
push(remote: string, branch: string, setUpstream?: boolean, forceMode?: PushForceMode) {
  this.send({ type: 'push', payload: { remote, branch, setUpstream, forceMode } });
}

// New async method for dialog usage
async pushAsync(remote: string, branch: string, setUpstream?: boolean, forceMode?: PushForceMode): Promise<string> {
  // Returns promise that resolves with success message or rejects with error
  // Uses pending request pattern similar to getCommitDetails()
}
```

## Backend Changes

**Location**: `src/services/GitRemoteService.ts`

```typescript
// Method signature change
async push(remote: string, branch: string, setUpstream?: boolean, forceMode?: PushForceMode): Promise<Result<string>>

// Force mode mapping:
// 'none' or undefined → no flag
// 'force-with-lease' → args.push('--force-with-lease')
// 'force' → args.push('--force')
```

**Location**: `src/WebviewProvider.ts`

```typescript
// Handler update — pass forceMode instead of force
case 'push': {
  const result = await this.gitRemoteService.push(
    message.payload.remote,
    message.payload.branch,
    message.payload.setUpstream,
    message.payload.forceMode
  );
  // ... same success/error handling
}
```

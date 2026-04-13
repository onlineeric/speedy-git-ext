# Quickstart: Batch Initial Data

## Overview

This feature replaces the current multi-message initial data loading flow with a single batched message. The backend gathers all data in parallel, then sends one `initialData` message. The frontend processes it in a single Zustand `set()` call with one topology computation.

## Files to Modify

| File | Change |
|------|--------|
| `shared/messages.ts` | Add `InitialDataPayload` interface and `initialData` response message type |
| `src/WebviewProvider.ts` | Refactor `sendInitialData()` to gather all data then send single `initialData` message |
| `webview-ui/src/stores/graphStore.ts` | Add `setInitialData()` action for atomic state update with single topology computation |
| `webview-ui/src/rpc/rpcClient.ts` | Add handler for `initialData` message type |
| `webview-ui/src/components/ControlBar.tsx` | Add refresh spinner indicator |

## Key Implementation Steps

### 1. Define the Message Type (shared/messages.ts)

Add `InitialDataPayload` interface and new `initialData` variant to `ResponseMessage` union. Update the `RESPONSE_TYPES` exhaustive map.

### 2. Refactor Backend (WebviewProvider.ts)

In `sendInitialData()`:
- Keep `persistedUIState` and `settingsData` as separate early messages (needed before data)
- Fetch all data sources in parallel using `Promise.allSettled()` for partial failure resilience
- Build `InitialDataPayload` from results
- Send single `initialData` message
- Handle fingerprint: if auto-refresh and commits unchanged, set `commits: null` in payload

### 3. Add Store Action (graphStore.ts)

Add `setInitialData(payload: InitialDataPayload)`:
- If `payload.commits` is not null, use new commits; else reuse existing `state.commits`
- Compute merged commits (commits + stashes + uncommitted) once
- Compute topology once
- Compute hidden commit hashes once
- Update all fields in a single `set()` call

### 4. Wire Up RPC Handler (rpcClient.ts)

In `handleMessage()`, add case for `type: 'initialData'` that calls `store.setInitialData(payload)`.

### 5. Add Refresh Indicator (ControlBar.tsx)

Show a spinner icon when `isRefreshing` is true in the store. Set `isRefreshing = true` when refresh is requested, `false` when `initialData` is processed.

## Testing

```bash
pnpm typecheck    # Verify type safety
pnpm lint         # Verify code quality
pnpm build        # Verify both extension and webview build
pnpm test         # Run unit tests
```

Manual smoke tests:
1. Open graph in repo with commits + uncommitted changes + stashes → single visual update, no flicker
2. Manual refresh → current graph stays visible with spinner, then updates in-place
3. Stage a file → only uncommitted section updates (targeted update still works)
4. Open graph in empty repo → graceful handling
5. Auto-refresh after file save → smooth update

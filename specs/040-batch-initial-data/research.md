# Research: Batch Initial Data

## Research Task 1: Current Data Loading Architecture

**Decision**: Refactor `sendInitialData()` from sequential multi-message to parallel-fetch-then-single-send.

**Rationale**: Current `sendInitialData()` in `WebviewProvider.ts` sends ~12+ separate `postMessage` calls during a single load cycle. Each message triggers a Zustand state update in the frontend. Three of these updates (`setCommits`, `setUncommittedChanges`, `setStashes`) trigger full topology recomputation in `graphTopology.ts`. This causes:
1. Three topology computations instead of one
2. Multiple React re-render cycles showing partial/intermediate graph states (flicker)
3. Wasted CPU on large repos (topology is O(commits × lanes))

**Alternatives considered**:
- **Debounce topology computation**: Would reduce computations but not eliminate intermediate renders; adds timing complexity and race conditions.
- **Frontend message buffering with timer**: Collect messages for N ms then process together. Fragile — wrong timer value causes either flicker or unnecessary delay. Hard to know when "all messages have arrived."
- **Explicit "batch start/end" sentinel messages**: Backend sends `batchStart`, then individual messages, then `batchEnd`. Frontend buffers between sentinels. Adds protocol complexity and still requires frontend buffering logic. If `batchEnd` is lost, UI hangs.
- **Single batched message (chosen)**: Backend gathers all data, sends one message. Simplest, most reliable. Frontend processes atomically. No timing issues, no lost sentinels.

## Research Task 2: VS Code Message Passing Constraints

**Decision**: A single large `postMessage` call is safe and performant for our data sizes.

**Rationale**: VS Code webview `postMessage` uses structured clone internally. For 500 commits with full metadata, the payload is roughly 200-500KB of JSON — well within browser memory and serialization limits. There is no documented size limit on VS Code webview messages. The structured clone is synchronous but fast for this data size.

**Alternatives considered**:
- **Chunked messages**: Split payload into chunks. Adds unnecessary complexity for our data sizes. Only relevant for multi-MB payloads.
- **SharedArrayBuffer**: Not available in VS Code webview context.

## Research Task 3: Zustand Atomic State Updates

**Decision**: Use a single `set()` call in Zustand to update all fields atomically.

**Rationale**: Zustand batches state updates within a single `set()` call — React only re-renders once. By computing topology inside the `set()` callback (before returning the new state), we guarantee exactly one topology computation and one re-render per load/refresh cycle.

Current pattern (multiple separate `set()` calls):
```typescript
setCommits(data) → set({commits, topology: compute(...)}) // render + topology
setStashes(data) → set({stashes, topology: compute(...)}) // render + topology  
setUncommittedChanges(data) → set({uncommitted, topology: compute(...)}) // render + topology
```

New pattern (single `set()` call):
```typescript
setInitialData(payload) → set({
  commits, stashes, uncommitted, branches, ...all fields,
  topology: compute(mergedData) // computed once
}) // single render
```

**Alternatives considered**:
- **Zustand middleware for batching**: Adds indirection. A single `set()` is simpler and explicit.
- **React `unstable_batchedUpdates`**: Zustand already handles this internally. Not needed.

## Research Task 4: Fingerprint Optimization Preservation

**Decision**: Preserve fingerprint check in backend. When commits are unchanged during auto-refresh, send `commits: null` in the batched payload to signal "reuse existing."

**Rationale**: The fingerprint optimization prevents unnecessary topology recomputation when only non-commit data has changed (e.g., staging a file triggers auto-refresh but commits haven't changed). This optimization must be preserved in the batched approach.

**Alternatives considered**:
- **Always send commits**: Simpler but defeats the purpose of the fingerprint optimization. Would cause unnecessary topology recomputation on every auto-refresh.
- **Skip the entire batch if commits unchanged**: Wrong — branches, stashes, and uncommitted changes can change independently of commits.
- **Separate "lightweight refresh" message**: Adds a third message type. The nullable `commits` field in the existing payload is simpler.

## Research Task 5: Partial Failure Handling

**Decision**: Wrap each data source fetch in try/catch. Use default values for failed sources. Include an `errors` string array in the payload listing failed sources.

**Rationale**: Data sources are independent git operations. One failing (e.g., submodule status in a corrupted submodule) should not block the entire graph from rendering. The frontend shows a non-blocking notification for any errors.

**Default values for failed sources**:
- commits → empty array (this is critical — show error prominently)
- branches → empty array
- stashes → empty array
- uncommittedChanges → zero counts, empty file lists
- remotes → empty array
- authors → empty array
- worktrees → empty array
- submodules → empty array
- cherryPickState → false
- rebaseState → false, null conflict info
- revertState → false

**Alternatives considered**:
- **Abort entire load on any failure**: Too aggressive. Users lose all data for a minor submodule issue.
- **Retry failed sources**: Adds complexity and delay. The user can manually refresh if needed.

## Research Task 6: Refresh Indicator UX

**Decision**: Add an `isRefreshing` boolean to the Zustand store. Show a subtle spinner in the ControlBar when true. Keep the current graph fully visible during refresh.

**Rationale**: During refresh, the user needs visual feedback that something is happening, but the current graph should remain usable. A toolbar spinner is non-intrusive and consistent with VS Code's own refresh patterns.

**Alternatives considered**:
- **Overlay spinner on graph**: Too intrusive, blocks interaction.
- **Progress bar**: Overkill for a sub-second operation.
- **No indicator**: User doesn't know refresh is in progress.

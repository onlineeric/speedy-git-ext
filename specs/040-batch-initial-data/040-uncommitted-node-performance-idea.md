# 040: Batch Initial Data — Single Render on Load

## Problem

During `sendInitialData` (initial load and every refresh), the backend sends **13+ separate `postMessage` calls** to the frontend, each triggering its own Zustand `set()` and React re-render. The graph topology (`computeMergedTopology`) is recomputed **3 times** — once for commits, once for uncommitted changes, and once for stashes.

This causes:

1. **Visible UI flicker** — the graph renders first without the uncommitted node, then re-renders with it ~0.5–1s later, then stashes jump in
2. **Wasted CPU** — topology computed 3x instead of once
3. **Poor UX** — user sees a "progressive loading" effect where elements keep appearing, giving the impression the UI is still settling

### Current message sequence in `sendInitialData`

| # | postMessage type | Triggers topology recompute? |
|---|-----------------|------------------------------|
| 1 | `loading: true` | no |
| 2 | `commits` | **yes** (1st) |
| 3 | `loading: false` | no |
| 4 | `uncommittedChanges` | **yes** (2nd) |
| 5 | `branches` | no |
| 6 | `authorList` | no |
| 7 | `remotes` | no |
| 8 | `submodulesData` | no |
| 9 | `worktreeList` | no |
| 10 | `stashes` | **yes** (3rd) |
| 11 | `cherryPickState` | no |
| 12 | `rebaseState` | no |
| 13 | `revertState` | no |

### Why uncommitted node appears late (even after v2.3.2 parallel fetch)

In v2.3.2, the uncommitted data fetch was moved to run in parallel with `getCommits`. However, the backend still **sends them as two separate messages sequentially** — `commits` first, then `uncommittedChanges` after. On the frontend, `setCommits` computes topology with `hasUncommittedChanges: false` (the initial state), so the first render never includes the uncommitted node. The node only appears when `setUncommittedChanges` arrives and recomputes topology a second time.

## Proposed Solution

**Fetch all data in parallel, send as a single batched message, render once.**

### Backend: parallel fetch + single message

Replace the sequential fetch-and-send pattern in `sendInitialData` with a single `Promise.all` that fetches everything, then sends one `initialData` message:

```typescript
const [commitsResult, uncommittedResult, branchesResult, authorsResult,
       remotesResult, stashesResult, submodulesResult, worktreesResult,
       revertStateResult] = await Promise.all([
  this.gitLogService.getCommits({ ...effectiveFilters, maxCount: batchSize }),
  this.gitDiffService.getUncommittedSummary(),
  this.gitLogService.getBranches(),
  this.gitLogService.getAuthors(),
  this.gitRemoteService.getRemotes(),
  includeStashes ? this.gitStashService.getStashes() : Promise.resolve(ok([])),
  this.gitSubmoduleService.getStatus(),
  this.gitWorktreeService.listWorktrees(),
  this.gitRevertService.getRevertState(),
]);

// Cherry-pick and rebase state are synchronous (fs.existsSync) — no await needed
const cherryPickState = this.gitCherryPickService.getCherryPickState();
const rebaseState = this.gitRebaseService.getRebaseState();

this.postMessage({ type: 'initialData', payload: { /* all results */ } });
```

### Frontend: single store update + single topology computation

Add a new `setInitialData()` method to the Zustand store that:

1. Receives all data in one payload
2. Computes `computeMergedTopology` **once** with commits + stashes + uncommitted context
3. Calls `set()` **once** with all state fields — triggers a single React render

```typescript
setInitialData: (payload) => {
  const hiddenCommitHashes = computeHiddenCommitHashes(payload.commits, filters);
  const uncommitted = { hasUncommittedChanges, counts, branches: payload.branches };
  const { mergedCommits, topology } = computeMergedTopology(
    payload.commits, payload.stashes, filters, hiddenCommitHashes, uncommitted
  );
  set({
    commits: payload.commits,
    branches: payload.branches,
    stashes: payload.stashes,
    remotes: payload.remotes,
    authorList: payload.authors,
    uncommittedStagedFiles: payload.uncommitted.stagedFiles,
    // ... all fields in one set() call
    mergedCommits,
    topology,
  });
}
```

### New shared message type

Add an `InitialDataMessage` to `shared/messages.ts` containing all data fields that `sendInitialData` currently sends individually.

## Why This Works

1. **Commits are always the bottleneck** — `getCommits` fetches 500 commits of git log, which dwarfs everything else. Fetching branches/stashes/uncommitted/remotes in parallel adds **zero wall-clock time** because they all finish before commits.

2. **One topology computation instead of three** — saves CPU on every load/refresh.

3. **One render instead of 13+** — no flicker, no progressive loading. User sees loading spinner, then the complete settled graph.

4. **Simpler mental model** — data flow becomes: fetch everything → send once → render once.

## Key Implementation Details

### Files to modify

- **`src/WebviewProvider.ts`** (`sendInitialData` method, ~lines 530–630) — replace sequential fetch+send with `Promise.all` + single `postMessage`
- **`shared/messages.ts`** — add `InitialDataMessage` type to the `ResponseMessage` union
- **`webview-ui/src/rpc/rpcClient.ts`** (~line 54+) — add `case 'initialData'` handler
- **`webview-ui/src/stores/graphStore.ts`** — add `setInitialData()` method

### What NOT to change

- **Individual setters stay** (`setCommits`, `setStashes`, `setUncommittedChanges`, etc.) — they're still needed for targeted updates after single operations (e.g., stage/unstage only refreshes uncommitted, branch rename only refreshes branches)
- **`handleMessage` RPC handlers stay** — they handle individual frontend-initiated requests
- **Avatar fetching stays separate** — it's already fire-and-forget (`void this.fetchAndSendGitHubAvatars`) and should remain non-blocking

### Edge cases to handle

- **Auto-refresh fingerprint optimization** — currently skips sending commits if the fingerprint hasn't changed. With the batched approach, compute fingerprint and either skip the entire `initialData` message or send a lighter payload.
- **Error handling** — if one fetch fails (e.g., submodules), still render everything else that succeeded. Check each result individually before including in payload.
- **Branch filter validation** — currently validates branch filters before fetching commits (lines 507–528 in WebviewProvider). This needs branches first, so it should either be handled before the `Promise.all` or branches should be fetched twice (once for validation, once in the batch). The current code already fetches branches before the main fetch block, so this should be preserved.
- **Rebase conflict info** — if rebase is in-progress, there's an additional async `getConflictInfo()` call. This can be included in the `Promise.all` conditionally or handled after.

### Current service method signatures (for reference)

| Service call | Return type |
|-------------|-------------|
| `gitLogService.getCommits(filters)` | `Result<{ commits: Commit[], totalLoadedWithoutFilter }>` |
| `gitDiffService.getUncommittedSummary()` | `Result<UncommittedSummary>` |
| `gitLogService.getBranches()` | `Result<Branch[]>` |
| `gitLogService.getAuthors()` | `Result<Author[]>` |
| `gitRemoteService.getRemotes()` | `Result<RemoteInfo[]>` |
| `gitStashService.getStashes()` | `Result<StashEntry[]>` |
| `gitSubmoduleService.getStatus()` | (sends postMessage internally — needs refactor to return data) |
| `gitWorktreeService.listWorktrees()` | `Result<WorktreeInfo[]>` |
| `gitRevertService.getRevertState()` | `Result<RevertState>` |
| `gitCherryPickService.getCherryPickState()` | `Result<CherryPickState>` (synchronous) |
| `gitRebaseService.getRebaseState()` | `Result<RebaseState>` (synchronous) |

### Submodule service note

The submodules handler (`case 'getSubmodules'`) calls `this.sendSubmodulesData()` which internally does its own `postMessage`. For the batched approach, this needs to be refactored to return the data instead of sending it directly.

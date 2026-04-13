# Tasks: Batch Initial Data — Single Render on Load

**Input**: Design documents from `/specs/040-batch-initial-data/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project setup needed — this feature modifies an existing codebase. Skip to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared types that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 [P] Add `InitialDataPayload` interface and `initialData` response message variant to `shared/messages.ts`. Import existing types (`Commit`, `Branch`, `StashEntry`, `UncommittedSummary`, `RemoteInfo`, `Author`, `WorktreeInfo`, `Submodule`, `SubmoduleNavEntry`, `CherryPickState`, `RebaseState`, `RebaseConflictInfo`, `RevertState`) — all already exist in `shared/types.ts`. Add `initialData` to the `RESPONSE_TYPES` exhaustive map. See `data-model.md` for the `InitialDataPayload` shape.
- [x] T002 [P] Add `isRefreshing` boolean field to the Zustand store state and a `setIsRefreshing(value: boolean)` action in `webview-ui/src/stores/graphStore.ts`. This field will be used by the refresh indicator (US2) and the RPC handler.

**Checkpoint**: Foundation ready — shared types and state fields are in place for all user stories

---

## Phase 3: User Story 1 — Flicker-Free Initial Graph Load (Priority: P1) 🎯 MVP

**Goal**: Deliver all initial data as a single coordinated message so the graph renders in one visual update with no flicker. This also achieves User Story 3 (single topology computation) as a natural consequence of processing all data in one atomic state update.

**Independent Test**: Open graph in a repo with commits + uncommitted changes + stashes. Verify graph appears fully settled in one visual step after the loading indicator — no progressive element appearance, no flicker.

### Implementation for User Story 1

- [x] T003 [US1] Refactor `sendInitialData()` in `src/WebviewProvider.ts`: keep `persistedUIState` and `settingsData` as separate early messages. Replace the sequential multi-message data sending with a parallel-fetch-then-single-send pattern. Fetch all data sources concurrently using `Promise.allSettled()`: commits, uncommitted changes, branches, authors, remotes, submodules, worktrees, stashes (when `includeStashes`), cherry-pick state, rebase state + conflict info, revert state. Build an `InitialDataPayload` from the settled results, using default values for any rejected promises (empty arrays, `'idle'` states). Collect error messages from rejected promises into the `errors` array. Preserve the existing fingerprint optimization: when `isAutoRefresh` and commit fingerprint is unchanged, set `commits: null` in the payload. Send a single `postMessage({ type: 'initialData', payload })`. Keep `loading: true/false` wrapper messages for initial load only (not for refresh — handled in US2).
- [x] T004 [US1] Add `setInitialData(payload: InitialDataPayload)` action to `webview-ui/src/stores/graphStore.ts`. This must perform a **single** Zustand `set()` call that: (a) uses `payload.commits` if not null, else reuses existing `state.commits`; (b) computes `hiddenCommitHashes` from filters; (c) calls `computeMergedTopology()` once with the complete dataset (commits + stashes + uncommitted); (d) updates all fields atomically: `commits`, `branches`, `stashes`, uncommitted file lists/counts, `remotes`, `authorList`, `worktreeList`, submodules, `cherryPickInProgress`, `rebaseInProgress`, `rebaseConflictInfo`, `revertInProgress`, `mergedCommits`, `topology`, `hiddenCommitHashes`, `hasMore`, `isRefreshing: false`. Reference existing `setCommits()`, `setStashes()`, `setUncommittedChanges()` for the computation logic to replicate.
- [x] T005 [US1] Add handler for `type: 'initialData'` in the `handleMessage()` switch in `webview-ui/src/rpc/rpcClient.ts`. Call `store.setInitialData(message.payload)`. If `payload.errors.length > 0`, show a non-blocking notification (use existing `store.setError()` or `store.setSuccessMessage()` pattern) listing which data sources failed.
- [x] T006 [US1] Remove the old individual `postMessage` calls for `commits`, `uncommittedChanges`, `branches`, `authorList`, `remotes`, `submodulesData`, `worktreeList`, `stashes`, `cherryPickState`, `rebaseState`, `revertState` from the `sendInitialData()` method in `src/WebviewProvider.ts`. These are now replaced by the single `initialData` message. The individual message handlers in `rpcClient.ts` and individual store actions (`setCommits`, `setBranches`, etc.) MUST remain — they are still used by targeted/incremental updates.

**Checkpoint**: Initial graph load now delivers data as a single message and renders in one visual update. Topology is computed exactly once. User Story 3 is inherently satisfied.

---

## Phase 4: User Story 2 — Flicker-Free Graph Refresh (Priority: P1)

**Goal**: During manual or auto-refresh, keep the current graph visible with a subtle refresh indicator. Update the graph in-place in a single visual transition when new data arrives.

**Independent Test**: With the graph displayed, trigger a manual refresh. Verify the current graph stays visible with a spinner in the toolbar, then updates smoothly to the new state without intermediate partial renders.

### Implementation for User Story 2

- [x] T007 [US2] Add a refresh spinner to the toolbar in `webview-ui/src/components/ControlBar.tsx`. Read `isRefreshing` from the Zustand store. When true, show a subtle animated spinner icon (e.g., a rotating sync icon using CSS animation or an existing Codicon icon) near the refresh button. The rest of the toolbar and graph remain fully interactive.
- [x] T008 [US2] Wire up the refresh flow in `webview-ui/src/rpc/rpcClient.ts`: when the user triggers a refresh (sends `refresh` request message), call `store.setIsRefreshing(true)` immediately. The `setInitialData()` action (T004) already sets `isRefreshing: false` when processing the response, completing the cycle.
- [x] T009 [US2] Ensure the backend `sendInitialData()` in `src/WebviewProvider.ts` does NOT send `loading: true/false` wrapper messages during refresh (non-initial load). The current graph must remain visible — no loading screen overlay during refresh. The `isRefreshing` spinner in the toolbar (T007) provides the user feedback instead.

**Checkpoint**: Refresh now keeps the graph visible, shows a toolbar spinner, and updates in-place.

---

## Phase 5: User Story 3 — Reduced Graph Computation on Load (Priority: P2)

**Goal**: Topology computed exactly once per load/refresh cycle instead of three times.

**Independent Test**: Verify via code inspection or a temporary `console.log` counter that `computeMergedTopology()` is called exactly once during a full load/refresh cycle.

**Note**: This user story is **inherently satisfied** by the implementation of US1 (T004). The single `set()` call in `setInitialData()` computes topology exactly once. No additional implementation tasks are needed. This phase exists for traceability only.

**Checkpoint**: Topology computation count reduced from 3× to 1× per load/refresh cycle.

---

## Phase 6: User Story 4 — Targeted Updates Remain Functional (Priority: P1)

**Goal**: Individual operations (stage/unstage, branch rename, stash drop) continue to trigger targeted updates that only refresh affected data, without triggering a full graph reload.

**Independent Test**: Stage a file and verify only the uncommitted changes section updates. Rename a branch and verify only the branch data updates. Drop a stash and verify only stash data updates.

### Implementation for User Story 4

- [x] T010 [US4] Verify that all existing individual message handlers in `webview-ui/src/rpc/rpcClient.ts` remain intact and functional: `commits`, `branches`, `stashes`, `uncommittedChanges`, `cherryPickState`, `rebaseState`, `revertState`, `remotes`, `authorList`, `worktreeList`, `submodulesData`. These handlers and their corresponding store actions (`setCommits()`, `setBranches()`, `setStashes()`, `setUncommittedChanges()`, etc.) MUST NOT be removed — they handle targeted updates from individual operations. Confirm no code was accidentally removed during T006.

**Checkpoint**: Targeted updates work correctly — staging/unstaging, branch rename, stash drop each update only their affected section.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation, cleanup, and final verification

- [x] T011 [P] Run `pnpm typecheck` and fix any TypeScript errors across all modified files (`shared/messages.ts`, `src/WebviewProvider.ts`, `webview-ui/src/stores/graphStore.ts`, `webview-ui/src/rpc/rpcClient.ts`, `webview-ui/src/components/ControlBar.tsx`)
- [x] T012 [P] Run `pnpm lint` and fix any ESLint errors across all modified files
- [x] T013 Run `pnpm build` and verify clean build of both extension and webview
- [x] T014 Run `pnpm test` and fix any failing unit tests
- [x] T015 Run quickstart.md validation: verify all 5 manual smoke test scenarios pass (initial load with all data types, manual refresh with spinner, targeted stage/unstage update, empty repo handling, auto-refresh after file save)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — can start immediately
- **User Story 1 (Phase 3)**: Depends on Phase 2 (T001, T002)
- **User Story 2 (Phase 4)**: Depends on Phase 3 (specifically T003, T004, T005)
- **User Story 3 (Phase 5)**: No implementation tasks — satisfied by Phase 3
- **User Story 4 (Phase 6)**: Depends on Phase 3 (specifically T006 — verify nothing was broken)
- **Polish (Phase 7)**: Depends on all previous phases

### User Story Dependencies

- **User Story 1 (P1)**: After Phase 2 — core batching implementation
- **User Story 2 (P1)**: After US1 — builds on the batched flow to add refresh UX
- **User Story 3 (P2)**: No additional work — inherently satisfied by US1
- **User Story 4 (P1)**: After US1 — verification that existing flows remain intact

### Within Each User Story

- Backend changes (WebviewProvider.ts) before frontend store changes (graphStore.ts)
- Store changes before RPC handler changes (rpcClient.ts)
- RPC handler before UI components (ControlBar.tsx)
- All code changes before cleanup/removal (T006 after T003-T005)

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- T007 and T008 can run in parallel within US2 (different files)
- T011, T012 can run in parallel (different tools)

---

## Parallel Example: Phase 2 (Foundational)

```
Task T001: "Add InitialDataPayload to shared/messages.ts" — shared types
Task T002: "Add isRefreshing to graphStore.ts" — frontend state
→ Both modify different files, no dependencies, run in parallel
```

## Parallel Example: Phase 4 (US2)

```
Task T007: "Add refresh spinner to ControlBar.tsx" — UI component
Task T008: "Wire up refresh flow in rpcClient.ts" — RPC handler
→ Both modify different files, T007 reads from store, T008 writes to store, no conflict
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001, T002)
2. Complete Phase 3: User Story 1 (T003, T004, T005, T006)
3. **STOP and VALIDATE**: Open graph → verify single visual update, no flicker
4. This also validates User Story 3 (single topology computation)

### Incremental Delivery

1. Phase 2 → Foundation ready
2. Phase 3 (US1) → Flicker-free initial load ✅ + Single topology computation ✅ (MVP!)
3. Phase 4 (US2) → Flicker-free refresh with spinner ✅
4. Phase 5 (US3) → Already satisfied, just verify ✅
5. Phase 6 (US4) → Verify targeted updates ✅
6. Phase 7 → Polish, typecheck, lint, build, test ✅

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US3 is inherently achieved by US1's single atomic state update — no separate tasks needed
- Existing individual message handlers and store actions MUST be preserved for targeted updates
- The `initialData` message replaces only the initial/refresh data flow, not targeted operation responses
- Avatar fetching remains fire-and-forget and separate from the batch (non-blocking, may complete after render)

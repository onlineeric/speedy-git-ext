# Tasks: Dotted-Line Graph Continuity

**Input**: Design documents from `/specs/033-dotted-line-graph-continuity/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not requested in specification — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US5)
- Exact file paths included in all descriptions

## User Story Mapping

| Story | Spec Title | Priority | Phase |
|-------|-----------|----------|-------|
| US1 | Filtered Graph Shows Continuous Connections | P1 | 3 |
| US2 | Instant Filter Toggle Without Data Reload | P2 | 4 |
| US3 | Dotted Lines Preserve Lane Colors | P2 | — (inherent in US1 design; verified in Phase 6) |
| US4 | Filter-Agnostic Continuity for Future Filters | P3 | — (inherent in architecture; verified in Phase 6) |
| US5 | Scroll-Triggered Prefetch With Filter-Aware Capping | P2 | 5 |

> US3 and US4 are architectural quality attributes satisfied by the filter-agnostic `hiddenHashes: Set<string>` design and the lane-color-preserving `colorIndex` on dotted connections. No dedicated implementation phase needed.

---

## Phase 1: Setup

**Purpose**: No project initialization needed — all changes are in existing files. This phase is intentionally empty.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure changes that MUST be complete before ANY user story can be implemented. These are the type extensions, the hidden-commit computation function, and the backend change to stop server-side author filtering.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Remove all `--author` git log arguments from `src/services/GitLogService.ts`. When `filters.authors` is set, do NOT add `--author` flags to git args. Also remove the legacy `filters.author` (singular) server-side path. The backend now always returns all commits for the selected branches regardless of author filter state. (Research R-001, spec clarification: "All author filtering must use client-side filtering")
- [x] T002 [P] Extend `ParentConnection` type in `webview-ui/src/utils/graphTopology.ts` with two optional fields: `isDotted?: boolean` and `hiddenCount?: number`. Extend the passing-lane entry type in `passingLanesByRow` with `isDotted?: boolean`. (Data model: ParentConnection Extended, PassingLane Extended)
- [x] T003 [P] Implement `computeHiddenCommitHashes(commits: Commit[], filters: GraphFilters): Set<string>` as a pure function in `webview-ui/src/stores/graphStore.ts`. For each active visibility filter (currently only author), add non-matching commit hashes to the returned set. When `filters.authors` is non-empty, hide commits whose `authorEmail` is not in the included set. Return empty set when no visibility filters are active. Note: Stash entries are excluded from the hidden set because stashes are stored separately and merged into `mergedCommits` after hidden-hash filtering, satisfying FR-010. (Contract: topology-api.md `computeHiddenCommitHashes`)
- [x] T004 Add new state fields to the Zustand store in `webview-ui/src/stores/graphStore.ts`: `hiddenCommitHashes: Set<string>` (initial: empty set), `consecutiveEmptyBatches: number` (initial: 0), `filteredOutCount: number` (initial: 0), `showGapIndicator: boolean` (initial: false). (Data model: GraphStore State Extended)

**Checkpoint**: Foundation ready — type system extended, hidden-commit computation available, backend returns all commits. User story implementation can now begin.

---

## Phase 3: User Story 1 — Filtered Graph Shows Continuous Connections (Priority: P1) MVP

**Goal**: When filters hide intermediate commits, dotted lines connect visible commits through the hidden gaps, maintaining visual branch continuity.

**Independent Test**: Apply an author filter that excludes some intermediate commits. Verify dotted lines appear between remaining visible commits. Verify hidden-merge commits follow mainline. Verify root-like endpoints when no visible ancestor exists.

### Implementation for User Story 1

- [x] T005 [US1] Update `calculateTopology()` signature in `webview-ui/src/utils/graphTopology.ts` to accept `hiddenHashes?: Set<string>` as second parameter. When provided, build an internal `commitByHash: Map<string, Commit>` from the full commit list for use in the skip-connection walk. Maintain an internal `fullIndexByHash` for lane assignment ordering, separate from the output `commitIndexByHash` which maps only visible commits to visible row indices. (Contract: topology-api.md `calculateTopology`)
- [x] T006 [US1] Modify the main walk loop in `calculateTopology()` in `webview-ui/src/utils/graphTopology.ts`. After processing each commit for lane assignment (lane reservation, parent connections, busy lanes), check if the commit's hash is in `hiddenHashes`. If hidden: do NOT add the commit to the output `nodes` map, but DO keep its lane reservation and parent connection tracking intact for downstream commits. If visible: add to `nodes` as before, and assign a visible row index in the output `commitIndexByHash`. (Research R-002)
- [x] T007 [US1] Add a skip-connection post-pass in `calculateTopology()` in `webview-ui/src/utils/graphTopology.ts`, after the main loop and stash handling but before `buildIncomingConnections`. For each visible node, iterate its `parentConnections`. If a parent hash is not in `nodes` but IS in `hiddenHashes`: walk through hidden parents via `commitByHash`, following only the first parent (mainline) of each hidden commit, counting hidden commits. If a visible ancestor is found in `nodes`, update the connection's `parentHash`, `toLane`, set `isDotted = true`, and `hiddenCount` = count. If no visible ancestor is found, remove the connection (commit becomes root-like per FR-006). (Contract: topology-api.md skip-connection behavior; spec edge case: hidden merge commits)
- [x] T008 [US1] Update `computePassingLanes()` in `webview-ui/src/utils/graphTopology.ts`. When tracking active connections to generate passing lane entries, propagate the `isDotted` flag from the parent connection to each passing lane entry it creates. Passing lanes between a visible commit and a dotted-connected ancestor must have `isDotted: true`. (Research R-007)
- [x] T009 [US1] Update `computeMergedTopology()` in `webview-ui/src/stores/graphStore.ts` to accept `hiddenHashes?: Set<string>` and pass it to `calculateTopology()`. When `hiddenHashes` is provided, filter `commits` to visible-only before calling `mergeStashesIntoCommits()` for `mergedCommits`, but pass the full `commits` list to `calculateTopology()`. Edge case: when all commits are hidden, `mergedCommits` will contain only stash entries (or be empty if no stashes). GraphContainer already handles empty commit lists, so this produces a natural empty-state display (spec edge case: "entire loaded history is hidden").
- [x] T010 [US1] Modify `setCommits()` in `webview-ui/src/stores/graphStore.ts`. After receiving commits from the backend, call `computeHiddenCommitHashes(commits, filters)` to derive `hiddenCommitHashes`. Pass the hidden set to `computeMergedTopology()`. Store `hiddenCommitHashes` in state. Reset `consecutiveEmptyBatches`, `filteredOutCount`, `showGapIndicator` to initial values. (Contract: store-api.md `setCommits`)
- [x] T011 [US1] Modify `appendCommits()` in `webview-ui/src/stores/graphStore.ts`. After concatenating new commits to existing, recompute `hiddenCommitHashes` for the full list. Pass hidden set to `computeMergedTopology()`. Store updated `hiddenCommitHashes` in state. (Contract: store-api.md `appendCommits`)
- [x] T012 [US1] Render dotted parent connections in `webview-ui/src/components/GraphCell.tsx`. In the parent connections rendering section, check each connection's `isDotted` flag. When true, apply `strokeDasharray="4 3"` and `opacity={0.7}` to the `<line>` and `<path>` elements. Apply to both same-lane vertical lines and cross-lane curves. Use the same `connColor` (lane color) for dotted connections as for solid ones. (Research R-004; FR-002, FR-003)
- [x] T013 [US1] Render dotted passing lanes in `webview-ui/src/components/GraphCell.tsx`. In the passing-through vertical lines rendering section, check each passing lane entry's `isDotted` flag. When true, apply `strokeDasharray="4 3"` and `opacity={0.7}` to the vertical `<line>` element. (Research R-007; FR-008)
- [x] T014 [US1] Add SVG `<title>` tooltip on dotted connection elements in `webview-ui/src/components/GraphCell.tsx`. For parent connections where `isDotted === true`, wrap the connection `<line>` or `<path>` in a `<g>` element containing a `<title>` child with text `"N hidden commits"` where N is `conn.hiddenCount`. (Research R-005; FR-011)

**Checkpoint**: Dotted lines appear in the graph when author filter hides intermediate commits. Lane colors preserved (US3). Tooltips show hidden count on hover. Visual continuity maintained through hidden merge commits. Root-like endpoints for commits with no visible ancestors. Verify with `pnpm typecheck && pnpm lint && pnpm build`.

---

## Phase 4: User Story 2 — Instant Filter Toggle Without Data Reload (Priority: P2)

**Goal**: Toggling visibility filters updates the graph instantly from cached data with no backend round-trip.

**Independent Test**: Toggle author filters on/off rapidly. Verify no loading spinner appears, no network requests fire, and the graph returns to the exact same state each time.

### Implementation for User Story 2

- [x] T015 [US2] Add a new action `recomputeVisibility()` in `webview-ui/src/stores/graphStore.ts` that recomputes `hiddenCommitHashes` from the current `commits` and `filters` using `computeHiddenCommitHashes()`, then recomputes `mergedCommits` and `topology` via `computeMergedTopology()` using the cached commit list. This is the local-only recompute path for visibility filter changes. Increment `fetchGeneration` to discard in-flight stale responses. (Contract: store-api.md `setFilters` visibility path; FR-005)
- [x] T016 [US2] Modify `handleAuthorToggle()` in `webview-ui/src/components/FilterWidget.tsx`. After calling `setFilters({ authors })`, call `recomputeVisibility()` instead of `rpcClient.getCommits()`. Remove the `rpcClient.getCommits()` call from this handler. (Spec: FR-005; research R-001)
- [x] T017 [US2] Modify `handleAuthorClear()` and `handleAuthorRemove()` in `webview-ui/src/components/FilterWidget.tsx`. Same pattern as T016: after `setFilters()`, call `recomputeVisibility()` instead of `rpcClient.getCommits()`. (FR-005, FR-007)
- [x] T018 [US2] Modify `handleResetAll()` in `webview-ui/src/components/FilterWidget.tsx`. Before calling `resetAllFilters()`, capture whether structural filters were active: `const hadStructuralFilters = filters.branches?.length > 0 || !!filters.afterDate || !!filters.beforeDate`. Then call `resetAllFilters()` and `recomputeVisibility()` (instant visual update). If `hadStructuralFilters` was true, ALSO call `rpcClient.getCommits({})` to re-fetch commits for the new structural filter state (e.g., all branches instead of selected ones). If only visibility filters were active, skip the backend call — the existing `commits` data already contains all commits. (FR-007; contract: store-api.md `resetAllFilters`)
- [x] T019 [US2] Update `firePrefetch()` in `webview-ui/src/rpc/rpcClient.ts`. Remove both `author` (singular, deprecated) and `authors` (plural) from the filter object passed to `loadMoreCommits()`. Since T001 removes all `--author` handling from the backend, these fields are no longer needed in prefetch requests — the backend always returns all authors so the frontend has full commit data for client-side filtering. (Contract: store-api.md Prefetch Interaction)

**Checkpoint**: Author filter toggle updates graph instantly with no loading indicator. Repeated toggle produces identical state. Clearing all filters restores all commits with solid lines. Verify with `pnpm typecheck && pnpm lint && pnpm build`.

---

## Phase 5: User Story 5 — Scroll-Triggered Prefetch With Filter-Aware Capping (Priority: P2)

**Goal**: Prefetch works correctly with visibility filters active: triggers at visible-row boundaries, auto-retries empty batches, caps at 3, and shows a gap indicator.

**Independent Test**: Apply a filter that hides most commits. Scroll to the bottom. Verify batches auto-load, stop after 3 empty batches, gap indicator appears with counts and instructions, and scrolling past the indicator loads more.

### Implementation for User Story 5

- [x] T020 [US5] Modify `appendCommits()` in `webview-ui/src/stores/graphStore.ts` to implement auto-retry logic. After appending and recomputing visible commits, count the new visible commits in the appended batch. If zero: increment `consecutiveEmptyBatches`, add `newCommits.length` to `filteredOutCount`. If `consecutiveEmptyBatches >= 3`: set `showGapIndicator = true`, do NOT auto-prefetch. If any batch yields ≥1 visible commit: reset `consecutiveEmptyBatches = 0`, `filteredOutCount = 0`, `showGapIndicator = false`. Auto-retry signaling: the `commitsAppended` handler in rpcClient.ts (T021) reads `consecutiveEmptyBatches` and `hasMore` from the store AFTER calling `appendCommits()` to decide whether to call `firePrefetch()` again. No return value or callback needed — the store is the source of truth. (FR-013, FR-014; contract: store-api.md `appendCommits`)
- [x] T021 [US5] Handle auto-retry trigger in `webview-ui/src/rpc/rpcClient.ts`. In the `commitsAppended` message handler, after calling `store.appendCommits()`, read `store.consecutiveEmptyBatches` and `store.hasMore` from the store. If `consecutiveEmptyBatches > 0` AND `consecutiveEmptyBatches < 3` AND `hasMore`: call `firePrefetch()` again immediately. If `consecutiveEmptyBatches >= 3` or `!hasMore`: do nothing (gap indicator or end-of-repo handles it). (FR-013)
- [x] T022 [US5] Adapt the prefetch trigger `useEffect` in `webview-ui/src/components/GraphContainer.tsx`. When a visibility filter is active (i.e., `hiddenCommitHashes.size > 0`), use a visible-row-based threshold: trigger when `rangeEnd >= mergedCommits.length - prefetchThreshold` (where threshold is a reasonable buffer, e.g., the overscan value). Keep the existing `lastBatchStartIndex` logic for the unfiltered case. (Research R-003; FR-012)
- [x] T023 [US5] Render the gap indicator UI in `webview-ui/src/components/GraphContainer.tsx`. When `showGapIndicator` is `true` AND `hasMore` is `true`, render a styled element at the bottom of the virtual list showing: (a) the count of filtered-out commits from `filteredOutCount`, (b) the total number of records already fetched from `commits.length`, and (c) instructional text "keep scrolling down to fetch next batch". Style to be visually distinct from commit rows (muted background, smaller text). (FR-015)
- [x] T024 [US5] Implement scroll-past-gap-indicator behavior in `webview-ui/src/components/GraphContainer.tsx`. When `showGapIndicator` is true and the user scrolls past the gap indicator (detected via virtualizer range extending beyond `mergedCommits.length`), reset `consecutiveEmptyBatches` to 0, set `showGapIndicator` to false, and call `rpcClient.firePrefetch()` to load the next batch. The same 3-batch capping logic re-applies after reset. (FR-016)
- [x] T025 [US5] Ensure `hasMore = false` stops all fetching in `webview-ui/src/stores/graphStore.ts`. When the backend signals no more commits, set `showGapIndicator = false` regardless of `consecutiveEmptyBatches`. The gap indicator should never display when the repository is fully loaded. (Spec edge case: "Given the repository has no more commits")

**Checkpoint**: Filtered scrolling prefetches correctly. Auto-retry fetches up to 3 empty batches. Gap indicator shows with counts. Scrolling past gap triggers more loading. No runaway fetching. Verify with `pnpm typecheck && pnpm lint && pnpm build`.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation, cleanup, and cross-cutting verification

- [x] T026 Verify lane color consistency across dotted and solid lines (US3 acceptance criteria): In `webview-ui/src/components/GraphCell.tsx`, confirm that dotted connections and dotted passing lanes use the same `colorIndex`-derived color as their solid counterparts. No implementation change expected — this is a design verification via smoke test on a multi-branch repo with filters active.
- [x] T027 Verify filter-agnostic architecture (US4 acceptance criteria): Confirm that `computeHiddenCommitHashes()` in `webview-ui/src/stores/graphStore.ts` is the single point where visibility filter logic resides. Confirm `calculateTopology()` in `webview-ui/src/utils/graphTopology.ts` has no filter-type-specific code. No implementation change expected — this is an architecture verification.
- [x] T028 Run full build validation: `pnpm typecheck && pnpm lint && pnpm build`. Fix any errors or warnings.
- [x] T029 Run quickstart.md smoke test: Open a repo with multiple authors in VS Code "Run Extension", apply author filter, verify dotted lines, toggle filter on/off for instant response (SC-002: verify no perceptible delay for typical commit counts), scroll to test prefetch and gap indicator. Verify entire-history-hidden edge case produces empty state.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (Foundational)**: No dependencies — can start immediately. BLOCKS all user stories.
- **Phase 3 (US1)**: Depends on Phase 2 completion. This is the MVP.
- **Phase 4 (US2)**: Depends on Phase 3 (US1) completion — needs topology + rendering in place before removing backend calls.
- **Phase 5 (US5)**: Depends on Phase 3 (US1) completion — needs `hiddenCommitHashes` and modified `appendCommits` in place. Can run in parallel with Phase 4.
- **Phase 6 (Polish)**: Depends on all previous phases.

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 (Foundational). No dependencies on other stories.
- **US2 (P2)**: Depends on US1 — needs the local recompute infrastructure (topology + rendering) before removing backend round-trips.
- **US5 (P2)**: Depends on US1 — needs `hiddenCommitHashes` state and modified `appendCommits`. Independent of US2.
- **US3 (P2)**: No dedicated tasks — inherent in US1 implementation. Verified in Phase 6.
- **US4 (P3)**: No dedicated tasks — inherent in architecture. Verified in Phase 6.

### Within Each User Story

- Store/algorithm changes before rendering changes
- Core implementation before integration points
- Story complete and building before moving to next priority

### Parallel Opportunities

- T002 and T003 can run in parallel (different sections of different files)
- Phase 4 (US2) and Phase 5 (US5) modify different functions within shared files (`graphStore.ts`, `rpcClient.ts`) — no merge conflicts, but must be serialized in a single-agent workflow

---

## Parallel Example: Phase 2 (Foundational)

```
# These can run in parallel (different files):
T002: Extend ParentConnection type in graphTopology.ts
T003: Implement computeHiddenCommitHashes in graphStore.ts

# Then sequential:
T001: Remove --author args from GitLogService.ts
T004: Add new state fields to graphStore.ts (depends on T003)
```

## Execution After US1 Completes

```
# US2 and US5 are independent concerns but share graphStore.ts and rpcClient.ts.
# In a multi-developer workflow, they can be worked in parallel on separate branches.
# In a single-agent workflow, execute sequentially: Phase 4 (US2) then Phase 5 (US5).
Phase 4 (US2): T015-T019 — instant filter toggle (FilterWidget + store + rpcClient)
Phase 5 (US5): T020-T025 — prefetch capping (GraphContainer + store + rpcClient)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (type extensions + backend change + hidden hash function)
2. Complete Phase 3: User Story 1 (topology + rendering)
3. **STOP and VALIDATE**: Apply author filter, verify dotted lines, verify lane colors, verify tooltips
4. At this point, the core visual continuity feature works. Filter toggling still requires a backend round-trip (like current behavior), and prefetch uses existing trigger logic.

### Incremental Delivery

1. Phase 2 → Foundation ready
2. Phase 3 (US1) → Dotted lines work, visual continuity achieved (MVP!)
3. Phase 4 (US2) → Filter toggling becomes instant (no loading)
4. Phase 5 (US5) → Scroll prefetch works correctly with filters
5. Phase 6 → Polish, verification, build validation

### Parallel Strategy

After Phase 3 (US1) completes:
- Phase 4 (US2) then Phase 5 (US5) — sequential in single-agent workflow
- In multi-developer: separate branches for US2 and US5 (different functions, same files — merge-safe) → Phase 6

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US3 (lane colors) and US4 (filter-agnostic) are architectural qualities verified in Phase 6, not separate implementation phases
- No new packages required — all changes use existing SVG capabilities and TypeScript types
- `shared/types.ts` requires no changes — `GraphFilters` and `Commit` types are already sufficient
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently

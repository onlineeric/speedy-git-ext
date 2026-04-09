# Tasks: Uncommitted Changes Node

**Input**: Design documents from `/specs/036-uncommitted-node/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in spec. Test tasks omitted.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Type definitions, constants, and message protocol changes shared by all user stories.

- [x] T001 [P] Add `'uncommitted'` to `RefType` union and export `UNCOMMITTED_HASH = 'UNCOMMITTED'` constant in shared/types.ts
- [x] T002 [P] Add `getUncommittedChanges` request and `uncommittedChanges` response to message union types, and add entries to `REQUEST_TYPES` and `RESPONSE_TYPES` compile-time maps in shared/messages.ts. Also add optional `status` field (`FileChangeStatus`) to `openDiff` payload to support untracked file detection in diff handler
- [x] T003 Create `isUncommitted()` helper and `buildUncommittedSubject(stagedCount, unstagedCount, untrackedCount)` function in webview-ui/src/utils/uncommittedUtils.ts (depends on T001 for UNCOMMITTED_HASH import)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend handler and store logic that ALL user stories depend on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Add `getUncommittedChanges` case to `handleMessage()` switch in src/WebviewProvider.ts — call `gitDiffService.getUncommittedSummary()`, post `uncommittedChanges` response with counts
- [x] T005 Add `uncommittedChanges` message handler in webview-ui/src/rpc/rpcClient.ts — receive payload and call store action to update uncommitted state
- [x] T006 Add uncommitted state fields (`uncommittedFiles`, `uncommittedCounts`, `hasUncommittedChanges`) and `setUncommittedChanges` action to the Zustand store in webview-ui/src/stores/graphStore.ts
- [x] T007 Create `mergeUncommittedIntoCommits()` function in webview-ui/src/stores/graphStore.ts — build synthetic Commit from uncommitted data using `buildUncommittedSubject()`, insert at index 0 with `parents: [headCommitHash]` and `refs: [{ name: 'Uncommitted Changes', type: 'uncommitted' }]`. Only inject when `hasUncommittedChanges` is true and branch filter includes HEAD branch (or no branch filter active)
- [x] T008 Integrate `mergeUncommittedIntoCommits()` into the `computeMergedTopology()` flow in webview-ui/src/stores/graphStore.ts — call it after `mergeStashesIntoCommits()` to prepend the uncommitted node at index 0
- [x] T009 Add uncommitted node bypass in `computeHiddenCommitHashes()` in webview-ui/src/stores/graphStore.ts — add `if (commit.refs.some(r => r.type === 'uncommitted')) continue;` to exempt from author, date, and text filters
- [x] T010 Fetch uncommitted changes during refresh cycle — add `getUncommittedChanges` request to `sendInitialData()` parallel fetch batch in src/WebviewProvider.ts

**Checkpoint**: Foundation ready — uncommitted node data flows from backend to store, synthetic commit created and merged into commit array.

---

## Phase 3: User Story 1 - See Uncommitted Changes at a Glance (Priority: P1) MVP

**Goal**: Display a visually distinct uncommitted changes node at the top of the graph with dynamic file count subject, connected to HEAD.

**Independent Test**: Make changes to files in a repo, open the graph, verify the uncommitted node appears at the top with categorized file count. Apply filters — verify node stays visible. Commit all changes — verify node disappears.

### Implementation for User Story 1

- [x] T011 [US1] Add uncommitted node to topology skip-parent logic in `calculateTopology()` in webview-ui/src/utils/graphTopology.ts — add `commit.refs.some(r => r.type === 'uncommitted')` check alongside the existing stash check to skip parent processing during the main loop, and collect uncommitted index for post-loop finalization
- [x] T012 [US1] Add uncommitted node post-loop finalization in `calculateTopology()` in webview-ui/src/utils/graphTopology.ts — add parent connection from uncommitted node to HEAD commit (same pattern as stash finalization at lines 301-314)
- [x] T013 [US1] Add dashed circle rendering for uncommitted node in webview-ui/src/components/GraphCell.tsx — when the commit has `refs.type === 'uncommitted'`, render the SVG circle with `strokeDasharray` and a distinct accent color
- [x] T014 [US1] Add dashed edge rendering for the uncommitted-to-HEAD connection in webview-ui/src/components/GraphCell.tsx — render the parent connection line with `strokeDasharray: '4 3'` when the source is an uncommitted node
- [x] T015 [P] [US1] Add uncommitted node subject styling in webview-ui/src/components/CommitRow.tsx — detect `isUncommitted` via ref type, apply italic + accent foreground color (distinct from stash styling)
- [x] T016 [P] [US1] Add uncommitted node subject styling in webview-ui/src/components/CommitTableRow.tsx — same detection and styling as CommitRow

**Checkpoint**: Uncommitted node appears at graph top with dashed circle, dashed edge to HEAD, italic subject with file counts. Filters bypass it. Disappears when clean.

---

## Phase 4: User Story 2 - Inspect Uncommitted File Changes (Priority: P1)

**Goal**: Click the uncommitted node to see all changed files in the details panel with correct status badges in list and tree view.

**Independent Test**: Select the uncommitted node, verify details panel opens with all staged/unstaged/untracked files, correct status badges, and both view modes work.

### Implementation for User Story 2

- [x] T017 [US2] Handle `UNCOMMITTED_HASH` in `getCommitDetails` case in src/WebviewProvider.ts — when hash is `UNCOMMITTED_HASH`, call `getUncommittedSummary()` and return a synthetic `CommitDetails` object with placeholder metadata, the file changes, and `stats: { additions: 0, deletions: 0 }`
- [x] T018 [US2] Update CommitDetailsPanel to use `getCommitDetails(UNCOMMITTED_HASH)` in webview-ui/src/components/CommitDetailsPanel.tsx — verified: existing flow works transparently with UNCOMMITTED_HASH via T017

**Checkpoint**: Clicking uncommitted node opens details panel with full file list, status badges, and tree/list toggle.

---

## Phase 5: User Story 3 - Diff Uncommitted Files (Priority: P2)

**Goal**: Click a file in the uncommitted details panel to open a diff view showing changes against HEAD.

**Independent Test**: Select a file from the uncommitted node's details panel, verify diff opens showing changes vs HEAD for tracked files and full content for untracked files.

### Implementation for User Story 3

- [x] T019 [US3] Handle `UNCOMMITTED_HASH` in `openDiffEditor()` in src/WebviewProvider.ts — when hash is `UNCOMMITTED_HASH`: use the `status` field from the `openDiff` payload to determine diff strategy. For tracked files, use `git-show://HEAD/...` as left URI and `vscode.Uri.file()` as right URI. For untracked files, use empty content left URI and file URI as right
- [x] T020 [US3] Pass file status in openDiff message from webview-ui/src/components/CommitDetailsPanel.tsx — when opening a diff for an uncommitted file, include the file's `status` field in the `openDiff` message payload

**Checkpoint**: Clicking any file in uncommitted details opens correct diff view.

---

## Phase 6: User Story 4 - Uncommitted Node Auto-Refreshes (Priority: P2)

**Goal**: Uncommitted node updates automatically when files change, and details panel stays open with updated content.

**Independent Test**: With graph open, modify files — verify node appears/updates. With details panel open on uncommitted node, save a file — verify panel updates without losing selection.

### Implementation for User Story 4

- [x] T021 [US4] Re-fetch uncommitted changes on auto-refresh in src/WebviewProvider.ts — verified: `triggerAutoRefresh()` → `sendInitialData()` includes `getUncommittedChanges` fetch (T010). Fingerprint check only applies to commits, not uncommitted messages
- [x] T022 [US4] Auto-update details panel on refresh in webview-ui/src/stores/graphStore.ts — `setUncommittedChanges` action triggers `getCommitDetails(UNCOMMITTED_HASH)` when the uncommitted node is selected and details panel is open

**Checkpoint**: Uncommitted node and details panel update live on file changes.

---

## Phase 7: User Story 5 - Uncommitted Node Context Menu (Priority: P3)

**Goal**: Right-clicking the uncommitted node shows no commit actions or a minimal Refresh-only menu.

**Independent Test**: Right-click the uncommitted node, verify no checkout/reset/cherry-pick actions appear.

### Implementation for User Story 5

- [x] T023 [P] [US5] Create UncommittedContextMenu component in webview-ui/src/components/UncommittedContextMenu.tsx — minimal Radix UI context menu with only a "Refresh" action
- [x] T024 [P] [US5] Route uncommitted node to UncommittedContextMenu in webview-ui/src/components/CommitRow.tsx — added `isUncommitted` check before `isStash` check
- [x] T025 [P] [US5] Route uncommitted node to UncommittedContextMenu in webview-ui/src/components/CommitTableRow.tsx — same routing logic as CommitRow

**Checkpoint**: Right-click uncommitted node shows minimal context menu, no commit actions.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validation, edge cases, and cleanup across all stories.

- [x] T026 Verify uncommitted node works in detached HEAD state — mergeUncommittedIntoCommits() falls back to first commit hash when no HEAD ref found
- [x] T027 Verify uncommitted node works during rebase and merge conflict states — getUncommittedSummary() runs independent git commands unaffected by conflict state
- [x] T028 Run `pnpm typecheck` — passes with 0 errors
- [x] T029 Run `pnpm lint` — passes with 0 errors (only pre-existing warnings)
- [x] T030 Run `pnpm build` — clean build of extension and webview
- [ ] T031 Smoke test per quickstart.md: open repo with changes → verify node → click node → verify details → click file → verify diff → commit all → verify node disappears. Also verify: (a) graph rendering feels equally responsive with the uncommitted node present (SC-005), (b) test in a multi-root workspace if possible to confirm per-repo independence (EC5)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) completion — BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational (Phase 2) completion
  - US1 and US2 can proceed in parallel after Phase 2
  - US3 depends on US2 (needs details panel to exist)
  - US4 depends on US1 and US2 (needs node and details panel)
  - US5 can proceed in parallel with US1-US4 after Phase 2
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no dependencies on other stories
- **US2 (P1)**: After Phase 2 — no dependencies on other stories (details panel already exists)
- **US3 (P2)**: After US2 — needs details panel file list to be clickable
- **US4 (P2)**: After US1 + US2 — needs node in graph and details panel working
- **US5 (P3)**: After Phase 2 — no dependencies on other stories

### Within Each User Story

- Topology changes before rendering changes
- Backend handlers before frontend consumers
- Core logic before styling/polish

### Parallel Opportunities

- T001 + T002 (Setup) can run in parallel; T003 depends on T001 (imports UNCOMMITTED_HASH)
- T004 through T010 (Foundational) are mostly sequential (store depends on handler)
- T015 + T016 (CommitRow + CommitTableRow styling) can run in parallel
- T023 + T024 + T025 (context menu) can all run in parallel
- US1 and US2 can run in parallel after Phase 2
- US5 can run in parallel with any other story after Phase 2

---

## Parallel Example: User Story 1

```bash
# After T011-T014 (topology + graph cell) complete sequentially:
# Launch styling tasks in parallel:
Task: "T015 [P] [US1] Add uncommitted node subject styling in CommitRow.tsx"
Task: "T016 [P] [US1] Add uncommitted node subject styling in CommitTableRow.tsx"
```

## Parallel Example: User Story 5

```bash
# All three tasks can run in parallel (different files):
Task: "T023 [P] [US5] Create UncommittedContextMenu component"
Task: "T024 [P] [US5] Route in CommitRow.tsx"
Task: "T025 [P] [US5] Route in CommitTableRow.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T010)
3. Complete Phase 3: User Story 1 (T011-T016)
4. **STOP and VALIDATE**: Uncommitted node visible in graph with correct styling
5. This alone delivers the core "at a glance" value

### Incremental Delivery

1. Setup + Foundational → Data pipeline ready
2. Add US1 → Node visible in graph (MVP!)
3. Add US2 → File inspection in details panel
4. Add US3 → Diff viewing for files
5. Add US4 → Auto-refresh for live updates
6. Add US5 → Context menu correctness
7. Polish → Validation and edge cases

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable after Phase 2
- No test tasks generated (not requested in spec)
- Total: 31 tasks across 8 phases

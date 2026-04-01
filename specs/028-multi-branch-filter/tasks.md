# Tasks: Multi-Branch Filter Selection

**Input**: Design documents from `/specs/028-multi-branch-filter/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project setup needed. This feature modifies existing files only.

(No tasks — project already initialized.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Update shared types and backend services that all user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 [P] Update `GraphFilters` interface: rename `branch?: string` to `branches?: string[]` in `shared/types.ts`
- [x] T002 [P] Update `loadMoreCommits` message filter type: change `branch?: string` to `branches?: string[]` in `shared/messages.ts`
- [x] T003 Update `GitLogService.getCommits()` to push multiple branch refs as positional args to `git log` (loop over `filters.branches` array; fall back to `--exclude=refs/stash --all` when empty/undefined) in `src/services/GitLogService.ts`
- [x] T004 Update `GitLogService.getCommits()` hasFilter check: change `filters?.branch` to `filters?.branches?.length` in `src/services/GitLogService.ts`
- [x] T005 Update `WebviewProvider.sendInitialData()` branch existence validation: iterate `effectiveFilters.branches` array and remove any branches that no longer exist in `src/WebviewProvider.ts`
- [x] T006 Update `WebviewProvider` message handlers (`getCommits`, `refresh`, `loadMoreCommits`) to merge `branches` array filter correctly in `src/WebviewProvider.ts`
- [x] T007 Update `rpcClient.getCommits()`, `rpcClient.refresh()`, `rpcClient.fetch()` filter type signatures to use `branches?: string[]` in `webview-ui/src/rpc/rpcClient.ts`
- [x] T008 Update `rpcClient.firePrefetch()` to extract `branches` (array) instead of `branch` from store filters in `webview-ui/src/rpc/rpcClient.ts`
- [x] T009 Update `graphStore.ts` hasFilter check in `appendCommits`: change `filters.branch` to `filters.branches?.length` in `webview-ui/src/stores/graphStore.ts`
- [x] T010 Run `pnpm typecheck` to verify all type errors from the `branch → branches` rename are resolved across the codebase

**Checkpoint**: Foundation ready — shared types, backend, and RPC layer all support `branches: string[]`. User story implementation can now begin.

---

## Phase 3: User Story 1 — Select Multiple Branches to Filter Graph (Priority: P1) 🎯 MVP

**Goal**: Users can select multiple branches in the dropdown and the graph shows only commits reachable from selected branches. Graph updates immediately after each toggle.

**Independent Test**: Open dropdown, select 2+ branches, verify graph shows only commits from those branches. Deselect one, verify graph updates. Select "All Branches", verify graph returns to full view.

### Implementation for User Story 1

- [x] T011 [US1] Create `MultiBranchDropdown.tsx` by copying `FilterableBranchDropdown.tsx` as a starting point. Change props to: `selectedBranches: string[]`, `onBranchToggle: (branch: string) => void`, `onClearSelection: () => void`. Keep `FilterableBranchDropdown.tsx` unchanged for future single-select reuse in `webview-ui/src/components/MultiBranchDropdown.tsx`
- [x] T012 [US1] Update `selectItem()` in `MultiBranchDropdown`: for branch items, call `onBranchToggle(item.value)` instead of closing; for "All Branches", call `onClearSelection()`. Dropdown must remain open after both actions in `webview-ui/src/components/MultiBranchDropdown.tsx`
- [x] T013 [US1] Update `isSelected` logic in branch list rendering: change from single-branch comparison to `selectedBranches.includes(item.value)` in `webview-ui/src/components/MultiBranchDropdown.tsx`
- [x] T014 [US1] Update `ControlBar.tsx`: switch from `FilterableBranchDropdown` to `MultiBranchDropdown`. Replace `handleBranchSelect(branch: string | undefined)` with `handleBranchToggle(branch: string)` that adds/removes from branches array, and `handleClearSelection()` that sets `branches` to `undefined`. Both must call `setFilters` and `rpcClient.getCommits` immediately after each toggle (per FR-012) in `webview-ui/src/components/ControlBar.tsx`
- [x] T015 [US1] Handle edge case: when last branch is deselected (array becomes empty), treat as "All Branches" (set `branches` to `undefined`) in `webview-ui/src/components/ControlBar.tsx`

**Checkpoint**: Core multi-select works — users can toggle branches, graph updates per toggle. MVP complete.

---

## Phase 4: User Story 2 — Text Filter Narrows Branch List Within Multi-Select (Priority: P1)

**Goal**: Text filter works alongside multi-select — narrowing the visible list without affecting existing selections.

**Independent Test**: Type filter text, select a branch from filtered results, clear filter, type different filter, select another branch — both selections persist.

### Implementation for User Story 2

- [x] T016 [US2] Verify text filter preserves selections: ensure `filteredList` in `MultiBranchDropdown` only affects visibility (already the case since filter is on `useMemo` and selections are in parent state). No code change expected — validate and document in `webview-ui/src/components/MultiBranchDropdown.tsx`
- [x] T017 [US2] Verify `filterText` state is independent of selection state — clearing text shows all branches with current selections intact. Manual test only; no code change expected in `webview-ui/src/components/MultiBranchDropdown.tsx`

**Checkpoint**: Text filter and multi-select work together without interference.

---

## Phase 5: User Story 3 — Visual Indication of Selected Branches (Priority: P2)

**Goal**: Users can see which branches are selected at a glance — both in the trigger button label and within the dropdown list.

**Independent Test**: Select 0, 1, 2, 5 branches and verify trigger button shows "All Branches", branch name, "2 branches selected", "5 branches selected" respectively. Open dropdown and verify selected branches have check indicators.

### Implementation for User Story 3

- [x] T018 [P] [US3] Update trigger button label: show "All Branches" when `selectedBranches` is undefined or empty, branch name when length === 1, "{N} branches selected" when length >= 2 in `webview-ui/src/components/MultiBranchDropdown.tsx`
- [x] T019 [P] [US3] Add checkbox/check indicator to each branch row: render a checkmark icon or checkbox element for selected branches, empty/unchecked for unselected in `webview-ui/src/components/MultiBranchDropdown.tsx`

**Checkpoint**: Visual indicators are clear and readable for all selection states.

---

## Phase 6: User Story 4 — Dropdown Stays Open for Multi-Selection (Priority: P2)

**Goal**: Dropdown remains open after toggling branch selections, closing only on Escape or click-outside.

**Independent Test**: Click multiple branches in succession — dropdown stays open. Press Escape — dropdown closes. Click outside — dropdown closes.

### Implementation for User Story 4

- [x] T020 [US4] Ensure `handleOpenChange` in `MultiBranchDropdown` does not close on item click — only on external dismissal (Escape, click-outside). Remove `setOpen(false)` from `selectItem`/toggle path (already addressed in T012 but verify Radix Popover `onOpenChange` is not triggered by internal clicks) in `webview-ui/src/components/MultiBranchDropdown.tsx`
- [x] T021 [US4] Verify full keyboard navigation in list mode: Enter toggles selection without closing dropdown, arrow keys navigate between selectable items, type-to-redirect returns focus to text input (per FR-011) in `webview-ui/src/components/MultiBranchDropdown.tsx`

**Checkpoint**: Dropdown behavior supports ergonomic multi-select workflow.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and edge case handling across all stories.

- [x] T022 Handle branch list refresh: when branches prop changes, remove any `selectedBranches` entries that no longer exist in the branch list. Implement in `ControlBar.tsx` or `MultiBranchDropdown.tsx` via a `useEffect` that reconciles selections in `webview-ui/src/components/ControlBar.tsx`
- [x] T023 Run `pnpm typecheck` — zero TypeScript errors
- [x] T024 Run `pnpm lint` — zero ESLint errors
- [x] T025 Run `pnpm build` — clean build of both extension and webview
- [x] T026 Run quickstart.md validation: manual smoke test via VS Code "Run Extension" launch config covering all acceptance scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately. BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) completion.
- **User Story 2 (Phase 4)**: Depends on User Story 1 (Phase 3) — text filter behavior depends on multi-select being in place.
- **User Story 3 (Phase 5)**: Depends on User Story 1 (Phase 3) — visual indicators need multi-select props.
- **User Story 4 (Phase 6)**: Depends on User Story 1 (Phase 3) — dropdown behavior changes built on toggle logic.
- **Polish (Phase 7)**: Depends on all user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — no story dependencies
- **User Story 2 (P1)**: Depends on US1 (multi-select must exist to test text filter interaction)
- **User Story 3 (P2)**: Depends on US1 (needs `selectedBranches` prop). Can run in parallel with US2 and US4.
- **User Story 4 (P2)**: Depends on US1 (toggle behavior). Can run in parallel with US2 and US3.

### Within Each User Story

- Models/types before services
- Services before UI components
- Core implementation before edge cases

### Parallel Opportunities

- T001 and T002 can run in parallel (different shared files)
- T003 and T004 are in the same file but sequential (same function)
- T007 and T008 are in the same file, sequential
- T018 and T019 can run in parallel (different parts of same component, but independent visual changes)
- US3 and US4 can run in parallel after US1 completes

---

## Parallel Example: Foundational Phase

```
# These can run in parallel (different files):
T001: Update GraphFilters in shared/types.ts
T002: Update loadMoreCommits type in shared/messages.ts

# Then sequentially within each file:
T003 → T004: GitLogService changes
T005 → T006: WebviewProvider changes
T007 → T008: rpcClient changes
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (type changes, backend, RPC)
2. Complete Phase 3: User Story 1 (dropdown toggle, ControlBar)
3. **STOP and VALIDATE**: Test multi-branch selection independently
4. Basic multi-select works — users can filter by multiple branches

### Incremental Delivery

1. Foundational → types + backend support for `branches[]`
2. Add User Story 1 → Core multi-select → MVP ready
3. Add User Story 2 → Verify text filter compatibility (likely no code changes)
4. Add User Story 3 → Visual indicators (checkmarks, trigger label)
5. Add User Story 4 → Dropdown stays open (verify/fix Radix behavior)
6. Polish → Edge cases, build validation, smoke test

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No new dependencies to install
- US2 is largely a verification phase — the text filter and selection state are already independent by design
- Total: 26 tasks across 7 phases

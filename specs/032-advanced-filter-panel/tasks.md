# Tasks: Advanced Filter Panel

**Input**: Design documents from `/specs/032-advanced-filter-panel/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## User Story Mapping

| ID | Title | Priority |
|----|-------|----------|
| US1 | Filter Commits by Author | P1 |
| US2 | Filter Commits by Date Range | P2 |
| US3 | View Branch Filter Badges in Filter Panel | P2 |
| US4 | Right-Click Context Menu for Quick Filtering | P3 |
| US5 | Filter Panel UI and Reset | P2 |
| US6 | Reusable Author Badge Component | P3 |

---

## Phase 1: Setup (Shared Types & Message Contracts)

**Purpose**: Extend shared type system and message protocol to support all new filter capabilities.

- [x] T001 [P] Add `Author` interface and extend `GraphFilters` with `authors?: string[]`, `afterDate?: string`, `beforeDate?: string` fields in `shared/types.ts`. Keep existing `author?: string` field for backward compatibility with `loadMoreCommits`, and add a `@deprecated` JSDoc comment on it. See data-model.md for exact type definitions.
- [x] T002 [P] Add `getAuthors` request type (`{ type: 'getAuthors'; payload: Record<string, never> }`) and `authorList` response type (`{ type: 'authorList'; payload: { authors: Author[] } }`) to `shared/messages.ts`. Update `loadMoreCommits` payload filter type to include `authors?: string[]`, `afterDate?: string`, `beforeDate?: string`. Update both `REQUEST_TYPES` and `RESPONSE_TYPES` exhaustive maps. See contracts/messages.md for full details.

---

## Phase 2: Foundational (Backend + Store + Generic Components)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented. Includes backend git services, Zustand store extensions, RPC client updates, and the generic MultiSelectDropdown component.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Add `getAuthors()` method to `src/services/GitLogService.ts`. Run `git log --all --format='%an%x00%ae'`, parse output, deduplicate by email (first name wins per git default order), return `Author[]` sorted alphabetically by name. Use the existing `GitExecutor` and `Result<T>` pattern. Also extend `getCommits()` to: (1) when `filters.authors` is set, add one `--author=<email>` flag per author email, (2) add `--after=<date>` when `filters.afterDate` is set, (3) add `--before=<date>` when `filters.beforeDate` is set. Update the `hasFilter` check (line ~78) to include `authors`, `afterDate`, `beforeDate`.
- [x] T004 Handle `getAuthors` message in `src/WebviewProvider.ts`. Add a case in the message handler that calls `gitLogService.getAuthors()` and sends back an `authorList` response. Also ensure `getCommits` and `loadMoreCommits` cases pass `authors`, `afterDate`, `beforeDate` fields through to `GitLogService`. Trigger `getAuthors` alongside initial `getCommits` on panel open and after fetch/refresh operations.
- [x] T005 [P] Create generic `MultiSelectDropdown<T>` component in `webview-ui/src/components/MultiSelectDropdown.tsx`. Extract the reusable multi-select dropdown logic from `MultiBranchDropdown` (Radix Popover, search input filtering, keyboard navigation with Tab/Arrow/Enter, auto-scroll highlighted item into view, multi-select with checkmarks, grouped items via optional `groupBy` prop). Use generic type parameter `<T>` with render props for item rendering and trigger rendering. See contracts/components.md for full `MultiSelectDropdownProps<T>` interface. Internal state: `filterText`, `highlightedIndex`, `listNavigationMode`.
- [x] T006 Refactor `webview-ui/src/components/MultiBranchDropdown.tsx` to use `MultiSelectDropdown<Branch>` internally. Move branch-specific logic (local/remote grouping, branch name display, "All Branches" label) into render props. External `MultiBranchDropdownProps` must remain unchanged (`branches`, `selectedBranches`, `onBranchToggle`, `onClearSelection`). Verify no regression in existing branch dropdown behavior.
- [x] T007 [P] Create `AuthorBadge` component in `webview-ui/src/components/AuthorBadge.tsx`. Props: `name: string`, `email: string`, `onRemove?: () => void`, `className?: string`. Renders the existing `AuthorAvatar` component + author name text. When `onRemove` is provided, render an X button. Style with VS Code theme variables. See contracts/components.md for interface.
- [x] T008 Extend Zustand store in `webview-ui/src/stores/graphStore.ts`. Add to `GraphStore` interface: `authorList: Author[]`, `authorListLoading: boolean`, `setAuthorList: (authors: Author[]) => void`, `setAuthorListLoading: (loading: boolean) => void`, `resetAllFilters: (options?: { preserveBranches?: boolean }) => void`. Initialize `authorList: []`, `authorListLoading: false`. The `resetAllFilters` action must atomically reset filter fields (see data-model.md centralized reset section): when `preserveBranches: true`, clear `authors`, `afterDate`, `beforeDate` but keep `branches` and `maxCount`; when `preserveBranches: false` (default), clear all filter fields keeping only `maxCount`. Also set `totalLoadedWithoutFilter: null`. Update existing `setRepos` (line ~486) and `setActiveRepo` (line ~496) to use `resetAllFilters({ preserveBranches: false })` instead of inline filter resets. This also satisfies FR-024 (reset on session/repo change) since `setRepos` is called on initial panel creation and `setActiveRepo` on repo switch — both paths now go through centralized reset. Update `appendCommits` `hasFilter` check (line ~343) to include `authors`, `afterDate`, `beforeDate`.
- [x] T009 Extend RPC client in `webview-ui/src/rpc/rpcClient.ts`. Add `getAuthors()` method that sends `{ type: 'getAuthors', payload: {} }`. In `handleMessage`, add `authorList` case that calls `store.setAuthorList(message.payload.authors)` and `store.setAuthorListLoading(false)`. Update `getCommits()` method signature to accept the extended filter fields (`authors`, `afterDate`, `beforeDate`). Update `loadMoreCommits()` to pass `authors`, `afterDate`, `beforeDate` alongside existing filter fields.

**Checkpoint**: Foundation ready — backend serves author lists and filters by author/date, store manages extended filter state with centralized reset, generic MultiSelectDropdown and AuthorBadge components are available.

---

## Phase 3: User Story 1 - Filter Commits by Author (Priority: P1) MVP

**Goal**: Users can filter commits by selecting one or more authors from a dropdown. Selected authors appear as badges. Only commits from selected authors are shown.

**Independent Test**: Open the filter panel, select authors from the dropdown, verify only commits from those authors appear. Remove authors via badge X buttons, verify list updates. Use dropdown search to filter author list.

### Implementation for User Story 1

- [x] T010 [US1] Rewrite `FilterWidget` in `webview-ui/src/components/FilterWidget.tsx` with the author filter section. Read `authorList`, `authorListLoading`, `filters` from the Zustand store. Render: (1) a `MultiSelectDropdown<Author>` for selecting authors — `getKey` returns `email`, `getSearchText` returns `name + email`, `renderItem` shows avatar + name + email, `clearAllLabel` is "All Authors"; (2) below the dropdown, render a flex-wrap container of `AuthorBadge` components for each selected author (from `filters.authors`), each with an `onRemove` callback that removes that email from `filters.authors` and triggers `rpcClient.getCommits()`. The author badge area MUST have `max-height` of ~96-112px (approximately 3-4 lines of badges) and `overflow-y: auto` so it scrolls independently when many authors are selected (FR-020). When `filters.authors` is empty or undefined, show "All authors" text. On author toggle in dropdown: update `filters.authors` via `store.setFilters()` and call `rpcClient.getCommits()`. Apply the panel container styling: `px-4 py-2 border-b border-[var(--vscode-panel-border)]`. The panel itself has NO fixed height and NO panel-level scrolling.
- [x] T011 [US1] Unhide the filter button in `webview-ui/src/components/ControlBar.tsx`. Remove `style={{ display: 'none' }}` from the filter button (line ~130). Note: filterColor logic update for all filter types is handled in T013 (US5) to avoid duplicate edits.

**Checkpoint**: User Story 1 is functional — authors can be selected/deselected, commits filter server-side, badges show active selections. Filter button visible and reflects author filter state.

---

## Phase 4: User Story 5 - Filter Panel UI and Reset (Priority: P2)

**Goal**: The filter panel shows a clear layout with three sections (branches, authors, dates) and a Reset All button that clears author and date filters while preserving branch filters.

**Independent Test**: Open filter panel, apply author and/or date filters, click Reset All — verify author and date filters clear but branch selections remain. Verify Reset All button is disabled when no author/date filters are active. Verify filter icon color reflects combined filter state.

### Implementation for User Story 5

- [x] T012 [US5] Extend `FilterWidget` in `webview-ui/src/components/FilterWidget.tsx` to add the full three-section layout and Reset All button. Add: (1) a "Date Range" row placeholder (actual date inputs come in US2 — for now render the label and empty fields); (2) a "Branches" row placeholder (actual badges come in US3 — for now render the label and "All branches" text); (3) a "Reset All" button that calls `store.resetAllFilters({ preserveBranches: true })` then `rpcClient.getCommits(store.filters)`. The button is `disabled` when `!(filters.authors?.length || filters.afterDate || filters.beforeDate)`. (4) a close button (X) that calls `store.setActiveToggleWidget(null)`. Use flexbox layout with three distinct rows, each with a label column and content column. The panel itself has NO fixed height and NO panel-level scrolling — only badge areas within each row scroll independently (FR-020).
- [x] T013 [US5] Update filter icon color in `webview-ui/src/components/ControlBar.tsx` to check all filter types. Change `filterColor` logic: `filtered` (yellow) state when `filterHasBranchFilter || (filters.authors?.length ?? 0) > 0 || !!filters.afterDate || !!filters.beforeDate`. This ensures the icon reflects the combined state of all active filters (FR-013).

**Checkpoint**: Filter panel has complete 3-section layout with labels, Reset All button works atomically, filter icon color reflects all filter types.

---

## Phase 5: User Story 2 - Filter Commits by Date Range (Priority: P2)

**Goal**: Users can filter commits by entering From and/or To dates (with optional time). Commits outside the range are excluded.

**Independent Test**: Open filter panel, enter a From date — verify only commits from that date onward appear. Enter a To date — verify only commits up to that date appear. Enter both — verify range works. Clear fields — verify all commits return. Enter time component — verify precise filtering.

### Implementation for User Story 2

- [x] T014 [US2] Implement date range inputs in `FilterWidget` (`webview-ui/src/components/FilterWidget.tsx`). In the "Date Range" row, add: (1) "From" label + `<input type="date">` + `<input type="time">` (time is optional); (2) "To" label + `<input type="date">` + `<input type="time">` (time is optional). On change: validate that date is present when time is entered (FR-006), show validation indicator (red border) for invalid input. When valid: format the value as ISO 8601 — From Date without time defaults to `YYYY-MM-DDT00:00:00`, To Date without time defaults to `YYYY-MM-DDT23:59:59` (FR-008). Debounce 150ms (FR-019) before calling `store.setFilters({ afterDate, beforeDate })` and `rpcClient.getCommits()`. Style date/time inputs with VS Code theme variables. When field is cleared, set the corresponding filter field to `undefined`.
- [x] T015 [US2] Update Reset All button logic in `FilterWidget` to properly clear date fields. Ensure the button's disabled state includes date filter checks, and that `resetAllFilters({ preserveBranches: true })` clears `afterDate` and `beforeDate` (already handled by T008's store implementation — verify the FilterWidget local date input state also clears when reset is triggered, using a `useEffect` that watches `filters.afterDate`/`filters.beforeDate`).

**Checkpoint**: Date range filtering works end-to-end with debounced input, validation, default time handling, and integration with Reset All.

---

## Phase 6: User Story 3 - View Branch Filter Badges in Filter Panel (Priority: P2)

**Goal**: Branch filter selections from the ControlBar dropdown appear as badges in the filter panel's "Branches" row, with X buttons to remove individual branches. Badges reuse the `RefLabel` component with graph-line colors.

**Independent Test**: Select branches in the branch dropdown, open filter panel — verify selected branches appear as badges with matching graph-line colors. Click X on a badge — verify that branch is removed from the filter and commits update. Verify combined local+remote branches show as a single combined badge.

### Implementation for User Story 3

- [x] T016 [P] [US3] Create `getBranchLaneColorStyle()` utility function in `webview-ui/src/utils/filterUtils.ts`. This function takes a branch name, the `mergedCommits` array, the `topology` (GraphTopology), and the color palette (string[]), and returns `React.CSSProperties | undefined`. Implementation: find the first commit in `mergedCommits` whose refs contain the branch name → get the `CommitNode` from `topology.nodes` using that commit's hash → extract `node.colorIndex` → resolve the hex color via `getColor(colorIndex, palette)` → return the CSS style via `getLaneColorStyle(hexColor)`. Return `undefined` if no commit is found for that branch (RefLabel will use its fallback VS Code badge colors).
- [x] T017 [US3] Implement branch filter badges in `FilterWidget` (`webview-ui/src/components/FilterWidget.tsx`). In the "Branches" row, render badges for each branch in `filters.branches` using the existing `RefLabel` component (from `webview-ui/src/components/RefLabel.tsx`) with `laneColorStyle` resolved via `getBranchLaneColorStyle()` from `filterUtils.ts`. Read `mergedCommits`, `topology`, and `userSettings.graphColors` from the Zustand store to compute the color. Each badge wraps a `RefLabel` + an X button that removes that branch from `filters.branches` via `store.setFilters()` and triggers `rpcClient.getCommits()`. When both local and remote versions of a branch are selected (e.g., `main` and `origin/main`), show a single combined badge using `DisplayRef` type `'merged-branch'` (FR-009). When no branches are filtered, show "All branches" text. The branch badge area MUST have `max-height` of ~96-112px and `overflow-y: auto` for independent scrolling when many branches are selected (FR-020). Use `flex-wrap: wrap` for badge layout.

**Checkpoint**: Branch filter selections visible and manageable from within the filter panel. RefLabel component reused with matching graph-line colors. Combined badges work correctly. Badge area scrolls independently.

---

## Phase 7: User Story 6 - Reusable Author Badge Component (Priority: P3)

**Goal**: The commit details panel uses the same `AuthorBadge` component as the filter panel for visual consistency.

**Independent Test**: Select a commit, view the details panel — verify the author is displayed as a styled badge with avatar icon + name (not plain text). Compare visually with filter panel author badges.

### Implementation for User Story 6

- [x] T018 [US6] Update `webview-ui/src/components/CommitDetailsPanel.tsx` to replace the plain-text author display with the `AuthorBadge` component. Use the display-only variant (no `onRemove` prop). Pass `name` from `commitDetails.author` and `email` from `commitDetails.authorEmail`. This ensures visual consistency between the filter panel and the details panel (FR-017).

**Checkpoint**: Author display is visually consistent across filter panel and commit details panel.

---

## Phase 8: User Story 4 - Right-Click Context Menu for Quick Filtering (Priority: P3)

**Goal**: Users can right-click on author names, dates, and branch badges in the commit table to quickly add or remove filter criteria via context menu.

**Independent Test**: Right-click an author name — verify "Add Author to filter" appears (or "Remove" if already filtered). Right-click a date — verify "Filter from this date" and "Filter to this date" appear. Right-click a branch badge — verify "Add/Remove branch to/from filter" appears. Execute each action and verify filter state updates.

### Implementation for User Story 4

- [x] T019 [US4] Add author filter context menu items to `webview-ui/src/components/CommitTableRow.tsx` (table view only, per FR-023). Reimplemented with lazy-mount pattern: `AuthorContextMenu` wrapper has zero store subscriptions; store access deferred to `ContextMenu.Content` children (mounted via Portal only when menu is open).
- [x] T020 [US4] Add date filter context menu items to `webview-ui/src/components/CommitTableRow.tsx`. Reimplemented with same lazy-mount pattern as T019 via `DateContextMenu` component.
- [x] T021 [US4] Add branch filter context menu items to `webview-ui/src/components/BranchContextMenu.tsx`. Add "Add branch to filter" / "Remove branch from filter" items (conditional on whether the branch is currently in `filters.branches`). For local branches: add/remove just the local branch name. For remote branches: add/remove just the remote ref (e.g., `origin/main`). For combined local+remote badges: add/remove both the local name and the remote ref (FR-016). Read `filters.branches` from the Zustand store to determine which item to show.

**Checkpoint**: All context menu filtering actions work — author, date, and branch quick filters are fully functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Empty state message, build validation, and final cleanup.

- [x] T022 [P] Add empty state message to `webview-ui/src/components/GraphContainer.tsx`. When `mergedCommits.length === 0 && !loading` and any filter is active (`filters.branches?.length || filters.authors?.length || filters.afterDate || filters.beforeDate`), display "No commits match the current filters" centered in the commit list area (FR-011). When no filters are active and no commits, show existing empty behavior.
- [x] T023 Run `pnpm typecheck` — verify zero TypeScript errors across all modified/new files.
- [x] T024 Run `pnpm lint` — verify zero ESLint errors.
- [x] T025 Run `pnpm build` — verify clean production build of both extension and webview.
- [ ] T026 Manual smoke test via VS Code "Run Extension" launch config. Verify: (1) filter button visible and toggles panel, (2) author dropdown loads and filters work — dropdown stays open for multi-select, (3) date range inputs filter correctly with debounce — date/time picker values display correctly, (4) branch badges display in panel with graph-line colors matching commit table and X removal, (5) branch and author badge areas scroll independently when many badges present, (6) Reset All (top-right) clears ALL filters including branches, (7) context menus on branch cells work (T019/T020 rolled back — author/date context menus pending), (8) author badge in details panel matches filter panel style, (9) empty state shows when no commits match, (10) filter icon color reflects combined filter state, (11) filters reset on session open/repo change, (12) graph lines render correctly (no corruption).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — MVP, should be completed first
- **US5 (Phase 4)**: Depends on Phase 3 (needs author section in FilterWidget to exist)
- **US2 (Phase 5)**: Depends on Phase 4 (US5) — needs the "Date Range" row layout from T012
- **US3 (Phase 6)**: Depends on Phase 4 (US5) — needs the "Branches" row layout from T012
- **US6 (Phase 7)**: Depends on Phase 2 (needs AuthorBadge from T007) — independent of other stories
- **US4 (Phase 8)**: Depends on Phase 2 — but practically benefits from US1/US2/US3 being done so filter state exists to interact with
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — no dependencies on other stories
- **US5 (P2)**: Depends on US1 (the FilterWidget created in US1 is extended with 3-section layout)
- **US2 (P2)**: Depends on US5 (needs the "Date Range" row layout created by T012)
- **US3 (P2)**: Depends on US5 (needs the "Branches" row layout created by T012)
- **US6 (P3)**: Depends on Foundational only (AuthorBadge component from T007)
- **US4 (P3)**: Depends on Foundational only — but practically benefits from US1+US2+US3 being done

### Within Each User Story

- Types/messages before backend before frontend
- Generic components before feature-specific components
- Store actions before UI components that use them
- Core implementation before integration/polish

### Parallel Opportunities

- T001 and T002 can run in parallel (different files: types.ts vs messages.ts)
- T005 and T007 can run in parallel (different new files: MultiSelectDropdown vs AuthorBadge)
- T016 and T017 must run sequentially (T017 depends on T016's utility function)
- T019 and T020 must run sequentially (same file: CommitTableRow.tsx)
- US2 and US3 can run in parallel after US5 (both need the 3-section layout from T012)
- US6 can run in parallel with US1+ (only depends on Foundational T007)

---

## Parallel Example: Foundational Phase

```bash
# After T001+T002 complete (types/messages), launch in parallel:
Task T005: "Create MultiSelectDropdown in webview-ui/src/components/MultiSelectDropdown.tsx"
Task T007: "Create AuthorBadge in webview-ui/src/components/AuthorBadge.tsx"

# After T005 completes:
Task T006: "Refactor MultiBranchDropdown to use MultiSelectDropdown"

# After T003+T004 complete (backend), and T005+T006+T007 complete (components):
Task T008: "Extend graphStore with author list and centralized reset"
Task T009: "Extend rpcClient with getAuthors and extended filter handling"
```

## Parallel Example: After US5 (Phase 4)

```bash
# These stories can run in parallel after US5 completes (T012 creates 3-section layout):
Story US2: "Date range filtering (T014, T015)"
Story US3: "Branch filter badges (T016, T017)"

# US6 can start any time after Foundational (depends only on T007):
Story US6: "Author badge in details panel (T018)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T009)
3. Complete Phase 3: User Story 1 - Author Filtering (T010-T011)
4. **STOP and VALIDATE**: Test author filtering independently
5. Deploy/demo if ready — users can already filter by author

### Incremental Delivery

1. Setup + Foundational -> Foundation ready
2. US1 (Author Filtering) -> Test independently -> MVP!
3. US5 (Panel UI + Reset) -> Test Reset All, layout, icon colors
4. US2 (Date Range) + US3 (Branch Badges) -> Can run in parallel after US5
5. US6 (Author Badge) -> Can run any time after Foundational (independent)
6. US4 (Context Menus) -> Test right-click filtering
7. Polish -> Empty state, build validation, smoke test

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- No new packages required — uses existing Radix UI and Chromium native inputs
- All filters are server-side (git flags) — no client-side filtering
- Centralized `resetAllFilters()` prevents the partial reset bugs from previous versions
- Filter state is transient — resets on session open/repo change (FR-024)
- Branch badges in filter panel reuse `RefLabel` with graph-line colors via `getBranchLaneColorStyle()` utility (FR-008)
- Filter panel has NO fixed height — only branch and author badge areas independently cap at ~3-4 lines with overflow scrolling (FR-020)

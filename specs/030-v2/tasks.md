# Tasks: v2.0 UI Reorganization — Control Bar & Toggle Panel

**Input**: Design documents from `/specs/030-v2/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths included in every task description

---

## Phase 1: Setup & Foundation

**Purpose**: Add shared type and update Zustand store — blocks US2, US3. US1 can start in parallel.

- [ ] T001 [P] Add `ActiveToggleWidget = 'search' | 'filter' | 'compare' | null` export to `shared/types.ts`
- [ ] T002 Update `webview-ui/src/stores/graphStore.ts` — add `activeToggleWidget: ActiveToggleWidget` state (initial: `null`), add `setActiveToggleWidget` action (toggles off if same widget clicked; syncs `searchState.isOpen`), update `openSearch` to set `activeToggleWidget = 'search'`, update `closeSearch` to set `activeToggleWidget = null` when currently `'search'`

**Checkpoint**: Type and store ready — US2, US3 can now proceed

---

## Phase 2: User Story 1 — Icon Buttons with Tooltips (Priority: P1) 🎯 MVP

**Goal**: All 7 control bar buttons are icon-only with hover tooltips; Refresh and Fetch still work.

**Independent Test**: Open extension panel — verify no text labels on buttons, hover each for tooltip, click Refresh and Fetch to confirm operations execute.

- [ ] T003 [P] [US1] Add `FilterIcon`, `CompareIcon`, and `SettingsIcon` SVG components to `webview-ui/src/components/icons/index.tsx` — follow existing pattern (12×12 viewBox, `currentColor`, `className?: string` prop)
- [ ] T004 [US1] In `webview-ui/src/components/ControlBar.tsx` — convert Refresh button from text label to icon-only (use an appropriate existing icon or inline SVG); add `title="Refresh"` tooltip; preserve existing click handler and disabled state
- [ ] T005 [US1] In `webview-ui/src/components/ControlBar.tsx` — convert Fetch button to icon-only using a cloud/download icon; add `title="Fetch"` tooltip; preserve existing `fetching` state and disabled logic
- [ ] T006 [US1] In `webview-ui/src/components/ControlBar.tsx` — convert Search button to icon-only (magnifier); add `title="Search"` tooltip; preserve existing `openSearch`/`closeSearch` toggle behavior (wiring to TogglePanel comes in US2)
- [ ] T007 [US1] In `webview-ui/src/components/ControlBar.tsx` — replace Manage Remotes `<CloudIcon />` button with `title="Manage Remotes"` tooltip (already icon-only; just add tooltip); replace Settings `⚙` character with `<SettingsIcon />`; add `title="Settings"` tooltip to Settings button
- [ ] T008 [US1] In `webview-ui/src/components/ControlBar.tsx` — add Filter icon button (`<FilterIcon />`, `title="Filter"`, no-op `onClick` placeholder) and Compare icon button (`<CompareIcon />`, `title="Compare"`, no-op `onClick` placeholder) in the correct control bar order: Filter after MultiBranchDropdown, Compare after Fetch (per spec)

**Checkpoint**: All 7 buttons (Refresh, Fetch, Search, Filter, Compare, Manage Remotes, Settings) are icon-only with tooltips. Refresh, Fetch, Search, Remotes, Settings all functional. Filter and Compare buttons visible but not yet wired to TogglePanel. ✅ US1 independently testable.

---

## Phase 3: User Story 2 — Toggle Panel with Single Active Widget (Priority: P1)

**Goal**: TogglePanel appears/disappears below control bar, shows one widget at a time; commit list reflows below.

**Independent Test**: Click Search → panel opens with SearchWidget; type query → rows highlight; click Search again → panel closes, highlights clear. Click Filter → panel opens; click Compare while Filter open → switches widget.

**Prerequisites**: Phase 1 (store changes), Phase 2 (Filter/Compare buttons exist in ControlBar)

**Note**: T009 and T010 carry `[US4]` labels (Priority P3) but are placed here because `FilterWidget` and `CompareWidget` are compile-time prerequisites for `TogglePanel` (T011). Their full placeholder content is the entire US4 implementation — no further US4 work is needed later.

- [ ] T009 [P] [US4] Create `webview-ui/src/components/FilterWidget.tsx` — renders a styled placeholder container with "Filter" label text identifying the panel type
- [ ] T010 [P] [US4] Create `webview-ui/src/components/CompareWidget.tsx` — renders a styled placeholder container with "Compare" label text identifying the panel type
- [ ] T011 [US2] Create `webview-ui/src/components/TogglePanel.tsx` — reads `activeToggleWidget` from Zustand store; renders `<SearchWidget />` when `'search'`, `<FilterWidget />` when `'filter'`, `<CompareWidget />` when `'compare'`, returns `null` when `null`; no animation, instant mount/unmount
- [ ] T012 [US2] Update `webview-ui/src/components/GraphContainer.tsx` — remove `<SearchWidget />` and its wrapping `<div className="px-4 pt-3">` container; add `<TogglePanel />` in the same position (between SubmoduleBreadcrumb and SubmoduleSection)
- [ ] T013 [US2] Update `webview-ui/src/components/ControlBar.tsx` — wire Filter button `onClick` to call `setActiveToggleWidget('filter')` (toggles off if already active); wire Search button `onClick` to call `setActiveToggleWidget('search')`; wire Compare button `onClick` to call `setActiveToggleWidget('compare')`
- [ ] T014 [US2] Update `webview-ui/src/App.tsx` — change `Cmd/Ctrl+F` keyboard handler to call `setActiveToggleWidget('search')` via store; change `Escape` handler to call `setActiveToggleWidget(null)` when `activeToggleWidget !== null` (closes any open panel, not just search)

**Checkpoint**: TogglePanel shows one widget at a time; commit list reflows correctly; search highlights work inside panel; Escape closes any open panel. ✅ US2 + US4 independently testable.

---

## Phase 4: User Story 3 — Button Toggle State Colors (Priority: P2)

**Goal**: Filter/Search/Compare buttons show gray (inactive), orange (active), and purple (Filter only, when branch filter applied).

**Independent Test**: Click Filter to open → button turns orange/yellow. Close Filter with no branch filter applied → returns to gray. Apply a branch filter via MultiBranchDropdown and close panel → Filter button turns purple/red.

**Prerequisites**: Phase 3 (buttons wired to `setActiveToggleWidget`; `activeToggleWidget` state available)

- [ ] T015 [US3] Define `TOGGLE_BUTTON_COLORS` constant in `webview-ui/src/components/ControlBar.tsx` — three keys: `inactive` (muted gray via VS Code CSS vars), `active` (orange/yellow via `--vscode-statusBarItem-warningBackground`), `filtered` (purple/red via `--vscode-inputValidation-warningBorder` or similar); validate colors render in dark + light themes
- [ ] T016 [US3] In `webview-ui/src/components/ControlBar.tsx` — apply `TOGGLE_BUTTON_COLORS` to Filter button: `active` when `activeToggleWidget === 'filter'`, `filtered` when `activeToggleWidget !== 'filter'` AND `graphFilters.branchNames.length > 0` (existing branch filter applied), `inactive` otherwise
- [ ] T017 [US3] In `webview-ui/src/components/ControlBar.tsx` — apply `TOGGLE_BUTTON_COLORS` to Search button (`active`/`inactive` only) and Compare button (`active`/`inactive` only)

**Checkpoint**: All three toggle buttons show correct colors in all three states across VS Code dark and light themes. ✅ US3 independently testable.

---

## Phase 5: Polish & Validation

**Purpose**: Verify correctness, type safety, and zero regressions across all changed files.

- [ ] T018 Run `pnpm typecheck` from repo root — fix all TypeScript errors in `shared/types.ts`, `graphStore.ts`, `ControlBar.tsx`, `GraphContainer.tsx`, `TogglePanel.tsx`, `FilterWidget.tsx`, `CompareWidget.tsx`, `App.tsx`, `icons/index.tsx`
- [ ] T019 Run `pnpm lint` from repo root — fix all ESLint errors in touched files
- [ ] T020 Run `pnpm build` from repo root — verify clean build of both extension and webview with zero errors
- [ ] T021 Manual smoke test via VS Code "Run Extension" launch config in both **dark and light VS Code themes** — verify: (1) all 7 buttons render icon-only with tooltips, (2) Search/Filter/Compare open correct panel, (3) only one panel visible at a time, (4) search row highlights work and clear on close, (5) Refresh and Fetch execute correctly, (6) Escape closes any open panel (including Filter and Compare), (7) Filter button shows filter-active color when branch filter applied and panel is closed — in both dark and light themes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundation)**: No dependencies — start immediately
- **Phase 2 (US1)**: T003 can start in parallel with Phase 1; T004–T008 depend on T003
- **Phase 3 (US2+US4)**: Depends on Phase 1 (store) AND Phase 2 (T008 — Filter/Compare buttons exist); T009/T010 can run in parallel; T011 depends on T009+T010
- **Phase 4 (US3)**: Depends on Phase 3 (wiring complete, T013)
- **Phase 5 (Polish)**: Depends on all implementation phases

### User Story Dependencies

- **US1 (P1)**: Depends only on T003 (icons). Independent of store changes.
- **US2 (P1)**: Depends on Phase 1 (store) + T008 (buttons exist). Core toggle behavior.
- **US3 (P2)**: Depends on Phase 3 (wiring in place). Visual layer on top of US2.
- **US4 (P3)**: Files created in Phase 3 (T009/T010) as prerequisites for TogglePanel. Full placeholder content is the entire US4 implementation.

### Parallel Opportunities Within Phases

- **Phase 1**: T001 and T003 (icons) can start simultaneously (different files)
- **Phase 3**: T009 and T010 can run in parallel (different files)
- **Phase 4**: T016 and T017 can run in parallel (same file — implement sequentially to avoid conflicts)

---

## Parallel Example: Phase 3 (US2)

```text
# Start simultaneously (different files, no dependencies):
Task T009: Create FilterWidget.tsx
Task T010: Create CompareWidget.tsx

# After T009 + T010 complete:
Task T011: Implement TogglePanel.tsx (imports both)
Task T012: Update GraphContainer.tsx (imports TogglePanel)

# After T011 + T012:
Task T013: Wire buttons in ControlBar.tsx
Task T014: Update keyboard handlers in App.tsx
```

---

## Implementation Strategy

### MVP First (US1 + US2 only)

1. Complete Phase 1: Add type + store changes
2. Complete Phase 2: Icon buttons with tooltips (US1 ✅)
3. Complete Phase 3: TogglePanel + widget wiring (US2 + US4 ✅)
4. **STOP and VALIDATE**: All buttons icon-only, TogglePanel works, search highlights work, Escape closes panels
5. Proceed to Phase 4 (colors) only after MVP validation

### Incremental Delivery

1. Phase 1 → Foundation ready
2. Phase 2 → **US1 complete**: all 7 icon buttons with tooltips, no regressions
3. Phase 3 → **US2 + US4 complete**: toggle panel with search/filter/compare
4. Phase 4 → **US3 complete**: button state colors
5. Phase 5 → Full validation across dark and light themes

---

## Notes

- [P] = different files, no blocking dependencies on incomplete tasks
- [US*] label maps task to its user story for traceability
- US4 tasks (T009, T010) are embedded in Phase 3 as compile-time prerequisites for TogglePanel; their placeholder content IS the full US4 implementation
- SearchWidget internals are NOT modified — it is reused as-is
- No new npm packages — only existing dependencies and custom SVG icon pattern used
- `pnpm typecheck` must pass before `pnpm build`
- Filter button's `filtered` state is driven by `graphFilters.branchNames.length > 0` (existing branch filter); search highlights carry no persistent filter state and do NOT trigger the Filter button's filtered color

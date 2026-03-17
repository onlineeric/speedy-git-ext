# Tasks: Filterable Branch Dropdown

**Input**: Design documents from `/specs/014-filterable-branch-dropdown/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Create component skeleton and integrate into ControlBar

- [X] T001 Create FilterableBranchDropdown.tsx with component skeleton, props interface (`branches: Branch[]`, `selectedBranch: string | undefined`, `onBranchSelect: (branch: string | undefined) => void`), and local type definitions for flat list items (`AllBranchesItem`, `GroupHeaderItem`, `BranchItem`) in webview-ui/src/components/FilterableBranchDropdown.tsx
- [X] T002 Replace native `<select>` element in ControlBar with `<FilterableBranchDropdown>` component, passing `branches`, `filters.branch`, and a callback that calls `setFilters({ branch })` + `rpcClient.getCommits({ ...filters, branch })` in webview-ui/src/components/ControlBar.tsx

**Checkpoint**: Component renders in ControlBar position (may be empty/placeholder). Build passes (`pnpm typecheck && pnpm build`).

---

## Phase 2: User Story 4 - Opening and Closing the Dropdown (Priority: P1) 🎯 MVP

**Goal**: User can open the dropdown to see the branch list and close it without making a selection.

**Independent Test**: Click the dropdown trigger → verify it opens with text input and branch list. Press Escape or click outside → verify it closes. Trigger displays current selection.

### Implementation for User Story 4

- [X] T003 [US4] Implement Radix Popover structure with controlled `open` state, trigger button styled with VS Code theme variables showing currently selected branch name (or "All Branches"), and Popover.Content container with `side="bottom"`, `align="start"`, `sideOffset={4}` in webview-ui/src/components/FilterableBranchDropdown.tsx
- [X] T004 [US4] Implement open/close behavior: Escape closes and clears filter text (FR-010), click-outside closes via Radix Popover's built-in `onInteractOutside` (FR-011), reset `filterText`/`highlightedIndex`/`listNavigationMode` to defaults on close. Note: auto-focus (FR-005) is implemented in T005 where the input ref is created in webview-ui/src/components/FilterableBranchDropdown.tsx

**Checkpoint**: Dropdown opens with trigger click, shows empty content area. Escape and click-outside close it. Trigger shows selected branch name.

---

## Phase 3: User Story 1 - Filter Branches by Typing (Priority: P1) 🎯 MVP

**Goal**: User can type in the text input to filter the branch list in real-time with case-insensitive substring matching.

**Independent Test**: Open dropdown, type partial branch name → only matching branches shown. Clear text → all branches shown. No matches → empty list.

### Implementation for User Story 1

- [X] T005 [US1] Implement text input field with `filterText` state, auto-focus via `useRef` + `useEffect` on open, and VS Code input styling (`bg-[var(--vscode-input-background)]`, etc.) in webview-ui/src/components/FilterableBranchDropdown.tsx
- [X] T006 [US1] Implement `buildFilteredList` function that produces the flat item array: always-present "All Branches" item, then "Local" group header + filtered local branches, then "Remote" group header + filtered remote branches. Use case-insensitive substring matching on display name. Hide group headers when no branches match in that group. Derive with `useMemo` keyed on `branches` and `filterText` in webview-ui/src/components/FilterableBranchDropdown.tsx
- [X] T007 [US1] Render the filtered list as a scrollable container (`max-h-[300px] overflow-y-auto`) with: "All Branches" as a selectable item, group headers as non-selectable styled labels, branch items showing display name with current branch marked `*`, all using VS Code menu theme variables (`--vscode-menu-background`, `--vscode-menu-selectionBackground`, etc.) and text truncation (`truncate`) for long names in webview-ui/src/components/FilterableBranchDropdown.tsx

**Checkpoint**: Dropdown opens, shows full branch list grouped by Local/Remote. Typing filters the list in real-time. "All Branches" always visible. Build passes.

---

## Phase 4: User Story 3 - Mouse-Based Branch Selection (Priority: P2)

**Goal**: User can click a branch in the list to select it as the active filter.

**Independent Test**: Open dropdown, click a branch → dropdown closes, branch is selected, commit list updates. Click outside → closes without selection change.

### Implementation for User Story 3

- [X] T008 [US3] Implement click handler on branch items and "All Branches" item: call `onBranchSelect` with the branch value (or `undefined` for "All Branches"), close the popover, and reset local state in webview-ui/src/components/FilterableBranchDropdown.tsx

**Checkpoint**: Full mouse-driven workflow works: open → optionally filter → click branch → selected. Click outside dismisses.

---

## Phase 5: User Story 2 - Keyboard-Only Branch Selection (Priority: P2)

**Goal**: User can select a branch entirely via keyboard: type to filter → Tab into list → arrow keys → Enter to select.

**Independent Test**: Open dropdown, type filter, press Tab (first item highlighted), arrow down/up (highlight moves), Enter (branch selected, dropdown closes). Type while in list mode (focus returns to input).

### Implementation for User Story 2

- [X] T009 [US2] Implement Tab key handler on the text input: when Tab is pressed, prevent default, set `listNavigationMode=true`, set `highlightedIndex` to the index of the first selectable item (skip group headers), do nothing if filtered list has no selectable items (FR-006, edge case) in webview-ui/src/components/FilterableBranchDropdown.tsx
- [X] T010 [US2] Implement Up/Down arrow key navigation: when `listNavigationMode=true`, ArrowDown moves `highlightedIndex` to next selectable item (skip group headers), ArrowUp moves to previous selectable item, stop at list boundaries (no wrapping per FR-007, spec assumption). Call `scrollIntoView({ block: 'nearest' })` on the highlighted item's DOM element via ref callback in webview-ui/src/components/FilterableBranchDropdown.tsx
- [X] T011 [US2] Implement Enter key selection: when `listNavigationMode=true` and `highlightedIndex >= 0`, select the highlighted item by calling `onBranchSelect` with its value, close popover, reset state (FR-008) in webview-ui/src/components/FilterableBranchDropdown.tsx
- [X] T012 [US2] Implement type-to-redirect: when `listNavigationMode=true` and a printable character key is pressed, set `listNavigationMode=false`, refocus the text input, and let the character append to `filterText` naturally. Reset `highlightedIndex` to -1 (FR-008a) in webview-ui/src/components/FilterableBranchDropdown.tsx
- [X] T013 [US2] Add visual highlight styling to the currently highlighted item using `highlightedIndex`: apply `bg-[var(--vscode-list-activeSelectionBackground)]` and `text-[var(--vscode-list-activeSelectionForeground)]` to the highlighted item in webview-ui/src/components/FilterableBranchDropdown.tsx

**Checkpoint**: Full keyboard workflow works: type → Tab → arrows → Enter. Type-to-redirect returns to input. All acceptance scenarios from US2 pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility, edge cases, and validation

- [X] T014 Add ARIA attributes: `role="combobox"` and `aria-expanded` on the text input, `role="listbox"` on the list container, `role="option"` on selectable items, `aria-activedescendant` pointing to highlighted item's `id`, `aria-selected` on the currently selected branch in webview-ui/src/components/FilterableBranchDropdown.tsx
- [X] T015 Handle edge cases: no branches (show only "All Branches"), Tab with empty filtered list (no-op). Verify current branch `*` indicator (FR-014, implemented in T007) renders correctly across filter states in webview-ui/src/components/FilterableBranchDropdown.tsx
- [X] T015a Handle reactive branch updates while dropdown is open: when `branches` prop changes (e.g., after refresh/fetch), re-run filter with current `filterText`, clamp `highlightedIndex` if filtered list shrinks, preserve dropdown open state and filter text in webview-ui/src/components/FilterableBranchDropdown.tsx
- [X] T016 Run validation gates: `pnpm typecheck` (zero errors), `pnpm lint` (zero errors), `pnpm build` (clean build)
- [ ] T017 Manual smoke test per quickstart.md checklist: verify all 12 test scenarios in both light and dark VS Code themes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US4 - Open/Close (Phase 2)**: Depends on Setup (T001, T002)
- **US1 - Filter by Typing (Phase 3)**: Depends on US4 (needs Popover shell to render into)
- **US3 - Mouse Selection (Phase 4)**: Depends on US1 (needs rendered list items to click)
- **US2 - Keyboard Navigation (Phase 5)**: Depends on US1 (needs rendered list items to navigate)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US4 (P1)**: Foundational — must complete first
- **US1 (P1)**: Depends on US4 — must complete second
- **US3 (P2)**: Depends on US1 — can start after US1
- **US2 (P2)**: Depends on US1 — can start after US1
- **US3 and US2 are independent of each other** and can be implemented in parallel

### Within Each User Story

- Tasks within each story are sequential (all modify the same file)
- Exception: T009-T013 in US2 build incrementally on the same keyboard handler but each adds distinct behavior

### Parallel Opportunities

- **T008 (US3)** and **T009-T013 (US2)** can run in parallel after US1 is complete (US3 is click handling, US2 is keyboard handling — different event handlers, same file but non-overlapping code sections)
- **T014** and **T015** in Polish phase can run in parallel (ARIA attributes vs. edge case handling)

---

## Parallel Example: After US1 Completion

```
# These can proceed in parallel after Phase 3 (US1) is complete:

Stream A (Mouse): T008 [US3] Click-to-select handler
Stream B (Keyboard): T009 → T010 → T011 → T012 → T013 [US2] Keyboard navigation
```

---

## Implementation Strategy

### MVP First (US4 + US1)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: US4 - Open/Close (T003-T004)
3. Complete Phase 3: US1 - Filter by Typing (T005-T007)
4. **STOP and VALIDATE**: Dropdown opens, filters branches, shows grouped results. Build passes.
5. This is a view-only MVP — users can filter and visually locate branches but cannot yet select them (click handlers are added in Phase 4, keyboard selection in Phase 5). Close via Escape or click outside.

### Incremental Delivery

1. Setup + US4 + US1 → Filterable dropdown shell (MVP)
2. Add US3 (Mouse Selection) → Full mouse workflow
3. Add US2 (Keyboard Navigation) → Full keyboard workflow
4. Polish → Accessibility, edge cases, validation

---

## Notes

- All implementation tasks modify the same file (`FilterableBranchDropdown.tsx`) except T002 which modifies `ControlBar.tsx`
- No new packages required — `@radix-ui/react-popover` is already installed
- No backend changes — purely frontend work
- No shared type changes — existing `Branch` and `GraphFilters` types are sufficient
- Edge case "selected branch deleted remotely" (spec.md) is handled implicitly: trigger displays `filters.branch` from store regardless of whether the branch still exists in the `branches` array. On next refresh, the branch list updates naturally.
- FR-005 (auto-focus) is owned by T005 (where the input ref is created). T004 handles state reset on close only.
- FR-014 (current branch `*` indicator) is owned by T007 (where list rendering lives). T015 verifies correctness across filter states.

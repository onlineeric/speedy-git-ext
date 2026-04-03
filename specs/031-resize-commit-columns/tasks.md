# Tasks: Resizable Commit Columns

**Input**: Design documents from `/specs/031-resize-commit-columns/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not requested. No automated test tasks are included; validation is via `pnpm typecheck`, `pnpm lint`, `pnpm build`, and manual smoke testing.

**Organization**: Tasks are grouped by user story so each increment can be implemented and validated independently once the shared foundation is in place.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Exact file paths are included in every task

---

## Phase 1: Setup (Shared Table Layout Scaffolding)

**Purpose**: Establish the reusable layout helper that all table-mode rendering will depend on.

- [X] T001 Create `webview-ui/src/utils/commitTableLayout.ts` with default column order, default widths, minimum widths, visible-column helpers, and responsive width-resolution logic for the message column

---

## Phase 2: Foundational (Shared State, Persistence, and Rendering Shell)

**Purpose**: Define the persisted data model and wire the classic/table rendering shell before story-specific interactions are added.

**⚠️ CRITICAL**: User-story work depends on these shared types, store actions, and rendering entry points.

- [X] T002 Add `CommitListMode`, `CommitTableColumnId`, `CommitTableColumnPreference`, `CommitTableLayout`, and updated `DEFAULT_PERSISTED_UI_STATE` values to `shared/types.ts`
- [X] T003 Extend persisted UI-state validation and save logic for `commitListMode` and `commitTableLayout` in `src/WebviewProvider.ts`
- [X] T004 Add commit-list mode and commit-table layout state plus mutation/hydration actions to `webview-ui/src/stores/graphStore.ts`
- [X] T005 [P] Add the commit-list settings popover trigger to `webview-ui/src/components/ControlBar.tsx` and implement the base popover shell in `webview-ui/src/components/CommitListSettingsPopover.tsx`
- [X] T006 Add classic/table rendering branching to `webview-ui/src/components/GraphContainer.tsx` and create the initial component interfaces in `webview-ui/src/components/CommitTableHeader.tsx` and `webview-ui/src/components/CommitTableRow.tsx` for the graph, hash, message, author, and date columns (refs render inline in the message column)

**Checkpoint**: The persisted mode/layout foundation and the basic table rendering shell exist, so mode switching and full table behavior can be completed in the user-story phases.

---

## Phase 3: User Story 1 - Adjust Column Widths to Fit the Task (Priority: P1) 🎯 MVP

**Goal**: Let the user switch to table mode and resize columns while keeping rows, headers, and graph content aligned and usable.

**Independent Test**: Open table mode, resize the graph and message columns, and confirm the list stays aligned with no overlapping content.

- [X] T007 [US1] Implement the classic/table mode selector and immediate mode persistence in `webview-ui/src/components/CommitListSettingsPopover.tsx`
- [X] T008 [P] [US1] Implement header cells for graph, hash, message, author, and date plus pointer-driven resize handles in `webview-ui/src/components/CommitTableHeader.tsx`
- [X] T009 [P] [US1] Implement table row rendering for graph, hash, message (with inline ref badges), author, and date in `webview-ui/src/components/CommitTableRow.tsx`, reusing graph rendering, selection styling, ref badges, author display, date display, and context-menu behavior from the current commit row
- [X] T010 [US1] Update `webview-ui/src/components/GraphContainer.tsx` and `webview-ui/src/utils/commitTableLayout.ts` so the table header and virtualized rows share one resolved grid template, the message column shrinks first as the viewport narrows, other visible optional columns may then compress to their minimum widths, and scroll position remains stable during mode switches and column layout updates
- [X] T011 [US1] Persist column-width changes on resize end from `webview-ui/src/components/CommitTableHeader.tsx` via `rpcClient.persistUIState(...)`, including restoring the saved message-column preferred width when space returns
- [X] T012 [US1] Enforce narrow-width behavior in `webview-ui/src/components/GraphContainer.tsx` and `webview-ui/src/utils/commitTableLayout.ts` so the message column shrinks first, other visible optional columns may compress to their minimum widths, and the table then stops shrinking at its minimum viable width and extends off the right edge without introducing a horizontal scrollbar

- [X] T028 [US1] Create `computeAutoFitWidth(columnId, commits, topology, userSettings)` utility in `webview-ui/src/utils/commitTableLayout.ts` that uses `canvas.measureText()` to compute the optimal column width across all loaded commits: graph uses max lane count × LANE_WIDTH, hash measures longest `abbreviatedHash`, message measures longest `commit.subject` plus ref badge padding, author measures longest `commit.author` plus avatar width, date measures longest formatted date string
- [X] T029 [US1] Add `onDoubleClick` handler to resize handle buttons in `webview-ui/src/components/CommitTableHeader.tsx` that calls `computeAutoFitWidth`, updates the column preferred width in the store, and persists immediately via `rpcClient.persistUIState(...)`

**Checkpoint**: Table mode is usable, resizable, aligned, and satisfies the MVP behavior.

---

## Phase 4: User Story 2 - Reorder and Show Only Relevant Columns (Priority: P1)

**Goal**: Let the user reorder optional columns and show/hide them while keeping the graph pinned first.

**Independent Test**: In table mode, reorder optional columns, hide one, restore it, and verify the graph column stays visible and first.

- [X] T013 [US2] Implement optional-column visibility toggles in `webview-ui/src/components/CommitListSettingsPopover.tsx` with the graph column locked visible and first
- [X] T014 [US2] Implement sortable optional-column reordering with `@dnd-kit/sortable` in `webview-ui/src/components/CommitListSettingsPopover.tsx`
- [X] T015 [US2] Update `webview-ui/src/utils/commitTableLayout.ts` and `webview-ui/src/components/GraphContainer.tsx` to derive visible column order from the persisted layout while restoring previously hidden columns to their saved width and order position
- [X] T016 [US2] Persist column visibility and reorder changes immediately from `webview-ui/src/components/CommitListSettingsPopover.tsx` via `rpcClient.persistUIState(...)`

**Checkpoint**: Optional columns can be reordered and hidden/restored without breaking table validity.

---

## Phase 5: User Story 3 - Keep Preferred Layout Across Sessions (Priority: P2)

**Goal**: Restore the last selected mode and table layout on reload and across repository switches.

**Independent Test**: Change mode, resize/reorder/hide columns, reload the webview, and verify the same layout returns on first render.

- [X] T017 [US3] Extend `webview-ui/src/stores/graphStore.ts` hydration logic so commit-list mode and commit-table layout restore atomically with the existing persisted UI state defaults
- [X] T018 [US3] Harden `src/WebviewProvider.ts` layout validation so partial or invalid saved column data falls back per field to defaults without discarding valid saved values
- [X] T019 [US3] Ensure `src/WebviewProvider.ts` continues sending `persistedUIState` before commit data so restored table mode and layout are available on first render after reload or repo switch

**Checkpoint**: The user's preferred mode and column layout restore consistently across sessions and repositories.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final regression checks, styling cleanup, and validation across all stories.

- [X] T020 [P] Refine truncation, alignment, highlight styling, and scroll continuity in `webview-ui/src/components/CommitTableHeader.tsx`, `webview-ui/src/components/CommitTableRow.tsx`, and `webview-ui/src/components/GraphContainer.tsx` so search highlights, selection, long content, and viewport position remain stable in both modes
- [X] T021 [P] Verify edge-case handling for dense graph histories, hidden-column restore, and minimum-width overflow behavior in `webview-ui/src/utils/commitTableLayout.ts` and `src/WebviewProvider.ts`
- [X] T022 Run `pnpm typecheck` for the repository TypeScript projects defined by `package.json`
- [X] T023 Run `pnpm lint` for the repository sources configured from `package.json`
- [X] T024 Run `pnpm build` for the extension and webview build targets in `package.json`
- [ ] T025 Manual smoke test via the VS Code launch configuration in `.vscode/launch.json` for mode switching, resize, reorder, visibility, persistence, and no-horizontal-scroll behavior
- [X] T026 Bug fixes from smoke test round 1: graph column min width reduced from 64px, removed Refs column so refs badges render inline in Message column matching classic mode, and table body border color aligned with header border color
- [X] T027 Bug fixes from smoke test round 2: (1) graph column min width set to 52px (enough for header label, graph clips when narrowed below topology width), (2) ref badges wrapped in shrink-0 container with whitespace-nowrap so they maintain fixed size regardless of message column width

---

## Phase 7: Post-Implementation Refinements

**Purpose**: Default to Table view, disable column config in Classic mode, and move column layout to per-repo storage.

- [X] T030 Change `DEFAULT_PERSISTED_UI_STATE.commitListMode` from `'classic'` to `'table'` in `shared/types.ts` so first-time and upgraded users default to Table view. Update the fallback in `src/WebviewProvider.ts` validation to use `'table'` as the default for invalid `commitListMode` values.
- [X] T031 Disable column configuration controls (visibility toggles, drag-to-reorder) in `webview-ui/src/components/CommitListSettingsPopover.tsx` when Classic mode is selected. Controls should be visually dimmed and non-interactive, re-enabling when Table mode is selected.
- [X] T032 Move `commitTableLayout` from the global `PersistedUIState` to per-repository storage in `src/WebviewProvider.ts`. Use a `globalState` key pattern `speedyGit.repoTableLayout.<sha256-hash-of-repo-path>` to store each repo's column layout independently. Load the active repo's layout when building the `persistedUIState` payload, and route `commitTableLayout` updates to the per-repo key on save. Remove `commitTableLayout` from the global `PersistedUIState` interface and default state.
- [X] T033 Update `webview-ui/src/stores/graphStore.ts` hydration logic so that when the repo changes (`switchRepo`), the new repo's column layout is applied from the incoming `persistedUIState` message.
- [X] T034 Update `src/__tests__/WebviewProvider.test.ts` to cover per-repo layout storage: verify layout is loaded/saved per repo path, verify repo switch loads the correct layout, verify missing per-repo layout falls back to defaults.
- [X] T035 Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` to verify all changes compile and pass checks.

---

## Phase 8: User Story 4 - Open Commit List Settings Without Disrupting Other Toolbar Panels (Priority: P2)

**Goal**: Make the commit-list settings popover operate independently from the exclusive filter/search/compare toolbar toggles, move it into the right-aligned utility group, and improve the toolbar separator rendering.

**Independent Test**: Open a filter/search/compare panel, open the commit-list settings popover, and confirm both controls preserve their own state while the settings trigger appears between the loaded-count indicator and Manage Remotes with a full-height divider separating toolbar groups.

- [X] T036 [US4] Refactor `webview-ui/src/components/CommitListSettingsPopover.tsx` so the popover manages its own open state locally, preserves the existing active-color treatment while open, and no longer reads from or writes to `activeToggleWidget`
- [X] T037 [US4] Update `shared/types.ts` and `webview-ui/src/stores/graphStore.ts` to remove any `commitListSettings` dependency from the exclusive toolbar toggle state while preserving existing filter/search/compare panel coordination
- [X] T038 [US4] Update `webview-ui/src/components/ControlBar.tsx` to move the commit-list settings trigger into the right-aligned utility group between the loaded-count indicator and Manage Remotes without changing the other utility button behaviors
- [X] T039 [P] [US4] Add a dedicated full-height toolbar separator rendering in `webview-ui/src/components/icons/index.tsx` and apply it from `webview-ui/src/components/ControlBar.tsx` so the divider aligns visually with adjacent icon buttons
- [ ] T040 [US4] Manually smoke test the independent settings-popover behavior, right-aligned placement, active-state coloring, and full-height toolbar divider via the VS Code launch configuration in `.vscode/launch.json`
- [X] T041 [US4] Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` after the toolbar/settings changes

**Checkpoint**: The commit-list settings control behaves as an independent utility popover, sits in the right utility group, and the toolbar divider matches the surrounding icon-button height.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on T001 and blocks all user stories.
- **US1 (Phase 3)**: Depends on Phase 2.
- **US2 (Phase 4)**: Depends on Phase 2.
- **US3 (Phase 5)**: Depends on Phase 2 and is best validated after US1 and US2 are complete.
- **US4 (Phase 8)**: Depends on the existing settings-popover baseline from Phases 2, 3, and 4.
- **Polish / Refinement Phases (6-8)**: Run after the relevant user-story work they validate or refine.

### User Story Dependencies

- **US1 (P1)**: Independent after foundation. Delivers the first usable table-mode MVP.
- **US2 (P1)**: Independent after foundation. Builds on the same table shell but does not require US1 completion to start.
- **US3 (P2)**: Depends on the persisted mode/layout fields introduced in foundation and is fully validated once US1 and US2 interactions are saving real data.
- **US4 (P2)**: Depends on the existing settings-popover and toolbar shell, but remains independent from persistence and can be implemented without changing the completed table-layout stories.

### Parallel Opportunities

- T005 can run in parallel with T003 and T004 after T002 defines the shared types.
- T008 and T009 can run in parallel after T006 defines the table component interfaces.
- T020 and T021 can run in parallel after implementation is complete.
- T038 and T039 can run in parallel once T036 establishes the decoupled settings-popover behavior.

---

## Parallel Example: User Story 1

```bash
# After the table shell exists, these can proceed together:
Task T008: "Implement resize handles in CommitTableHeader.tsx"
Task T009: "Implement aligned table row rendering in CommitTableRow.tsx"
```

## Parallel Example: User Story 2

```bash
# Column-management UI work can split once the popover shell exists:
Task T013: "Implement visibility toggles in CommitListSettingsPopover.tsx"
Task T014: "Implement sortable reorder list in CommitListSettingsPopover.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3.
3. Validate table mode switching plus column resizing manually.
4. Stop if the goal is only the first usable table-mode MVP.

### Incremental Delivery

1. Foundation: persisted model + rendering shell
2. US1: resizeable table mode
3. US2: reorder and visibility controls
4. US3: reload/reopen persistence validation
5. US4: independent settings-popover behavior and toolbar polish
6. Polish: full validation and cleanup

---

## Notes

- `CommitRow.tsx` remains the classic-view fallback; the new table view should not regress it.
- The graph column is never hidden or reordered. Its minimum width (52px) is independent of the rendered topology; graph content clips when the column is narrowed below the topology's rendered width.
- The message column is the only primary flexible column when width becomes constrained. Ref badges render inline in the message column (matching classic view) with fixed size (shrink-0, whitespace-nowrap); only the commit message text truncates.
- Refs are not a separate column. The table uses five columns: graph, hash, message, author, date.
- The commit-list settings popover is now an independent toolbar utility control and no longer participates in `activeToggleWidget` exclusivity with filter/search/compare.
- No automated test tasks are included because the spec did not request TDD or explicit new test coverage.

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

- [ ] T001 Create `webview-ui/src/utils/commitTableLayout.ts` with default column order, default widths, minimum widths, visible-column helpers, and responsive width-resolution logic for the message column

---

## Phase 2: Foundational (Shared State, Persistence, and Rendering Shell)

**Purpose**: Define the persisted data model and wire the classic/table rendering shell before story-specific interactions are added.

**⚠️ CRITICAL**: User-story work depends on these shared types, store actions, and rendering entry points.

- [ ] T002 Add `CommitListMode`, `CommitTableColumnId`, `CommitTableColumnPreference`, `CommitTableLayout`, and updated `DEFAULT_PERSISTED_UI_STATE` values to `shared/types.ts`
- [ ] T003 Extend persisted UI-state validation and save logic for `commitListMode` and `commitTableLayout` in `src/WebviewProvider.ts`
- [ ] T004 Add commit-list mode and commit-table layout state plus mutation/hydration actions to `webview-ui/src/stores/graphStore.ts`
- [ ] T005 [P] Add the commit-list settings popover trigger to `webview-ui/src/components/ControlBar.tsx` and implement the base popover shell in `webview-ui/src/components/CommitListSettingsPopover.tsx`
- [ ] T006 Add classic/table rendering branching to `webview-ui/src/components/GraphContainer.tsx` and create the initial component interfaces in `webview-ui/src/components/CommitTableHeader.tsx` and `webview-ui/src/components/CommitTableRow.tsx` for the graph, hash, refs, message, author, and date columns

**Checkpoint**: The persisted mode/layout foundation and the basic table rendering shell exist, so mode switching and full table behavior can be completed in the user-story phases.

---

## Phase 3: User Story 1 - Adjust Column Widths to Fit the Task (Priority: P1) 🎯 MVP

**Goal**: Let the user switch to table mode and resize columns while keeping rows, headers, and graph content aligned and usable.

**Independent Test**: Open table mode, resize the graph and message columns, and confirm the list stays aligned with no overlapping content.

- [ ] T007 [US1] Implement the classic/table mode selector and immediate mode persistence in `webview-ui/src/components/CommitListSettingsPopover.tsx`
- [ ] T008 [P] [US1] Implement header cells for graph, hash, refs, message, author, and date plus pointer-driven resize handles in `webview-ui/src/components/CommitTableHeader.tsx`
- [ ] T009 [P] [US1] Implement table row rendering for graph, hash, refs, message, author, and date in `webview-ui/src/components/CommitTableRow.tsx`, reusing graph rendering, selection styling, ref badges, author display, date display, and context-menu behavior from the current commit row
- [ ] T010 [US1] Update `webview-ui/src/components/GraphContainer.tsx` and `webview-ui/src/utils/commitTableLayout.ts` so the table header and virtualized rows share one resolved grid template, the message column shrinks first as the viewport narrows, other visible optional columns may then compress to their minimum widths, and scroll position remains stable during mode switches and column layout updates
- [ ] T011 [US1] Persist column-width changes on resize end from `webview-ui/src/components/CommitTableHeader.tsx` via `rpcClient.persistUIState(...)`, including restoring the saved message-column preferred width when space returns
- [ ] T012 [US1] Enforce narrow-width behavior in `webview-ui/src/components/GraphContainer.tsx` and `webview-ui/src/utils/commitTableLayout.ts` so the message column shrinks first, other visible optional columns may compress to their minimum widths, and the table then stops shrinking at its minimum viable width and extends off the right edge without introducing a horizontal scrollbar

**Checkpoint**: Table mode is usable, resizable, aligned, and satisfies the MVP behavior.

---

## Phase 4: User Story 2 - Reorder and Show Only Relevant Columns (Priority: P1)

**Goal**: Let the user reorder optional columns and show/hide them while keeping the graph pinned first.

**Independent Test**: In table mode, reorder optional columns, hide one, restore it, and verify the graph column stays visible and first.

- [ ] T013 [US2] Implement optional-column visibility toggles in `webview-ui/src/components/CommitListSettingsPopover.tsx` with the graph column locked visible and first
- [ ] T014 [US2] Implement sortable optional-column reordering with `@dnd-kit/sortable` in `webview-ui/src/components/CommitListSettingsPopover.tsx`
- [ ] T015 [US2] Update `webview-ui/src/utils/commitTableLayout.ts` and `webview-ui/src/components/GraphContainer.tsx` to derive visible column order from the persisted layout while restoring previously hidden columns to their saved width and order position
- [ ] T016 [US2] Persist column visibility and reorder changes immediately from `webview-ui/src/components/CommitListSettingsPopover.tsx` via `rpcClient.persistUIState(...)`

**Checkpoint**: Optional columns can be reordered and hidden/restored without breaking table validity.

---

## Phase 5: User Story 3 - Keep Preferred Layout Across Sessions (Priority: P2)

**Goal**: Restore the last selected mode and table layout on reload and across repository switches.

**Independent Test**: Change mode, resize/reorder/hide columns, reload the webview, and verify the same layout returns on first render.

- [ ] T017 [US3] Extend `webview-ui/src/stores/graphStore.ts` hydration logic so commit-list mode and commit-table layout restore atomically with the existing persisted UI state defaults
- [ ] T018 [US3] Harden `src/WebviewProvider.ts` layout validation so partial or invalid saved column data falls back per field to defaults without discarding valid saved values
- [ ] T019 [US3] Ensure `src/WebviewProvider.ts` continues sending `persistedUIState` before commit data so restored table mode and layout are available on first render after reload or repo switch

**Checkpoint**: The user's preferred mode and column layout restore consistently across sessions and repositories.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final regression checks, styling cleanup, and validation across all stories.

- [ ] T020 [P] Refine truncation, alignment, highlight styling, and scroll continuity in `webview-ui/src/components/CommitTableHeader.tsx`, `webview-ui/src/components/CommitTableRow.tsx`, and `webview-ui/src/components/GraphContainer.tsx` so search highlights, selection, long content, and viewport position remain stable in both modes
- [ ] T021 [P] Verify edge-case handling for dense graph histories, hidden-column restore, and minimum-width overflow behavior in `webview-ui/src/utils/commitTableLayout.ts` and `src/WebviewProvider.ts`
- [ ] T022 Run `pnpm typecheck` for the repository TypeScript projects defined by `package.json`
- [ ] T023 Run `pnpm lint` for the repository sources configured from `package.json`
- [ ] T024 Run `pnpm build` for the extension and webview build targets in `package.json`
- [ ] T025 Manual smoke test via the VS Code launch configuration in `.vscode/launch.json` for mode switching, resize, reorder, visibility, persistence, and no-horizontal-scroll behavior

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on T001 and blocks all user stories.
- **US1 (Phase 3)**: Depends on Phase 2.
- **US2 (Phase 4)**: Depends on Phase 2.
- **US3 (Phase 5)**: Depends on Phase 2 and is best validated after US1 and US2 are complete.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Independent after foundation. Delivers the first usable table-mode MVP.
- **US2 (P1)**: Independent after foundation. Builds on the same table shell but does not require US1 completion to start.
- **US3 (P2)**: Depends on the persisted mode/layout fields introduced in foundation and is fully validated once US1 and US2 interactions are saving real data.

### Parallel Opportunities

- T005 can run in parallel with T003 and T004 after T002 defines the shared types.
- T008 and T009 can run in parallel after T006 defines the table component interfaces.
- T020 and T021 can run in parallel after implementation is complete.

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
5. Polish: full validation and cleanup

---

## Notes

- `CommitRow.tsx` remains the classic-view fallback; the new table view should not regress it.
- The graph column is never hidden or reordered.
- The message column is the only primary flexible column when width becomes constrained.
- No automated test tasks are included because the spec did not request TDD or explicit new test coverage.

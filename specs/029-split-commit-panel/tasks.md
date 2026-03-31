# Tasks: Responsive Split Layout for Bottom Commit Details Panel

**Input**: Design documents from `/specs/029-split-commit-panel/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Manual smoke testing only. The specification does not require new automated tests for this feature.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. `US1`, `US2`, `US3`)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the existing panel component for a focused responsive-layout refactor

- [x] T001 Extract the current stacked panel structure into explicit section boundaries for refactor in `webview-ui/src/components/CommitDetailsPanel.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the reusable layout primitives that every user story depends on

**⚠️ CRITICAL**: No user story work should begin until this phase is complete

- [x] T002 Add local layout constants and a derived bottom layout mode helper in `webview-ui/src/components/CommitDetailsPanel.tsx`
- [x] T003 Refactor `PanelBody` into reusable commit-details and files-changed section renderers in `webview-ui/src/components/CommitDetailsPanel.tsx`
- [x] T004 Add panel-width observation and responsive mode evaluation in `webview-ui/src/components/CommitDetailsPanel.tsx`

**Checkpoint**: The component can now decide between stacked and split bottom layouts without changing rendered behavior yet

---

## Phase 3: User Story 1 - Use Horizontal Space in Bottom Panel (Priority: P1) 🎯 MVP

**Goal**: Show commit details on the left and files changed on the right when the bottom panel is wide enough

**Independent Test**: Open the commit details panel in bottom position, widen the panel, and verify the layout switches to left/right sections while preserving current metadata, signature, file list, and tree view content

### Implementation for User Story 1

- [x] T005 [US1] Implement the bottom-panel split container that renders commit details on the left and files changed on the right in `webview-ui/src/components/CommitDetailsPanel.tsx`
- [x] T006 [US1] Add automatic flex-based width allocation and minimum usable section widths for split mode in `webview-ui/src/components/CommitDetailsPanel.tsx`
- [x] T007 [US1] Add independent overflow handling so both split sections remain usable with long metadata and long file lists in `webview-ui/src/components/CommitDetailsPanel.tsx`

**Checkpoint**: User Story 1 should be fully functional and independently testable

---

## Phase 4: User Story 2 - Fall Back Gracefully on Narrow Bottom Panels (Priority: P1)

**Goal**: Automatically return the bottom panel to the original stacked layout when the available width is no longer sufficient

**Independent Test**: Start with the bottom panel in split mode, narrow the available width, and verify the panel switches back to the original top/bottom arrangement without losing the selected commit or file-view state

### Implementation for User Story 2

- [x] T008 [US2] Implement the responsive cutoff and stacked fallback path for narrow bottom panels in `webview-ui/src/components/CommitDetailsPanel.tsx`
- [x] T009 [US2] Preserve selected commit content, file view mode, and existing file interactions while switching between split and stacked bottom layouts in `webview-ui/src/components/CommitDetailsPanel.tsx`

**Checkpoint**: User Stories 1 and 2 should both work independently in the bottom panel

---

## Phase 5: User Story 3 - Preserve Right Panel Behavior (Priority: P2)

**Goal**: Keep the right-position details panel on the original stacked layout regardless of available width changes

**Independent Test**: Move the panel to the right, resize the editor and panel, and verify the layout always stays stacked with no accidental split rendering

### Implementation for User Story 3

- [x] T010 [US3] Route right-position rendering through the unchanged stacked layout path in `webview-ui/src/components/CommitDetailsPanel.tsx`
- [ ] T011 [US3] Adjust the panel integration only if needed to preserve right-side behavior in `webview-ui/src/App.tsx`

**Checkpoint**: All three user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation across all stories

- [x] T012 Clean up duplicated layout conditionals and helper naming in `webview-ui/src/components/CommitDetailsPanel.tsx`
- [ ] T013 [P] Update verification notes and changed-file expectations in `specs/029-split-commit-panel/quickstart.md`
- [ ] T014 Validate wide and narrow bottom-panel behavior with a representative commit containing long metadata and 100+ changed files using the scenarios in `specs/029-split-commit-panel/quickstart.md`
- [ ] T015 Run `pnpm typecheck` from `/home/onlineeric/repos/speedy-git-ext/.worktrees/029-split-commit-panel`
- [ ] T016 Run `pnpm lint` from `/home/onlineeric/repos/speedy-git-ext/.worktrees/029-split-commit-panel`
- [ ] T017 Run `pnpm build` from `/home/onlineeric/repos/speedy-git-ext/.worktrees/029-split-commit-panel`
- [ ] T018 Run manual smoke validation in the VS Code Extension Development Host using `specs/029-split-commit-panel/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories
- **Phase 3 (US1)**: Depends on Phase 2
- **Phase 4 (US2)**: Depends on Phase 3 because it builds on the split-layout implementation
- **Phase 5 (US3)**: Depends on Phase 2 and can be completed after US1/US2 verification to confirm no regression in right-panel behavior
- **Phase 6 (Polish)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational and delivers the MVP
- **User Story 2 (P1)**: Depends on User Story 1 because fallback behavior is defined against the new split bottom layout
- **User Story 3 (P2)**: Depends only on Foundational, but is best validated after the bottom-panel behavior is complete

### Within Each User Story

- Establish layout structure before styling and overflow tuning
- Complete rendering behavior before regression protection tasks
- Validate the story independently before moving to the next priority

### Parallel Opportunities

- `T013` can run in parallel with final cleanup once implementation behavior is stable
- `T015`, `T016`, and `T017` can run in parallel after implementation is complete
- If `webview-ui/src/App.tsx` needs adjustment, `T011` can be handled separately from `T010` after the stacked-path decision is clear

---

## Parallel Example: User Story 3

```bash
Task: "Route right-position rendering through the unchanged stacked layout path in webview-ui/src/components/CommitDetailsPanel.tsx"
Task: "Adjust the panel integration only if needed to preserve right-side behavior in webview-ui/src/App.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate the wide bottom-panel split layout manually

### Incremental Delivery

1. Finish Setup + Foundational
2. Deliver User Story 1 as the MVP
3. Add User Story 2 to make the bottom layout fully responsive
4. Add User Story 3 to prove the right-side panel remains unchanged
5. Finish with cleanup and quickstart validation

### Parallel Team Strategy

With multiple developers:

1. One developer completes Phases 1-2
2. After the shared split-layout primitives land:
   - Developer A handles bottom split rendering in `webview-ui/src/components/CommitDetailsPanel.tsx`
   - Developer B verifies right-panel regression safety in `webview-ui/src/App.tsx`
3. Rejoin for polish and manual validation

---

## Notes

- Most implementation work is intentionally concentrated in `webview-ui/src/components/CommitDetailsPanel.tsx`
- No backend, RPC, or shared-type changes are expected for this feature
- Keep the existing panel resize persistence behavior intact while adding responsive split layout logic

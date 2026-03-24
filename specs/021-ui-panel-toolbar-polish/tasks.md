# Tasks: UI Panel & Toolbar Polish

**Input**: Design documents from `/specs/021-ui-panel-toolbar-polish/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add SVG icon components needed by US2 (CloudIcon) and US4 (CloseIcon, MoveRightIcon, MoveBottomIcon)

- [x] T001 Add CloudIcon, CloseIcon, MoveRightIcon, and MoveBottomIcon SVG components to webview-ui/src/components/icons/index.tsx following existing IconProps pattern (12x12 viewBox, currentColor, aria-hidden)

**Checkpoint**: All 4 new icons exported and available for import

---

## Phase 2: P1 User Stories (US1, US2, US3 — parallel, different files)

**Purpose**: All three P1 stories touch different files and can be implemented in parallel

### User Story 1 - Resizable Right-Side Commit Details Panel

**Goal**: Fix the right-side panel so users can drag-resize its width, with a max width cap preserving 200px minimum graph area

**Independent Test**: Move panel to right side → drag left resize handle → verify width changes smoothly and caps at max

- [x] T002 [P] [US1] Fix right-side panel resize in webview-ui/src/components/CommitDetailsPanel.tsx: add `relative` to panel container className, read parent container width in handleResizeStart to compute maxWidth (containerWidth - 200), apply Math.min(maxWidth, Math.max(MIN_SIZE, newSize))

### User Story 2 - Toolbar Button Reorganization

**Goal**: Reorder action buttons to Refresh → Fetch → Search, and move Manage Remotes to a cloud icon button between loaded commits count and settings gear

**Independent Test**: Verify toolbar button order visually, click cloud icon → Remote Management dialog opens

- [x] T003 [P] [US2] Reorganize toolbar in webview-ui/src/components/ControlBar.tsx: reorder buttons to Refresh, Fetch, Search after branch dropdown; remove "Manage Remotes..." text button; add CloudIcon button (import from icons) between ml-auto loaded commits count and settings gear button with title="Manage Remotes" and aria-label

### User Story 3 - Hide Commit Details Panel on Repo Switch

**Goal**: Automatically close panel and clear all commit selection state when switching repositories

**Independent Test**: Open commit details → switch repo from dropdown → verify panel closes and no commit is highlighted

- [x] T004 [P] [US3] Clear commit state on repo switch in webview-ui/src/stores/graphStore.ts: in setActiveRepo, add to the set() call: selectedCommit: undefined, selectedCommitIndex: -1, selectedCommits: [], lastClickedHash: undefined, commitDetails: undefined, detailsPanelOpen: false

**Checkpoint**: All P1 stories independently functional — resize works, toolbar reordered, repo switch clears panel

---

## Phase 3: User Story 4 - Larger and Improved Panel Header Buttons (Priority: P2)

**Goal**: Replace Unicode characters with SVG icons, add text label to move button, increase click target for both buttons

**Independent Test**: Verify move button shows icon + "Move to right"/"Move to bottom" label, close button shows clean X icon, both buttons are larger

**Dependencies**: T001 (icons), T002 (same file — CommitDetailsPanel.tsx)

- [x] T005 [US4] Update PanelHeader in webview-ui/src/components/CommitDetailsPanel.tsx: replace Unicode move arrows with MoveRightIcon/MoveBottomIcon SVG + add text label "Move to right" or "Move to bottom"; replace Unicode close ✕ with CloseIcon SVG; increase both buttons from px-1.5 py-0.5 to px-2 py-1 with flex items-center gap-1 for icon+label layout

**Checkpoint**: All 4 user stories complete — panel header buttons render correctly with SVG icons and labels

---

## Phase 4: Polish & Validation

**Purpose**: Verify all changes compile and work together

- [x] T006 Run pnpm typecheck, pnpm lint, and pnpm build to validate zero errors across all modified files
- [ ] T007 Run quickstart.md smoke test checklist via VS Code "Run Extension" launch config

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **P1 Stories (Phase 2)**: T002/T003 depend on T001 (icons import); T004 is fully independent
- **US4 (Phase 3)**: Depends on T001 (icons) and T002 (same file as CommitDetailsPanel.tsx)
- **Polish (Phase 4)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 1 setup only — no other story dependencies
- **US2 (P1)**: Depends on Phase 1 setup (CloudIcon) — no other story dependencies
- **US3 (P1)**: No dependencies — fully independent, can start immediately
- **US4 (P2)**: Depends on Phase 1 (icons) + US1 completion (same file)

### Parallel Opportunities

- T002, T003, T004 can all run in parallel (different files: CommitDetailsPanel.tsx, ControlBar.tsx, graphStore.ts)
- T001 is a quick prerequisite (~20 lines of SVG code) that unblocks T002, T003, T005

---

## Parallel Example: Phase 2

```
# After T001 (icons) completes, launch all P1 stories in parallel:
Task T002: "Fix right-side panel resize in CommitDetailsPanel.tsx"
Task T003: "Reorganize toolbar in ControlBar.tsx"
Task T004: "Clear commit state on repo switch in graphStore.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3)

1. Complete Phase 1: Setup (add icons)
2. Complete Phase 2: All P1 stories in parallel
3. **STOP and VALIDATE**: Test each story independently
4. All critical functionality delivered

### Full Delivery

1. Complete Phases 1-2 → P1 stories done
2. Complete Phase 3 → US4 (panel header polish)
3. Complete Phase 4 → Build validation + smoke test
4. All 7 requested changes delivered

---

## Notes

- All changes are webview-only (frontend) — no backend modifications
- No new packages needed — all SVG icons are hand-crafted
- 4 files modified, 0 new files created
- Total: 7 tasks covering all 4 user stories and 10 functional requirements

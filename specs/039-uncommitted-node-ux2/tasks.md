# Tasks: Uncommitted Node UX2 — Reuse File List in File Picker Dialog

**Input**: Design documents from `/specs/039-uncommitted-node-ux2/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: No test tasks generated (not requested in spec). Validation via typecheck + lint + build + manual smoke test.

**Organization**: Tasks grouped by user story. Both stories are P1 but US2 depends on US1's shared components.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Shared Component Extraction)

**Purpose**: Extract and prepare shared components from CommitDetailsPanel so both user stories can consume them. MUST complete before any user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Extract `FileChangeRow` from `webview-ui/src/components/CommitDetailsPanel.tsx` (lines 651-694) into `webview-ui/src/components/FileChangeShared.tsx` as a named export; add optional `hideActions?: boolean` prop that suppresses `FileActionIcons` rendering when true; update `CommitDetailsPanel.tsx` to import `FileChangeRow` from `FileChangeShared.tsx`
- [x] T002 Extract view mode toggle JSX from `webview-ui/src/components/CommitDetailsPanel.tsx` (lines 463-480) into a `ViewModeToggle` component in `webview-ui/src/components/FileChangeShared.tsx`; the component reads `fileViewMode` from Zustand, calls `setFileViewMode` + `rpcClient.persistUIState()`; update `CommitDetailsPanel.tsx` to use the extracted `ViewModeToggle` (sequential after T001 — both modify FileChangeShared.tsx and CommitDetailsPanel.tsx)
- [x] T003 [P] Add `getDescendantFilePaths(node: FileTreeNode): string[]` utility function to `webview-ui/src/utils/fileTreeBuilder.ts` that recursively collects all `fileChange.path` values from leaf nodes under a folder node
- [x] T004 Add optional selection props to `webview-ui/src/components/FileChangesTreeView.tsx`: `selectedPaths?: Set<string>`, `onTogglePath?: (path: string) => void`, `onToggleFolderPaths?: (paths: string[], checked: boolean) => void`, `hideActions?: boolean`; when `selectedPaths` is provided, render checkboxes on `FileNode` and tri-state checkboxes on `FolderNode` using `getDescendantFilePaths`; when `hideActions` is true, suppress `FileActionIcons`; when these props are absent, tree renders exactly as before (backward compatible)

**Checkpoint**: All shared components extracted and extended. CommitDetailsPanel unchanged in behavior. Ready for user story implementation.

---

## Phase 2: User Story 1 — Consistent File Browsing in File Picker Dialog (Priority: P1) 🎯 MVP

**Goal**: Replace the plain `FileGroup` component in the file picker dialog with the same rich row rendering (status badges, +N/−N line counts) used by the commit details panel. File action icons hidden; checkbox selection preserved.

**Independent Test**: Open the file picker dialog with both staged and unstaged changes. Verify each row shows a status badge (colored letter) and added/deleted line counts matching the commit details panel. Verify file selection (check/uncheck) still works and downstream actions operate on the selected set.

### Implementation for User Story 1

- [x] T005 [US1] Create `SelectableFileSection` component in `webview-ui/src/components/FilePickerDialog.tsx` replacing `FileGroup`; render section header with title, file count, and tri-state "select all" checkbox; for list view, render each file as a checkbox + `FileChangeRow` (with `hideActions={true}`); accept props: `title`, `files: FileChange[]`, `selectedPaths: Set<string>`, `disabled: boolean`, `onToggleFile: (path: string) => void`, `onToggleAll: () => void`
- [x] T006 [US1] Update `FilePickerDialogInner` in `webview-ui/src/components/FilePickerDialog.tsx` to replace both `FileGroup` usages (staged and unstaged sections) with the new `SelectableFileSection` component; ensure all existing selection logic (`selectedPaths`, `onToggleFile`, `onToggleAll`) passes through correctly
- [x] T007 [US1] Remove the old `FileGroup` component from `webview-ui/src/components/FilePickerDialog.tsx`

**Checkpoint**: File picker dialog shows rich file rows with status badges and +/- line counts in list view. All selection and action flows work as before.

---

## Phase 3: User Story 2 — Shared View Mode Toggle Between List and Tree (Priority: P1)

**Goal**: Add list/tree view toggle to each section's title bar in the file picker dialog. View mode is shared bidirectionally with the commit details panel via the Zustand `fileViewMode` state. Tree view includes tri-state folder checkboxes.

**Independent Test**: Set commit details panel to tree view, close it, open file picker dialog — both sections should open in tree view. Switch to list view via either section's toggle — both switch. Close dialog, open commit details panel — should be in list view. In tree view: click folder checkbox — all descendants select; partial selection shows indeterminate state. Toggle view mode with files selected — selections preserved.

### Implementation for User Story 2

- [x] T008 [US2] Add `ViewModeToggle` to each `SelectableFileSection` title bar in `webview-ui/src/components/FilePickerDialog.tsx`; the toggle reads `fileViewMode` from Zustand store and updates it via the shared handler; both section toggles always show the same mode
- [x] T009 [US2] Extend `SelectableFileSection` in `webview-ui/src/components/FilePickerDialog.tsx` to conditionally render `FileChangesTreeView` (with selection props: `selectedPaths`, `onTogglePath`, `onToggleFolderPaths`, `hideActions={true}`) when `fileViewMode === 'tree'`; pass through the existing `selectedPaths` set so selections persist across view mode changes
- [x] T010 [US2] Implement `onToggleFolderPaths` handler in `FilePickerDialogInner` in `webview-ui/src/components/FilePickerDialog.tsx` that adds or removes all provided paths from `selectedPaths`; folder click with all descendants selected → deselects all; folder click with none/partial → selects all

**Checkpoint**: File picker dialog supports list/tree toggle, synced with commit details panel. Tri-state folder checkboxes work. Selections preserved across view mode changes.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Validation, edge cases, and cleanup

- [x] T011 Verify edge cases in `webview-ui/src/components/FilePickerDialog.tsx`: only staged or only unstaged present (single section toggle still works); binary/renamed/untracked files render correctly; partially staged files appear in both sections with correct indicators; in tree view, folder checkbox shows unchecked when no descendants selected, fully checked when all descendants selected, and indeterminate when some but not all descendants selected; clicking an indeterminate folder checkbox selects all descendants
- [x] T012 Run `pnpm typecheck && pnpm lint && pnpm build` to validate zero errors
- [ ] T013 Smoke (requires manual testing) test per `specs/039-uncommitted-node-ux2/quickstart.md` validation steps in VS Code Extension Development Host

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately. BLOCKS all user stories.
- **US1 (Phase 2)**: Depends on Phase 1 completion (T001 for FileChangeRow, T002 for ViewModeToggle extraction)
- **US2 (Phase 3)**: Depends on Phase 1 (T003, T004 for tree selection) and Phase 2 (T005, T006 for SelectableFileSection)
- **Polish (Phase 4)**: Depends on all story phases complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 1 — no dependency on US2
- **User Story 2 (P1)**: Depends on US1's `SelectableFileSection` component (T005) — extends it with tree view

### Within Each Phase

- T001 and T003 can run in parallel (different files); T002 is sequential after T001 (both write to FileChangeShared.tsx and CommitDetailsPanel.tsx)
- T004 depends on T003 (`getDescendantFilePaths`)
- T005 depends on T001 (`FileChangeRow` with `hideActions`)
- T006 depends on T005 (`SelectableFileSection`)
- T007 depends on T006 (remove old component after replacement wired up)
- T008 depends on T002 (`ViewModeToggle`) and T005 (`SelectableFileSection`)
- T009 depends on T004 (`FileChangesTreeView` with selection props) and T005
- T010 depends on T009 (folder toggle handler)

### Parallel Opportunities

```
Phase 1:
  T001 (extract FileChangeRow) ‖ T003 (getDescendantFilePaths)   ← parallel (different files)
Then:
  T002 (extract ViewModeToggle — sequential after T001, same files)
  T004 (tree selection props — sequential after T003)

Phase 2 sequential:
  T005 → T006 → T007

Phase 3 partially parallel:
  T008 (view toggle in dialog) ‖ T009 (tree view rendering — after T004)
Then:
  T010 (folder toggle handler — depends on T009)
```

---

## Parallel Example: Phase 1

```
# Launch parallel extractions (different files):
Task: "Extract FileChangeRow to FileChangeShared.tsx" (T001)
Task: "Add getDescendantFilePaths to fileTreeBuilder.ts" (T003)

# Then sequentially (same files as T001):
Task: "Extract ViewModeToggle to FileChangeShared.tsx" (T002 — after T001)
Task: "Add selection props to FileChangesTreeView" (T004 — after T003)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational extractions
2. Complete Phase 2: User Story 1 (rich file rows in dialog)
3. **STOP and VALIDATE**: File picker shows status badges + line counts; all actions work
4. Proceed to User Story 2

### Incremental Delivery

1. Phase 1 → Shared components extracted, CommitDetailsPanel unchanged
2. Phase 2 (US1) → Rich file list in dialog (list view only) → Validate
3. Phase 3 (US2) → List/tree toggle + folder checkboxes → Validate
4. Phase 4 → Polish, edge cases, final validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No new packages required — pure refactoring of existing components
- No backend changes — all work is in `webview-ui/src/`
- `fileViewMode` state already exists in Zustand and is persisted — no new state infrastructure
- Selection state (`selectedPaths`) is path-based and view-mode-independent by design

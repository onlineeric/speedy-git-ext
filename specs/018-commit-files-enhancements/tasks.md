# Tasks: Commit Files Panel Enhancements

**Input**: Design documents from `/specs/018-commit-files-enhancements/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/messages.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Install new dependency required for tree view (User Story 3)

- [ ] T001 Install `@headless-tree/core` and `@headless-tree/react` in webview-ui — run `cd webview-ui && pnpm add @headless-tree/core @headless-tree/react` and verify `pnpm build` succeeds

---

## Phase 2: Foundational (Shared Types, Messages, Icons)

**Purpose**: Establish shared contracts, backend handlers, store state, and icon components that user story phases depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Add `FileViewMode` type (`'list' | 'tree'`) to `shared/types.ts` and add `FileTreeNode` interface with fields: `id: string`, `name: string`, `isFolder: boolean`, `depth: number`, `children?: FileTreeNode[]`, `fileChange?: FileChange`
- [x] T003 [P] Add `openCurrentFile` request message type (`{ type: 'openCurrentFile'; payload: { filePath: string } }`) to the `RequestMessage` union in `shared/messages.ts`, add corresponding type guard following existing patterns (e.g., `isOpenCurrentFileRequest`)
- [x] T004 [P] Add new SVG icon components to `webview-ui/src/components/icons/index.tsx` following existing 12×12 SVG pattern with `currentColor`: `CopyIcon` (clipboard), `FileIcon` (document), `FileCodeIcon` (document with brackets), `CheckIcon` (checkmark), `ListViewIcon` (horizontal lines), `TreeViewIcon` (hierarchical nodes). Each icon must accept `className?: string` prop and set `aria-hidden`
- [x] T005 Add `openCurrentFile` handler in `src/WebviewProvider.ts`: construct file URI from workspace folder + relative `filePath` payload, open via `vscode.workspace.openTextDocument(uri)` then `vscode.window.showTextDocument(doc)`. Show warning notification if file does not exist. Follow existing `openFileAtRevision` pattern (depends on T003)
- [x] T006 Add `openCurrentFile(filePath: string)` method to `webview-ui/src/rpc/rpcClient.ts` following existing `openFile`/`openDiff` fire-and-forget pattern (depends on T003)
- [x] T007 Add `fileViewMode: FileViewMode` state (default `'list'`) and `setFileViewMode(mode: FileViewMode)` action to the Zustand store in `webview-ui/src/stores/graphStore.ts` (depends on T002)

**Checkpoint**: Shared types, message contracts, backend handler, RPC method, store state, and icons are ready. User story implementation can begin.

---

## Phase 3: User Story 1 — Per-File Line Change Counts (Priority: P1) MVP

**Goal**: Move line addition/deletion counts from the aggregate header to individual file rows. Suppress counts for added/deleted files. Show "binary" label for binary files. Display renamed files with arrow notation.

**Independent Test**: Select a commit with mixed file statuses (added, modified, deleted, renamed, binary). Verify the header shows only "N files changed" with no +/- totals. Verify each modified/renamed file row shows its own +N -N counts. Verify added/deleted files show no counts. Verify binary files show a "binary" label. Verify renamed files display `newName ← oldName`.

### Implementation for User Story 1

- [x] T008 [US1] Refactor the `FileChangesList` header in `webview-ui/src/components/CommitDetailsPanel.tsx` (around line 296-305): remove the green `+{details.stats.additions}` and red `-{details.stats.deletions}` spans from the header. Header should display only `{count} file(s) changed` (FR-003)
- [x] T009 [US1] Refactor `FileChangeRow` in `webview-ui/src/components/CommitDetailsPanel.tsx` to conditionally display per-file change counts: show green `+{additions}` and red `-{deletions}` only for files with status `modified`, `renamed`, or `copied` that have non-zero additions or deletions. Do NOT show counts for `added` or `deleted` status files (FR-001, FR-002). Enforce layout order: status badge → file path → change counts (FR-021)
- [x] T010 [US1] Add binary file detection in `FileChangeRow` in `webview-ui/src/components/CommitDetailsPanel.tsx`: when `file.additions === undefined && file.deletions === undefined` and status is not `added`/`deleted`, display a muted "binary" label in place of change counts (FR-013)
- [x] T011 [US1] Update renamed file display in `FileChangeRow` in `webview-ui/src/components/CommitDetailsPanel.tsx`: show `newPath ← oldPath` with the old path in muted/dimmed style using `text-[var(--vscode-descriptionForeground)]`. In list view, use full relative paths. Update the title attribute accordingly (FR-018)
- [x] T012 [US1] Handle edge case for renamed files with zero changes in `FileChangeRow` in `webview-ui/src/components/CommitDetailsPanel.tsx`: when a file is renamed but has `additions === 0` and `deletions === 0`, suppress the change counts (treat as no meaningful content change)

**Checkpoint**: Per-file change counts work correctly for all file statuses. Header is clean. Renamed files show arrow notation. Binary files show "binary" label.

---

## Phase 4: User Story 2 — Per-File Action Icons (Priority: P2)

**Goal**: Add three hover action icons to each file row: copy relative path, open file at commit version, open current version. Icons appear on hover following VS Code convention. Copy shows inline checkmark feedback for 0.5s.

**Independent Test**: Select a commit, hover over a modified file row — 3 icons appear. Click copy icon — path copied to clipboard, icon flashes checkmark. Click "open at commit" — file opens read-only. Click "open current version" — current file opens editable. On a deleted file — only 2 icons visible (no "open current").

### Implementation for User Story 2

- [x] T013 [US2] Add a hover action icon container to `FileChangeRow` in `webview-ui/src/components/CommitDetailsPanel.tsx`: create a flex container that is hidden by default and shown on row hover (using Tailwind `opacity-0 group-hover:opacity-100` pattern). Add the row's parent a `group` class. Container appears after the change counts, aligned to the right end of the row. Each icon button should have `title` tooltip (FR-004, FR-007, FR-021)
- [x] T014 [US2] Implement "copy relative path" action in `FileChangeRow` in `webview-ui/src/components/CommitDetailsPanel.tsx`: onClick calls `rpcClient.copyToClipboard(file.path)`. Use React `useState` to track a `copied` flag. When clicked, set `copied = true`, show `CheckIcon` instead of `CopyIcon`, then after 500ms revert to `CopyIcon`. For renamed files, copy the new (current) path (FR-004, FR-014). Ensure the click event does not propagate to the file name link
- [x] T015 [US2] Implement "open file at this commit version" action in `FileChangeRow` in `webview-ui/src/components/CommitDetailsPanel.tsx`: onClick calls `rpcClient.openFile(hash, file.path)` using the commit hash from `CommitDetails`. For deleted files, use the parent hash: `rpcClient.openFile(parentHash, file.path)`. For uncommitted changes (no hash), call `rpcClient.openFile('HEAD', file.path)`. Use `FileCodeIcon`. Ensure click does not propagate (FR-005)
- [x] T016 [US2] Implement "open current version" action in `FileChangeRow` in `webview-ui/src/components/CommitDetailsPanel.tsx`: onClick calls `rpcClient.openCurrentFile(file.path)`. Use `FileIcon`. Conditionally render: do NOT show this icon when `file.status === 'deleted'` (FR-006). Ensure click does not propagate
- [x] T017 [US2] Verify that clicking the file name link still opens the diff view (existing `handleFileClick` behavior in `FileChangesList`), and that clicking anywhere else on the row (including the icon container area when icons are hidden) does NOT trigger any action (FR-016). Ensure icon button `onClick` handlers call `e.stopPropagation()` to prevent bubbling

**Checkpoint**: All three action icons work correctly on hover. Copy shows checkmark feedback. Deleted files hide "open current". File name click still opens diff.

---

## Phase 5: User Story 3 — Tree View for File Changes (Priority: P3)

**Goal**: Add a tree/list view toggle to the file changes header. Tree view groups files by folder hierarchy with compaction of single-child intermediate folders. All folders expanded by default. File nodes show only file name with change counts and action icons.

**Independent Test**: Select a commit with files in multiple directories. Click tree view toggle icon — files re-render grouped by folders. Folders are expanded and collapsible. Single-child intermediate folders are compacted. Click list view toggle — flat list restored. View mode persists when selecting different commits.

### Implementation for User Story 3

- [x] T018 [P] [US3] Create `webview-ui/src/utils/fileTreeBuilder.ts`: implement `buildFileTree(files: FileChange[]): FileTreeNode[]` function that converts a flat array of `FileChange` objects into a hierarchical `FileTreeNode[]` tree. Group files by directory path segments. Apply folder compaction: when a folder has exactly one child that is also a folder (and no direct file children), merge into a single node with combined path name (e.g., `src/components/ui/`). Root-level files appear at top level without folder wrapper. Sort: folders first (alphabetical), then files (alphabetical)
- [x] T019 [US3] Add list/tree view toggle icons to the `FileChangesList` header in `webview-ui/src/components/CommitDetailsPanel.tsx`: read `fileViewMode` and `setFileViewMode` from Zustand store. Render `ListViewIcon` and `TreeViewIcon` as toggle buttons in the header bar (after the file count text). Active view icon should be visually highlighted (e.g., brighter text color). Clicking toggles the view mode (FR-008, FR-012)
- [x] T020 [US3] Create `webview-ui/src/components/FileChangesTreeView.tsx`: implement tree view component using `@headless-tree/react`. Accept `files: FileChange[]`, `commitHash: string`, `parentHash?: string`, and the file click/action handlers as props. Use `buildFileTree()` to compute tree data. Configure headless-tree with all nodes expanded by default. Render folder nodes with expand/collapse chevron, indentation based on depth, and folder name only (no stats per FR-020). Render file nodes using the same layout as `FileChangeRow`: status badge → file name (not full path) → change counts → hover action icons (FR-010, FR-011, FR-019, FR-021)
- [x] T021 [US3] Conditionally render list view or tree view in `FileChangesList` in `webview-ui/src/components/CommitDetailsPanel.tsx`: based on `fileViewMode` from store, render existing flat `FileChangeRow` list (for `'list'`) or `FileChangesTreeView` component (for `'tree'`). Pass through file click handler and commit details (FR-009, FR-010)
- [x] T022 [US3] Handle edge cases in tree view: root-level files (no parent folder) appear at top level. Empty commit (zero files) shows empty state message. Renamed files in tree view show arrow notation on file name only (`newName ← oldName`, not full path). Verify tree view works for both committed and uncommitted changes (FR-006 edge case for uncommitted, FR-017, FR-018)

**Checkpoint**: Tree/list toggle works. Tree view groups files by folder with compaction. All folders expanded by default. File nodes show name, counts, and hover icons. Renamed files show arrow notation. View mode persists across commit selections.

---

## Phase 6: Polish & Validation

**Purpose**: Final build validation, cross-cutting checks, and smoke testing

- [x] T023 [P] Run `pnpm typecheck` and fix any TypeScript errors across all modified and new files
- [x] T024 [P] Run `pnpm lint` and fix any ESLint errors across all modified and new files
- [x] T025 Run `pnpm build` and verify clean production build of both extension and webview (depends on T023, T024)
- [ ] T026 Run full smoke test from quickstart.md checklist via VS Code "Run Extension" launch config: verify all 12 test scenarios pass (depends on T025)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001) for `@headless-tree` types
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion (needs icons from T004 only indirectly — US1 does not use new icons, but depends on the phase gate)
- **User Story 2 (Phase 4)**: Depends on Phase 2 (T003-T006 for openCurrentFile, T004 for icons)
- **User Story 3 (Phase 5)**: Depends on Phase 2 (T002 for types, T004 for icons, T007 for store)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2. No dependencies on other stories. **This is the MVP.**
- **User Story 2 (P2)**: Can start after Phase 2. Independent of US1 in terms of code (icons are in a separate container from change counts), but best done after US1 since the row layout order matters.
- **User Story 3 (P3)**: Can start after Phase 2. T018 (fileTreeBuilder) can run in parallel with US1/US2 work. Main component (T020) benefits from US1+US2 being done first since it reuses the refined FileChangeRow layout.

### Within Each User Story

- Implementation tasks are ordered by dependency (header before row, row before icons, etc.)
- Tasks modifying the same file (`CommitDetailsPanel.tsx`) must be sequential
- Tasks in different files (marked [P]) can run in parallel

### Parallel Opportunities

- **Phase 2**: T002, T003, T004 can all run in parallel (different files)
- **Phase 3**: T008-T012 are sequential (all in CommitDetailsPanel.tsx)
- **Phase 4**: T013-T017 are sequential (all in CommitDetailsPanel.tsx)
- **Phase 5**: T018 (fileTreeBuilder.ts) can run in parallel with any Phase 3/4 work
- **Phase 6**: T023 and T024 can run in parallel

---

## Parallel Example: Phase 2 (Foundational)

```bash
# These three tasks modify different files and can run in parallel:
Task T002: "Add FileViewMode and FileTreeNode types in shared/types.ts"
Task T003: "Add openCurrentFile message type in shared/messages.ts"
Task T004: "Add icon components in webview-ui/src/components/icons/index.tsx"
```

## Parallel Example: Cross-Story

```bash
# T018 can run in parallel with User Story 1 or 2 work:
Task T018: "Create fileTreeBuilder.ts utility" (new file, no conflicts)
Task T008: "Refactor FileChangesList header" (different file)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (install dependency)
2. Complete Phase 2: Foundational (types, messages, icons, handlers)
3. Complete Phase 3: User Story 1 (per-file change counts)
4. **STOP and VALIDATE**: Test per-file counts independently — header clean, counts correct, binary/renamed handled
5. This alone delivers significant value by fixing the existing display issue

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → MVP ready
3. Add User Story 2 → Test independently → Action icons working
4. Add User Story 3 → Test independently → Tree view working
5. Polish → Build validation → Full smoke test
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All tasks modifying `CommitDetailsPanel.tsx` are sequential within their phase (same file)
- `fileTreeBuilder.ts` is a standalone new file and can be developed early in parallel
- Remember coding preferences: clean, readable, self-documenting code; DRY; explicit over implicit; TypeScript strict mode; no auto-install of packages
- Follow existing patterns: icon components use 12×12 SVG with `currentColor`; RPC methods are fire-and-forget; store actions are simple setters
- Verify `pnpm typecheck && pnpm lint && pnpm build` pass after each phase

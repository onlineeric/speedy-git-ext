# Feature Specification: Commit Files Panel Enhancements

**Feature Branch**: `018-commit-files-enhancements`
**Created**: 2026-03-20
**Status**: Draft
**Input**: User description: "Enhance the commit details panel file changes list with per-file action icons, per-file line change counts, and a list/tree view toggle."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Per-File Line Change Counts (Priority: P1)

A developer viewing a commit wants to quickly assess the impact of changes on each file. Currently the aggregate line additions and deletions are shown only in the header ("4 files changed +46 -10"), but users need this information per file to understand which files had the most churn. The header should show only the number of files changed (e.g., "4 files changed"), while each file row displays its own addition and deletion counts next to the file name (e.g., `utils.ts +30 -5`). For newly added or fully deleted files, change counts are omitted since the entire file is the change.

**Why this priority**: Accurate, per-file change counts are the most fundamental improvement — they fix an existing display issue and provide essential context that every other enhancement builds upon.

**Independent Test**: Can be fully tested by selecting any commit with multiple changed files and verifying that each file row shows its own +/- counts while the header shows only the file count.

**Acceptance Scenarios**:

1. **Given** a commit with modified files is selected, **When** the commit details panel opens, **Then** each modified file row displays its additions count in green and deletions count in red immediately after the file name.
2. **Given** a commit that includes a newly added file, **When** viewing the file list, **Then** the added file row does NOT display +/- change counts.
3. **Given** a commit that includes a deleted file, **When** viewing the file list, **Then** the deleted file row does NOT display +/- change counts.
4. **Given** a commit with any number of changed files, **When** viewing the header, **Then** only the file count is shown (e.g., "4 files changed") without aggregate addition/deletion totals.
5. **Given** a commit with renamed or copied files that also have modifications, **When** viewing the file list, **Then** the file row displays the +/- counts for the modifications.

---

### User Story 2 - Per-File Action Icons (Priority: P2)

A developer reviewing a commit often needs to perform quick actions on individual files: copy the relative file path to share with colleagues or paste into commands, open the file as it existed at the commit revision to inspect the full file state, or open the current version of the file to compare mentally or make edits. Each file row in the changes list should show action icons on hover (appearing after the change counts) that allow these three operations, following VS Code's convention where action icons appear when hovering over a row.

**Why this priority**: Action icons add significant workflow convenience. They are high-value, low-complexity enhancements that directly reduce friction in common developer tasks.

**Independent Test**: Can be tested by selecting a commit, hovering over a file row, and clicking each icon to verify the correct action is performed.

**Acceptance Scenarios**:

1. **Given** a file row in the changes list, **When** the user clicks the "copy relative file path" icon, **Then** the file's relative path is copied to the clipboard and the icon briefly changes to a checkmark for ~0.5 seconds before reverting.
2. **Given** a file row for a modified or added file, **When** the user clicks the "open file at this commit version" icon, **Then** the file content at that specific commit is opened in a read-only editor.
3. **Given** a file row for a modified or added file, **When** the user clicks the "open current version" icon, **Then** the current working tree version of the file is opened in the editor.
4. **Given** a file row for a deleted file, **When** viewing the action icons, **Then** the "open current version" icon is not shown (since the file no longer exists), but "copy path" and "open at commit version" remain available.
5. **Given** a file row for a deleted file, **When** the user clicks "open file at this commit version" icon, **Then** the file content at the parent commit is opened in a read-only editor.
6. **Given** any file action icon, **When** the user hovers over it, **Then** a tooltip describes the action (e.g., "Copy relative path", "Open file at this commit", "Open current version").

---

### User Story 3 - Tree View for File Changes (Priority: P3)

When a commit touches many files across multiple directories, a flat list of relative paths can be hard to scan. The user wants a tree view option that groups files by their folder hierarchy, similar to the VS Code Explorer panel. A toggle in the file changes header bar lets the user switch between the current flat list view and the new tree view. Folders in the tree view should be collapsible/expandable. In tree view, each file node shows only the file name (not the full relative path), with change counts and action icons still visible.

**Why this priority**: Tree view is a significant UX improvement for large commits but is additive — the flat list already works. This can be delivered after the core per-file enhancements are in place.

**Independent Test**: Can be tested by selecting a commit with files in multiple directories, toggling to tree view, and verifying files are grouped under their respective folder nodes.

**Acceptance Scenarios**:

1. **Given** the file changes header, **When** the user views the header bar, **Then** toggle icons for list view and tree view are visible.
2. **Given** the user is in list view (default), **When** the user clicks the tree view toggle icon, **Then** the file list re-renders as a folder tree grouped by directory hierarchy.
3. **Given** the user is in tree view, **When** the user clicks the list view toggle icon, **Then** the file list returns to the flat list layout showing full relative paths.
4. **Given** tree view is active, **When** viewing a folder node, **Then** the folder is expanded by default, collapsible/expandable, and shows its files underneath.
5. **Given** tree view is active, **When** viewing a file node, **Then** only the file name is shown (not the full path), with change counts and action icons still present.
6. **Given** tree view is active and a file is at the repository root (no parent folder), **When** viewing the tree, **Then** the file appears at the top level without a folder wrapper.
7. **Given** the user toggles between list and tree view, **When** switching back, **Then** the previously selected view preference is remembered for the session.
8. **Given** a commit with deeply nested file paths (e.g., `src/components/ui/buttons/PrimaryButton.tsx`), **When** viewing the tree, **Then** intermediate folders that contain only one subfolder MUST be compacted (e.g., `src/components/ui/buttons/` shown as a single node) to reduce nesting depth.

---

### Edge Cases

- What happens when a file has binary changes (no line additions/deletions available)? The change counts should be omitted and a "binary" label shown instead.
- What happens when a commit has zero changed files? The file changes section should display an appropriate empty state message.
- What happens when the user copies a path for a renamed file? The current (new) path should be copied.
- What happens when a file is renamed with no content changes? No change counts are shown (0 additions, 0 deletions should be treated as no counts to display).
- What happens when the clipboard API is unavailable? A brief notification informs the user that copying failed.
- What happens for uncommitted changes with the "open at commit version" icon? For uncommitted changes, this icon opens the file at HEAD (last committed version), since there is no commit hash.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each file row MUST display per-file addition count (green) and deletion count (red) immediately after the file name, for files with status "modified", "renamed", or "copied" that have non-zero changes.
- **FR-002**: File rows for files with status "added" or "deleted" MUST NOT display line change counts.
- **FR-003**: The file changes header MUST display only the total file count (e.g., "4 files changed") without aggregate addition/deletion totals.
- **FR-004**: Each file row MUST display action icons on hover (copy path, open at commit, open current version), following VS Code's convention for row-level actions.
- **FR-005**: Each file row MUST include an "open file at this commit version" action icon that opens the file content at the selected commit in a read-only editor.
- **FR-006**: Each file row MUST include an "open current version" action icon that opens the current working tree version of the file, except for deleted files where this icon is hidden.
- **FR-007**: All action icons MUST display a descriptive tooltip on hover.
- **FR-008**: The file changes header MUST include toggle icons to switch between list view and tree view.
- **FR-009**: List view MUST display files as a flat list with full relative paths (current behavior).
- **FR-010**: Tree view MUST group files by their directory hierarchy, showing only file names at the leaf level.
- **FR-011**: Folder nodes in tree view MUST be collapsible and expandable.
- **FR-012**: The selected view mode (list or tree) MUST persist for the duration of the session.
- **FR-013**: Files with binary changes MUST show a "binary" indicator instead of line change counts.
- **FR-014**: For renamed files, the "copy path" action MUST copy the new (current) file path.
- **FR-015**: Action icons MUST be visually consistent with existing icon patterns in the extension.
- **FR-016**: Clicking the file name MUST continue to open the diff view (existing link behavior preserved). Clicking elsewhere on the row MUST NOT trigger any action. Action icons are supplementary to this primary interaction.
- **FR-017**: All enhancements (per-file change counts, action icons, tree/list view toggle) MUST apply consistently to both committed and uncommitted/working tree changes views.
- **FR-018**: Renamed files MUST display the new path followed by an arrow and the old path in muted style (e.g., `newName.ts ← oldName.ts`). In tree view, the arrow notation applies to the file name only.
- **FR-019**: In tree view, intermediate folders that contain only a single subfolder (and no files) MUST be compacted into a single node showing the combined path (e.g., `src/components/ui/buttons/`).
- **FR-020**: Folder nodes in tree view MUST display only the folder name/path without any aggregate change counts or file counts.
- **FR-021**: Each file row MUST follow the layout order: status badge (A/M/D/R/C), file path/name, change counts (+N -N), then action icons (on hover). This order applies to both list and tree views.

### Key Entities

- **FileChange**: A single file affected by a commit, with path, status, optional old path (for renames), and per-file addition/deletion counts.
- **ViewMode**: The user's selected display mode for the file changes list — either "list" (flat) or "tree" (hierarchical).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can identify per-file change impact (additions/deletions) at a glance without clicking into each file.
- **SC-002**: Users can copy a file's relative path with a single click, reducing the number of steps compared to manually selecting and copying text.
- **SC-003**: Users can open any file at its commit version or current version with a single click, without navigating away from the commit details panel.
- **SC-004**: Users can switch between list and tree views in under 1 second, with the tree view rendering correctly for commits with 100+ changed files.
- **SC-005**: Tree view reduces visual scanning time for commits spanning 5+ directories by grouping related files together.

## Clarifications

### Session 2026-03-20

- Q: Should action icons be always visible, appear on hover, or hybrid? → A: Show on hover, matching VS Code's Explorer/Source Control pattern for clean UI.
- Q: Should clicking the file row still open the diff with new icons added? → A: File name acts as a link that opens the diff (existing behavior preserved); clicking the row itself does nothing. Icons are supplementary actions.
- Q: What feedback should the user see after copying a file path? → A: Inline icon feedback — icon briefly changes to a checkmark then reverts after ~0.5 seconds.
- Q: Should tree view folders be expanded or collapsed by default? → A: All expanded by default so users see all changed files immediately; users can collapse folders they don't care about.
- Q: Should enhancements apply to uncommitted/working tree changes too? → A: Yes, all enhancements (per-file counts, action icons, tree view) apply to uncommitted changes for consistent behavior.
- Q: How should renamed files be displayed? → A: Show with arrow notation (e.g., `newName.ts ← oldName.ts`) with old path in muted style.
- Q: Should tree view folder compaction be required or optional? → A: Required — single-child intermediate folders are always compacted into one node (e.g., `src/components/ui/buttons/`).
- Q: Should folder nodes in tree view display aggregate change counts? → A: No — folders show only the folder name/path, no stats.
- Q: Where should the status badge (A/M/D) appear in the file row layout? → A: Keep at the start. Layout order: `[badge] [file path] [+N -N] [...icons on hover]`.

## Assumptions

- The existing per-file addition/deletion data from the git backend (`git diff-tree --numstat`) is accurate and available for all non-binary file changes.
- The clipboard API is available in the VS Code webview environment.
- Opening a file at a specific commit revision reuses the existing `openFile` message type in the extension backend.
- The view mode toggle preference does not need to persist across VS Code sessions (session-only).
- Tree view folder compaction (combining single-child intermediate folders) is required.
- If a suitable, well-maintained tree view component exists (e.g., from VS Code's own component library or a popular React tree library), it should be preferred over a custom implementation.

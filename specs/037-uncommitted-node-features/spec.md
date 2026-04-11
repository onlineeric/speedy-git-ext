# Feature Specification: Uncommitted Node Features

**Feature Branch**: `037-uncommitted-node-features`  
**Created**: 2026-04-10  
**Status**: Draft  
**Input**: User description: "Uncommitted node features: context menu operations, staged/unstaged separation in details panel, and per-file actions"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Staged and Unstaged Files Separately (Priority: P1)

A user selects the uncommitted node in the git graph and sees their file changes organized into two clear sections: "Staged Changes" and "Unstaged Changes". Each section shows the count of files it contains. Untracked files appear in the Unstaged Changes section. This gives users immediate visibility into what will be committed and what won't, without leaving the extension.

**Why this priority**: This is the foundation for all other uncommitted node features. Without separated staged/unstaged views, users cannot make informed decisions about staging, unstaging, or discarding. Every other feature in this spec depends on users being able to see and understand their staging state.

**Independent Test**: Can be fully tested by making changes to files, staging some via terminal, then selecting the uncommitted node and verifying the two sections display correctly with accurate counts.

**Acceptance Scenarios**:

1. **Given** a repo with 2 staged files and 3 unstaged files, **When** user selects the uncommitted node, **Then** the details panel shows "Staged Changes (2 files)" and "Unstaged Changes (3 files)" as separate sections with the correct files in each.
2. **Given** a repo with only staged files, **When** user selects the uncommitted node, **Then** only the "Staged Changes" section is shown (unstaged section is hidden or empty).
3. **Given** a repo with only unstaged files, **When** user selects the uncommitted node, **Then** only the "Unstaged Changes" section is shown.
4. **Given** a repo with untracked files, **When** user selects the uncommitted node, **Then** untracked files appear in the "Unstaged Changes" section.
5. **Given** the details panel showing staged/unstaged sections, **When** the user toggles between list and tree view, **Then** both sections respect the same view mode, controlled by a single toggle in the top section header.

---

### User Story 2 - Stage and Unstage Individual Files (Priority: P1)

A user viewing the uncommitted node details panel can stage or unstage individual files using action buttons next to each file. Staged files have an "unstage" button; unstaged files have a "stage" button. After the action completes, the file moves to the correct section and counts update immediately.

**Why this priority**: Per-file staging is the most fundamental git workflow operation. Users need granular control over what goes into their next commit. This is equally critical as the separated view because the view without actions is read-only.

**Independent Test**: Can be tested by having a mix of staged and unstaged files, clicking the stage button on an unstaged file, and verifying it moves to the staged section. Then clicking unstage on a staged file and verifying it moves back.

**Acceptance Scenarios**:

1. **Given** an unstaged modified file, **When** user clicks the stage button next to it, **Then** the file moves to the Staged Changes section and counts update.
2. **Given** a staged file, **When** user clicks the unstage button next to it, **Then** the file moves to the Unstaged Changes section and counts update.
3. **Given** an untracked file in the unstaged section, **When** user clicks stage, **Then** the file is tracked and staged, moving to the Staged Changes section.
4. **Given** a file that exists in both staged and unstaged sections (partially staged), **When** user stages the unstaged version, **Then** all changes for that file are now staged.

---

### User Story 3 - Bulk Stage All and Unstage All (Priority: P2)

Each section header in the details panel has a bulk action button. The "Unstaged Changes" header has a "Stage All" button; the "Staged Changes" header has an "Unstage All" button. These perform the operation on all files in that section at once.

**Why this priority**: Bulk operations save time and are a natural complement to per-file actions. They are lower priority than per-file actions because per-file provides the core capability; bulk is a convenience.

**Independent Test**: Can be tested by having multiple unstaged files, clicking "Stage All", and verifying all files move to the staged section in one action.

**Acceptance Scenarios**:

1. **Given** 5 unstaged files, **When** user clicks "Stage All" on the Unstaged Changes header, **Then** all 5 files move to Staged Changes and counts update.
2. **Given** 3 staged files, **When** user clicks "Unstage All" on the Staged Changes header, **Then** all 3 files move to Unstaged Changes and counts update.
3. **Given** no unstaged files exist, **When** user views the details panel, **Then** the "Stage All" button is not shown (or the section is hidden entirely).

---

### User Story 4 - Discard Individual File Changes (Priority: P2)

A user can discard changes to individual unstaged files using a discard button next to each file. Discarding is destructive and requires a confirmation dialog before proceeding. The dialog clearly warns that this action cannot be undone.

**Why this priority**: Discard is a common workflow need but is destructive, so it requires careful UX. It's P2 because staging/unstaging must work first before users need discard.

**Independent Test**: Can be tested by modifying a file, clicking the discard button, confirming the dialog, and verifying the file reverts to its last committed state.

**Acceptance Scenarios**:

1. **Given** an unstaged modified file, **When** user clicks the discard button, **Then** a confirmation dialog appears warning that changes will be permanently lost.
2. **Given** the discard confirmation dialog is showing, **When** user confirms, **Then** the file's changes are discarded and it disappears from the unstaged section.
3. **Given** the discard confirmation dialog is showing, **When** user cancels, **Then** no changes are made.
4. **Given** an untracked file, **When** user clicks the discard button and confirms, **Then** the untracked file is deleted from the working directory.
5. **Given** a staged file, **When** user views its action buttons, **Then** no discard button is shown (discard only applies to unstaged files).

---

### User Story 5 - Uncommitted Node Context Menu (Priority: P2)

A user right-clicks the uncommitted node in the graph and sees a context menu with operations: Stash All Changes, Stage All Changes, Unstage All Changes, Discard All Unstaged Changes, and Open Source Control Panel. Each destructive operation shows a confirmation dialog.

**Why this priority**: The context menu provides quick access to bulk operations from the graph view itself, complementing the details panel actions. P2 because the details panel actions (P1-P2) cover the same core operations.

**Independent Test**: Can be tested by right-clicking the uncommitted node and verifying the context menu appears with the correct items, and that each item triggers the expected operation.

**Acceptance Scenarios**:

1. **Given** a repo with unstaged changes, **When** user right-clicks the uncommitted node, **Then** a context menu appears with all expected operations.
2. **Given** no unstaged changes exist, **When** user right-clicks the uncommitted node, **Then** "Stage All Changes" is hidden or disabled.
3. **Given** no staged changes exist, **When** user right-clicks the uncommitted node, **Then** "Unstage All Changes" is hidden or disabled.
4. **Given** user selects "Stash All Changes", **Then** a confirmation dialog appears with a message input field, and upon confirmation, all changes are stashed.
5. **Given** user selects "Discard All Unstaged Changes", **Then** a confirmation dialog appears with a clear destructive warning, and upon confirmation, all unstaged changes are discarded.
6. **Given** user selects "Open Source Control Panel", **Then** the VS Code/Cursor native Source Control panel opens.

---

### User Story 6 - File Selection for Batch Operations (Priority: P3)

A user right-clicks the uncommitted node and selects "Select files for..." which opens a multi-select file picker dialog. The user selects specific files, then chooses an action (Stage, Unstage, Stash, or Discard). This allows targeted batch operations on a subset of files.

**Why this priority**: This is an advanced workflow for power users who need surgical control over subsets of files. P3 because individual file actions (P1) and bulk actions (P2) cover most use cases.

**Independent Test**: Can be tested by opening the file picker, selecting 3 of 5 changed files, choosing "Stage", and verifying only the selected files are staged.

**Acceptance Scenarios**:

1. **Given** user selects "Select files for..." from context menu, **Then** a dialog appears listing all changed files with checkboxes, grouped by staged/unstaged status with section headers.
2. **Given** the file picker dialog with files selected, **When** user clicks "Stage", **Then** only the selected files are staged.
3. **Given** the file picker dialog with files selected, **When** user clicks "Discard", **Then** a confirmation appears, and upon confirmation only the selected files are discarded.
4. **Given** no files are selected in the picker, **When** user views the action buttons, **Then** all action buttons are disabled.

---

### User Story 7 - Merge Conflict State Display (Priority: P3)

When the repository is in a conflict state (mid-merge, mid-rebase, or mid-cherry-pick), the details panel shows an additional "Merge Conflicts" section at the top, listing files with unresolved conflicts. Conflict files only have an "open file" button — the extension does not provide any conflict resolution actions. Users resolve conflicts through VS Code's native merge editor.

**Why this priority**: Conflict states are less frequent than normal staging workflows, and the extension deliberately defers resolution to VS Code's native tools. This is informational display only. P3 because it's a read-only enhancement for an uncommon state.

**Independent Test**: Can be tested by initiating a merge that creates conflicts, selecting the uncommitted node, and verifying the Merge Conflicts section appears with the correct files.

**Acceptance Scenarios**:

1. **Given** a repo mid-merge with 2 conflicted files, **When** user selects the uncommitted node, **Then** a "Merge Conflicts (2 files)" section appears above Staged and Unstaged sections.
2. **Given** a conflicted file in the Merge Conflicts section, **When** user views its action buttons, **Then** only an "open file" button is shown (no stage/unstage/discard).
3. **Given** a repo mid-rebase with conflicts, **When** user selects the uncommitted node, **Then** the Merge Conflicts section is displayed.
4. **Given** a repo mid-cherry-pick with conflicts, **When** user selects the uncommitted node, **Then** the Merge Conflicts section is displayed.
5. **Given** no conflict state exists, **When** user selects the uncommitted node, **Then** no Merge Conflicts section is shown.

---

### User Story 8 - Staged File Content Viewing (Priority: P3)

When a user opens a staged file's diff or content view, they see the staged version of the file (from the git index), not the working tree version. This ensures users can verify exactly what will be committed.

**Why this priority**: This is a correctness improvement for file viewing. P3 because the current diff viewing already works — this refines it to show the correct version for staged files specifically.

**Independent Test**: Can be tested by modifying a file, staging it, modifying it again (so staged and working versions differ), then opening the staged file's content and verifying it shows the staged version.

**Acceptance Scenarios**:

1. **Given** a file with different staged and working tree versions, **When** user opens the staged file's content from the Staged Changes section, **Then** the staged version is shown.
2. **Given** an unstaged file, **When** user opens its content from the Unstaged Changes section, **Then** the working tree version is shown.

---

### Edge Cases

- What happens when a file is partially staged (some hunks staged, others not)? The file should appear in both Staged and Unstaged sections.
- What happens when a staging/unstaging operation fails (e.g., file locked by another process)? An error message should be shown and the panel state should remain unchanged.
- What happens when files change externally while the details panel is open? The file watcher should detect changes and refresh the panel automatically.
- What happens when the user stages/unstages rapidly in succession? Operations should queue and execute sequentially; the UI should reflect the final state.
- What happens when there are no uncommitted changes at all? The uncommitted node should not appear in the graph (existing behavior).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display uncommitted file changes in separate "Staged Changes" and "Unstaged Changes" sections in the details panel, each with an accurate file count.
- **FR-002**: System MUST provide a stage button on each unstaged file that stages that individual file.
- **FR-003**: System MUST provide an unstage button on each staged file that unstages that individual file.
- **FR-004**: System MUST provide a discard button on each unstaged file that reverts the file to its last committed state after user confirmation.
- **FR-005**: System MUST provide "Stage All" and "Unstage All" bulk action buttons on the respective section headers.
- **FR-006**: System MUST show a context menu on right-click of the uncommitted node with: Stash All Changes, Stage All Changes, Unstage All Changes, Discard All Unstaged Changes, Select files for..., and Open Source Control Panel.
- **FR-007**: System MUST conditionally show/hide context menu items based on current state (e.g., hide "Stage All" when no unstaged changes exist).
- **FR-008**: System MUST require user confirmation via dialog for all destructive operations (discard, stash), with clear warnings about data loss.
- **FR-009**: System MUST refresh the uncommitted node summary, details panel, and graph immediately after any staging/unstaging/stashing/discarding operation.
- **FR-010**: System MUST display confirmation dialogs with a developer-friendly command preview showing the git command that will be executed, consistent with existing extension dialogs.
- **FR-011**: System MUST display untracked files in the Unstaged Changes section, and staging an untracked file MUST both track and stage it.
- **FR-012**: System MUST provide a file picker dialog (accessible via context menu "Select files for...") that allows multi-select of files, grouped by staged/unstaged status with section headers, with action buttons for Stage, Unstage, Stash, and Discard.
- **FR-013**: System MUST detect merge/rebase/cherry-pick conflict state and display a "Merge Conflicts" section above the Staged and Unstaged sections when conflicts exist.
- **FR-014**: System MUST show only an "open file" button for conflict files — no stage, unstage, or discard actions.
- **FR-015**: System MUST NOT provide any conflict resolution actions (continue, abort, mark resolved). The extension only displays conflict state.
- **FR-016**: System MUST open the staged version (git index) when viewing content of staged files, not the working tree version.
- **FR-017**: The list/tree view toggle MUST be controlled by a single toggle in the top section header, and MUST apply to all sections simultaneously.
- **FR-018**: The "Stash All Changes" dialog MUST include a text input for an optional stash message.

### Key Entities

- **File Change (extended)**: A changed file with its path, change status, addition/deletion counts, and a new "stage state" attribute indicating whether it is staged, unstaged, or conflicted.
- **Conflict State**: Represents whether the repo is in a merge/rebase/cherry-pick conflict, including the list of conflicted file paths and the type of operation that caused the conflict.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can stage or unstage an individual file in under 1 second from clicking the action button to seeing the updated panel.
- **SC-002**: Users can identify which files are staged vs. unstaged at a glance, without needing to open the terminal or VS Code's Source Control panel.
- **SC-003**: All destructive operations (discard, stash) require exactly one explicit user confirmation before executing.
- **SC-004**: The details panel accurately reflects the current staging state at all times, including after rapid successive operations.
- **SC-005**: Users in a merge conflict state can see which files have conflicts and open them for resolution without the extension interfering with VS Code's native conflict resolution workflow.
- **SC-006**: All dialogs display the corresponding git command preview, maintaining consistency with the extension's existing dialog patterns.

## Clarifications

### Session 2026-04-10

- Q: Should the stash dialog offer a "keep staged" option, or always stash everything? → A: Stash everything (staged + unstaged + untracked) with no keep-staged option. Keeps the dialog simple; users who need keep-index can use the terminal.
- Q: Should "Discard All Changes" discard everything or only unstaged, and should the label reflect the scope? → A: Rename to "Discard All Unstaged Changes" — only discards unstaged changes, label matches behavior.
- Q: Should the "Select files for..." dialog group files by staged/unstaged status or show a flat list? → A: Group files by staged/unstaged status with section headers in the picker.

## Assumptions

- The existing file system watcher (`GitWatcherService`) provides sufficient responsiveness for detecting staging state changes. If not, explicit refresh calls will supplement it after operations.
- Partially staged files (some hunks staged, others not) will appear in both the Staged and Unstaged sections simultaneously, as this is how git represents them.
- The "Stash All Changes" operation stashes all changes (staged + unstaged + untracked) and leaves a clean working directory. No "keep staged" option is provided.
- Drag-and-drop between staged/unstaged sections is explicitly out of scope.
- The extension does not provide commit functionality — users commit through VS Code's native Source Control panel or terminal.

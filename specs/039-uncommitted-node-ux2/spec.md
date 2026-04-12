# Feature Specification: Uncommitted Node UX2 — Reuse File List in File Picker Dialog

**Feature Branch**: `039-uncommitted-node-ux2`
**Created**: 2026-04-12
**Status**: Draft
**Input**: User description: "read @specs/039-uncommitted-node-ux2-idea.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent file browsing in the file picker dialog (Priority: P1)

When a user opens the "Select files for..." dialog (triggered from the uncommitted node for commit, stash, discard, etc.), they see the exact same file list presentation they are used to from the commit details panel: the same row layout, the same status badges, and the same per-file added/deleted line counts (+?? −??). Staged and unstaged sections remain visually separated so users can make per-file selections, but the way each file row is rendered is indistinguishable from how that same file would look in the commit details panel.

**Why this priority**: The file picker dialog is the primary entry point for committing, stashing, and otherwise acting on uncommitted changes. A consistent, information-rich file list reduces cognitive load, lets users see change magnitude before they act, and removes a jarring inconsistency between two parts of the extension that show the same conceptual data. This is the foundation of the whole feature — without it, the other improvements do not apply.

**Independent Test**: Open the file picker dialog with a repo that has both staged and unstaged changes of varying sizes. Verify each row in both sections shows a status badge and an added/deleted indicator that matches what the commit details panel shows for the same working-tree change. Verify the dialog remains fully usable for selecting files and continuing to the underlying action (commit, stash, discard).

**Acceptance Scenarios**:

1. **Given** a repository with staged and unstaged changes, **When** the user opens the "Select files for..." dialog, **Then** each file row in both the staged and unstaged sections shows the same status badge and the same added (+N) and deleted (−N) line counts that the commit details panel would display for the same working-tree file.
2. **Given** the file picker dialog is open, **When** the user selects or deselects a file, **Then** the selection state is preserved independently of the presentation change, and the downstream action (commit, stash, discard) operates on exactly the selected set as before.
3. **Given** a binary file or a renamed file in the uncommitted changes, **When** the user opens the dialog, **Then** the row renders in the same way the commit details panel renders that same case (e.g., binary files show no numeric indicators, renamed files show their rename decoration).

---

### User Story 2 - Shared view mode toggle between list and tree (Priority: P1)

The file picker dialog supports both the flat list view and the directory tree view. The view mode is shared one-to-one with the commit details panel: whatever view mode the user last chose in the commit details panel is the view mode the file picker dialog opens in, and vice versa. Each section (staged and unstaged) has its own view-mode toggle in its title bar, but both toggles control the same shared view mode — clicking either one switches all sections in the dialog simultaneously and updates the shared preference that also governs the commit details panel.

**Why this priority**: Users have already invested time configuring their preferred view mode in the commit details panel. A shared setting respects the user's existing preference. Placing a toggle on each section title bar means the user always has immediate access to the control regardless of scroll position or which sections are visible, while both toggles always stay in sync.

**Independent Test**: Set the commit details panel to tree view, close it, then open the file picker dialog — it must open in tree view for both staged and unstaged sections. Switch to list view using the toggle on either section's title bar — both sections switch and both toggles update. Close the dialog and open the commit details panel — it must now be in list view.

**Acceptance Scenarios**:

1. **Given** the commit details panel was last set to tree view, **When** the user opens the file picker dialog, **Then** both the staged and unstaged sections render in tree view.
2. **Given** the file picker dialog is open in list view, **When** the user clicks the tree-view button on either section's title bar, **Then** both the staged and unstaged sections switch to tree view at the same time, and the toggle on the other section's title bar also updates to reflect tree view.
3. **Given** the user changed the view mode inside the file picker dialog and then closed it, **When** the user later opens the commit details panel, **Then** the commit details panel reflects the view mode the user picked in the dialog.
4. **Given** the file picker dialog is open with both staged and unstaged sections, **When** the user looks at the section title bars, **Then** each section has its own view-mode toggle and both toggles always show the same current mode.

---

### Edge Cases

- **Only staged or only unstaged changes exist**: The visible section's title bar still shows its view-mode toggle and still governs the view mode. The absent section's toggle is simply not rendered.
- **Empty tree branches after filtering**: In tree view, empty intermediate directories are handled the same way the commit details panel handles them — no new rules are introduced.
- **Very large change sets**: The dialog must not feel noticeably slower to open or interact with than it does today when the repository has many uncommitted files; the shared component must remain responsive in both sections.
- **View mode toggled mid-interaction**: A user who has already checked some files and then switches between list and tree view keeps all selections intact. Switching view mode never clears selection state.
- **A file appears in both staged and unstaged** (partially staged): Each representation of the file is rendered in its own section with its own indicators, matching how each side reports changes — the behavior matches what the commit details panel already produces for the working-tree view.
- **Binary / unmerged / renamed / copied files**: These render using the same rules the commit details panel applies, so no dialog-specific special cases are introduced.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The "Select files for..." dialog MUST render each file row using the same presentation component the commit details panel uses for its file list, so that row layout, status badges, and added/deleted line indicators match exactly. File action icons (e.g., open diff, open file) MUST be hidden in the dialog context since the dialog serves a selection purpose, not a file-exploration purpose.
- **FR-002**: Each file row in both the staged and unstaged sections MUST display the per-file added and deleted line counts in the same "+N −N" format shown by the commit details panel, including the same rules for files where counts are not applicable (e.g., binary files).
- **FR-003**: The dialog MUST support both list view and tree view for the staged and unstaged sections, reusing the same list and tree rendering behavior already present in the commit details panel.
- **FR-004**: Each section (staged and unstaged) MUST display a view-mode toggle in its title bar. Both toggles MUST control the same shared view mode state, so clicking either one switches all sections simultaneously and both toggles always reflect the current mode.
- **FR-005**: The view-mode toggles on both section title bars MUST remain visually synchronized at all times — they MUST always show the same selected mode.
- **FR-006**: The view mode used by the dialog MUST be the same shared preference used by the commit details panel; changing the view mode in the dialog MUST immediately be reflected the next time the commit details panel is shown, and vice versa, without the user having to reconfigure it.
- **FR-007**: The view mode preference MUST persist across dialog open/close cycles and across editor reloads using the same persistence mechanism the commit details panel already uses, with no new user-visible setting introduced.
- **FR-008**: File selection state (which files are checked for the downstream action) MUST remain independent of the view mode; toggling between list and tree view MUST NOT alter which files are selected.
- **FR-009**: All existing downstream actions initiated from the dialog (commit, stash, discard, and any other currently supported entry points) MUST continue to operate on exactly the set of files the user has selected, unchanged by the new presentation.
- **FR-010**: The dialog MUST preserve the existing visual separation between the staged and unstaged sections (including their section headers and any collapse/expand behavior) while delegating the rendering of the file entries inside each section to the shared component.
- **FR-011**: When only one of the two sections (staged or unstaged) has entries to show, that section's title bar MUST still display the view-mode toggle and it MUST still govern the section and update the shared view mode state.
- **FR-012**: In tree view, clicking a folder checkbox MUST toggle the selection of all descendant files within that folder. Folder checkboxes MUST display a tri-state indicator: unchecked when no descendants are selected, fully checked when all descendants are selected, and partially checked when some but not all descendants are selected.

### Key Entities

- **Uncommitted File Entry**: A single working-tree change with a path, a change status (added, modified, deleted, renamed, copied, unmerged, untracked), and — when applicable — counts of lines added and lines deleted. Belongs to either the "staged" or "unstaged" bucket in the dialog.
- **File View Mode Preference**: A single shared user preference representing how file lists are presented ("list" or "tree"). Used by both the commit details panel and the file picker dialog, and persisted across sessions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of file rows shown in the file picker dialog render with the same status badge and the same added/deleted line indicators as the commit details panel would show for the same working-tree file, verified across staged, unstaged, binary, renamed, and deleted cases.
- **SC-002**: Each visible section in the file picker dialog has exactly one view-mode toggle in its title bar, and all toggles always display the same current mode — verified with both sections shown, only staged shown, and only unstaged shown.
- **SC-003**: After a user changes the view mode in either the commit details panel or the file picker dialog, the other surface reflects the new view mode the very next time it is opened — the propagation delay, measured in user-visible interactions, is **0** extra steps.
- **SC-004**: Opening the file picker dialog on a repository with up to several hundred uncommitted files feels at least as responsive as it does today; users do not report a perceived slowdown versus the previous dialog implementation.
- **SC-005**: In usability review, users correctly identify the file picker dialog's file list as "the same" as the commit details panel's file list without being prompted, confirming the consistency goal.
- **SC-006**: Zero regressions are reported in downstream actions (commit, stash, discard) as a result of this change — the set of files acted on always equals the set the user explicitly selected.

## Clarifications

### Session 2026-04-12

- Q: In tree view, when a user clicks a folder checkbox, should it cascade select/deselect all descendants? → A: Yes — clicking a folder toggles all descendant file checkboxes; folder shows tri-state indicator (empty / partial / full) based on children's selection state.
- Q: Should file action icons (open diff, open file) from the commit details panel be shown in the dialog rows? → A: No — hide action icons in the dialog; show only the status badge, file path, and +/- line counts.
- Q: Where should the view-mode toggle appear when only one section exists? → A: Toggle buttons appear on both the staged and unstaged section title bars. Both control the same shared view mode state, affecting all sections in the dialog and the commit details panel.

## Assumptions

- The commit details panel's existing file list rendering (row component, status badge, added/deleted indicator, list view, tree view) is the authoritative presentation and can be reused without behavioral changes to the panel itself.
- The existing persistence mechanism the commit details panel already uses for its view-mode preference is the correct place to store the shared preference; no new persisted setting is introduced.
- The staged and unstaged sections already exist in the dialog and continue to be the right way to group selectable uncommitted changes; this feature does not change how they are grouped, only how each file inside them is rendered.
- Per-file added and deleted line counts for working-tree changes are already available (or obtainable through the same path used by the commit details panel) and do not require a new backend capability.
- The file picker dialog's selection, confirm, and cancel flows remain unchanged; only the inner file list presentation and the view-mode toggle are in scope.
- Checkbox-style selection remains the interaction model for selecting files in both list and tree views inside the dialog. In tree view, folder nodes have cascading select/deselect with a tri-state checkbox indicator.

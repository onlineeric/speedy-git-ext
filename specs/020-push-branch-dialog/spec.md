# Feature Specification: Push Branch Dialog

**Feature Branch**: `020-push-branch-dialog`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "Improve current push branch feature with a parameter dialog including set-upstream checkbox, push mode radio buttons, and a live command preview with copy functionality."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Push Branch with Default Options (Priority: P1)

A developer right-clicks on a local branch badge in the git graph and selects "Push Branch" from the context menu. A dialog appears showing push options pre-filled with sensible defaults. The developer reviews the options, sees the constructed git command at the bottom, and clicks "Execute" to push the branch.

**Why this priority**: This is the core workflow — pushing a branch with visible, configurable options. It replaces the current silent push action with a transparent, developer-friendly dialog that shows exactly what git command will run.

**Independent Test**: Can be fully tested by right-clicking any local branch badge → selecting "Push Branch" → verifying the dialog opens with correct defaults → clicking "Execute" and confirming the push succeeds.

**Acceptance Scenarios**:

1. **Given** the git graph is displayed with local branches, **When** a developer right-clicks a local branch badge and selects "Push Branch", **Then** a push dialog opens with the branch name displayed and default options pre-selected.
2. **Given** the push dialog is open with default options, **When** the developer clicks "Execute", **Then** the branch is pushed to the remote using the displayed command and a success notification appears.
3. **Given** the push dialog is open, **When** the developer views the bottom of the dialog, **Then** a read-only text field displays the fully constructed `git push` command reflecting the current option selections.

---

### User Story 2 - Configure Push Options Before Pushing (Priority: P1)

A developer opens the push dialog and configures the push options before executing. They can toggle the `--set-upstream / -u` checkbox (checked by default) and select a push mode from "Normal", `--force-with-lease`, or `--force` (Normal by default). The command preview updates in real time as options change.

**Why this priority**: Configurable options are the primary value proposition of this feature. Without them, the dialog adds no value over the current direct-push behavior.

**Independent Test**: Can be fully tested by opening the push dialog → toggling the set-upstream checkbox → changing push mode → verifying the command preview updates correctly for each combination.

**Acceptance Scenarios**:

1. **Given** the push dialog is open, **When** the developer unchecks the `--set-upstream / -u` checkbox, **Then** the `-u` flag is removed from the command preview.
2. **Given** the push dialog is open, **When** the developer selects `--force-with-lease` push mode, **Then** the command preview includes `--force-with-lease`.
3. **Given** the push dialog is open, **When** the developer selects `--force` push mode, **Then** the command preview includes `--force`.
4. **Given** the push dialog is open with `--set-upstream / -u` checked and push mode set to `--force-with-lease`, **When** the developer views the command preview, **Then** the preview shows both `-u` and `--force-with-lease` flags in the constructed command.

---

### User Story 3 - Copy Command and Cancel (Priority: P2)

A developer opens the push dialog, configures the desired options, then copies the constructed git command using the copy button. They cancel the dialog and paste the command into their own terminal to execute it manually.

**Why this priority**: This is a developer-friendly convenience feature that provides transparency and control. Some developers prefer to run commands in their own terminal for additional control or scripting.

**Independent Test**: Can be fully tested by opening the push dialog → configuring options → clicking the copy button → canceling the dialog → pasting and verifying the copied command matches what was displayed.

**Acceptance Scenarios**:

1. **Given** the push dialog is open with options configured, **When** the developer clicks the copy button next to the command preview, **Then** the full git push command is copied to the system clipboard.
2. **Given** the developer has copied the command, **When** they click "Cancel", **Then** the dialog closes without executing the push and no git operation is performed.
3. **Given** the developer copies the command, **When** they paste it into a terminal, **Then** the pasted text matches the command shown in the dialog exactly.

---

### User Story 4 - Consistent Push Workflow Across Entry Points (Priority: P2)

Any location in the extension that triggers a push branch action opens the same push dialog with the same options and behavior, ensuring a consistent user experience regardless of where the push was initiated.

**Why this priority**: Consistency prevents confusion. If push is available from multiple locations, each entry point should provide the same dialog and workflow.

**Independent Test**: Can be tested by triggering push from each available entry point and verifying the same dialog appears with the same options and behavior.

**Acceptance Scenarios**:

1. **Given** push branch is available from the branch badge context menu, **When** the developer selects "Push Branch", **Then** the push dialog opens with the same layout and defaults as from any other entry point.
2. **Given** a new entry point for push is added in the future, **When** it triggers the push workflow, **Then** it reuses the same push dialog without duplicating dialog logic.

---

### Edge Cases

- What happens when the push fails (e.g., remote rejects the push)? The dialog should close and an error notification should display the failure reason from git.
- What happens when there is no configured remote for the repository? The push dialog should still open with an empty remote dropdown. If no remote exists, the Execute button should be disabled and a message should indicate no remotes are configured.
- What happens when the repository has only one remote? The remote dropdown is pre-selected with that remote and still editable (in case the developer wants to confirm).
- What happens when the branch name contains special characters? The command preview should display the branch name as-is, and the push command should handle it correctly.
- What happens when the user selects `--force` or `--force-with-lease` mode? A sharp, yellow warning message is displayed on the dialog and the Execute button/push mode area shows a visual warning cue. No additional confirmation step is required — the developer has explicitly chosen this mode, can see the exact command, and the warning provides sufficient visibility.
- What happens when the developer opens the dialog but the branch has already been deleted locally? The push should fail gracefully with an appropriate error message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a push dialog when the developer selects "Push Branch" from a local branch badge context menu.
- **FR-002**: The push dialog MUST include a checkbox labeled `--set-upstream / -u` that is checked by default.
- **FR-003**: The push dialog MUST include a radio button group labeled "Push mode:" with three options: "Normal", `--force-with-lease`, and `--force`, with "Normal" selected by default.
- **FR-004**: The push dialog MUST display a read-only, selectable text field at the bottom showing the fully constructed git push command based on current option selections.
- **FR-005**: The command preview MUST update in real time as the developer changes any option in the dialog.
- **FR-006**: The push dialog MUST include a copy button adjacent to the command preview that copies the command text to the system clipboard.
- **FR-007**: The push dialog MUST include an "Execute" button that runs the displayed git push command.
- **FR-008**: The push dialog MUST include a "Cancel" button that closes the dialog without performing any git operation.
- **FR-009**: All option labels MUST use the actual git parameter text (e.g., `--set-upstream / -u`, `--force-with-lease`, `--force`) rather than friendly names, to be developer-friendly.
- **FR-010**: All locations in the extension that trigger a push branch action MUST open the same push dialog with the same options and behavior.
- **FR-011**: After a successful push execution, the system MUST display a success notification and refresh the git graph data.
- **FR-012**: After a failed push execution, the system MUST display an error notification with the failure reason from git.
- **FR-013**: The push dialog MUST only be available for local branches (not remote-tracking branches or tags).
- **FR-014**: While a push is in progress, the dialog MUST remain open with a loading indicator and all interactive elements (buttons, checkboxes, radio buttons) MUST be disabled until the operation completes.
- **FR-015**: After the push operation completes (success or failure), the dialog MUST close automatically and display the result as a toast notification.
- **FR-016**: When `--force-with-lease` or `--force` push mode is selected, the dialog MUST display a sharp, yellow warning message on the dialog body and apply a visual warning cue to the Execute button and push mode area.
- **FR-017**: When push mode is changed back to "Normal", the warning message and visual cues MUST be removed immediately.
- **FR-018**: The push dialog MUST include a remote dropdown selector, defaulting to "origin", populated from the repository's configured remotes.
- **FR-019**: The command preview MUST always include the explicit remote name and branch name (e.g., `git push -u origin my-branch`), regardless of whether they match defaults, for full transparency and portability.
- **FR-020**: The push dialog title MUST display the branch name being pushed (e.g., "Push Branch: `my-branch`") for immediate context.

### Key Entities

- **Push Options**: The set of parameters the developer configures before pushing — includes set-upstream toggle, push mode selection, target remote, and branch name.
- **Command Preview**: A read-only representation of the fully constructed git push command, dynamically built from the current push options.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can push a branch with custom options in under 5 seconds from right-clicking the branch badge to clicking "Execute".
- **SC-002**: The command preview accurately reflects the selected options 100% of the time — every option change is immediately visible in the preview.
- **SC-003**: Developers can copy the constructed command and successfully execute it in an external terminal with identical results to clicking "Execute".
- **SC-004**: All entry points for push branch open the identical dialog, with zero behavioral differences between entry points.

## Clarifications

### Session 2026-03-24

- Q: What should the dialog do while the push operation is in progress? → A: Keep the dialog open with a loading indicator (disabled buttons) until the push completes, then close.
- Q: Should the dialog provide visual differentiation when a force push mode is selected? → A: Yes — display a visual cue on the Execute button/push mode area AND a sharp, yellow color warning message on the dialog when `--force` or `--force-with-lease` is selected.
- Q: Should the dialog include a remote selector for multi-remote repositories? → A: Yes — include a remote dropdown defaulting to "origin", populated from the repository's configured remotes.
- Q: Should the command preview always include explicit remote and branch name? → A: Yes — always include both (e.g., `git push -u origin my-branch`) for full transparency and portability.
- Q: Should the dialog title display the branch name? → A: Yes — use a title like "Push Branch: `my-branch`" for immediate context.

## Assumptions

- The default remote for push operations is "origin". The dialog includes a remote dropdown populated from configured remotes, allowing developers to select a different remote when multiple are available.
- The push dialog is a modal dialog that blocks interaction with the main graph view until dismissed.
- The command preview uses the short form `-u` in the constructed command (matching common developer usage) when `--set-upstream / -u` is checked.
- "Normal" push mode means no force-related flags are added to the command.
- The copy button provides visual feedback (e.g., briefly changing to a checkmark or "Copied!") to confirm the copy action succeeded.

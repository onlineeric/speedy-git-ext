# Feature Specification: Uncommitted Node UX Polish

**Feature Branch**: `038-uncommitted-node-ux`
**Created**: 2026-04-11
**Status**: Draft
**Input**: User description: "read @specs/038-uncommitted-node-enh-idea.md"

## Clarifications

### Session 2026-04-11

- Q: How should a single file path that has BOTH staged and unstaged changes (e.g., staged then re-edited) be counted and categorized in the "Select files for…" dialog? → A: Count it as both — +1 to the unstaged count AND +1 to the staged count; selecting one such file alone qualifies as "mixed" so all four radios enable.
- Q: What should the "Select files for…" dialog do when a git action fails partway through (e.g., add-then-stash where add succeeds but stash fails)? → A: Dialog stays open, file selection preserved, inline error banner at the top shows the git error message; for add-then-stash, the banner explicitly names which step failed and what state the working tree is now in. User can retry or close.
- Q: What should the dialog do after a successful action completes? → A: Stay open, refresh the file list to reflect post-action state, **preserve the user's file selection** (pruning only paths that no longer exist in the refreshed list) so they can immediately run another action on the same set, and re-evaluate the radio group per the standard enable rules (the sticky default rule will flip the selected radio when appropriate — e.g. after Stage it flips to Unstage so the user can undo in one click).
- Q: What does the Stash command preview show when the selection includes untracked files (the add-then-stash multi-step case)? → A: Show both commands joined with `&&` on a single line, e.g. `git add -- <paths> && git stash push -m "<msg>" -- <paths>`. When the selection has no untracked files, only the single `git stash push` line is shown. The copy button copies the exact string displayed.
- Q: What does the new action button show while the git command is actually executing? → A: Busy + disable pattern. The action button shows a busy indicator, the action button / file-list checkboxes / radio group are all disabled, and the Close button remains enabled (dismissing closes the dialog but does NOT cancel the running git command).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Overhauled "Select files for…" dialog with action radio group (Priority: P1)

A developer opens the "Select files for…" dialog from the uncommitted node, picks a subset of changed files, and then chooses a single action — Stage, Unstage, Discard, or Stash with message — from a clearly labeled radio group. The developer can see exactly which git command will run for each action before committing to it, and the action button shows how many files will actually be affected.

**Why this priority**: This is the most impactful UX change in the feature. The current dialog forces users to scan multiple action buttons whose applicability depends on the current selection, which is confusing when the selection mixes staged and unstaged files. A single radio group with live command previews and live affected-file counts makes the outcome unambiguous before the user clicks, and folds in a previously missing capability (stash with message) that users want for partial stashes.

**Independent Test**: Can be fully tested by opening the dialog on a working tree that has a mix of unstaged, staged, untracked, and renamed files, selecting different file subsets, switching between the four radios, and verifying that the action button label/count, the command previews, the radio enable/disable states, and the default selection all behave as described — without any of the other stories in this feature being present.

**Acceptance Scenarios**:

1. **Given** no files are selected in the dialog, **When** the user opens the dialog, **Then** all four radios are disabled, no radio is selected, and the action button is hidden (only the Close button is shown).
2. **Given** only unstaged files are selected, **When** the user views the radio group, **Then** Stage, Discard, and Stash are enabled, Unstage is disabled, and Stage is selected by default.
3. **Given** only staged files are selected, **When** the user views the radio group, **Then** Unstage and Stash are enabled, Stage and Discard are disabled, and Unstage is selected by default.
4. **Given** a mixed selection of 2 unstaged and 3 staged files, **When** the user cycles through the radios, **Then** the action button label updates to `Stage (2)`, `Unstage (3)`, `Discard (2)`, and `Stash (5)` respectively.
5. **Given** the Stash radio is not currently selected, **When** the user clicks the disabled stash message input field, **Then** the Stash radio is automatically selected and the text field becomes editable and focused.
6. **Given** the user has selected the Stash radio and left the message empty, **When** the user confirms the action, **Then** the stash is created with an auto-generated message in the format `Stash of <N> files from <branch>`.
7. **Given** any row in the radio group (including disabled rows), **When** the user views the dialog, **Then** every row shows its git command preview (disabled rows are greyed out), but only the selected row shows a copy-to-clipboard button next to its preview.
8. **Given** the user has selected the Discard radio with N files (of which M are untracked), **When** the user clicks the action button, **Then** a confirmation dialog appears whose text reflects both N and M, and the action only proceeds after explicit confirmation.

---

### User Story 2 - "Stash Everything…" rename with confirmation dialog (Priority: P2)

A developer right-clicks the uncommitted node and sees the menu item labeled "Stash Everything…" (with an ellipsis) instead of "Stash All Changes". Clicking it opens a confirmation dialog where the developer can optionally type a stash message and then confirm or cancel. The new label no longer visually collides with "Stage All Changes", and the confirmation step prevents accidental stashing of the entire working tree.

**Why this priority**: Prevents real data-loss-feeling accidents (users reported confusing "Stash All Changes" with "Stage All Changes" and clicking the wrong one), and the confirmation step gives a safe exit if they do misclick. High user value for a small surface-area change, but gated below P1 because it affects only one menu entry rather than an entire workflow.

**Independent Test**: Can be verified by right-clicking the uncommitted node, confirming the new label appears with an ellipsis, clicking it, confirming the dialog appears with a message input and Stash/Cancel buttons, and checking that Cancel aborts the stash while Stash performs it — all without the file picker overhaul or the details panel changes being in place.

**Acceptance Scenarios**:

1. **Given** the user right-clicks on the uncommitted node, **When** the context menu opens, **Then** the menu item that stashes everything is labeled "Stash Everything…" (with trailing ellipsis) and is visually distinct from any "Stage" menu items.
2. **Given** the user clicks "Stash Everything…", **When** the dialog appears, **Then** it shows a title identifying the stash-everything action, an optional message input, a git command preview, a Cancel button, and a Stash button.
3. **Given** the confirmation dialog is open, **When** the user clicks Cancel, **Then** no stash is created and the working tree is unchanged.
4. **Given** the confirmation dialog is open and the user types a message, **When** the user clicks Stash, **Then** the entire working tree is stashed with the provided message.

---

### User Story 3 - Always-visible Stage / Unstage arrow on uncommitted node file rows (Priority: P3)

When browsing the commit details panel for the uncommitted node, a developer sees the Stage / Unstage arrow button next to each file permanently, without having to hover over the row. Other action icons (Copy path, Open file, Open current version) still appear only on hover, so the row stays visually calm but the primary action is always one click away.

**Why this priority**: Staging and unstaging are the most frequent actions on uncommitted files, so requiring a hover before the button appears adds friction to the most common workflow. Lower priority than P1/P2 because the action is still reachable today — this is a pure ergonomics improvement, not a correctness or safety fix.

**Independent Test**: Can be verified by opening the commit details panel for the uncommitted node and confirming that the stage/unstage arrow is visible on every file row without hovering, while the copy-path and open-file icons remain hover-only; and by opening the panel for a regular commit and confirming nothing has changed there.

**Acceptance Scenarios**:

1. **Given** the uncommitted node is selected, **When** the details panel renders the file list, **Then** the Stage / Unstage arrow is visible on every file row regardless of hover state.
2. **Given** the uncommitted node is selected and the mouse is not over any row, **When** the user looks at any file row, **Then** the Copy path, Open file, and Open current version icons are hidden (hover-only behavior preserved).
3. **Given** a regular commit (non-uncommitted) is selected, **When** the details panel renders, **Then** file-row icon behavior is unchanged from the current implementation.

---

### User Story 4 - Remove redundant "Open file at this commit" from uncommitted node rows (Priority: P4)

When viewing the uncommitted node's file rows, the developer no longer sees the "Open file at this commit" icon, because for the uncommitted node it behaves identically to "Open current version". The button is still present on every other commit in history.

**Why this priority**: Pure visual cleanup for the uncommitted node — no functional loss, just a redundant button removed. Lowest priority because current behavior is already correct; this only reduces clutter.

**Independent Test**: Can be verified by opening the commit details panel on the uncommitted node and confirming the "Open file at this commit" icon is absent from every file row, while the same button is still present when viewing any normal commit.

**Acceptance Scenarios**:

1. **Given** the uncommitted node is selected, **When** the user views any file row, **Then** the "Open file at this commit" icon is not rendered.
2. **Given** a regular commit is selected, **When** the user views any file row, **Then** the "Open file at this commit" icon is present and functional.

---

### Edge Cases

- **Untracked files in a selective stash**: Selecting untracked files together with modified files in the file picker dialog and running Stash MUST result in the untracked files being included in the stash alongside the modified ones. Untracked files are not silently dropped.
- **Renamed files in a selective stash**: When any renamed file exists in the uncommitted set, the Stash row in the dialog MUST display an always-visible inline note explaining that renamed files are stashed as a pair and cannot be partially selected. Running the Stash action MUST include all renamed files in the stash even when they were not explicitly selected in the upper list, so the stash entry is never left in a broken half-rename state.
- **No files selected**: If the upper file-selection section has nothing selected, all four radios are disabled, no radio is pre-selected, and the single action button is hidden entirely (only Close remains).
- **Discarding untracked files**: When the Discard action targets untracked files, the confirmation message MUST explicitly call out that untracked files will be permanently deleted in addition to the regular "cannot be undone" warning, so the user can distinguish this irreversible case from a normal discard.
- **Empty stash message**: When the user confirms a Stash action with an empty message, the system MUST auto-generate a message in the format `Stash of <N> files from <branch>` so the stash is still identifiable in the stash list.
- **Click on disabled stash message field**: If the user clicks the text input while the Stash radio is not selected (and thus the field is disabled), the Stash radio MUST auto-select and the field MUST become editable, so the click is never a dead-end interaction.
- **"Stash Everything…" cancel**: Cancelling the new confirmation dialog MUST leave the working tree untouched — no partial stash, no side effects.

## Requirements *(mandatory)*

### Functional Requirements

#### "Stash Everything…" menu item and dialog

- **FR-001**: The uncommitted node's right-click menu MUST display the stash-everything action with the label "Stash Everything…" (including a trailing ellipsis), replacing the previous label.
- **FR-002**: Activating "Stash Everything…" MUST open a confirmation dialog that shows a clear title, an optional stash-message text input, a preview of the git command that will be run, a Cancel button, and a Stash action button.
- **FR-003**: The confirmation dialog MUST NOT stash anything until the user explicitly clicks the Stash action button; clicking Cancel or dismissing the dialog MUST leave the working tree unchanged.

#### Uncommitted-node details-panel polish

- **FR-004**: For the uncommitted node only, the Stage / Unstage arrow button on each file row MUST be visible at all times, not only on row hover.
- **FR-005**: For the uncommitted node only, the "Open file at this commit" icon MUST be omitted from every file row. All other commits MUST retain this icon with its existing behavior.
- **FR-006**: All other per-row action icons on the uncommitted node (Copy path, Open file, Open current version) MUST remain hover-only.
- **FR-007**: File-row interactions on regular (non-uncommitted) commits MUST be unchanged by this feature.

#### "Select files for…" dialog — layout replacement

- **FR-008**: The action-buttons section of the "Select files for…" dialog MUST be replaced with a radio group containing exactly four options, each on its own row: Stage, Unstage, Discard, and Stash with message.
- **FR-009**: The Stash with message option MUST occupy two visual lines: the radio and label on the first line, and a stash-message text input on the second line.
- **FR-010**: The dialog MUST show a single action button whose label and behavior change based on the currently selected radio, plus a Close button.

#### Radio group enable/disable rules

- **FR-011**: When no files are selected, all four radios MUST be disabled and no radio MUST be selected.
- **FR-012**: When only unstaged files are selected, Unstage MUST be disabled and Stage, Discard, and Stash MUST be enabled.
- **FR-013**: When only staged files are selected, Stage and Discard MUST be disabled and Unstage and Stash MUST be enabled.
- **FR-014**: When a mix of staged and unstaged files is selected, all four radios MUST be enabled.
- **FR-015**: The Stash radio MUST be enabled whenever at least one file is selected, regardless of staged/unstaged mix.
- **FR-015a**: A file path that has both staged and unstaged changes on the same path (i.e., staged content plus additional working-tree edits) MUST be counted as contributing to both the staged side and the unstaged side. For radio enable/disable purposes such a dual-state file, selected alone, MUST qualify as a "mixed" selection and enable all four radios.

#### Default radio selection

- **FR-016**: Whenever Stage is enabled, it MUST be the default selected radio on selection change.
- **FR-017**: When Stage is disabled but Unstage is enabled, Unstage MUST be the default selected radio.
- **FR-018**: When no files are selected, no radio MUST be pre-selected.

#### Action button label, count, and visibility

- **FR-019**: The action button label MUST follow the pattern `<ActionName> (<count>)` where the count is the number of files the currently selected action will actually affect.
- **FR-020**: For Stage, the count MUST equal the number of selected files that have an unstaged side (a dual-state file contributes 1).
- **FR-021**: For Unstage, the count MUST equal the number of selected files that have a staged side (a dual-state file contributes 1).
- **FR-022**: For Discard, the count MUST equal the number of selected files that have an unstaged side (a dual-state file contributes 1; Discard only affects the unstaged side per git semantics).
- **FR-023**: For Stash, the count MUST equal the total number of distinct selected paths (a dual-state file contributes 1, since stash captures both sides of the path into a single stash entry).
- **FR-024**: The action button MUST be hidden when no radio is selected (i.e., when no files are selected). Only the Close button MUST be visible in that state.

#### Command preview and copy button

- **FR-025**: Every radio row — enabled or disabled, selected or unselected — MUST display a developer-readable preview of the git command that action would run.
- **FR-026**: Command previews on disabled radio rows MUST be rendered in a greyed-out visual style to reinforce that the action is not currently available.
- **FR-027**: A copy-to-clipboard button for the command preview MUST be shown only on the currently selected radio row, not on any other row.
- **FR-028**: When any radio label already identifies the command, the command preview MUST omit the redundant "Command preview:" lead-in label so the row stays compact.
- **FR-028a**: When the Stash action's selection includes at least one untracked file, the Stash row's command preview MUST display both steps of the add-then-stash flow joined with `&&` on a single line, e.g. `git add -- <paths> && git stash push -m "<msg>" -- <paths>`, so the preview matches exactly what will be executed.
- **FR-028b**: When the Stash action's selection contains no untracked files, the Stash row's command preview MUST display only the single `git stash push` line with no `git add` prefix.
- **FR-028c**: The copy-to-clipboard button on the Stash row MUST copy the exact string shown in the preview (including the `&&`-joined form when untracked files are present), so a user pasting into a terminal reproduces what the dialog executed.

#### Stash message input behavior

- **FR-029**: The stash message text input MUST be disabled whenever the Stash radio is not the currently selected radio.
- **FR-030**: Clicking the disabled stash message text input MUST automatically select the Stash radio and enable the field for editing.
- **FR-031**: The stash message MUST be optional; an empty message MUST NOT block the Stash action.
- **FR-032**: When the user confirms a Stash action with an empty message, the system MUST auto-generate a stash message in the format `Stash of <N> files from <branch>`, where `<N>` is the number of files being stashed and `<branch>` is the current branch name.

#### Stash behavior for special file types

- **FR-033**: When the Stash action is run on a selection that includes untracked files, the untracked files MUST end up inside the resulting stash entry alongside the modified files (they MUST NOT be silently dropped).
- **FR-034**: When any renamed file exists in the uncommitted set, the Stash row MUST display a persistent inline informational note explaining that renamed files are stashed as a pair and cannot be partially selected.
- **FR-035**: When the Stash action is executed and any renamed files exist in the uncommitted set, all renamed files MUST be included in the stash entry even if the user did not explicitly select them in the upper file list, so the stash is never left in a broken half-rename state.

#### In-flight action state

- **FR-I01**: While a git action invoked from the "Select files for…" dialog is executing, the action button MUST display a busy indicator (e.g., a spinner or "Working…" label) so the click is visibly acknowledged.
- **FR-I02**: While the action is executing, the action button, the upper file-list checkboxes, and the radio group MUST all be disabled so the user cannot change inputs under a running command.
- **FR-I03**: While the action is executing, the Close button MUST remain enabled. Clicking Close closes the dialog but MUST NOT attempt to cancel the already-running git command.
- **FR-I04**: When the executing command completes (success or failure), the dialog MUST lift the busy state and apply either the post-action refresh (FR-P01/FR-P02) or the failure banner behavior (FR-F01 through FR-F04), depending on the outcome.

#### Post-action dialog state

- **FR-P01**: On successful completion of any action from the "Select files for…" dialog, the dialog MUST remain open (preserving the existing dialog behavior rather than introducing auto-close).
- **FR-P02**: On successful completion, the upper file list MUST refresh to reflect the new working-tree state, the user's prior file selection MUST be preserved (so they can run another action on the same set without re-selecting), and the radio group MUST re-evaluate its enable/disable state and default selection per FR-011 through FR-018 against the refreshed state. Selected paths that no longer exist in the refreshed list (e.g. untracked files after a Discard, or all files after a Stash) MUST be silently pruned from the selection so counts and checkboxes stay aligned with the new working-tree state. The stash message text input MUST be cleared on success because it belonged to the completed stash.

#### Action failure handling

- **FR-F01**: When any action (Stage, Unstage, Discard, Stash) invoked from the "Select files for…" dialog fails, the dialog MUST remain open with the user's file selection and radio choice preserved.
- **FR-F02**: On action failure, the dialog MUST display an inline error banner at the top containing the git error message returned by the failing command.
- **FR-F03**: When the add-then-stash flow (used for selective stashes that include untracked files) fails, the inline error banner MUST explicitly identify which step failed (the `git add` step or the `git stash push` step) and describe the resulting working-tree state so the user understands what changed before the failure.
- **FR-F04**: The dialog MUST NOT attempt automatic rollback of partial state changes on failure; reporting the actual current state is preferred over speculative recovery that could itself fail.

#### Discard confirmation dialog

- **FR-036**: Running the Discard action from the "Select files for…" dialog MUST present a confirmation dialog before any files are modified.
- **FR-037**: The discard confirmation dialog title MUST reflect that the discard is scoped to the selected files (e.g., "Discard Selected Changes") rather than reusing a title that implies all unstaged changes are being discarded.
- **FR-038**: The discard confirmation dialog description MUST state the number of files that will be discarded, and MUST additionally call out the count of untracked files that will be permanently deleted when any are included.
- **FR-039**: The discard confirmation action button MUST show the count of files in the form `Discard (N)`.
- **FR-040**: The existing behavior and wording of the whole-uncommitted-set Discard confirmation MUST remain unchanged as the default when no overrides are supplied.

### Key Entities *(include if feature involves data)*

- **Uncommitted file entry**: Represents a single file in the uncommitted working set. Key attributes relevant to this feature: staged/unstaged status, untracked flag, renamed flag, and file path. Drives radio enable/disable rules and action counts.
- **Action radio option**: Represents one of the four selectable actions in the new dialog (Stage, Unstage, Discard, Stash with message). Attributes: label, enabled/disabled state, command preview text, count of affected files, and (for Stash only) an associated optional stash-message input.
- **Stash confirmation intent**: Represents a user's in-progress decision to stash everything or to stash a selected subset. Attributes: optional stash message, target scope (everything vs selected subset), and the set of files that will ultimately be included (including any renamed files auto-added, and any untracked files auto-added via add-then-stash).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability testing, zero participants confuse "Stash Everything…" with "Stage All Changes" in the uncommitted node's right-click menu, eliminating the misclick confusion reported against the previous "Stash All Changes" label.
- **SC-002**: A user who opens the "Select files for…" dialog can identify which action will run, how many files it will touch, and the exact git command it will execute without having to click any button, 100% of the time — all three pieces of information are visible before commit.
- **SC-003**: When a user selects a mixed set of staged and unstaged files and wants to stash a subset, they can complete the stash in one dialog open without hitting a dead-end or needing to re-select files, in 100% of attempts.
- **SC-004**: Selective stashes that include untracked files result in those untracked files being present in the resulting stash entry in 100% of cases (no silent drops).
- **SC-005**: Selective stashes that involve renamed files never produce a broken half-rename stash entry — 0% failure rate on apply for stashes generated through this dialog.
- **SC-006**: On the uncommitted node, the number of mouse movements required to stage or unstage a file from the details panel drops from two (hover, then click) to one (click), measured as a 50% reduction in pointer travel for the most common file action.
- **SC-007**: Accidental whole-working-tree stashes from the uncommitted node drop to zero reports after the confirmation dialog is introduced, since no stash occurs without an explicit confirm click.
- **SC-008**: The "Open file at this commit" icon no longer appears on any uncommitted-node file row (0 occurrences) while remaining present on 100% of regular commits.

## Assumptions

- The existing `StashDialog` component provides the layout needed for the new "Stash Everything…" confirmation dialog, and only its title needs updating — no new dialog is introduced for that flow.
- The existing `DiscardAllDialog` component can be parameterized with optional title, description, and confirm-label overrides so a single dialog component serves both the whole-uncommitted-set discard flow and the new per-file-selection discard flow, preserving current wording as the default.
- The existing `CommandPreview` component can be extended with two optional flags to hide the copy button and hide the "Command preview:" lead-in label, avoiding a duplicate component for the new dialog.
- The auto-generated default stash message format `Stash of <N> files from <branch>` is acceptable in user-facing stash lists and does not need localization for this feature.
- The uncommitted-node special casing for the details panel (always-on stage arrow, omitted "Open file at this commit") can be gated on an existing uncommitted-node sentinel already known to the file-row renderer, without adding a new mode concept.
- Renamed files in the uncommitted set are rare enough in practice that auto-including them in every selective stash (rather than offering a more granular option) is an acceptable trade-off for avoiding broken stash entries.

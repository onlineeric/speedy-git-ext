# Feature Specification: UI Enhancements for Merge Dialog and Inline Code Rendering

**Feature Branch**: `027-ui-enhancements-merge-inline`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "Add inline code rendering for commit messages, add --squash option to merge dialog, and update merge option labels to show git flags with inline code styling"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inline Code in Commit Messages (Priority: P1)

As a developer viewing commit history, I want backtick-delimited text in commit messages (e.g., `functionName`) to render with a visually distinct inline code style (light grey background, no backtick characters displayed), so that code references in commit messages are easy to identify at a glance.

**Why this priority**: Commit messages are the most frequently viewed text in the extension. Inline code references appear in many commit messages and improving their readability benefits all users across the entire UI.

**Independent Test**: Can be fully tested by creating commits with backtick-wrapped text and verifying they render with grey background styling in both the commit list and commit details panel.

**Acceptance Scenarios**:

1. **Given** a commit message containing `` `exampleCode` ``, **When** the commit is displayed in the commit list, **Then** "exampleCode" renders without backtick characters and with a light grey background highlight.
2. **Given** a commit message containing `` `exampleCode` ``, **When** the commit details panel is open showing the commit subject, **Then** "exampleCode" renders without backtick characters and with a light grey background highlight.
3. **Given** a commit message body containing `` `exampleCode` ``, **When** the commit details panel is open showing the commit body, **Then** "exampleCode" renders without backtick characters and with a light grey background highlight.
4. **Given** a commit message with no backtick-delimited text, **When** displayed anywhere in the UI, **Then** the message renders exactly as it does today with no changes.
5. **Given** a commit message with multiple inline code segments like `` `foo` `` and `` `bar` ``, **When** displayed, **Then** each segment renders independently with its own inline code styling.

---

### User Story 2 - Add --squash Option to Merge Dialog (Priority: P1)

As a developer performing a merge, I want a --squash checkbox option in the merge dialog so that I can combine all changes from the target branch into a single change on the current branch without creating a merge commit.

**Why this priority**: The --squash option is a commonly used git merge strategy. The command builder already supports it, so exposing it in the UI completes the feature set and delivers immediate value.

**Independent Test**: Can be fully tested by opening the merge dialog, toggling the --squash checkbox, and verifying the command preview updates to include `--squash` and the merge executes with the squash flag.

**Acceptance Scenarios**:

1. **Given** the merge dialog is open, **When** I look at the options, **Then** I see a --squash checkbox as the first option (above --no-commit and --no-ff) with the label: "--squash: combines all changes from the target branch into a single change on the current branch without creating a merge commit."
2. **Given** the merge dialog is open and --squash is unchecked, **When** I check --squash, **Then** the command preview updates to include `--squash` in the git merge command.
3. **Given** --squash is checked, **When** I also check --no-commit, **Then** the command preview shows both `--squash` and `--no-commit` flags.
4. **Given** --squash is unchecked, **When** I confirm the merge, **Then** the merge proceeds without the --squash flag (existing behavior).

---

### User Story 3 - Updated Merge Option Labels with Inline Code Styling (Priority: P2)

As a developer using the merge dialog, I want the option labels to display git flags (--squash, --no-commit, --no-ff) with inline code styling (grey background), so that the git flags are visually distinct from the descriptive text and match familiar documentation formatting.

**Why this priority**: This is a visual polish enhancement that improves readability but does not change functionality. It depends on User Story 2 being implemented (--squash option exists).

**Independent Test**: Can be tested by opening the merge dialog and verifying that the git flag portions of each option label render with inline code styling.

**Acceptance Scenarios**:

1. **Given** the merge dialog is open, **When** I look at the --no-commit option, **Then** the label reads "--no-commit: No commits, stage changes only" with "--no-commit" displayed in inline code style (grey background).
2. **Given** the merge dialog is open, **When** I look at the --no-ff option, **Then** the label reads "--no-ff: Create a new commit even if fast forward is possible" with "--no-ff" displayed in inline code style (grey background).
3. **Given** the merge dialog is open, **When** I look at the --squash option, **Then** the label has "--squash" displayed in inline code style (grey background), followed by the descriptive text.

---

### Edge Cases

- What happens when a commit message contains an unpaired/odd number of backticks (e.g., "Fix the ` character issue")? The unpaired backtick should render as a literal backtick character with no special styling.
- What happens when a commit message contains empty backtick pairs (`` `` ``)? They should be ignored and render as-is (no empty styled span).
- What happens when a commit message contains nested backticks? Standard markdown parsing rules apply: the outermost pair is treated as the delimiter.
- What happens when --squash and --no-ff are both selected? This is a valid git combination; both flags appear in the command preview.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST parse backtick-delimited text in commit message subjects and bodies and render the enclosed text with a light grey background and without the backtick characters.
- **FR-002**: System MUST apply inline code rendering in the commit list (CommitRow), commit details panel subject, and commit details panel body.
- **FR-003**: System MUST leave commit messages without backticks completely unchanged in rendering.
- **FR-004**: System MUST handle unpaired backticks gracefully by rendering them as literal characters.
- **FR-005**: System MUST handle empty backtick pairs (``) by rendering them as two literal backtick characters without creating empty styled elements.
- **FR-006**: System MUST add a --squash checkbox option to the merge dialog, positioned as the first option (above --no-commit and --no-ff). The --squash checkbox operates independently with no coupling behavior on other checkboxes.
- **FR-007**: The --squash option label MUST read: "--squash: combines all changes from the target branch into a single change on the current branch without creating a merge commit."
- **FR-008**: The --squash checkbox MUST update the command preview to include `--squash` when checked, reusing the existing command builder support.
- **FR-009**: System MUST update the --no-commit option label to: "--no-commit: No commits, stage changes only".
- **FR-010**: System MUST update the --no-ff option label to: "--no-ff: Create a new commit even if fast forward is possible".
- **FR-011**: The git flag text (--squash, --no-commit, --no-ff) in merge dialog option labels MUST display with inline code styling (grey background) to be visually distinct from descriptive text.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of commit messages containing backtick-delimited text render with the inline code style (grey background, no backtick characters) across all display locations (commit list, details subject, details body).
- **SC-002**: The --squash option is available in the merge dialog and correctly passes the squash flag to the git merge command when selected.
- **SC-003**: All three merge dialog option labels (--squash, --no-commit, --no-ff) display their respective git flag with inline code styling.
- **SC-004**: Users can visually distinguish git flags from descriptive text in the merge dialog without reading the full label.
- **SC-005**: No regressions in commit message display for messages without backticks.

## Clarifications

### Session 2026-03-30

- Q: When --squash is checked, should it have coupling behavior with other checkboxes? → A: Independent - --squash has no effect on other checkboxes.
- Q: Where should the --squash checkbox appear relative to existing options? → A: First (above --no-commit and --no-ff), matching git merge --help order.

## Assumptions

- The inline code styling for commit messages follows a simple markdown-like approach: match the first backtick with the next backtick to form a pair. No support for double-backtick or triple-backtick code fences is needed in single-line commit subjects.
- The grey background color for inline code will use VSCode theme-aware CSS variables to ensure consistency across light and dark themes.
- The existing `buildMergeCommand()` function already supports `--squash` and does not need modification for command generation.
- The `MergeOptions` type already includes an optional `squash` field and does not need modification.

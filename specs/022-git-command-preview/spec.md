# Feature Specification: Centralize Git Command Preview for All Dialogs

**Feature Branch**: `022-git-command-preview`
**Created**: 2026-03-26
**Status**: Draft
**Input**: Refactor Push dialog git command preview into centralized utility and reusable component, then extend command preview feature to all git dialogs. Developer-friendly feature showing equivalent git command for each operation.

## User Scenarios & Testing

### User Story 1 - Refactored Push Dialog Command Preview (Priority: P1)

As a developer using the Push dialog, the existing command preview feature continues to work identically after being refactored to use shared, centralized components. This is the foundation that all other dialogs will build upon.

**Why this priority**: Refactoring the existing working feature into reusable pieces is the prerequisite for extending it everywhere else. If the refactored Push dialog breaks, the entire feature is compromised.

**Independent Test**: Open the Push dialog, change remote/upstream/force options, verify the command preview updates reactively and the Copy button works.

**Acceptance Scenarios**:

1. **Given** the Push dialog is open, **When** the user changes any option (remote, set-upstream, force mode), **Then** the command preview updates immediately to reflect the new options
2. **Given** the Push dialog shows a command preview, **When** the user clicks Copy, **Then** the command is copied to clipboard and the button shows brief "Copied!" feedback
3. **Given** the Push dialog is refactored, **When** compared to the previous version, **Then** the visual appearance, behavior, and command output are identical

---

### User Story 2 - Command Preview in Merge and Cherry-Pick Dialogs (Priority: P1)

As a developer about to merge a branch or cherry-pick commits, I want to see the equivalent git command so I understand exactly what options and flags will be applied.

**Why this priority**: Merge and cherry-pick are frequently used git operations with options that significantly affect the resulting history. Both dialogs already have multiple user-configurable options that directly map to git flags.

**Independent Test**: Open each dialog, toggle options, verify the command preview updates to show the corresponding flags.

**Acceptance Scenarios**:

1. **Given** the Merge dialog is open with default options, **When** the user views the command preview, **Then** it shows the base merge command with the target branch name
2. **Given** the Merge dialog is open, **When** the user toggles no-commit, **Then** the command preview adds the corresponding flag and also reflects that no-fast-forward is implied
3. **Given** the Cherry-Pick dialog is open with selected commits, **When** the user views the command preview, **Then** it shows abbreviated commit hashes for readability
4. **Given** the Cherry-Pick dialog is open, **When** the user toggles append-source-ref and no-commit flags, **Then** the preview accurately reflects the resulting command including flag interactions (e.g., -x suppressed when --no-commit is used)
5. **Given** a merge commit is selected for cherry-pick, **When** the user selects a mainline parent, **Then** the command preview includes the parent flag

---

### User Story 3 - Command Preview in Rebase, Reset, and Drop Commit Dialogs (Priority: P2)

As a developer performing rebase, reset, or drop commit operations, I want to see the equivalent git command so I understand the exact operation before confirming a potentially destructive action.

**Why this priority**: These are less frequently used but more dangerous operations where transparency is especially valuable. Each is simpler (fewer options) and builds on the same foundation as P1 stories.

**Independent Test**: Open each dialog individually and verify the command preview is displayed and accurate.

**Acceptance Scenarios**:

1. **Given** the Rebase confirm dialog is open with a target ref, **When** the user views the command preview, **Then** it shows the rebase command with the target reference
2. **Given** the Rebase confirm dialog is open, **When** the user toggles ignore-date, **Then** the preview updates to include the flag
3. **Given** the Reset confirm dialog is open, **When** the user views the command preview, **Then** it shows the reset command with the correct mode and target hash
4. **Given** the Drop Commit dialog is open, **When** the user views the command preview, **Then** it shows `git rebase -i <hash>~1  # drop <hash>` with the target commit's abbreviated hash

---

### User Story 4 - Command Preview in Checkout and Tag Creation Dialogs (Priority: P3)

As a developer checking out a branch or creating a tag, I want to see the equivalent git command for consistency across all dialogs.

**Why this priority**: These operations are straightforward and low-risk, so command preview is less critical but still valuable for consistency and developer education.

**Independent Test**: Open each dialog and verify the command preview is displayed and accurate.

**Acceptance Scenarios**:

1. **Given** the Checkout with Pull dialog is open, **When** the user selects "Pull", **Then** the preview shows `git checkout <branch> && git pull`; **When** the user selects "No pull", **Then** the preview shows only `git checkout <branch>`
2. **Given** the Tag Creation dialog is open with a tag name entered, **When** the user views the preview, **Then** it shows the tag command with the name and target commit
3. **Given** the Tag Creation dialog is open, **When** the user enters an annotation message, **Then** the preview switches to show the annotated tag command variant

---

### Edge Cases

- What happens when a dialog has no meaningful target data yet (e.g., empty tag name)? The command preview should show a partial command with a placeholder or omit the incomplete part, rather than showing an invalid command.
- How does the command preview behave when the command string is very long (e.g., cherry-picking many commits)? The preview input should be horizontally scrollable and not break the dialog layout.
- How does the Copy button work in restricted clipboard contexts (e.g., certain VS Code remote environments)? It should fail silently without error, matching the existing Push dialog behavior.

## Requirements

### Functional Requirements

- **FR-001**: The command preview display MUST be a single reusable component used consistently across all dialogs
- **FR-002**: All git command string generation MUST be centralized in a single utility with one pure function per git operation
- **FR-003**: The command preview MUST update reactively as the user changes dialog options, with no manual refresh needed
- **FR-004**: Each command preview MUST include a Copy button that copies the command string to the clipboard with brief visual feedback
- **FR-005**: The command strings MUST accurately represent the equivalent git CLI command for the operation being performed, including all user-selected flags and options
- **FR-006**: Adding command preview to a dialog MUST NOT change the dialog's existing visual layout, behavior, or functionality
- **FR-007**: The command preview MUST be placed consistently across all dialogs — between the options/description area and the action buttons
- **FR-008**: The command builder functions MUST be independently testable with unit tests covering all flag combinations and interactions
- **FR-009**: Dialogs out of scope for this feature (Interactive Rebase, Revert Parent Selection, Remote Management) MUST remain unchanged
- **FR-010**: The generic confirm dialog MUST accept an optional command preview string prop; when provided, it renders the command preview component between the description and action buttons — no other new content slots are introduced

### Scope

**In scope** — dialogs that will receive command preview:

- Push (refactor existing)
- Merge
- Cherry-Pick
- Rebase Confirm
- Reset (via generic confirm dialog)
- Drop Commit
- Checkout with Pull
- Tag Creation

**Out of scope** — excluded for specific reasons:

- Interactive Rebase: Multi-step wizard with complex entry reordering; resulting commands are too complex for a single preview string
- Revert Parent Selection: "Click parent to immediately confirm" pattern has no intermediate state to compute a command from
- Remote Management: Handles multiple distinct operations (add, edit, remove) within a single dialog

### Key Entities

- **Command Builder**: A pure function that takes an options object and returns a git command string. One builder per git operation.
- **Command Preview**: A reusable display component that renders a readonly command string with copy-to-clipboard functionality.

### Assumptions

- The command preview shows the "equivalent" git command — not necessarily the literal command executed by the extension backend (which may use programmatic APIs or different internal flags). The purpose is developer comprehension, not exact command replication.
- The existing Push dialog command preview UI and behavior is the gold standard for how command preview should look and behave across all dialogs.
- Command builder functions will also be created for Revert (for future use, with full unit tests) even though the Revert Parent Dialog is out of scope for the preview UI. The revert builder includes `--no-edit` to match the extension's actual behavior.
- The Merge command builder supports all `MergeOptions` fields including `squash`, even though the UI does not yet expose squash — this keeps the builder aligned with the existing type definition.
- Abbreviated hashes (7 chars) are used in command preview strings where hashes appear (cherry-pick, drop commit, tag creation) for readability.

## Clarifications

### Session 2026-03-26

- Q: How should the generic confirm dialog (ConfirmDialog) support command preview for Reset? → A: Add an optional `commandPreview?: string` prop. When provided, render the CommandPreview component between the description and action buttons. No broader children/ReactNode slot.
- Q: How should the Drop Commit command be represented in the preview? → A: Show `git rebase -i <hash>~1  # drop <hash>` — the real interactive rebase mechanism with a comment clarifying that the specified commit will be dropped.
- Q: How should Checkout with Pull display its multi-command operation? → A: Single combined string using CLI chaining: `git checkout <branch> && git pull`. When "No pull" is selected, show only `git checkout <branch>`.
- Q: Should the Merge command builder support the `squash` option not yet exposed in the UI? → A: Yes, include squash support in the builder and tests. Aligns with the existing `MergeOptions` type and avoids rework when squash is added to the UI.
- Q: Should the Revert command builder include the `--no-edit` flag? → A: Yes, include `--no-edit` to match the actual backend behavior. The preview should show `git revert --no-edit [-m N] <hash>`.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All 8 in-scope dialogs display an accurate, reactive command preview that updates immediately when options change
- **SC-002**: The refactored Push dialog is visually and functionally identical to the original — no user-visible regression
- **SC-003**: Every command builder function has unit test coverage for all flag combinations
- **SC-004**: Users can copy any displayed command to their clipboard in one click with visual confirmation feedback
- **SC-005**: Adding command preview to a dialog introduces no layout shift when toggling options
- **SC-006**: The command preview component is reused (not duplicated) across all dialogs

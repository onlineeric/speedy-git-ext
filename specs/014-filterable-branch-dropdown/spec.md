# Feature Specification: Filterable Branch Dropdown

**Feature Branch**: `014-filterable-branch-dropdown`
**Created**: 2026-03-17
**Status**: Draft
**Input**: User description: "Branch filter dropdown is a dropdown box, change it to a dropdown box with text filter on top. That is, user can type text on top of the dropdown box and filter the list below. Ensure UI design, that user type in text, click tab, focus go to the list, user can navigate up/down on the list by up down arrow key, press enter to select the branch."

## Clarifications

### Session 2026-03-17

- Q: When focus is on the branch list, how does the user return focus to the text input? → A: Typing while the list is focused automatically redirects focus back to the text input and appends the typed character (combobox pattern, consistent with VS Code's Command Palette).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filter Branches by Typing (Priority: P1)

A user working in a repository with many branches wants to quickly find and select a specific branch. They click on the branch dropdown, type a few characters of the branch name, and see the list narrow down to matching branches. They then navigate to the desired branch and select it.

**Why this priority**: This is the core feature — without text filtering, the dropdown remains a plain select element and provides no improvement over the current experience. Repositories with dozens or hundreds of branches are common, and scrolling through a long list is slow and error-prone.

**Independent Test**: Can be fully tested by opening the branch dropdown, typing partial text, and verifying the list filters to show only matching branches. Delivers immediate value by reducing branch selection time.

**Acceptance Scenarios**:

1. **Given** the branch dropdown is open and the repository has 50+ branches, **When** the user types "feat" in the text input, **Then** only branches containing "feat" (case-insensitive) are displayed in the list below.
2. **Given** the user has typed a filter string, **When** the user clears the text input, **Then** all branches are displayed again (grouped by Local and Remote).
3. **Given** the user has typed a filter string that matches no branches, **When** viewing the list, **Then** the list is empty (no branches shown) and the user can continue editing the filter text.

---

### User Story 2 - Keyboard-Only Branch Selection (Priority: P2)

A power user who prefers keyboard navigation wants to select a branch entirely via keyboard. They type to filter, press Tab to move focus into the list, use Up/Down arrow keys to highlight a branch, and press Enter to select it.

**Why this priority**: Keyboard accessibility is essential for power users and accessibility compliance. This story ensures the dropdown is fully operable without a mouse, which is a common expectation in developer tools.

**Independent Test**: Can be fully tested by opening the dropdown, typing a filter, pressing Tab, using arrow keys to navigate, and pressing Enter to confirm selection — all without touching the mouse. Delivers value by enabling efficient keyboard-driven workflows.

**Acceptance Scenarios**:

1. **Given** the text input is focused and the user has typed a filter, **When** the user presses Tab, **Then** focus moves to the branch list and the first matching branch is highlighted.
2. **Given** focus is on the branch list, **When** the user presses the Down arrow key, **Then** the highlight moves to the next branch in the list.
3. **Given** focus is on the branch list, **When** the user presses the Up arrow key, **Then** the highlight moves to the previous branch in the list.
4. **Given** focus is on the branch list with a branch highlighted, **When** the user presses Enter, **Then** that branch is selected as the active filter and the dropdown closes.
5. **Given** focus is on the branch list and the first branch is highlighted, **When** the user presses the Up arrow key, **Then** the highlight stays on the first branch (no wrapping).
6. **Given** focus is on the branch list, **When** the user starts typing characters, **Then** focus automatically moves back to the text input, the typed characters are appended to the filter text, and the list updates accordingly.

---

### User Story 3 - Mouse-Based Branch Selection (Priority: P2)

A user who prefers mouse interaction wants to click on a branch in the filtered list to select it, similar to the current dropdown behavior but with the added benefit of text filtering.

**Why this priority**: Mouse selection is the most common interaction pattern and must work seamlessly alongside keyboard navigation. Shares priority with keyboard navigation since both are required for a complete user experience.

**Independent Test**: Can be fully tested by opening the dropdown, optionally typing a filter, and clicking on a branch in the list. Delivers value by maintaining familiar mouse-driven interaction with filtering enhancement.

**Acceptance Scenarios**:

1. **Given** the dropdown is open showing filtered branches, **When** the user clicks on a branch in the list, **Then** that branch is selected as the active filter and the dropdown closes.
2. **Given** the dropdown is open, **When** the user clicks outside the dropdown, **Then** the dropdown closes without changing the selected branch.

---

### User Story 4 - Opening and Closing the Dropdown (Priority: P1)

A user wants to open the branch filter dropdown to see available branches and be able to close it without making a selection when needed.

**Why this priority**: Opening/closing is fundamental to the dropdown interaction. Without this, no other story can function. Shares P1 with filtering since it is a prerequisite.

**Independent Test**: Can be fully tested by clicking the dropdown trigger to open, verifying branches are displayed, and closing via Escape or clicking outside.

**Acceptance Scenarios**:

1. **Given** the dropdown is closed, **When** the user clicks on the dropdown trigger (button or current selection display), **Then** the dropdown opens showing the text input (focused) and the full branch list below it.
2. **Given** the dropdown is open, **When** the user presses Escape, **Then** the dropdown closes without changing the selected branch and the filter text is cleared.
3. **Given** a branch is currently selected as filter, **When** the dropdown trigger is displayed in its closed state, **Then** it shows the currently selected branch name (or "All Branches" if no filter is active).

---

### Edge Cases

- What happens when the repository has no branches (e.g., fresh repo with no commits)? The dropdown should display "All Branches" as the only option or indicate no branches are available.
- What happens when typing produces no matching branches? The list should be empty with no visual glitch; the user can continue editing or clear the text.
- What happens when the currently selected branch is deleted or renamed remotely? The dropdown trigger should still display the branch name; upon next fetch/refresh, the branch list updates and the user may need to reselect.
- What happens when the dropdown is open and the user triggers a refresh (R key or Refresh button)? The branch list should update with fresh data without closing the dropdown, and the current filter text should be preserved.
- What happens when the user presses Tab in the text input but the filtered list is empty? Focus should remain on the text input (nothing to navigate to).
- What happens with very long branch names? Branch names should be truncated with ellipsis if they exceed the dropdown width.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The branch filter MUST replace the current native select dropdown with a custom dropdown component that includes a text input field at the top and a scrollable branch list below.
- **FR-002**: The text input MUST filter the branch list in real-time as the user types, matching branch names case-insensitively using substring matching.
- **FR-003**: The filtered branch list MUST preserve the grouping of branches into "Local" and "Remote" sections (matching the current behavior). Groups with no matching branches should be hidden.
- **FR-004**: The dropdown MUST include an "All Branches" option that clears the branch filter, equivalent to the current empty-value option.
- **FR-005**: When the dropdown opens, the text input MUST receive focus automatically so the user can start typing immediately.
- **FR-006**: Pressing Tab while the text input is focused MUST move focus to the branch list, highlighting the first visible branch.
- **FR-007**: While focus is on the branch list, Up and Down arrow keys MUST navigate between branches, moving the highlight accordingly.
- **FR-008**: While focus is on the branch list, pressing Enter MUST select the highlighted branch, apply it as the active filter, and close the dropdown.
- **FR-008a**: While focus is on the branch list, typing any printable character MUST redirect focus back to the text input and append the character to the filter text (combobox pattern).
- **FR-009**: Clicking a branch in the list MUST select it, apply it as the active filter, and close the dropdown.
- **FR-010**: Pressing Escape while the dropdown is open MUST close the dropdown without changing the selected branch and clear the filter text.
- **FR-011**: Clicking outside the dropdown MUST close it without changing the selected branch.
- **FR-012**: The dropdown trigger (closed state) MUST display the currently selected branch name, or "All Branches" if no branch filter is active.
- **FR-013**: The dropdown MUST visually integrate with the VS Code theme, using VS Code CSS variables for colors, borders, and focus indicators (consistent with the existing control bar styling).
- **FR-014**: The current branch MUST be visually distinguished in the list (e.g., with an asterisk or indicator), matching the current behavior.
- **FR-015**: The branch list MUST be scrollable when the number of visible branches exceeds the dropdown's maximum height.

### Key Entities

- **Branch**: A git branch with a name, optional remote, current status, and commit hash. Displayed in the dropdown list grouped by local/remote.
- **Filter Text**: The user-entered search string used to narrow the branch list. Transient state, cleared when the dropdown closes.
- **Highlighted Branch**: The currently keyboard-focused branch in the list. Visual state used for keyboard navigation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can locate and select a branch from a list of 100+ branches in under 5 seconds using the text filter.
- **SC-002**: Users can complete branch selection entirely via keyboard (type → Tab → arrow keys → Enter) without requiring mouse interaction.
- **SC-003**: The filtered branch list updates within 100ms of each keystroke, providing a responsive filtering experience.
- **SC-004**: The dropdown visually matches the VS Code theme with no visual artifacts or misalignment in both light and dark themes.

## Assumptions

- The text filter uses simple case-insensitive substring matching (not fuzzy matching or regex). This is the most intuitive and predictable behavior for branch name filtering.
- The dropdown is single-select only (one branch at a time), consistent with the current behavior.
- The "All Branches" option is always visible regardless of filter text, so the user can always reset the filter.
- The dropdown's maximum visible height accommodates approximately 10-15 branches before scrolling, similar to standard dropdown behavior in VS Code.
- Arrow key navigation in the list does not wrap (reaching the end stops at the last item; reaching the top stops at the first item). This matches standard listbox behavior.
- When focus is on the branch list, typing redirects focus to the text input (combobox pattern). This means Shift+Tab is not required — the user simply types to return to filtering.

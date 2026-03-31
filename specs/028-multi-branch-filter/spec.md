# Feature Specification: Multi-Branch Filter Selection

**Feature Branch**: `028-multi-branch-filter`  
**Created**: 2026-03-31  
**Status**: Draft  
**Input**: User description: "The current branch filter combo box can only select one branch. Change it to a multiple select combo box, still keeping the existing text filter on top. Update the current filter logic to filter multiple branches, filter to show only all selected branches."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select Multiple Branches to Filter Graph (Priority: P1)

A user working on a repository with many branches wants to view the commit history for a specific set of branches simultaneously. They open the branch filter dropdown, use the text filter to narrow down the list, and select multiple branches by clicking on them. The graph updates to show only commits reachable from the selected branches.

**Why this priority**: This is the core feature request. Without multi-select capability, the entire feature has no value. Users frequently need to compare history across 2-3 related branches (e.g., a feature branch and main) and the current single-select forces them to switch back and forth.

**Independent Test**: Can be tested by opening the branch dropdown, selecting two or more branches, and verifying the graph displays only commits from those branches.

**Acceptance Scenarios**:

1. **Given** the branch filter dropdown is open and no branches are selected, **When** the user clicks on a branch name, **Then** that branch is added to the selection (checked) and the graph updates to show only commits reachable from that branch.
2. **Given** one or more branches are already selected, **When** the user clicks on another branch, **Then** that branch is added to the selection and the graph updates to include commits reachable from all selected branches.
3. **Given** multiple branches are selected, **When** the user clicks on an already-selected branch, **Then** that branch is removed from the selection and the graph updates to exclude commits only reachable from that branch.
4. **Given** multiple branches are selected, **When** the user selects "All Branches", **Then** all individual selections are cleared and the graph returns to showing all branches.
5. **Given** the last remaining selected branch is deselected, **When** no branches remain selected, **Then** the graph returns to showing all branches (same as "All Branches").

---

### User Story 2 - Text Filter Narrows Branch List Within Multi-Select (Priority: P1)

A user in a repository with many branches (e.g., 50+) needs to find specific branches quickly. They type in the text filter input at the top of the dropdown to narrow the visible branch list, then select the desired branches from the filtered results. Previously selected branches that don't match the filter text remain selected but are hidden from the visible list.

**Why this priority**: Without text filtering working correctly alongside multi-select, the feature is impractical for repositories with many branches. This is co-essential with the multi-select capability.

**Independent Test**: Can be tested by typing a filter string, selecting a branch from filtered results, clearing the filter, typing a different filter, selecting another branch, and verifying both selections persist.

**Acceptance Scenarios**:

1. **Given** the dropdown is open, **When** the user types in the text filter, **Then** the branch list is filtered to show only branches whose names contain the typed text (case-insensitive), and any selected branches not matching the filter are hidden but remain selected.
2. **Given** the user has filtered the list and selected a branch, **When** the user clears the text filter, **Then** all branches reappear and the previously selected branch still shows as selected.
3. **Given** multiple branches are selected and the text filter is active, **When** the user selects a visible branch, **Then** it is added to the existing selection set without affecting hidden selected branches.

---

### User Story 3 - Visual Indication of Selected Branches (Priority: P2)

A user wants to see at a glance which branches are currently selected in the filter. The dropdown trigger button displays meaningful information about the current selection, and within the dropdown, selected branches are visually distinguished from unselected ones.

**Why this priority**: Good visual feedback is important for usability but the core functionality works without it.

**Independent Test**: Can be tested by selecting various numbers of branches and verifying the trigger button label and in-dropdown indicators update correctly.

**Acceptance Scenarios**:

1. **Given** no branches are selected (all branches mode), **When** the user views the filter button, **Then** it displays "All Branches".
2. **Given** exactly one branch is selected, **When** the user views the filter button, **Then** it displays the name of that branch.
3. **Given** two or more branches are selected, **When** the user views the filter button, **Then** it displays a summary indicating the number of selected branches (e.g., "2 branches selected").
4. **Given** the dropdown is open, **When** the user views the branch list, **Then** selected branches display a checkbox or check indicator distinguishing them from unselected branches.

---

### User Story 4 - Dropdown Stays Open for Multi-Selection (Priority: P2)

A user selecting multiple branches expects the dropdown to remain open after each selection so they can continue selecting without reopening.

**Why this priority**: Essential for an ergonomic multi-select workflow but is a behavioral change from the current single-select (which closes on selection).

**Independent Test**: Can be tested by clicking multiple branches in succession and verifying the dropdown stays open until explicitly dismissed.

**Acceptance Scenarios**:

1. **Given** the dropdown is open, **When** the user clicks a branch to select or deselect it, **Then** the dropdown remains open.
2. **Given** the dropdown is open, **When** the user presses Escape or clicks outside the dropdown, **Then** the dropdown closes.
3. **Given** the dropdown is open, **When** the user clicks "All Branches", **Then** all selections are cleared and the dropdown remains open.

---

### Edge Cases

- What happens when all selected branches are deleted from the repository (e.g., after a fetch/prune)? The filter should gracefully fall back to showing all branches.
- What happens when the user selects branches and then the branch list is refreshed? Selections for branches that still exist should persist; selections for deleted branches should be silently removed.
- What happens when the user selects a very large number of branches (e.g., 20+)? The trigger button summary should remain readable and the filter should still perform well.
- What happens when the dropdown is closed and reopened? The current selections and text filter state should be preserved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to select zero, one, or multiple branches from the branch filter dropdown.
- **FR-002**: System MUST display a text filter input at the top of the dropdown that filters the visible branch list by name (case-insensitive), consistent with existing behavior.
- **FR-003**: System MUST update the commit graph to show only commits reachable from any of the currently selected branches when one or more branches are selected.
- **FR-004**: System MUST show all branches (existing default behavior) when no specific branches are selected.
- **FR-005**: System MUST provide an "All Branches" option that clears all selections and returns to the unfiltered view.
- **FR-006**: System MUST visually indicate which branches are currently selected within the dropdown (e.g., checkboxes or check marks).
- **FR-007**: System MUST display a meaningful summary on the dropdown trigger button reflecting the current selection state ("All Branches", single branch name, or count of selected branches).
- **FR-008**: System MUST preserve branch selections when the text filter is changed or cleared.
- **FR-009**: System MUST preserve branch selections when the dropdown is closed and reopened.
- **FR-010**: System MUST keep the dropdown open after toggling a branch selection, closing only on Escape or click-outside.
- **FR-012**: System MUST update the commit graph immediately after each branch toggle (not deferred until dropdown closes).
- **FR-011**: System MUST support existing keyboard navigation within the dropdown (arrow keys, Enter to toggle selection, Escape to close).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can select and deselect branches individually without the dropdown closing, allowing efficient multi-selection in a single interaction.
- **SC-002**: The graph updates to reflect the filtered branch set within the same perceived responsiveness as the current single-branch filter.
- **SC-003**: Users can identify the current filter state (which and how many branches are selected) from the trigger button label without opening the dropdown.
- **SC-004**: The text filter continues to narrow the branch list in real-time as the user types, with no perceptible delay for repositories with up to 200 branches.

## Clarifications

### Session 2026-03-31

- Q: When should the graph update as the user toggles branches in the open dropdown? → A: Immediately after each toggle (instant feedback, one fetch per toggle).

## Assumptions

- A new multi-select dropdown component is created based on the existing single-select `FilterableBranchDropdown` (Radix Popover-based), preserving the original for future reuse.
- The dropdown remains open after each branch toggle to allow multi-selection workflow. It closes on Escape or clicking outside.
- The "All Branches" option acts as a "select none" / clear-all mechanism, not a "select literally all branches" toggle.
- Branch selections are transient (not persisted across extension sessions), consistent with current single-branch filter behavior.
- The backend git log command supports multiple branch refs as arguments, which is standard git behavior.


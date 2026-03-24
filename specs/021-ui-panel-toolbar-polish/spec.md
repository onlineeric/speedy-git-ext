# Feature Specification: UI Panel & Toolbar Polish

**Feature Branch**: `021-ui-panel-toolbar-polish`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "Multiple small UI improvements: resizable right-side panel, toolbar button reorganization, panel header button improvements, repo switch panel reset, close button fix"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resizable Right-Side Commit Details Panel (Priority: P1)

A user opens the commit details panel and moves it to the right side. They want to adjust the panel width to see more or less detail, just like they can adjust height when the panel is at the bottom. The user drags the left edge of the right-side panel to resize it horizontally.

**Why this priority**: This is a usability gap — bottom panel supports height resize but right panel width resize doesn't work, creating an inconsistent experience.

**Independent Test**: Can be tested by switching the commit details panel to the right position and dragging to resize width, verifying smooth resize behavior.

**Acceptance Scenarios**:

1. **Given** the commit details panel is positioned on the right, **When** the user drags the left resize handle horizontally, **Then** the panel width adjusts proportionally to the drag distance
2. **Given** the commit details panel is positioned on the right, **When** the user drags the resize handle to make the panel narrower than the minimum width, **Then** the panel width stops at the minimum width and does not collapse
3. **Given** the commit details panel is positioned at the bottom, **When** the user drags the top resize handle vertically, **Then** the existing height resize behavior remains unchanged

---

### User Story 2 - Toolbar Button Reorganization (Priority: P1)

A user views the control bar and sees a cleaner layout: "Manage Remotes..." has moved from a text button to a cloud icon button positioned between the settings icon and the loaded commits count. The remaining action buttons are reordered to Refresh, Fetch, Search for a more logical flow (refresh local first, then fetch remote, then search).

**Why this priority**: Improves toolbar clarity and reduces visual clutter. "Manage Remotes..." is an infrequent action that doesn't warrant a prominent text button.

**Independent Test**: Can be tested by visually verifying the new toolbar layout order and that the cloud icon button opens the remote management dialog.

**Acceptance Scenarios**:

1. **Given** the control bar is displayed, **When** the user looks at the action buttons after the branch dropdown, **Then** the buttons appear in order: Refresh, Fetch, Search
2. **Given** the control bar is displayed, **When** the user looks at the area between the loaded commits count and the settings gear icon, **Then** a cloud icon button for "Manage Remotes" is visible
3. **Given** the user clicks the cloud icon button, **Then** the Remote Management dialog opens
4. **Given** the user hovers over the cloud icon button, **Then** a tooltip shows "Manage Remotes"

---

### User Story 3 - Hide Commit Details Panel on Repo Switch (Priority: P1)

A user is viewing commit details for a commit in Repo A. They switch to Repo B using the repository dropdown. The commit details panel automatically closes because the previously displayed commit belongs to a different repository and is no longer relevant.

**Why this priority**: Prevents showing stale/misleading information — a commit from Repo A has no relevance in Repo B context.

**Independent Test**: Can be tested by opening commit details, switching repositories, and verifying the panel closes.

**Acceptance Scenarios**:

1. **Given** the commit details panel is open showing a commit, **When** the user selects a different repository from the repo dropdown, **Then** the commit details panel closes
2. **Given** the commit details panel is already closed, **When** the user switches repositories, **Then** the panel remains closed (no unexpected behavior)

---

### User Story 4 - Larger and Improved Panel Header Buttons (Priority: P2)

A user interacts with the commit details panel header buttons (move and close). Both buttons are larger and easier to click. The move button now shows an icon with a descriptive label ("Move to right" or "Move to bottom") so the user clearly understands what it does. The close button displays a proper X icon instead of a garbled character.

**Why this priority**: Improves discoverability and usability of panel controls. The current small buttons are hard to target, and the move button's icon-only design is not self-explanatory.

**Independent Test**: Can be tested by verifying button sizes, labels, and that the close button renders correctly.

**Acceptance Scenarios**:

1. **Given** the commit details panel is open at the bottom, **When** the user views the panel header, **Then** the move button displays an icon with the label "Move to right"
2. **Given** the commit details panel is open on the right, **When** the user views the panel header, **Then** the move button displays an icon with the label "Move to bottom"
3. **Given** the commit details panel is open, **When** the user views the close button, **Then** it displays a proper X icon (not garbled text)
4. **Given** the panel header buttons, **When** the user interacts with them, **Then** both buttons have adequate click target area for comfortable mouse targeting
5. **Given** the user clicks the move button with label "Move to right", **Then** the panel moves to the right side and the label updates to "Move to bottom"

---

### Edge Cases

- What happens when the right-side panel is resized very wide (near full window width)? The panel width is capped so the graph area always retains at least 200px visible width.
- What happens when the window is very narrow and the panel is on the right? The minimum width constraint should still apply.
- What happens if the user rapidly switches repositories while commit details are loading? The panel should close cleanly without errors.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The commit details panel MUST support horizontal width resizing when positioned on the right side, using the same drag interaction pattern as the bottom panel's height resize
- **FR-002**: The right-side panel resize MUST enforce a minimum width to prevent the panel from becoming unusably narrow, and MUST cap the maximum width so the graph area always retains at least 200px visible width
- **FR-003**: The "Manage Remotes..." text button MUST be replaced with a cloud icon button
- **FR-004**: The cloud icon button MUST be positioned between the loaded commits count display and the settings gear icon
- **FR-005**: The remaining toolbar action buttons MUST appear in the order: Refresh, Fetch, Search (left to right)
- **FR-006**: When the user switches to a different repository, the system MUST close the commit details panel, clear the selected commit highlight, and clear commit details state
- **FR-007**: Both panel header buttons (move and close) MUST have increased click target areas compared to current sizing
- **FR-008**: The move panel button MUST display both an SVG icon and a text label ("Move to right" when panel is at bottom, "Move to bottom" when panel is on right)
- **FR-009**: The close button MUST display a proper X SVG icon that renders correctly across all platforms and font configurations
- **FR-010**: The cloud icon button MUST show a "Manage Remotes" tooltip on hover

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can resize the right-side panel width by dragging, with the same smoothness and responsiveness as the existing bottom panel height resize
- **SC-002**: All toolbar buttons are immediately identifiable by their label or icon without needing to hover for a tooltip
- **SC-003**: Users switching repositories never see commit details from the previously selected repository
- **SC-004**: Panel header buttons (move and close) are easy to click on first attempt with adequate size for comfortable mouse targeting
- **SC-005**: The close button renders as a recognizable X symbol on all supported platforms

## Clarifications

### Session 2026-03-24

- Q: How should the maximum panel width be enforced when resizing the right-side panel? → A: Cap panel width so the graph area always retains at least 200px visible width.
- Q: When switching repositories, should selected commit highlighting in the graph also be cleared? → A: Clear everything — close panel, clear selected commit highlight, and clear commit details.
- Q: Should the move button icons also switch from Unicode to SVG for consistency with the close button fix? → A: Yes, switch move button to SVG icons too for consistent rendering.

## Assumptions

- The cloud icon for "Manage Remotes" will use an SVG icon consistent with the existing icon style in the project (similar to ListViewIcon, TreeViewIcon pattern)
- All panel header button icons (move and close) will use SVG icons instead of Unicode characters to ensure consistent rendering across all platforms
- The minimum panel width for right-side positioning will follow the existing MIN_SIZE constant (120px) already defined in the codebase
- The repo switch will clear all commit-related state (selected commit, commit details, panel open state) to ensure a clean slate

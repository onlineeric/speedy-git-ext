# Feature Specification: Responsive Split Layout for Bottom Commit Details Panel

**Feature Branch**: `029-split-commit-panel`
**Created**: 2026-03-31
**Status**: Draft
**Input**: User description: "on our UI, when click on a commit row, will display a commit details panel. The panel has 2 position, which at bottom or on right side. the panel has 2 part, the top part is commit details showing a title, details with Hash, Parent, Author, Date and etc... the bottom part is Files changed, showing all changed files in list view or tree view. the current panel area is quite tall where there any many to display. When the panel on right side, this is ok because right side the panel has a tall height. however, when panel on the bottom position, it is wide in width but short in height, when many to display, data are not fit to it's space. I want to make this change: - only when panel at bottom position, if the current available width is large enough, responsively change the panel 2 parts to display in left and right, left side display commit details, right side display files changed. - if available width is not enough, responsively switch back to original arrangement, commit details on top, files changed at bottom. - panel on right position always display in original arrangement, no change. - when display the panel parts in left and right mode, the width, size of the area should be responsive."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use Horizontal Space in Bottom Panel (Priority: P1)

When a developer opens a commit details panel at the bottom of the screen, the panel is usually wide but not very tall. In that layout, stacking commit metadata above the files-changed area wastes the available width and leaves too little vertical space for each section. The panel should automatically switch to a side-by-side arrangement when the bottom panel is wide enough so the user can see more commit details and more changed files without extra scrolling.

**Why this priority**: This directly addresses the main usability problem described by the user and improves the primary commit-inspection workflow without requiring any manual toggle.

**Independent Test**: Can be fully tested by opening the commit details panel at the bottom position, increasing the available width, and verifying that commit details render on the left while files changed render on the right.

**Acceptance Scenarios**:

1. **Given** the commit details panel is open in the bottom position and the available panel width is large enough, **When** the layout is evaluated, **Then** the panel displays the commit details section on the left and the files changed section on the right.
2. **Given** the panel is in this side-by-side bottom layout, **When** the user reviews a commit with many metadata rows and many changed files, **Then** both sections remain visible at the same time without one section forcing the other below the fold.
3. **Given** the bottom panel is wide enough for side-by-side mode, **When** the selected commit changes, **Then** the panel keeps the side-by-side arrangement for the newly displayed commit.

---

### User Story 2 - Fall Back Gracefully on Narrow Bottom Panels (Priority: P1)

When the bottom commit details panel becomes too narrow, a left-right split would make both sections cramped and harder to read. In that case, the panel should automatically return to the original stacked arrangement, with commit details above and files changed below, so the content remains legible and usable.

**Why this priority**: Responsive fallback is necessary to avoid replacing one layout problem with another. The feature is only successful if it improves wide bottom panels without harming narrow ones.

**Independent Test**: Can be fully tested by opening the commit details panel at the bottom position, reducing the available width below the responsive threshold, and verifying that the layout returns to the original vertical stacking.

**Acceptance Scenarios**:

1. **Given** the commit details panel is open in the bottom position and the available width is not large enough for a comfortable side-by-side layout, **When** the layout is evaluated, **Then** the panel displays the original arrangement with commit details above files changed.
2. **Given** the bottom panel is currently showing side-by-side sections, **When** the available width shrinks below the responsive threshold, **Then** the panel automatically switches back to the stacked arrangement without requiring user action.
3. **Given** the bottom panel is currently stacked because width is limited, **When** the available width grows again above the responsive threshold, **Then** the panel automatically switches back to the side-by-side arrangement.

---

### User Story 3 - Preserve Right Panel Behavior (Priority: P2)

When a developer moves the commit details panel to the right side, the panel already has enough vertical space for the original arrangement. The right-side panel should continue to behave exactly as it does today, always showing commit details above files changed regardless of width changes.

**Why this priority**: The new behavior should be tightly scoped to the bottom panel only. Preserving the right-side layout avoids unnecessary behavioral change in a layout that already works well.

**Independent Test**: Can be fully tested by moving the panel to the right position and resizing the editor area to various widths, verifying that the panel always keeps the original stacked arrangement.

**Acceptance Scenarios**:

1. **Given** the commit details panel is open in the right position, **When** the layout is evaluated, **Then** the panel always displays commit details above files changed.
2. **Given** the panel is in the right position, **When** the available width changes, **Then** the panel does not switch into a left-right split layout.
3. **Given** the user moves the panel from bottom to right while the bottom panel was in side-by-side mode, **When** the right panel renders, **Then** it returns to the original stacked arrangement.

### Edge Cases

- What happens when the bottom panel width is near the responsive cutoff and the user keeps resizing? The layout should switch cleanly between modes without overlapping content, clipped sections, or duplicate scrollbars.
- What happens when a commit has very little metadata but many changed files? The side-by-side layout should still allocate usable space to both sections instead of collapsing one side too aggressively.
- What happens when a commit has many metadata rows, a long body, or signature details? The commit details section should remain independently readable in both stacked and side-by-side bottom layouts.
- What happens when the files changed area is in tree view and contains deep folder nesting? The side-by-side layout should still provide a usable files area without forcing the panel back to stacked mode unless the available width is truly insufficient.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support two presentation modes for the bottom-position commit details panel: stacked mode and side-by-side mode.
- **FR-002**: When the commit details panel is positioned at the bottom, the system MUST automatically choose side-by-side mode when the currently available panel width is sufficient to present both sections comfortably.
- **FR-003**: In bottom-panel side-by-side mode, the commit details section MUST appear on the left and the files changed section MUST appear on the right.
- **FR-004**: When the commit details panel is positioned at the bottom and the available width is not sufficient for side-by-side mode, the system MUST use the original stacked arrangement with commit details above files changed.
- **FR-005**: The system MUST re-evaluate the bottom-panel layout responsively as the available width changes and switch between side-by-side and stacked arrangements automatically.
- **FR-006**: The right-position commit details panel MUST always use the original stacked arrangement and MUST NOT switch into side-by-side mode.
- **FR-007**: In bottom-panel side-by-side mode, the widths of the left and right sections MUST respond to the available panel space rather than staying fixed at a single hard-coded size.
- **FR-008**: In bottom-panel side-by-side mode, both sections MUST remain usable and readable at the minimum width required for that mode, with no overlap between content areas.
- **FR-009**: Switching between bottom-panel stacked mode and bottom-panel side-by-side mode MUST preserve the currently selected commit and the currently displayed file list content.
- **FR-010**: The files changed section MUST preserve its current behavior in either bottom-panel layout, including list view and tree view presentation.
- **FR-011**: The commit details section MUST preserve its current information content in either bottom-panel layout, including title, metadata rows, body text, and any additional commit detail subsections already shown by the panel.
- **FR-012**: The layout change MUST occur automatically based on panel width and MUST NOT require any new user-facing toggle or preference.
- **FR-013**: In bottom-panel side-by-side mode, the left and right section widths MUST be determined automatically by the responsive layout and MUST NOT introduce a separate user-controlled divider or width adjustment.

### Key Entities

- **Commit Details Panel**: The UI region shown after selecting a commit, which can appear at the bottom or on the right side of the graph view.
- **Commit Details Section**: The portion of the panel that shows the commit title, metadata such as hash, parent, author, and date, plus any additional commit information already included in the panel.
- **Files Changed Section**: The portion of the panel that shows the changed files for the selected commit in list view or tree view.
- **Bottom Panel Layout Mode**: The responsive arrangement used only when the panel is at the bottom, with two possible states: stacked or side-by-side.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In bottom-panel mode, users with sufficient panel width can view the commit details section and the files changed section simultaneously without one section being pushed below the other.
- **SC-002**: In bottom-panel mode, resizing the panel across the responsive cutoff updates the layout automatically within one interaction, with no manual refresh or reopen required.
- **SC-003**: In right-panel mode, the panel continues to present the original stacked arrangement for 100% of resize scenarios.
- **SC-004**: In bottom-panel side-by-side mode, both sections remain readable and interactive for representative commits containing long metadata and 100+ changed files.
- **SC-005**: Users do not need any new control or setting to benefit from the improved bottom-panel layout.

## Assumptions

- The existing commit details panel already has distinct content sections that can be rearranged without changing the underlying commit data model.
- The responsive decision can be based on the available width of the bottom-position panel itself rather than on the overall editor window size.
- The current stacked arrangement remains the fallback and default behavior whenever there is not enough room for a usable split layout.
- The exact responsive cutoff and left-right space distribution can be determined during implementation as long as the resulting behavior satisfies the requirements above.

## Clarifications

### Session 2026-03-31

- Q: Should the side-by-side bottom layout be automatic-only or allow manual resizing between the left and right sections? → A: Automatic responsive split only; no manual resize divider between sections.

# Feature Specification: Resizable Commit Columns

**Feature Branch**: `031-resize-commit-columns`  
**Created**: 2026-04-03  
**Status**: Draft  
**Input**: User description: "Read `specs/031-resize-commit-columns-idea.md` and create the feature specification for resizable commit columns."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adjust Column Widths to Fit the Task (Priority: P1)

A developer viewing the commit list switches to a table-style view and resizes columns so the most important information is easier to read on their current screen. For example, they can widen the message column to read more of a commit subject or widen the graph column when the history has many active lanes.

**Why this priority**: Resizing is the core user value of this feature. Without it, the commit list remains constrained by fixed widths and cannot adapt to different repository histories or screen sizes.

**Independent Test**: Can be fully tested by opening the table-style view, dragging one or more column boundaries, and confirming the commit list immediately reflects the new widths while remaining usable.

**Acceptance Scenarios**:

1. **Given** the user is in the table-style commit list view, **When** they drag a column boundary, **Then** the affected column width updates and the commit list reflows without overlapping content.
2. **Given** the user has widened or narrowed one or more columns, **When** they continue browsing the commit list, **Then** rows, headers, and commit data remain aligned.
3. **Given** the commit graph requires more space than usual, **When** the user widens the graph column, **Then** the graph remains fully visible without forcing other columns to overlap it.

---

### User Story 2 - Reorder and Show Only Relevant Columns (Priority: P1)

A developer customizes the table-style commit list so the columns they care about appear in the order they prefer, and less relevant columns can be hidden to free up space. The graph column always remains first so the visual history stays anchored.

**Why this priority**: Different users prioritize different commit metadata. Reordering and visibility controls are the other half of column customization and are necessary to make the table view truly adaptable.

**Independent Test**: Can be fully tested by moving optional columns, hiding at least one optional column, restoring it, and confirming the graph column remains visible and first.

**Acceptance Scenarios**:

1. **Given** the user is in the table-style commit list view, **When** they reorder visible optional columns, **Then** the commit list updates to reflect the new column order.
2. **Given** the user opens the column chooser, **When** they hide an optional column, **Then** that column is removed from both the header and the rows and the remaining columns use the available space.
3. **Given** the graph column is a required anchor for the commit list, **When** the user customizes column order or visibility, **Then** the graph column remains visible and stays in the first position.

---

### User Story 3 - Keep Preferred Layout Across Sessions (Priority: P2)

A developer returns to the commit list after reloading the webview or reopening the repository and sees the same commit list mode and column layout they previously chose, instead of having to configure it again.

**Why this priority**: Persistent preferences turn the feature from a one-off convenience into a reliable part of the daily workflow, especially for users who routinely work on small or crowded screens.

**Independent Test**: Can be fully tested by changing the view mode and table column layout, reloading the webview, and confirming the previous settings are restored.

**Acceptance Scenarios**:

1. **Given** the user selected the table-style commit list view, **When** the webview reloads, **Then** the table-style view is restored instead of reverting to the classic layout.
2. **Given** the user changed column widths, order, or visibility in the table-style view, **When** the webview reloads, **Then** the same layout preferences are restored.
3. **Given** the user switches back to the classic view, **When** they later return to the table-style view, **Then** their last saved table column layout is still available.

---

### Edge Cases

- What happens when the commit list area becomes very narrow? The table-style view should preserve usability by enforcing minimum widths, keeping the graph visible, and preventing columns from visually colliding.
- What happens when a user hides every optional column except one? The table-style view should continue rendering a valid layout with the graph column still visible and anchored first.
- What happens when commit data is unusually long, such as many refs or a long commit subject? Content should remain clipped or truncated within its column rather than overlapping adjacent columns.
- What happens when the user switches between classic and table-style views while a commit is selected? The current selection should remain visible and actionable after the view switch.
- What happens when the commit list is scrolled and the user customizes columns? The list should stay stable enough that the user does not lose their place.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide two commit list presentation modes: a classic view and a customizable table-style view.
- **FR-002**: System MUST default to the classic view for users who have not chosen a different commit list mode.
- **FR-003**: Users MUST be able to switch between the classic view and the table-style view from settings.
- **FR-004**: The classic view MUST remain available as an unchanged fallback when users do not want column customization.
- **FR-005**: The table-style view MUST display the same core commit information currently available in the commit list: graph, hash, refs, message, author, and date.
- **FR-006**: Users MUST be able to resize visible columns in the table-style view through direct manipulation of column boundaries.
- **FR-007**: System MUST keep headers and row cells aligned while columns are resized.
- **FR-008**: System MUST prevent column resizing from making the table-style view unusable, including preserving visibility of the graph column and preventing overlapping column content.
- **FR-009**: Users MUST be able to reorder optional columns in the table-style view.
- **FR-010**: The graph column MUST remain visible and fixed in the first position regardless of user customization.
- **FR-011**: Users MUST be able to show or hide optional columns from a column chooser while in the table-style view.
- **FR-012**: System MUST immediately reflect column visibility changes in both the table header and the commit rows.
- **FR-013**: System MUST preserve the user's selected commit list mode across webview reloads.
- **FR-014**: System MUST preserve the user's table-style column widths, column order, and column visibility preferences across webview reloads.
- **FR-015**: When no saved table-style preferences exist, system MUST start from a default column layout that preserves the current commit list information hierarchy.
- **FR-016**: Switching between classic and table-style views MUST preserve existing commit-list interactions, including commit selection, scrolling, search highlighting, and context menu access.
- **FR-017**: The table-style view MUST remain usable when repositories have dense graph histories, long ref names, or narrow panel widths.

### Key Entities

- **Commit List View Preference**: The user's selected presentation mode for the commit list, either classic or table-style.
- **Column Layout Preference**: The user's saved table-style configuration, including column widths, display order, and which optional columns are hidden.
- **Commit Column**: A visible section of the commit list representing one category of commit metadata, such as graph, hash, refs, message, author, or date.
- **Column Chooser**: A control that lets the user decide which optional commit columns remain visible in the table-style view.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can switch from the classic view to the table-style view and complete at least one column resize in under 10 seconds without leaving the commit list.
- **SC-002**: A user can reorder optional columns and hide at least one optional column in a single customization session without losing access to the graph column.
- **SC-003**: After a user customizes the table-style view and reloads the webview, the same commit list mode and column layout are restored on first render.
- **SC-004**: In manual smoke testing, the table-style view shows no header-to-row misalignment and no overlapping column content across narrow, medium, and wide panel sizes.
- **SC-005**: In manual smoke testing, switching between classic and table-style views introduces no regressions in commit selection, search highlighting, scrolling, or context menu access.

## Assumptions

- The classic commit list remains available indefinitely as a supported fallback, not just as a temporary migration aid.
- Column layout preferences are saved per user and reused across repositories unless a later feature introduces repository-specific layouts.
- The graph column is required for orientation in the commit list and therefore cannot be hidden or moved away from the first position.
- All non-graph columns are optional for visibility purposes, including refs, author, and date.
- The default table-style layout keeps the same relative information priority users see today so that first-time use feels familiar.

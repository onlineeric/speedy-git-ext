# Feature Specification: Advanced Filter Panel

**Feature Branch**: `032-advanced-filter-panel`  
**Created**: 2026-04-04  
**Status**: Draft  
**Input**: User description: "Advanced filter panel with author filter, date range filter, branch filter badge display, and right-click context menu integration"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filter Commits by Author (Priority: P1)

As a developer working in a large repository with many contributors, I want to filter the commit list by one or more authors so that I can quickly find commits made by specific people.

**Why this priority**: Author filtering is the primary new filtering capability. It provides the most common use case for narrowing down commit history and delivers immediate value for code review and blame investigation workflows.

**Independent Test**: Can be fully tested by opening the filter panel, selecting authors from the author dropdown, and verifying that only commits from those authors appear in the commit list.

**Acceptance Scenarios**:

1. **Given** the filter panel is open, **When** I click the author filter dropdown and select one or more authors, **Then** the commit list updates to show only commits from the selected authors.
2. **Given** authors are selected in the filter, **When** I type text in the dropdown search field, **Then** the author list filters to show authors whose name OR email matches the typed text.
3. **Given** authors are selected in the filter, **When** I click the X button on an author badge in the filter panel, **Then** that author is removed from the filter and the commit list updates accordingly.
4. **Given** authors are selected in the filter, **When** I select "All Authors" in the dropdown, **Then** all author selections are cleared and the commit list shows commits from all authors.
5. **Given** no authors are selected, **When** I look at the commit list, **Then** commits from all authors are displayed (no author filtering applied).

---

### User Story 2 - Filter Commits by Date Range (Priority: P2)

As a developer investigating a regression or reviewing recent activity, I want to filter commits by a date range so that I can focus on commits within a specific time period.

**Why this priority**: Date range filtering is the second major filter dimension. Combined with author filtering, it enables powerful commit history investigation workflows.

**Independent Test**: Can be fully tested by opening the filter panel, entering dates in the From and/or To date fields, and verifying that only commits within the specified date range appear.

**Acceptance Scenarios**:

1. **Given** the filter panel is open, **When** I enter a date in the "From Date" field only, **Then** the commit list shows only commits from that date onward.
2. **Given** the filter panel is open, **When** I enter a date in the "To Date" field only, **Then** the commit list shows only commits up to and including that date.
3. **Given** the filter panel is open, **When** I enter dates in both "From Date" and "To Date" fields, **Then** the commit list shows only commits within that date range (inclusive).
4. **Given** a date is entered in a date field, **When** I clear the field, **Then** that date constraint is removed and the commit list updates.
5. **Given** both date fields are empty, **When** I look at the commit list, **Then** no date filtering is applied.
6. **Given** the filter panel is open, **When** I enter only a time without a date, **Then** the input is rejected with a validation indicator.
7. **Given** a date is entered, **When** I optionally add a time component, **Then** the filter uses the exact date+time for filtering.
8. **Given** a date is entered without a time, **When** the filter is applied, **Then** the "From Date" defaults to start-of-day (00:00) and "To Date" defaults to end-of-day (23:59:59).

---

### User Story 3 - View Branch Filter Badges in Filter Panel (Priority: P2)

As a user who has selected branches in the branch filter dropdown, I want to see my branch filter selections displayed as badges in the filter panel so that I have a clear overview of all active filters.

**Why this priority**: This connects the existing branch filter feature to the new filter panel, providing a unified view of all active filters and enabling quick removal of branch filters.

**Independent Test**: Can be fully tested by selecting branches in the existing branch filter dropdown, opening the filter panel, and verifying that the selected branches appear as styled badges with remove buttons.

**Acceptance Scenarios**:

1. **Given** branches are selected in the branch filter dropdown, **When** I open the filter panel, **Then** I see badges for each selected branch displayed in the "Branch filtered" row.
2. **Given** a branch badge is displayed in the filter panel, **When** I click its X button, **Then** that branch is removed from the branch filter and the commit list updates.
3. **Given** both a local and remote version of a branch are selected, **When** I look at the filter panel, **Then** a single combined badge is shown (matching the commit list badge style).
4. **Given** no branches are selected (showing all branches), **When** I open the filter panel, **Then** the branch filter row shows no badges or an indication that all branches are shown.

---

### User Story 4 - Right-Click Context Menu for Quick Filtering (Priority: P3)

As a user viewing the commit list, I want to right-click on an author, date, or branch badge to quickly add or remove filter criteria, so that I can rapidly narrow down commits without manually opening dropdowns.

**Why this priority**: This is a convenience/power-user feature that enhances discoverability and speed of filtering but is not essential for core filter functionality.

**Independent Test**: Can be fully tested by right-clicking on author names, dates, and branch badges in the commit list and verifying the appropriate context menu items appear and function correctly.

**Acceptance Scenarios**:

1. **Given** a commit row is visible, **When** I right-click on an author name that is NOT in the author filter, **Then** the context menu shows "Add Author to filter".
2. **Given** a commit row is visible, **When** I right-click on an author name that IS in the author filter, **Then** the context menu shows "Remove Author from filter".
3. **Given** a commit row is visible, **When** I right-click on a date and select "Filter from this date", **Then** the From Date field is set to that date (date portion only, time at 00:00).
4. **Given** a commit row is visible, **When** I right-click on a date and select "Filter to this date", **Then** the To Date field is set to that date (date portion only).
5. **Given** a local branch badge is visible, **When** I right-click and select "Add branch to filter", **Then** only the local branch is added to the branch filter.
6. **Given** a remote branch badge is visible, **When** I right-click and select "Add branch to filter", **Then** only the remote branch is added to the branch filter.
7. **Given** a combined local+remote branch badge is visible, **When** I right-click and select "Add branch to filter", **Then** both the local and remote branches are added to the branch filter.
8. **Given** a branch badge for a branch already in the filter, **When** I right-click, **Then** the context menu shows "Remove branch from filter" instead.

---

### User Story 5 - Filter Panel UI and Reset (Priority: P2)

As a user with multiple filters active, I want a clear visual layout of all filter controls and a way to reset non-branch filters at once, so that I can manage my filter state efficiently.

**Why this priority**: The panel layout and reset functionality are essential for usability of the filter features.

**Independent Test**: Can be fully tested by opening the filter panel, applying various filters, and using the Reset All button to clear author and date filters while preserving branch filters.

**Acceptance Scenarios**:

1. **Given** the filter panel is open, **When** I look at the panel, **Then** I see three sections: branch filter badges, author filter with dropdown and badges, and date range filter fields, laid out in the specified arrangement.
2. **Given** author and date filters are active, **When** I click the "Reset All" button, **Then** author and date filters are cleared but branch filter selections remain unchanged.
3. **Given** filter badges (branch or author) exceed the panel width, **When** the badges wrap to multiple lines, **Then** the panel height adjusts automatically to fit all content.
4. **Given** filters are active, **When** I look at the filter button in the control bar, **Then** the icon color reflects the combined filter state (filtered color when any filter is active, active color when panel is open, inactive when no filters applied).

---

### User Story 6 - Reusable Author Badge Component (Priority: P3)

As a user viewing author information, I want a consistent author badge appearance across the filter panel and the commit details panel, so that the interface feels cohesive and polished.

**Why this priority**: Visual consistency is important for user experience but is a lower priority than core filtering functionality.

**Independent Test**: Can be fully tested by comparing the author badge appearance in the filter panel with the author display in the commit details panel, verifying they use the same visual style (avatar icon + name).

**Acceptance Scenarios**:

1. **Given** the commit details panel is open, **When** I view the Author field, **Then** the author is displayed as a styled badge with an avatar icon and name (upgraded from plain text).
2. **Given** the filter panel shows selected author badges, **When** I compare them to the commit details panel author display, **Then** both use the same visual badge style (avatar + name), with the filter panel version additionally showing an X remove button.

---

### Edge Cases

- What happens when the repository has no commits? The filter panel opens but the author dropdown shows an empty list, and date fields have no constraints.
- What happens when the selected author has no commits in the current branch filter? The commit list shows an empty state message (e.g., "No commits match the current filters").
- What happens when From Date is after To Date? The system should still apply both filters; git handles this naturally (zero results with empty state message).
- What happens when the author list is very large (hundreds of contributors)? The dropdown should still be performant with the search/filter field allowing users to narrow down quickly.
- What happens when the user enters an invalid date manually? The date field shows a validation indicator and does not apply the invalid date as a filter.
- What happens when multiple filters are combined (branch + author + date)? All filters are AND-ed together, showing only commits matching all active filter criteria.
- What happens when branch filter badges wrap to many lines? The filter panel height adjusts dynamically up to a cap of ~3–4 lines, then scrolls internally.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an author filter dropdown that allows multi-selection of authors, with a search field that filters by both author name and email.
- **FR-002**: System MUST display the author dropdown options as avatar + name + email, with "All Authors" as the always-visible first option.
- **FR-003**: System MUST provide a complete author list sourced from the full repository history (all branches), deduplicated by email.
- **FR-004**: System MUST display selected author badges in the filter panel, styled with an avatar icon and author name, each with a removable X button.
- **FR-005**: System MUST provide From Date and To Date fields that support both date picker selection and manual date input, with optional time component.
- **FR-006**: System MUST validate manual date input and prevent time-only entries (date is required when time is provided).
- **FR-007**: System MUST apply date filters server-side: From Date filters commits from that date/time onward; To Date filters commits up to and including that date/time.
- **FR-008**: System MUST display branch filter selections as styled badges in the filter panel, matching the commit list badge style, with X buttons to remove individual branches.
- **FR-009**: System MUST combine branch badges when both local and remote versions of a branch are selected (showing one combined badge).
- **FR-010**: System MUST provide a "Reset All" button that clears author and date range filters but preserves branch filter selections. The button MUST be visible but disabled/grayed out when no author or date filters are active.
- **FR-011**: System MUST apply all filter types with AND logic (branch AND author AND date range). When filters produce zero matching commits, the commit list MUST display an empty state message (e.g., "No commits match the current filters").
- **FR-012**: System MUST unhide the filter button in the control bar that toggles the filter panel open/closed.
- **FR-013**: System MUST update the filter icon color to reflect combined filter state: filtered color (yellow) when any filter is active, active color (sky blue) when the panel is open, inactive color when no filters are applied.
- **FR-014**: System MUST provide right-click context menu on author cells with "Add Author to filter" or "Remove Author from filter" based on current filter state.
- **FR-015**: System MUST provide right-click context menu on date cells with "Filter from this date" and "Filter to this date" options.
- **FR-016**: System MUST provide right-click context menu on branch badges with "Add branch to filter" or "Remove branch from filter", respecting local/remote/combined branch types.
- **FR-017**: System MUST use a shared author badge component between the filter panel and the commit details panel, with the details panel version omitting the remove button.
- **FR-018**: System MUST extract a generic multi-select dropdown component used by both the branch filter and author filter dropdowns.
- **FR-019**: System MUST debounce date field changes (150ms) before triggering a data reload.
- **FR-020**: System MUST auto-adjust the filter panel height based on content (wrapped badges, multiple lines), up to a maximum height of approximately 3–4 lines. When content exceeds the maximum height, the panel MUST scroll internally.
- **FR-021**: When right-clicking a date and selecting "Filter from this date", the system MUST set the From Date to the date portion only (time defaults to 00:00).
- **FR-022**: When right-clicking a date and selecting "Filter to this date", the system MUST set the To Date to the date portion only (end-of-day behavior applied).
- **FR-023**: System MUST NOT implement filter features specifically for the classic (non-table) commit list view. Classic view is pending deprecation.
- **FR-024**: System MUST reset all filter state (branch, author, and date range filters) to defaults (no filters applied) on each session/panel open. Filter state is not persisted across sessions.
- **FR-025**: System MUST provide a single centralized reset method/event that resets ALL filter state (branch selections, author selections, date range, filter panel UI, and commit list reload) atomically. All reset triggers (session open, repo change, manual reset) MUST use this centralized method to prevent partial resets where some filters clear but others remain stale.

### Key Entities

- **Author**: Represents a commit author, identified by email address as the primary key, with a display name. One author may have multiple name/email combinations (handled by git's mailmap).
- **Filter State**: The combined state of all active filters — selected branches, selected authors, from date, and to date — that determines which commits are displayed.
- **Author Badge**: A visual component displaying an avatar icon and author name, optionally with a remove button. Shared between the filter panel and commit details panel.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can filter commits by selecting one or more authors and see results update within 2 seconds on a repository with 10,000+ commits.
- **SC-002**: Users can filter commits by date range and see results update within 2 seconds on a repository with 10,000+ commits.
- **SC-003**: Users can combine branch, author, and date range filters and see only commits matching all criteria simultaneously.
- **SC-004**: Users can add or remove filter criteria via right-click context menu in 2 clicks or fewer (right-click + menu selection).
- **SC-005**: The filter panel clearly displays all active filters (branches, authors, date range) at a glance without scrolling the panel horizontally.
- **SC-006**: Users can reset all non-branch filters with a single click using the "Reset All" button.
- **SC-007**: The filter icon in the control bar visually indicates whether any filters are active, enabling users to know their filter state without opening the panel.
- **SC-008**: Author display is visually consistent between the filter panel badges and the commit details panel author field.

## Assumptions

- The author list is fetched once on initial load and refreshed on fetch/refresh operations, not on every filter change.
- The existing branch filter dropdown in the control bar remains the primary way to add branches to the filter; the filter panel provides visibility and removal only.
- Git's native `--author` flag (substring matching with OR semantics for multiple authors) and `--after`/`--before` flags are sufficient for server-side filtering.
- The built-in Chromium date picker in the VS Code webview provides adequate UX for date selection without requiring a third-party date picker library.
- The classic (non-table) commit list view will not receive filter panel features and is pending deprecation.
- All filter state (branch, author, date range) is transient and resets to defaults on each session/panel open. No filter persistence across sessions.

## Clarifications

### Session 2026-04-04

- Q: Should filter state (authors, date range, branches) persist across sessions? → A: No. All filters (including branch filter) reset to defaults on each session/panel open. Filter state is transient.
- Q: Should the filter panel have a maximum height? → A: Yes. Cap at approximately 3–4 lines of height; content scrolls internally when it overflows.
- Q: How should filter resets be triggered across different scenarios (session open, repo change, manual reset)? → A: A single centralized reset method/event must handle all filter resets atomically. Previous version had bugs where partial resets occurred (e.g., dropdown reset but graph still filtered, or vice versa). All reset triggers must go through this centralized method.
- Q: What is the Reset All button state when no non-branch filters are active? → A: Visible but disabled/grayed out.
- Q: What should the user see when filters produce zero matching commits? → A: An empty state message (e.g., "No commits match the current filters") displayed in the commit list area.

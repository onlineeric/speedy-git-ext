# Feature Specification: Replace Filter Panel Date/Time Picker with react-datepicker

**Feature Branch**: `034-react-datepicker-filter`  
**Created**: 2026-04-06  
**Status**: Draft  
**Input**: User description: "Implement react-datepicker, use it to replace the date and time picker on filter panel. We need to make sure current logic will not break. We need to allow user only input date without time, or input both date and time. Only input time is not valid. User can input date and time manually by typing, there should be validation to validate is it valid. There should be a button to clear the value. We should use 24 hours format."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select Date Using Calendar Picker (Priority: P1)

A user opens the filter panel and wants to filter commits by a date range. They click on the "From" or "To" date field and a calendar dropdown appears. They select a date from the calendar. The selected date appears in the input field in a readable format. The commit list updates to show only commits within the specified date range.

**Why this priority**: This is the core interaction replacing the existing date picker. Without this, the feature has no value.

**Independent Test**: Can be fully tested by opening the filter panel, clicking a date field, selecting a date from the calendar, and verifying commits are filtered correctly.

**Acceptance Scenarios**:

1. **Given** the filter panel is open with no date filters applied, **When** the user clicks the "From" date field and selects a date from the calendar, **Then** the date appears in the input field and commits before that date are excluded from the list.
2. **Given** the filter panel is open with no date filters applied, **When** the user clicks the "To" date field and selects a date from the calendar, **Then** the date appears in the input field and commits after that date are excluded from the list.
3. **Given** a "From" date is already set, **When** the user selects a "To" date that creates a valid range, **Then** only commits within the date range are displayed.

---

### User Story 2 - Type Date and Time Manually (Priority: P1)

A user wants to specify an exact date or date-and-time by typing directly into the input field. They type a date (e.g., "2025-03-15") or a date with time (e.g., "2025-03-15 14:30"). The system validates the input in real-time and applies the filter when the input is valid.

**Why this priority**: Manual typing is essential for precise filtering and is equally important as calendar selection for power users.

**Independent Test**: Can be fully tested by typing various date and date-time strings into the input fields and verifying correct validation feedback and filtering behavior.

**Acceptance Scenarios**:

1. **Given** the filter panel is open, **When** the user types a valid date "2025-03-15" into the "From" field, **Then** the input is accepted and commits are filtered from that date (beginning of day).
2. **Given** the filter panel is open, **When** the user types a valid date-time "2025-03-15 14:30" into the "From" field, **Then** the input is accepted and commits are filtered from that exact date and time.
3. **Given** the filter panel is open, **When** the user types an invalid value (e.g., "2025-13-45" or "abc"), **Then** the input is visually marked as invalid and the filter is not applied.
4. **Given** the filter panel is open, **When** the user types only a time value without a date (e.g., "14:30"), **Then** the input is visually marked as invalid and the filter is not applied.

---

### User Story 3 - Clear Date Filter Value (Priority: P2)

A user has previously set a date filter and wants to remove it. They click a clear button associated with the date field to reset the filter value.

**Why this priority**: Clearing filters is a common and necessary operation, but secondary to the core set-filter workflow.

**Independent Test**: Can be fully tested by setting a date filter, clicking the clear button, and verifying the filter is removed and all commits are shown again.

**Acceptance Scenarios**:

1. **Given** a "From" date filter is currently applied, **When** the user clicks the clear button on the "From" field, **Then** the date value is removed and the "From" filter is no longer applied.
2. **Given** a "To" date filter is currently applied, **When** the user clicks the clear button on the "To" field, **Then** the date value is removed and the "To" filter is no longer applied.
3. **Given** no date filter is applied, **Then** the clear button is either hidden or visually indicates there is nothing to clear.

---

### User Story 4 - Select Date and Time Using Picker (Priority: P2)

A user wants to filter commits by a specific date and time combination. They use the picker to select a date and optionally add a time component for more precise filtering.

**Why this priority**: Time selection extends the core date selection functionality for users who need finer granularity.

**Independent Test**: Can be fully tested by selecting a date and time via the picker and verifying commits are filtered to that exact date-time boundary.

**Acceptance Scenarios**:

1. **Given** the filter panel is open, **When** the user selects a date and then sets a time of "14:30" using the time input, **Then** the combined date-time filter is applied.
2. **Given** the filter panel has a date selected, **When** the user adds a time component, **Then** the filter updates from whole-day filtering to precise date-time filtering.

---

### User Story 5 - Context Menu Date Filter Compatibility (Priority: P2)

A user right-clicks on a commit row and uses the context menu to set a "Filter from this date" or "Filter to this date". The react-datepicker fields in the filter panel reflect the selected date correctly.

**Why this priority**: This existing feature must continue to work seamlessly with the new date picker component.

**Independent Test**: Can be fully tested by right-clicking a commit, selecting a date filter option from the context menu, and verifying the filter panel date fields update correctly.

**Acceptance Scenarios**:

1. **Given** the user right-clicks on a commit, **When** they select "Filter from this date", **Then** the "From" date field in the filter panel shows the commit's date and commits are filtered accordingly.
2. **Given** the user right-clicks on a commit, **When** they select "Filter to this date", **Then** the "To" date field in the filter panel shows the commit's date and commits are filtered accordingly.

---

### Edge Cases

- What happens when the user types a partial date (e.g., "2025-03") and then leaves the field? The partial input should be treated as invalid and not applied as a filter.
- How does the system handle a "From" date that is after the "To" date? The filter should still be applied as-is (git handles this naturally by returning no results), consistent with current behavior.
- What happens when the user pastes a date string from clipboard? The pasted value should be validated the same way as typed input.
- What happens when the filter panel "Reset all filters" action is used? Both date fields should be cleared.
- What happens when the date picker calendar is open and the user scrolls the commit list? The calendar should remain anchored to the input field or close gracefully.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST replace the existing four native HTML inputs (date + time for "From", date + time for "To") with two single combined react-datepicker input fields (one for "From", one for "To"), each accepting date-only or date-with-time input.
- **FR-002**: System MUST allow the user to select a date from a visual calendar dropdown, which also includes a free-text time input field for optional time entry.
- **FR-003**: System MUST allow the user to type a date manually in the format `YYYY-MM-DD`.
- **FR-004**: System MUST allow the user to type a date with time manually in the format `YYYY-MM-DD HH:mm` (24-hour format).
- **FR-005**: System MUST use 24-hour time format for all time display and input.
- **FR-006**: System MUST treat date-only input as valid, using default times (beginning of day for "From", end of day for "To").
- **FR-007**: System MUST treat time-only input (without a date) as invalid and visually indicate the error.
- **FR-008**: System MUST validate manually typed input and visually indicate when the value is invalid using a red border (no error message text).
- **FR-009**: System MUST NOT apply filters when the input value is invalid.
- **FR-010**: System MUST provide a clear button on each date field to remove the filter value.
- **FR-011**: System MUST maintain the existing data flow: date values stored in ISO 8601 format (`YYYY-MM-DDTHH:MM:SS`) passed to the Zustand store and subsequently to the backend for git filtering.
- **FR-012**: System MUST continue to support the existing context menu "Filter from this date" and "Filter to this date" actions, with the new date picker fields reflecting the selected date.
- **FR-013**: System MUST continue to support the "Reset all filters" functionality, clearing both date picker fields.
- **FR-014**: System MUST debounce filter application when the user is typing, consistent with current behavior.
- **FR-015**: System MUST sync the date picker fields when external actions update the date filters (e.g., context menu, reset all filters).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can set date filters using the new picker in the same number of interactions or fewer compared to the current native inputs.
- **SC-002**: All existing date filter behaviors (context menu, reset, store sync) continue to function identically after the replacement.
- **SC-003**: 100% of valid date inputs (date-only and date-time) are correctly applied as commit filters.
- **SC-004**: 100% of invalid inputs (time-only, malformed dates) are rejected with clear visual feedback and do not trigger filtering.
- **SC-005**: Users can clear any date filter value with a single click.
- **SC-006**: The date picker visually integrates with the existing filter panel layout without causing layout shifts or overflow issues.

## Clarifications

### Session 2026-04-06

- Q: Should each From/To use a single combined input field or maintain separate date and time fields? → A: Single combined input per From/To (type date or date+time in one field).
- Q: Should the calendar popup include a time selection control, or should time only be enterable by typing in the input? → A: Include a free-text time input field within the calendar popup (showTimeInput).
- Q: Should invalid input display an error message or only visual styling? → A: Visual indicator only (red border), no error message text.

## Assumptions

- The react-datepicker library will be used as the calendar/date-time picker component, as explicitly requested by the user.
- The existing ISO 8601 format (`YYYY-MM-DDTHH:MM:SS`) used for backend communication will be preserved. The display format in the input field may differ for readability.
- The time input will use `HH:mm` format for display (hours and minutes), while the stored value will continue to include seconds (defaulting to `:00`).
- The calendar dropdown positioning will adapt to available space within the VS Code webview panel.
- No changes are needed to the backend (extension host) or shared types, as the data format remains the same.
- The existing 150ms debounce behavior for filter application will be preserved.

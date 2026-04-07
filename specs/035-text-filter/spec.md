# Feature Specification: Text Filter in Filter Widget

**Feature Branch**: `035-text-filter`  
**Created**: 2026-04-07  
**Status**: Draft  
**Input**: User description: "Add text filter to Filter Widget for hiding non-matching commits"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filter Commits by Message Text (Priority: P1)

A user wants to find commits related to a specific topic (e.g., "login", "refactor", "fix bug #42") and see only those commits in the graph, hiding all unrelated commits. They open the Filter panel, type their search text into the Message filter field, and the commit list immediately narrows to show only commits whose message or hash matches the text. The graph topology updates to reflect only the visible commits, with dotted lines indicating hidden connections.

**Why this priority**: This is the core value of the feature. Users migrating from SourceTree expect a filtered list view where non-matching commits are hidden, not just highlighted. Without this, the feature has no value.

**Independent Test**: Can be fully tested by opening the Filter panel, typing text into the Message field, and verifying that only commits matching the text remain visible in the graph.

**Acceptance Scenarios**:

1. **Given** commits exist with various messages, **When** the user types "login" in the Message filter field, **Then** only commits whose message contains "login" (case-insensitive) are shown, and all other commits are hidden.
2. **Given** commits exist with various hashes, **When** the user types a hash prefix of 4 or more characters in the Message filter field, **Then** commits matching that hash prefix are also shown.
3. **Given** the Message filter field has text, **When** the user clears the field, **Then** all commits become visible again (subject to other active filters).

---

### User Story 2 - Combine Text Filter with Other Filters (Priority: P1)

A user wants to narrow results further by combining the text filter with existing filters. For example, they want to see only commits by "Alice" that mention "auth". They set the Author filter to "Alice" and type "auth" in the Message filter. Only commits that match both criteria are shown.

**Why this priority**: The text filter must work as an AND operation with existing filters (Branch, Author, Date Range) to be useful in real workflows. This is fundamental to the feature's integration.

**Independent Test**: Can be tested by setting an Author filter and a Message filter simultaneously, then verifying only commits matching both criteria appear.

**Acceptance Scenarios**:

1. **Given** the Author filter is set to "Alice", **When** the user types "auth" in the Message filter, **Then** only commits by "Alice" whose message contains "auth" are shown.
2. **Given** both Author and Message filters are active, **When** the user removes the Author filter, **Then** all commits matching the Message filter text are shown (regardless of author).
3. **Given** both Author and Message filters are active, **When** the user resets all filters, **Then** all commits become visible.

---

### User Story 3 - Clear Text Filter (Priority: P2)

A user has filtered commits by message text and wants to quickly clear the text filter without clearing other filters. They click a clear button on the Message filter field to remove the text, restoring visibility of all commits (subject to other active filters).

**Why this priority**: Clearing a filter is a common action. A dedicated clear button improves usability but is not strictly required (the user can also manually select and delete the text).

**Independent Test**: Can be tested by setting a Message filter, clicking the clear button, and verifying the filter text is removed and commits reappear.

**Acceptance Scenarios**:

1. **Given** the Message filter has text, **When** the user clicks the clear button, **Then** the text is removed and all commits matching other active filters become visible.
2. **Given** the Message filter is empty, **Then** no clear button is shown.

---

### User Story 4 - Stash Entries Remain Visible (Priority: P2)

A user has stash entries in their repository. When they apply a text filter, stash entries always remain visible regardless of whether they match the filter text. This prevents users from accidentally losing track of their stashed changes.

**Why this priority**: Consistent with existing filter behavior where stash entries are never hidden. Important for data safety but not the primary use case.

**Independent Test**: Can be tested by having stash entries, applying a Message filter that doesn't match any stash entry, and verifying stash entries remain visible.

**Acceptance Scenarios**:

1. **Given** stash entries exist and a Message filter is set that does not match any stash entry, **When** the filter is applied, **Then** stash entries remain visible in the graph.

---

### Edge Cases

- What happens when the user types a very short string (1-2 characters)? The filter should still work, matching all commits containing that string.
- What happens when no commits match the filter text? The graph should show no commits (except stash entries), and the existing batch-prefetch and gap indicator behavior should handle this gracefully.
- What happens when the user types while commits are still loading? The filter should apply to currently loaded commits and automatically apply to newly loaded batches as they arrive.
- What happens with special characters in the filter text? The filter should perform a plain text match (not regex), so special characters are treated literally.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a text input field in the Filter panel labeled "Message" for filtering commits by message text.
- **FR-002**: System MUST hide commits whose message does not contain the filter text (case-insensitive plain text match).
- **FR-003**: System MUST also match commits whose hash starts with the filter text, when the filter text is 4 or more characters long.
- **FR-004**: System MUST combine the text filter as an AND operation with all other active filters (Branch, Author, Date Range).
- **FR-005**: System MUST never hide stash entries, regardless of the text filter value.
- **FR-006**: System MUST provide a clear button on the Message filter field when text is present, allowing users to remove the filter text.
- **FR-007**: System MUST apply the text filter with a short input delay (debounce) to avoid excessive recalculation during typing.
- **FR-008**: System MUST update the graph topology (including dotted lines for hidden connections) when the text filter changes, consistent with existing filter behavior.
- **FR-009**: System MUST clear the text filter when the user resets all filters.
- **FR-010**: System MUST apply the text filter to newly loaded commit batches as they arrive, consistent with existing filter behavior.
- **FR-011**: The existing Search feature (highlighting mode with Prev/Next navigation) MUST remain unchanged and continue to work independently of the text filter.

### Scope Boundaries

- **Message filter searches commit message and hash only.** Author and date are excluded because the Filter panel already has dedicated Author and Date Range filters for those fields. This avoids redundancy and keeps each filter's responsibility clear.
- **Client-side only.** The text filter operates on commits already fetched from the server. No new server calls are needed.
- **No changes to the Search feature.** Search (highlighting with navigation) and Filter (hiding) remain separate, independent features.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can filter commits by message text and see only matching results within 200ms of finishing typing, for repositories with up to 10,000 loaded commits.
- **SC-002**: The text filter combines correctly with all existing filters — applying Author + Date + Message filters together shows only commits matching all three criteria.
- **SC-003**: Users can clear the text filter in a single action (one click) and see all commits restored immediately.
- **SC-004**: Users familiar with SourceTree's search-as-filter behavior can achieve the same workflow in this extension without guidance.
- **SC-005**: Stash entries remain visible at all times, regardless of text filter state.

## Assumptions

- The text filter follows the same UX patterns as existing filters in the Filter panel (similar layout, consistent interaction patterns).
- The debounce duration for the text input is consistent with other debounced inputs in the Filter panel (150ms).
- The "Message" label is used to distinguish this filter from the existing "Search" feature, making it clear that this filter searches commit messages specifically.
- Hash matching uses a prefix match (starts-with) requiring at least 4 characters, consistent with the existing Search feature's hash matching behavior.

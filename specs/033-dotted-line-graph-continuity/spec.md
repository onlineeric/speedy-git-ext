# Feature Specification: Dotted-Line Graph Continuity

**Feature Branch**: `033-dotted-line-graph-continuity`  
**Created**: 2026-04-05  
**Status**: Draft  
**Input**: User description: "When filters hide commits from the graph, show dotted lines to maintain visual continuity between visible commits connected through hidden ones"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filtered Graph Shows Continuous Connections (Priority: P1)

As a developer viewing a git graph with an author filter applied, I see dotted lines connecting visible commits when hidden (filtered-out) commits exist between them, so I understand that the branch history is continuous even though some commits are not displayed.

**Why this priority**: This is the core value proposition. Without visual continuity, filtered graphs appear broken and misleading — users cannot tell whether a gap means "commits were filtered out" or "these commits are truly unrelated." This directly solves the disconnected-graph problem.

**Independent Test**: Can be fully tested by applying an author filter that excludes some intermediate commits and verifying that dotted lines appear between the remaining visible commits. Delivers immediate visual clarity for any filtered graph view.

**Acceptance Scenarios**:

1. **Given** a linear branch with commits A (Alice), B (Bob), C (Alice) in order, **When** the user excludes Bob via the author filter, **Then** a dotted line connects commit A to commit C in the graph, using the same lane color as the solid connections.
2. **Given** a branch where multiple consecutive commits are hidden by a filter, **When** the user views the graph, **Then** a single dotted line spans the full gap between the nearest visible commits above and below.
3. **Given** a visible commit whose only ancestors are all hidden (no visible ancestor exists in the loaded data), **When** the user views the graph, **Then** the visible commit appears as a root-like endpoint with no dangling or broken line below it.
4. **Given** a filtered graph with dotted lines, **When** the user compares dotted lines to solid lines, **Then** the two styles are visually distinct at a glance (different stroke pattern and/or opacity).

---

### User Story 2 - Instant Filter Toggle Without Data Reload (Priority: P2)

As a developer toggling author visibility filters, I see the graph update instantly without waiting for new data to load from the repository, so I can quickly explore different author views of the commit history.

**Why this priority**: If every filter toggle requires a backend round-trip, the experience is sluggish and discourages exploration. Instant toggling makes the filter a fluid, interactive tool rather than a slow query mechanism.

**Independent Test**: Can be tested by toggling author filters on and off and measuring that the graph re-renders without any loading indicator or network request. Delivers a responsive, interactive filtering experience.

**Acceptance Scenarios**:

1. **Given** a graph with commits loaded and an author filter panel open, **When** the user toggles an author's visibility, **Then** the graph updates immediately without a loading spinner or progress indicator.
2. **Given** a graph with commits loaded, **When** the user toggles the same author filter on and off repeatedly, **Then** the graph returns to the exact same state each time with no data inconsistencies.
3. **Given** a graph showing dotted lines from a previous filter, **When** the user changes the filter to include all authors, **Then** all dotted lines revert to solid lines and all previously hidden commits reappear.

---

### User Story 3 - Dotted Lines Preserve Lane Colors (Priority: P2)

As a developer viewing a filtered graph with multiple branches, I see that dotted lines maintain the same color as their lane, so I can visually track which branch a connection belongs to even through hidden segments.

**Why this priority**: Color consistency is essential for graph readability. If dotted lines used a different color or a single generic color, users would lose the ability to visually trace branches through filtered sections.

**Independent Test**: Can be tested by filtering out commits on a multi-branch graph and verifying that each dotted line segment uses the same color as the lane it belongs to. Delivers consistent visual branch tracking.

**Acceptance Scenarios**:

1. **Given** a graph with two branches in different lane colors, **When** commits are hidden on both branches via a filter, **Then** each branch's dotted lines use that branch's assigned lane color.
2. **Given** a visible commit connected to a visible ancestor via a dotted line, **When** the user inspects the dotted line color, **Then** it matches the lane color of the originating commit's lane.

---

### User Story 4 - Filter-Agnostic Continuity for Future Filters (Priority: P3)

As a product maintainer, when new filter types are added in the future (e.g., search by commit message, custom property filters), the dotted-line continuity works automatically without requiring changes to the graph rendering logic.

**Why this priority**: Designing the solution to be filter-agnostic from the start avoids rework when future filters are introduced. This is an architectural quality attribute rather than a direct user-facing feature.

**Independent Test**: Can be tested by simulating a new filter type that hides arbitrary commits and verifying that dotted lines appear correctly without any modifications to the graph display logic.

**Acceptance Scenarios**:

1. **Given** the graph continuity system is in place, **When** a new filter type hides commits by a different property (e.g., commit message content), **Then** dotted lines appear between visible commits connected through newly-hidden ones without any changes to graph rendering.

---

### User Story 5 - Scroll-Triggered Prefetch With Filter-Aware Capping (Priority: P2)

As a developer scrolling through a filtered graph, the system automatically loads more commits in the background as I scroll — the same way it does without filters — but stops after 3 consecutive empty batches to avoid excessive loading in large repositories, and shows me a gap indicator with a way to continue.

**Why this priority**: Without this, the existing background prefetch mechanism breaks when filters are active (the scroll trigger operates on visible row positions but the batch boundaries are based on total loaded commits). This ensures smooth scrolling parity with the unfiltered experience while protecting against runaway fetching.

**Independent Test**: Can be tested by applying a filter that hides most commits and scrolling to the bottom — verify that batches load automatically, stop after 3 empty batches, and a gap indicator with a continue action appears.

**Acceptance Scenarios**:

1. **Given** a filtered graph where the user scrolls near the end of visible commits, **When** the scroll position reaches the prefetch trigger threshold, **Then** the system fetches the next batch in the background (same as unfiltered behavior).
2. **Given** a prefetch returns a batch with zero visible commits after filtering, **When** fewer than 3 consecutive empty batches have occurred, **Then** the system automatically fetches the next batch.
3. **Given** a prefetch returns a batch with at least 1 visible commit, **When** the batch is appended, **Then** the consecutive empty batch counter resets to zero and normal prefetch behavior resumes.
4. **Given** 3 consecutive batches have returned zero visible commits, **When** the cap is reached, **Then** the system stops fetching and displays a gap indicator at the bottom of the list showing the count of filtered-out commits, the total records already fetched, and instructional text to scroll down for more.
5. **Given** a gap indicator is displayed, **When** the user scrolls past the indicator, **Then** the system fetches 1 more batch and re-applies the same capping logic (reset counter, try up to 3 more empty batches).
6. **Given** the repository has no more commits (`hasMore` is false), **When** the last batch is processed, **Then** the system stops fetching regardless of empty batch count and shows no gap indicator.

---

### Edge Cases

- **Hidden merge commits**: When a hidden commit is a merge (has multiple parents), the continuity line follows the mainline (first parent) path. Secondary parents of hidden commits are not traced to avoid visual noise.
- **Multiple filters hiding the same commit**: A commit hidden by more than one active filter is treated identically to one hidden by a single filter — no double-counting or visual difference.
- **Stash entries**: Stash commits are never hidden by visibility filters and remain visible regardless of filter state.
- **Entire loaded history is hidden**: If filters hide all loaded commits, the graph displays an empty state rather than only dotted lines.
- **Load-more with active filters**: When the user loads more commits while a visibility filter is active, newly loaded commits are correctly classified as visible or hidden and the graph continuity updates accordingly.
- **Extreme filter ratios**: When a filter excludes 95%+ of commits, the 3-batch cap prevents fetching the entire repository. The user sees a gap indicator and can choose to continue loading incrementally.
- **Filter changed during prefetch**: If the user changes the filter while a prefetch is in flight, the generation tracking mechanism discards the stale response and the new filter state is applied to subsequently loaded data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a visibility filter hides commits that sit between two visible commits in the same ancestry chain, the system MUST display a dotted/dashed line connecting those visible commits.
- **FR-002**: Dotted connection lines MUST use the same lane color as the lane they belong to, maintaining visual branch identity.
- **FR-003**: Dotted connection lines MUST be visually distinct from solid connection lines (different stroke pattern and reduced opacity).
- **FR-004**: The graph continuity mechanism MUST be filter-agnostic — it operates on a set of hidden commit identifiers regardless of which filter produced them.
- **FR-005**: Toggling a visibility filter (e.g., author selection) MUST update the graph display without triggering a data reload from the repository.
- **FR-006**: When no visible ancestor exists for a visible commit (all ancestors are hidden or not loaded), the system MUST render the commit as a root-like endpoint without broken or dangling lines.
- **FR-007**: When a visibility filter is cleared (all commits become visible), all dotted lines MUST revert to solid lines and all previously hidden commits MUST reappear in the graph.
- **FR-008**: Passing lane indicators (vertical lines passing through rows where a lane continues but has no commit node) MUST also use the dotted style when they pass through a hidden segment.
- **FR-009**: The system MUST correctly handle hidden merge commits by following the mainline (first parent) for continuity, ignoring secondary parents of hidden commits.
- **FR-010**: Stash entries MUST never be hidden by visibility filters.
- **FR-011**: When the user hovers over a dotted line segment, the system MUST display a tooltip showing the number of hidden commits in that gap.
- **FR-012**: When a visibility filter is active, the scroll-triggered prefetch MUST operate on visible commit row positions, not total loaded commit positions, to ensure the trigger fires correctly.
- **FR-013**: During prefetch with a visibility filter active, if a fetched batch yields zero visible commits after filtering, the system MUST automatically fetch the next batch until at least 1 visible commit is found or the consecutive empty batch cap is reached.
- **FR-014**: The system MUST stop automatic prefetching after 3 consecutive batches that yield zero visible commits (hardcoded cap).
- **FR-015**: When the 3-batch cap is reached, the system MUST display a gap indicator at the bottom of the list showing: (a) the count of filtered-out commits, (b) the total number of records already fetched, and (c) instructional text indicating the user can scroll down to load more (e.g., "keep scrolling down to fetch next batch").
- **FR-016**: When the user scrolls past the gap indicator, the system MUST fetch 1 batch, reset the consecutive empty batch counter, and re-apply the same capping logic.

### Key Entities

- **Visible Commit**: A commit that passes all active visibility filters and is rendered as a node in the graph.
- **Hidden Commit**: A commit present in the loaded data but excluded from display by one or more active visibility filters. Hidden commits are not rendered as nodes but their ancestry relationships are used to compute dotted connections.
- **Dotted Connection**: A visual link between two visible commits indicating that one or more hidden commits exist in the ancestry path between them. Rendered as a dashed/dotted line in the lane color.
- **Visibility Filter**: Any filter that selectively hides individual commits by a property (e.g., author, future: message search, custom property). Distinct from structural filters (e.g., branch selection) which constrain which commits are fetched.
- **Gap Indicator**: A UI element displayed at the bottom of the graph when the 3-batch prefetch cap is reached with zero visible commits found. Shows the count of filtered-out commits and provides a user action to continue loading.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can visually trace branch continuity through any number of filtered-out commits — no disconnected segments appear in the graph when hidden commits exist between visible ones.
- **SC-002**: Toggling a visibility filter updates the graph display in under 100ms for repositories with up to 2,000 loaded commits, and under 500ms for up to 10,000 loaded commits, with no loading indicator shown.
- **SC-003**: Dotted lines are distinguishable from solid lines by users in a side-by-side comparison without any legend or explanation.
- **SC-004**: Adding a new visibility filter type requires zero changes to the graph rendering or connectivity logic — only filter definition and UI control are needed.
- **SC-005**: The graph displays identically (same connections, colors, lanes) whether a filter is toggled off-then-on or was never applied — no state drift from repeated filter toggling.
- **SC-006**: When a visibility filter excludes most commits, the system fetches at most 3 consecutive empty batches before stopping and showing a gap indicator — preventing runaway loading in large repositories.

## Clarifications

### Session 2026-04-05

- Q: Should dotted line segments display information about hidden commit count (tooltip, badge, or nothing)? → A: Show hidden commit count as a tooltip when hovering over a dotted line segment.
- Q: When visibility filters reduce visible commits, how should pagination/prefetch compensate? → A: Reuse existing scroll-triggered prefetch. When a batch yields 0 visible commits, auto-fetch the next batch. Stop after 3 consecutive empty batches (hardcoded cap). Show a gap indicator with filtered-out count and a continue action. Consecutive empty counter resets when any visible commit is found. Loading state while fetching is acceptable.
- Q: Should the system increase individual batch size when visibility filters are active, or rely on the auto-retry mechanism? → A: No separate batch-size increase. Each batch stays at the configured batch size. The auto-retry mechanism (FR-013/FR-014) compensates by fetching up to 3 consecutive batches when no visible commits are found, stopping as soon as any batch yields visible results. This effectively provides up to 3x data without changing per-batch size.
- Q: Should the gap indicator use a button, scroll trigger, or both to continue loading? → A: Scroll trigger only. The gap indicator appears at the end of the list with instructional text (e.g., "keep scrolling down to fetch next batch") and displays the number of records already fetched so the user knows fetching is happening. Scrolling past the indicator triggers the next batch.
- Q: Should clicking a dotted line segment do anything beyond the hover tooltip? → A: No click action. Hover tooltip showing hidden commit count only.
- Q: Should the dotted line tooltip include any detail beyond the hidden commit count? → A: Count only (e.g., "3 hidden commits"). No author names or commit details.
- Q: Should the spec define a performance target for larger repositories beyond 2000 commits? → A: Yes, add target: under 500ms for up to 10,000 loaded commits.
- Q: Should all author filtering use client-side filtering, or keep the legacy server-side `filters.author` (singular) path? → A: All author filtering must use client-side filtering. Remove the legacy `--author` server-side path so the store consistently holds all commits regardless of which author filter interface triggered the query.

## Assumptions

- The existing graph topology algorithm correctly handles unfiltered commit rendering; this feature builds on top of that foundation.
- Visibility filters currently in scope are limited to author filtering; the architecture is designed to support future filter types without rework.
- The "load more" pagination mechanism already exists and will continue to work with the addition of client-side filtering.
- Typical loaded commit counts range from 500 to 2000, making O(n) per-filter client-side computation negligible for performance.
- Structural filters (branch selection, date range) remain server-side and do not interact with the dotted-line mechanism.
- All author filtering (including the legacy singular `filters.author` path) is migrated to client-side filtering; no `--author` flag is passed to git when visibility filters are active.

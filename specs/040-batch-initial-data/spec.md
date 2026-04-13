# Feature Specification: Batch Initial Data — Single Render on Load

**Feature Branch**: `040-batch-initial-data`  
**Created**: 2026-04-13  
**Status**: Draft  
**Input**: User description: "Batch initial data into single render on load to eliminate UI flicker and redundant topology computations"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Flicker-Free Initial Graph Load (Priority: P1)

When a user opens the Speedy Git graph view, they currently see an incomplete graph that progressively fills in — first commits appear without the uncommitted changes node, then the uncommitted node pops in, then stashes appear. This creates a jarring, unsettled experience. Instead, the user should see a loading indicator followed by the complete, fully-settled graph in a single visual transition.

**Why this priority**: This is the core user-facing problem. The flickering graph on every open/refresh undermines the "speedy" brand promise and gives users the impression the tool is still loading even after content appears. Eliminating this flicker is the primary reason for this feature.

**Independent Test**: Can be tested by opening the graph view in a repository with uncommitted changes and stashes, and verifying that the graph appears fully settled in one visual step after the loading indicator.

**Acceptance Scenarios**:

1. **Given** a repository with commits, uncommitted changes, and stashes, **When** the user opens the graph view, **Then** the graph displays all elements (commits, uncommitted node, stashes) in a single visual update after the loading indicator disappears.
2. **Given** a repository with commits but no uncommitted changes and no stashes, **When** the user opens the graph view, **Then** the graph displays all commits in a single visual update without any intermediate partial renders.
3. **Given** a repository with commits and uncommitted changes but no stashes, **When** the user opens the graph view, **Then** the uncommitted node appears simultaneously with the commit graph, not as a delayed second render.

---

### User Story 2 - Flicker-Free Graph Refresh (Priority: P1)

When the user manually refreshes the graph or when an auto-refresh is triggered (e.g., after switching branches, pulling, or committing), the graph currently flickers through multiple intermediate states. During refresh, the current graph remains visible with a subtle refresh indicator (e.g., toolbar spinner) while new data is being fetched. Once all data arrives, the graph updates in-place in a single visual step — no intermediate partial states, no blank screen.

**Why this priority**: Refresh happens far more frequently than initial load (every commit, every branch switch, every file save with auto-refresh enabled). Flickering on refresh is more disruptive because it interrupts the user's active workflow.

**Independent Test**: Can be tested by making a commit in a repository and observing the graph refresh — the current graph should remain visible with a refresh indicator, then update in one visual transition without intermediate states.

**Acceptance Scenarios**:

1. **Given** the graph is currently displayed, **When** the user triggers a manual refresh, **Then** the current graph remains visible with a subtle refresh indicator, and updates to the new state in a single visual transition once data arrives.
2. **Given** the graph is displayed and auto-refresh is enabled, **When** a file change triggers auto-refresh, **Then** the current graph stays visible and updates smoothly without showing intermediate states where some data is new and some is stale.
3. **Given** the graph is displayed, **When** a refresh is in progress, **Then** a subtle refresh indicator is visible so the user knows an update is happening.

---

### User Story 3 - Reduced Graph Computation on Load (Priority: P2)

The graph topology (lane assignments, connection paths, colors) is currently recomputed multiple times during a single load/refresh cycle — once when commits arrive, again when uncommitted changes arrive, and again when stashes arrive. This wastes CPU and delays the time to settled display. The topology should be computed exactly once per load or refresh cycle.

**Why this priority**: While less visible than flicker, redundant computations slow down the time-to-settled-graph, especially on repositories with many commits. This becomes more noticeable on lower-powered machines.

**Independent Test**: Can be tested by measuring topology computation count during a single load cycle — should be exactly one computation per load/refresh.

**Acceptance Scenarios**:

1. **Given** a repository with commits, uncommitted changes, and stashes, **When** the graph loads, **Then** the graph topology is computed exactly once (not three times).
2. **Given** a large repository (500+ commits), **When** the graph refreshes, **Then** the time from refresh trigger to settled display is reduced compared to the current multi-computation approach.

---

### User Story 4 - Targeted Updates Remain Functional (Priority: P1)

Individual operations (stage/unstage a file, rename a branch, drop a stash) currently trigger targeted updates that only refresh the affected data. These targeted, incremental updates must continue to work correctly — the batched approach applies only to full load/refresh cycles, not to individual operations.

**Why this priority**: Breaking targeted updates would be a regression that harms the very performance this feature aims to improve. Individual operations must remain fast and not trigger a full data reload.

**Independent Test**: Can be tested by staging a file and verifying that only the uncommitted changes data refreshes, not the entire graph.

**Acceptance Scenarios**:

1. **Given** the graph is displayed, **When** the user stages or unstages a file, **Then** only the uncommitted changes section updates — commits, branches, and stashes are not re-fetched.
2. **Given** the graph is displayed, **When** the user renames a branch, **Then** only the branch data updates without triggering a full graph reload.
3. **Given** the graph is displayed, **When** the user drops a stash, **Then** only the stash data updates without triggering a full graph reload.

---

### Edge Cases

- What happens when one data source fails during initial load (e.g., submodule status fails but commits succeed)? The graph should still display all successfully fetched data, show a non-blocking notification listing the failed data source(s), and use sensible defaults (e.g., empty list) for the failed data.
- What happens when the repository has no commits (empty repo)? The graph should handle this gracefully, showing only the uncommitted changes node if uncommitted changes exist.
- What happens when the fingerprint-based optimization determines that commits haven't changed since the last load? The system should skip the commit fetch but still fetch and send other data (branches, stashes, uncommitted changes) in a lightweight batch, since these can change independently of commits.
- What happens during a rebase conflict when additional conflict information needs to be included? The conflict state should be included in the batched data without requiring a separate follow-up message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST deliver all initial graph data (commits, branches, stashes, uncommitted changes, remotes, authors, worktrees, submodules, cherry-pick state, rebase state, revert state) as a single coordinated update during full load and refresh cycles.
- **FR-002**: System MUST compute the graph topology (lane assignments, connections, colors) exactly once per full load or refresh cycle, using the complete dataset.
- **FR-003**: System MUST render the graph in a single visual update after a full load or refresh, with no intermediate partial states visible to the user.
- **FR-004**: System MUST continue to support targeted, incremental updates for individual operations (stage/unstage, branch rename, stash drop, etc.) without triggering a full data reload.
- **FR-005**: System MUST fetch all data sources concurrently during full load/refresh to minimize wall-clock time.
- **FR-006**: System MUST gracefully handle partial failures — if one data source fails during load, successfully fetched data should still be displayed and the failed data should use sensible defaults (e.g., empty list for stashes if stash fetch fails). The system MUST show a non-blocking notification (e.g., toast or status bar message) listing which data source(s) failed to load.
- **FR-007**: System MUST preserve the existing fingerprint-based optimization for commit data. When the commit fingerprint is unchanged, the system MUST skip the commit fetch but still fetch and batch other data sources (branches, stashes, uncommitted changes, etc.) since they can change independently of commits.
- **FR-008**: During initial load, the system MUST show a loading indicator during the data fetch phase and hide it only after all data has been received and rendered.
- **FR-009**: During refresh, the system MUST keep the current graph visible and show a subtle refresh indicator (e.g., toolbar spinner) while fetching new data. The graph MUST NOT be replaced by a loading screen during refresh.

### Key Entities

- **Initial Data Bundle**: A complete snapshot of all data needed to render the full graph view — commits, branches, stashes, uncommitted changes status, remotes, authors, worktree list, submodule status, and operation states (cherry-pick, rebase, revert).
- **Targeted Update**: A focused data refresh affecting only one data category (e.g., uncommitted changes after staging), used for individual operations outside of full load/refresh cycles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The graph view displays zero intermediate visual states during initial load — users see loading indicator, then the fully-settled graph, with no flicker or progressive element appearance.
- **SC-002**: The graph view displays zero intermediate visual states during refresh — the graph transitions directly from the previous state to the updated state in a single step.
- **SC-003**: Graph topology computation occurs exactly once per full load/refresh cycle, reduced from the current three computations.
- **SC-004**: Total wall-clock time from load/refresh trigger to settled graph display is equal to or less than the current time (parallel data fetching should offset the batching overhead).
- **SC-005**: Individual operations (stage, unstage, branch rename, stash drop) continue to update in under 1 second without triggering a full graph reload.
- **SC-006**: When one data source fails during load, the graph still renders with all successfully fetched data — no blank screen or full-page error.

## Clarifications

### Session 2026-04-13

- Q: During refresh, should the current graph stay visible or be replaced by a loading spinner? → A: Current graph stays visible with a subtle refresh indicator (e.g., toolbar spinner); graph updates in-place once new data arrives.
- Q: When one data source fails during load, should the user be notified? → A: Yes, show a non-blocking notification (toast/status bar) listing which data source(s) failed, while still rendering the graph with available data.
- Q: When the commit fingerprint is unchanged, should the entire batch be skipped or should non-commit data still be fetched? → A: Skip only the commit fetch; still fetch and batch other data (branches, stashes, uncommitted changes) since they can change independently of commits.

## Assumptions

- The commits fetch is the longest-running data source and will remain the bottleneck, so fetching other data sources in parallel adds negligible wall-clock time.
- Avatar fetching (GitHub/Gravatar) is fire-and-forget and remains separate from the batched data flow, as it is non-blocking and may complete after the graph renders.
- Branch filter validation (which requires branch data) will be handled before or as part of the parallel fetch, preserving the current behavior where invalid branch filters are detected before commits are fetched.
- The existing auto-refresh fingerprint optimization applies only to commit data. When the fingerprint is unchanged, commits are reused from the previous load, but all other data sources are still fetched and batched since they can change independently.

## Scope Boundaries

### In Scope

- Batching all data delivery for full load and full refresh cycles
- Reducing graph topology computations from three to one per cycle
- Eliminating visual flicker during load and refresh
- Graceful partial failure handling

### Out of Scope

- Changing how targeted/incremental updates work for individual operations
- Modifying the avatar fetching mechanism
- Changing the graph topology algorithm itself
- Altering the virtual scrolling or commit rendering approach
- Adding new data sources beyond what is currently fetched

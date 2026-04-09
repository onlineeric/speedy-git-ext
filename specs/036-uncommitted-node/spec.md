# Feature Specification: Uncommitted Changes Node

**Feature Branch**: `036-uncommitted-node`  
**Created**: 2026-04-09  
**Status**: Draft  
**Input**: User description: "Add an uncommitted changes node to the git graph so users can see working-tree state at a glance and inspect changed files like any real commit."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See Uncommitted Changes at a Glance (Priority: P1)

As a developer working in a repository, I want to see my uncommitted changes (staged, unstaged, and untracked files) as a visually distinct node at the top of the git graph, so I can quickly understand my working tree state without leaving the graph view.

**Why this priority**: This is the core value proposition. Every competing tool (GitKraken, Fork, SourceTree, Git Graph by mhutchie, GitLens) shows an uncommitted changes indicator in their graph. Without this, the graph shows stale history and users must switch to VS Code's SCM panel to see current working tree state. This is the most-requested missing feature for a developer-friendly git graph tool.

**Independent Test**: Can be fully tested by making changes to files in a repo, opening the graph, and verifying the uncommitted node appears at the top with correct file count. Delivers immediate value by showing working tree state in the graph.

**Acceptance Scenarios**:

1. **Given** a repository with staged, unstaged, or untracked files, **When** the user opens the git graph, **Then** an "Uncommitted Changes" node appears at the top of the graph (index 0), visually connected to the HEAD commit.
2. **Given** a repository with no uncommitted changes (clean working tree), **When** the user opens the git graph, **Then** no uncommitted changes node is shown.
3. **Given** the uncommitted node is visible, **When** the user commits all changes (working tree becomes clean), **Then** the uncommitted node disappears automatically on the next refresh.
4. **Given** the uncommitted node is visible, **When** the user applies author, date, or text filters, **Then** the uncommitted node remains visible — it is never hidden by these filters.
5. **Given** the uncommitted node is visible, **When** the user applies a branch filter that excludes the current/HEAD branch, **Then** the uncommitted node is hidden.
6. **Given** the uncommitted node is visible, **When** the user looks at the graph, **Then** the node is visually distinct from regular commits (different styling) so it is immediately recognizable.

---

### User Story 2 - Inspect Uncommitted File Changes (Priority: P1)

As a developer, I want to click the uncommitted changes node and see the list of all changed files (staged, unstaged, untracked) in the commit details panel, so I can inspect what has changed without leaving the graph.

**Why this priority**: Seeing the node alone is only half the value. Being able to inspect file changes makes this a truly useful feature — on par with how users inspect any committed change. This is essential for the "developer-friendly tool" goal.

**Independent Test**: Can be tested by selecting the uncommitted node and verifying the details panel shows all changed files with correct status badges, in both list and tree view modes.

**Acceptance Scenarios**:

1. **Given** the uncommitted node exists, **When** the user clicks/selects it, **Then** the commit details panel opens showing all staged, unstaged, and untracked files with their change status (added, modified, deleted, renamed, untracked).
2. **Given** the details panel is open for the uncommitted node, **When** the user switches between list and tree view modes, **Then** files are displayed correctly in both modes.
3. **Given** the details panel is open for the uncommitted node, **When** the user views file status badges, **Then** each file shows the correct status badge (using existing badge styling).
4. **Given** the details panel is open for the uncommitted node, **When** metadata is displayed, **Then** it shows "Uncommitted Changes" as the subject, appropriate placeholder values for author/hash, and a current timestamp.

---

### User Story 3 - Diff Uncommitted Files (Priority: P2)

As a developer, I want to click on a file in the uncommitted changes details panel and see a diff view, so I can review exactly what changed in each file.

**Why this priority**: Diff viewing completes the inspection workflow. Without it, users can see which files changed but not what changed — they'd still need to switch to another tool. This makes the feature a complete replacement for switching context.

**Independent Test**: Can be tested by selecting a file from the uncommitted node's details panel and verifying a diff view opens showing changes against HEAD.

**Acceptance Scenarios**:

1. **Given** the user is viewing uncommitted file changes in the details panel, **When** the user clicks a staged or unstaged file, **Then** a diff view opens showing changes compared to HEAD.
2. **Given** the user is viewing uncommitted file changes, **When** the user clicks an untracked file, **Then** a view opens showing the full file content (new file diff).
3. **Given** the diff view is open for an uncommitted file, **When** the user views it, **Then** the diff is displayed using the same diff viewer used for committed file changes.

---

### User Story 4 - Uncommitted Node Auto-Refreshes (Priority: P2)

As a developer, I want the uncommitted changes node to update automatically when I save files, stage changes, or perform git operations, so the graph always reflects the current working tree state.

**Why this priority**: Stale data undermines the value of showing uncommitted changes. Auto-refresh ensures the feature is reliable and trustworthy without requiring manual intervention.

**Independent Test**: Can be tested by making file changes while the graph is open and verifying the uncommitted node appears/disappears/updates without manual refresh.

**Acceptance Scenarios**:

1. **Given** the graph is open with a clean working tree, **When** the user modifies a file outside the graph, **Then** the uncommitted node appears automatically after the file system watcher triggers a refresh.
2. **Given** the uncommitted node is visible showing 3 changed files, **When** the user stages one file, **Then** the node updates to reflect the current change count.
3. **Given** the uncommitted node is visible, **When** the user commits all changes, **Then** the uncommitted node disappears automatically.
4. **Given** the uncommitted node is selected with the details panel open, **When** a file change triggers an auto-refresh, **Then** the details panel stays open and updates its content with the latest file changes without losing the user's selection.

---

### User Story 5 - Uncommitted Node Context Menu (Priority: P3)

As a developer, I want the uncommitted changes node to have an appropriate context menu that does not offer irrelevant commit operations (checkout, reset, cherry-pick, etc.).

**Why this priority**: Showing commit-specific actions for a non-commit node would be confusing and error-prone. A minimal or no-op context menu is needed for correctness, but this is lower priority than the core display and inspection features.

**Independent Test**: Can be tested by right-clicking the uncommitted node and verifying no irrelevant commit actions appear.

**Acceptance Scenarios**:

1. **Given** the uncommitted node is visible, **When** the user right-clicks it, **Then** the standard commit context menu is NOT shown (no checkout, reset, cherry-pick, revert, etc.).
2. **Given** the uncommitted node is visible, **When** the user right-clicks it, **Then** either no context menu appears, or a minimal context menu appears with only "Refresh" as an option.

---

### Edge Cases

- What happens when the user is in a detached HEAD state? The uncommitted node should still appear if there are changes, with its parent set to the detached HEAD commit.
- What happens during a rebase or merge conflict? The uncommitted node should still show uncommitted changes; conflict state does not suppress it.
- What happens when the repository has thousands of uncommitted files (e.g., after a large code generation)? The node should still render performantly; the file list in the details panel should handle large lists without freezing.
- What happens when the graph is filtered to a branch that is not the current branch? The uncommitted node is hidden when the branch filter excludes the current/HEAD branch, to avoid showing unrelated working tree changes when inspecting another branch's history.
- What happens when multiple repositories are open in a multi-root workspace? Each repository's graph should show its own uncommitted node independently.
- What happens if fetching uncommitted status fails (git process error, corrupted index, locked repository)? The uncommitted node is silently omitted — the graph shows commits only. The next file watcher refresh cycle retries automatically. No error UI is shown for this transient failure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display an "Uncommitted Changes" node at the top of the git graph (position 0, above all commits and stashes) when the working tree has any staged, unstaged, or untracked changes.
- **FR-002**: System MUST hide the uncommitted node when the working tree is completely clean (no staged, unstaged, or untracked changes).
- **FR-003**: The uncommitted node MUST be visually distinct from regular commit nodes so users can immediately recognize it (different visual styling from commits and stashes).
- **FR-004**: The uncommitted node MUST connect to the HEAD commit via a graph edge, positioned on the same lane as HEAD.
- **FR-005**: The uncommitted node MUST be exempt from author, date, and text filters — it is always visible when changes exist, matching the behavior of stash nodes. However, when a branch filter is active, the uncommitted node MUST only appear if the current/HEAD branch is included in the filter. This avoids confusing users who are viewing other branches' history.
- **FR-006**: When the uncommitted node is selected, the commit details panel MUST display all changed files (staged, unstaged, untracked) with correct status badges (added, modified, deleted, renamed, untracked).
- **FR-007**: The commit details panel for the uncommitted node MUST support both list and tree view modes for the file list.
- **FR-008**: Clicking a file in the uncommitted node's details panel MUST open a diff view showing changes against HEAD (for tracked files) or full file content (for untracked files).
- **FR-009**: The uncommitted node MUST refresh automatically when the file system watcher detects changes (using existing watcher infrastructure). If the uncommitted node is currently selected with the details panel open, the panel MUST stay open and auto-update its content with the latest file changes — the user's selection is not lost on refresh.
- **FR-010**: The uncommitted node MUST NOT show the standard commit context menu. It should either show no context menu or a minimal one with only a "Refresh" action.
- **FR-011**: The uncommitted node MUST use a well-known constant identifier (not a real git hash) so all layers can identify it without ambiguity.
- **FR-012**: The uncommitted node MUST work correctly in detached HEAD state, with its parent set to the current HEAD commit.
- **FR-013**: The subject line of the uncommitted node MUST display "Uncommitted Changes" followed by a categorized file count summary in parentheses, e.g., "Uncommitted Changes (3 staged, 2 modified, 1 untracked)". Categories with zero count are omitted. If all categories are zero (should not occur since the node is hidden when clean), the label falls back to "Uncommitted Changes".

### Key Entities

- **Uncommitted Node**: A synthetic (non-git) graph node representing the current working tree state. Has a constant identifier, connects to HEAD as its parent, and contains a collection of file changes.
- **File Change**: An individual file modification in the working tree, classified as staged, unstaged, or untracked, with a change status (added, modified, deleted, renamed, copied, untracked).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can identify whether they have uncommitted changes within 1 second of viewing the graph, without scrolling or switching panels.
- **SC-002**: Users can view the full list of uncommitted file changes within 2 clicks (select node, panel opens).
- **SC-003**: Users can open a diff for any uncommitted file within 3 clicks (select node, select file, diff opens).
- **SC-004**: The uncommitted node appears/disappears within the existing file watcher refresh cycle (no additional latency beyond current refresh debounce).
- **SC-005**: Graph rendering performance is not degraded — adding the uncommitted node does not increase graph render time by more than 5% compared to current performance with the same commit set.
- **SC-006**: The feature works identically across all repository states: normal branch, detached HEAD, during rebase, during merge conflict.
- **SC-007**: 100% of users who have uncommitted changes see the node without any configuration — the feature is on by default with no setup required.

## Clarifications

### Session 2026-04-09

- Q: Should the uncommitted node appear when the branch filter excludes the current/HEAD branch? → A: No — visible only when the current/HEAD branch is included in the branch filter, to avoid confusing users viewing other branches' history.
- Q: Should there be a user setting to disable the uncommitted node? → A: No — always shown when changes exist, no opt-out setting. Keeps the feature simple and universally available.
- Q: Should the node subject line be static or dynamic? → A: Dynamic with categorized count — "Uncommitted Changes (3 staged, 2 modified, 1 untracked)". Zero-count categories omitted.
- Q: What happens to the details panel when the uncommitted node auto-refreshes? → A: Panel stays open and auto-updates its content with the latest file changes. User's selection is not lost.
- Q: What happens if fetching uncommitted status fails? → A: Silently omit the node — graph shows commits only. Next refresh retries automatically. No error UI for this transient failure.

## Assumptions

- The existing file system watcher infrastructure (`GitWatcherService`) provides sufficient refresh frequency for working tree changes. No additional polling mechanism is needed.
- The existing `getUncommittedDetails()` backend method provides all necessary data (staged, unstaged, untracked files with status). No new git commands are required.
- The existing commit details panel and diff viewer can handle uncommitted file data without major architectural changes — the uncommitted node is treated as a synthetic commit.
- Performance of `getUncommittedDetails()` is acceptable for typical working trees (up to hundreds of changed files). Repositories with thousands of uncommitted files are an edge case that may require pagination in a future phase.
- Line-level stats (additions/deletions per file) are not available from the `--name-status` git output used by `getUncommittedDetails()`. The uncommitted node's details panel will show file change statuses but not per-file line counts in Phase 1.
- The stash node pattern (synthetic commit insertion, filter bypass, dedicated context menu) is the proven architectural model for this feature.

## Scope Boundaries

### In Scope (Phase 1)

- Displaying the uncommitted node in the graph
- File change inspection in the details panel (list and tree view)
- Diff viewing for uncommitted files
- Automatic refresh via existing file watcher
- Filter bypass (node always visible when changes exist)
- Minimal or empty context menu
- Visual distinction from regular commits

### Out of Scope (Future Phases)

- Stage/unstage individual files from the graph
- Stash changes from the uncommitted node
- Discard changes from the uncommitted node
- Commit from the uncommitted node
- Separate visual indicators for staged vs. unstaged vs. untracked (e.g., sub-sections, badge counts)
- Compare working tree against arbitrary commits or branches
- Keyboard shortcut to jump to the uncommitted node
- Right-click file actions (open, stage, unstage, discard) in the details panel

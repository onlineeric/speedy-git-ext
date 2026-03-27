# Feature Specification: Commit Node Hover Tooltip

**Feature Branch**: `025-commit-node-tooltip`
**Created**: 2026-03-27
**Status**: Draft
**Input**: User description: "Commit Node Hover Tooltip — display a detailed tooltip popup when a user hovers over any commit node in the main graph view"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Commit References on Hover (Priority: P1)

As a developer viewing the commit graph, I want to hover over any commit node and immediately see which branches, tags, and other references point to that commit, so I can understand the graph topology and assess the impact of operations like rebase, reset, or revert without clicking away from the graph.

**Why this priority**: This is the core value of the tooltip — surfacing reference metadata (HEAD, branches, tags, stashes) directly on the graph. It answers the most frequent developer question: "What points to this commit?" and enables safe decision-making before destructive git operations.

**Independent Test**: Can be fully tested by hovering over a commit node that has one or more refs (branch, tag, stash) and verifying the tooltip displays all associated references. Delivers immediate value by making graph topology browsable.

**Acceptance Scenarios**:

1. **Given** the graph view is loaded, **When** the user hovers over a commit node's graph cell circle/dot for at least 200ms, **Then** a tooltip appears near the node. The tooltip header may display the short hash for identification, but the tooltip body does not repeat commit metadata (author, date, message) already visible in the commit row.
2. **Given** a commit has branch refs (e.g., `main`, `feature/login`), **When** the tooltip appears, **Then** all branch names pointing to that commit are displayed.
3. **Given** a commit has tag refs (e.g., `v1.2.0`), **When** the tooltip appears, **Then** all tag names pointing to that commit are displayed.
4. **Given** a commit is the current HEAD, **When** the tooltip appears, **Then** a HEAD indicator is shown.
5. **Given** a commit has stash refs, **When** the tooltip appears, **Then** stash references pointing to that commit are displayed.
6. **Given** the user moves the cursor away from both the commit node and the tooltip area, **When** 150ms passes without the cursor re-entering either area, **Then** the tooltip is dismissed.
7. **Given** the tooltip is visible, **When** the user moves the cursor from the commit node into the tooltip area, **Then** the tooltip remains visible and interactive (e.g., allowing scrolling or clicking external reference links).

---

### User Story 2 - Check Remote Sync Status (Priority: P2)

As a developer, I want the tooltip to indicate whether a commit exists only locally or has been pushed to a remote, so I can quickly verify if my work is safely backed up before switching branches or performing destructive operations.

**Why this priority**: Remote sync status is a frequently needed safety check. Knowing whether a commit is local-only or pushed helps developers avoid accidental data loss and make informed decisions about when to push.

**Independent Test**: Can be tested by hovering over a commit that has been pushed to a remote and one that is local-only, verifying the tooltip shows the correct sync status for each.

**Acceptance Scenarios**:

1. **Given** a commit has been pushed to at least one remote, **When** the tooltip appears, **Then** a "Pushed to Remote" indicator is displayed.
2. **Given** a commit exists only locally (no remote tracking branch includes it), **When** the tooltip appears, **Then** a "Local Only" indicator is displayed.
3. **Given** a commit's sync status is being determined, **When** the tooltip first appears, **Then** a loading state is shown for the sync status while other local data displays immediately.

---

### User Story 3 - View Worktree Status (Priority: P3)

As a developer working with multiple worktrees, I want the tooltip to show whether a commit is currently checked out in an active worktree and where that worktree is located, so I can avoid conflicts and lock issues when working across multiple local workspaces.

**Why this priority**: Worktree awareness is important for developers using multiple workspaces, but it applies to a narrower audience than reference viewing or sync status. It prevents real but less common issues (git lock errors, accidental concurrent modifications).

**Independent Test**: Can be tested by hovering over a commit that is checked out in a worktree and verifying the tooltip displays worktree status and path. Also testable by hovering over a commit not in any worktree and confirming no worktree indicator is shown.

**Acceptance Scenarios**:

1. **Given** a commit is checked out in an active worktree, **When** the tooltip appears, **Then** a worktree indicator is displayed along with the absolute local path of the worktree.
2. **Given** a commit is not checked out in any worktree, **When** the tooltip appears, **Then** no worktree indicator is shown (the section is omitted, not shown as empty).
3. **Given** a commit is checked out in the main working directory (not an additional worktree), **When** the tooltip appears, **Then** the worktree indicator reflects that it is the primary workspace.

---

### User Story 4 - Access External System Links (Priority: P4)

As a developer, I want the tooltip to display associated Pull Request links or Issue Tracker IDs when available, so I can quickly navigate to code review or project management context directly from the commit graph.

**Why this priority**: This is an extensibility feature that bridges git history with external project management tools. While valuable, it depends on external integrations and is additive — the tooltip provides full value from local git data alone.

**Independent Test**: Can be tested by hovering over a commit whose message contains a PR reference or issue ID pattern, verifying the tooltip displays a clickable link to the external system.

**Acceptance Scenarios**:

1. **Given** a commit message contains a recognized PR reference (e.g., `#42`), **When** the tooltip appears, **Then** the PR reference is displayed as a clickable link that opens the PR in the user's browser.
2. **Given** a commit message contains a recognized issue tracker ID (e.g., `JIRA-123`), **When** the tooltip appears, **Then** the issue ID is displayed as a text label. It is not clickable unless a base URL for the issue tracker is configured (deferred to future iteration).
3. **Given** a commit message contains no recognized external references, **When** the tooltip appears, **Then** no external links section is shown.

---

### Edge Cases

- **Commit with no refs**: Tooltip shows the short hash header but has no reference section content. If the commit also has no sync status, worktree, or external links data, the tooltip displays minimal content (header only).
- **Commit with many refs**: When a commit has a large number of refs (e.g., 10+ branches), the tooltip displays them in a scrollable area so the tooltip does not grow excessively large.
- **Fast mouse movement across nodes**: Moving quickly across multiple commit nodes does not trigger multiple tooltips simultaneously; only the most recently hovered node's tooltip appears (if hover duration exceeds 200ms).
- **Hover then scroll**: If the user scrolls the graph while a tooltip is visible, the tooltip is dismissed.
- **Narrow viewport**: The tooltip repositions itself to remain fully visible within the webview viewport, avoiding overflow beyond screen edges.
- **Commit node partially visible**: If a commit node is only partially visible due to scrolling, hovering over the visible portion still triggers the tooltip.
- **Async data fetch failure**: If fetching sync status, worktree data, or external references fails, the affected tooltip section shows an error indicator while other sections remain unaffected.
- **Empty repository or error state**: If the graph has no commits or is in an error state, no tooltip functionality is expected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a tooltip when the user hovers over a commit node's graph cell circle/dot for at least 200ms. Hovering over other parts of the commit row (text, metadata) does not trigger the tooltip. The tooltip is mouse-only; no keyboard trigger is required.
- **FR-002**: System MUST dismiss the tooltip 150ms after the cursor leaves both the commit node and the tooltip area. If the cursor re-enters either area within 150ms, dismissal is cancelled. The tooltip appears and disappears instantly (no fade or animation) once the respective delay timer elapses.
- **FR-003**: The tooltip MUST be interactive — users MUST be able to move the cursor into the tooltip area to interact with its content (scroll, click external reference links) without the tooltip disappearing. The tooltip does not include copy-to-clipboard buttons.
- **FR-004**: The tooltip header MAY display the commit's short hash for identification. The tooltip MUST NOT duplicate commit metadata (author, date, message) already visible in the commit row. Tooltip sections MUST display in fixed order: Short Hash header → References (branches, tags, HEAD, stashes) → Remote Sync Status → Worktree Status → External Links. Sections with no data are omitted but the relative order of visible sections is preserved.
- **FR-005**: The tooltip MUST display all git references (branches, tags, stashes, HEAD) that directly point to the hovered commit, including both local and remote branches. Branch display MUST follow the existing app branch badge pattern: local-only branches show name only, remote-only branches show `prefix/name` (e.g., `origin/main`), and paired local+remote branches show grouped format (e.g., `dev ⇄ origin`).
- **FR-006**: The tooltip MUST visually distinguish between different reference types (branches, tags, stashes, HEAD) by reusing the existing badge/label styling from `CommitRow` (color-coded badges for branches, tags, and stashes) and a distinct HEAD indicator.
- **FR-007**: The tooltip MUST display a remote sync status indicator showing whether the commit is "Local Only" or "Pushed to Remote." The backend MUST determine sync status by checking if the commit hash is reachable from any remote tracking ref (e.g., via `git branch -r --contains <hash>`), covering multi-remote setups. The check uses the existing GitExecutor 30s timeout. While the sync status is loading, the tooltip MUST show a loading indicator in the sync status section. On timeout or error, display "Sync status unavailable."
- **FR-008**: The tooltip MUST display worktree status (active worktree path) when the commit is checked out in a worktree; the section MUST be omitted when not applicable. Worktree data MUST be bulk-fetched via `git worktree list` once on graph load, cached, and matched per commit on hover.
- **FR-009**: The tooltip MUST display clickable links for recognized external references (PR numbers, issue tracker IDs) found in the commit message. The base URL for links MUST be auto-detected from the git remote URL. GitHub is supported initially; other hosting platforms may be added later.
- **FR-010**: The tooltip MUST show locally-available data immediately and display a loading state for any data that requires asynchronous fetching. If an async data fetch fails, the affected section MUST display an error indicator (e.g., "Sync status unavailable") while other sections display normally. Tooltip async data (sync status, worktree info) MUST be cached per commit for the session and reused on subsequent hovers until the graph data refreshes.
- **FR-011**: Only one tooltip MUST be visible at a time — hovering a new commit node replaces the previous tooltip.
- **FR-012**: The tooltip MUST reposition itself to remain fully visible within the webview viewport boundaries. The tooltip MUST use auto-width sizing with a maximum of `min(800px, 80% of available viewport width)` and auto-height sizing with a maximum of `min(600px, 80% of viewport height)`. Content exceeding the max height MUST scroll within the tooltip. The tooltip MUST use VS Code theme CSS variables for all colors, borders, and text styling to match dark, light, and high contrast themes.
- **FR-013**: The tooltip MUST be dismissed when the user scrolls the graph view.

### Key Entities

- **Commit Node**: A visual element in the graph representing a single git commit. Key attributes: hash, short hash, author, date, message, parent hashes.
- **Git Reference**: A named pointer to a commit. Types: branch (local/remote), tag, stash, HEAD. A commit may have zero or more references.
- **Worktree**: An active git worktree linked to the repository. Key attributes: path (absolute local directory), associated branch/commit.
- **Remote Sync Status**: Indicates whether a commit is reachable from any remote tracking ref ("Pushed to Remote") or not ("Local Only").
- **External Reference**: A PR number or issue tracker ID extracted from a commit message, linked to an external system URL.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view commit references and short hash within 300ms of hovering over a commit node (200ms hover delay + 100ms render), with no perceptible lag.
- **SC-002**: The tooltip displays complete, accurate reference information for 100% of commits in the graph — no missing or incorrect branch, tag, stash, or HEAD associations.
- **SC-003**: Users can interact with the tooltip (scroll content, click links/buttons) without the tooltip flickering or dismissing unexpectedly during normal cursor movement.
- **SC-004**: The tooltip correctly identifies remote sync status for 100% of commits — no false "Local Only" or false "Pushed to Remote" indicators.
- **SC-005**: Graph scrolling and navigation remain smooth (no frame drops) while tooltips are active, even in repositories with 1000+ commits.
- **SC-006**: Users can discover and access external references (PRs, issues) from the tooltip in a single click, reducing context-switching time compared to manually searching commit messages.

## Clarifications

### Session 2026-03-27

- Q: Which area of the commit row triggers the tooltip — graph cell only, entire row, or both? → A: Only the graph cell circle/dot triggers the tooltip.
- Q: Should the tooltip be accessible via keyboard navigation? → A: No, mouse hover only — no keyboard trigger for the tooltip.
- Q: How long is the dismissal delay when cursor leaves the tooltip/node? → A: 150ms.
- Q: Should the tooltip display commit metadata (author, date, message)? → A: No. The tooltip header may show the short hash for identification, but must not duplicate metadata already visible in the commit row.
- Q: Should the tooltip include copy-to-clipboard buttons? → A: No, the tooltip is informational only — no clipboard actions.
- Q: How should external link base URLs be determined for PR/issue links? → A: Auto-detect from the git remote URL. Initially supports GitHub; other hosts can be added later.
- Q: What happens if a tooltip data fetch fails (e.g., sync status, worktree)? → A: Show an error indicator in the failed section (e.g., "Sync status unavailable"). Other successfully loaded sections display normally.
- Q: How should local and remote branches be displayed in the tooltip? → A: Follow the existing app branch badge pattern: local-only branches show name only, remote-only branches show prefix/name (e.g., `origin/main`), paired local+remote branches show grouped format (e.g., `dev ⇄ origin`).

### Session 2026-03-28

- Q: Should there be an explicit out-of-scope section? → A: Yes — add out-of-scope section listing: no commit actions (cherry-pick, revert, checkout), no inline editing, no tooltip on graph edges/lines, no tooltip on row text.
- Q: Should the tooltip have visual transition/animation on appear/disappear? → A: No — instant show/hide after delay timers, no animation.
- Q: What is the maximum width for the tooltip? → A: Auto-width with a max of min(800px, 80% available viewport width).
- Q: What is the maximum height for the tooltip? → A: Auto-height with a max of min(600px, 80% viewport height), scroll overflow for content exceeding the limit.
- Q: Should the tooltip follow the VS Code color theme? → A: Yes — use CSS variables from the VS Code theme API for colors, borders, and text to match dark/light/high contrast themes.
- Q: How should the backend determine remote sync status? → A: Check if the commit is reachable from any remote tracking ref (e.g., `git branch -r --contains <hash>`).
- Q: Should tooltip data be cached or re-fetched on every hover? → A: Cache per session — fetch once per commit, reuse until graph data refreshes.
- Q: How should worktree data be fetched — bulk on graph load or on-demand per hover? → A: Bulk fetch — run `git worktree list` once on graph load, cache the full list, match per commit on hover.
- Q: Should tooltip sections have a fixed display order? → A: Yes — fixed order: Short Hash header → References (branches, tags, HEAD, stashes) → Remote Sync Status → Worktree Status → External Links.
- Q: Should the sync status check have a timeout, and what happens on timeout? → A: Use the existing GitExecutor 30s timeout. Show a loading indicator in the tooltip while the status is being fetched, and show "Sync status unavailable" on timeout/error.

## Out of Scope

- **No commit actions from tooltip**: The tooltip will not provide actions such as cherry-pick, revert, checkout, reset, or any other git operations. It is read-only and informational.
- **No inline editing**: Tooltip content is not editable — users cannot rename branches, edit tags, or modify any data from the tooltip.
- **No tooltip on graph edges/lines**: Only commit node circles/dots trigger tooltips. Hovering over connection lines, merge paths, or other graph decorations does not show a tooltip.
- **No tooltip on row text**: Hovering over commit message text, author name, date, or other metadata in the commit row does not trigger the tooltip.

## Assumptions

- **Ref scope**: "Git references" means refs that directly point to (decorate) the hovered commit — not all branches whose history contains the commit. The graph view already conveys ancestry/topology visually.
- **External reference patterns**: PR and issue references are identified by conventional patterns in commit messages (e.g., `#123` for GitHub PRs, common issue tracker prefixes like `JIRA-123`). Link base URLs are auto-detected from the git remote URL. GitHub is the initially supported host. Custom patterns and additional hosts may be added in the future.
- **Single remote**: For remote sync status, the system checks against all configured remotes. A commit is "Pushed to Remote" if it is reachable from any remote ref.
- **Hover delay**: The 200ms hover delay is a reasonable default to prevent tooltip flickering during fast mouse movements. This value may be tunable in future iterations but is fixed for the initial release.
- **Tooltip positioning**: The tooltip appears adjacent to the hovered commit node, with automatic repositioning to stay within viewport bounds. Exact placement algorithm (above/below/left/right) is an implementation detail.

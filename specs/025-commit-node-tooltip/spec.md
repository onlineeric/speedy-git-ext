# Feature Specification: Commit Node Hover Tooltip

**Feature Branch**: `025-commit-node-tooltip`
**Created**: 2026-03-27
**Status**: Draft
**Input**: User description: "Commit Node Hover Tooltip — display a detailed tooltip popup when a user hovers over any commit node in the main graph view"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Commit References on Hover (Priority: P1)

As a developer viewing the commit graph, I want to hover over any commit node and immediately see which branches, tags, stashes, and HEAD include that commit in their history, so I can understand the graph topology and assess the impact of operations like rebase, reset, or revert without clicking away from the graph.

**Why this priority**: This is the core value of the tooltip — surfacing reference metadata (HEAD, branches, tags, stashes) directly on the graph. It answers the most frequent developer question: "Which branches include this commit?" and enables safe decision-making before destructive git operations. This matches the behavior of standard Git UI tools (SourceTree, GitLens, Fork).

**Independent Test**: Can be fully tested by hovering over a commit node deep in a branch's history and verifying the tooltip displays all branches, tags, stashes, and HEAD that include this commit. Delivers immediate value by making graph topology browsable.

**Acceptance Scenarios**:

1. **Given** the graph view is loaded, **When** the user hovers over a commit node's graph cell circle/dot for at least 200ms, **Then** a tooltip appears near the node. The tooltip header may display the short hash for identification, but the tooltip body does not repeat commit metadata (author, date, message) already visible in the commit row.
2. **Given** a commit is part of a branch's history (e.g., an older commit on `main` or `feature/login`), **When** the tooltip appears, **Then** all branch names whose history contains that commit are displayed — not just branches whose tip is at that commit.
3. **Given** a commit is included in the history of a tag (e.g., `v1.2.0` points to a descendant commit), **When** the tooltip appears, **Then** that tag is displayed even if the tag does not directly point to the hovered commit.
4. **Given** a commit is included in the history of the currently checked out branch, **When** the tooltip appears, **Then** a HEAD indicator is shown even if HEAD points to a newer descendant commit.
5. **Given** a commit is included in the history of a stash commit, **When** the tooltip appears, **Then** that stash reference is displayed even if the stash does not directly point to the hovered commit.
6. **Given** the tooltip shows multiple containing reference types, **When** it renders the references area, **Then** it splits the content into conditional subsections in this order: HEAD, Branches, Tags, Stashes, with a separator between adjacent visible subsections.
7. **Given** the tooltip shows containing refs from different graph lanes, **When** the badges render, **Then** each badge uses the same color as the source ref's own graph lane rather than a single shared hovered-commit color.
8. **Given** the user moves the cursor away from both the commit node and the tooltip area, **When** 150ms passes without the cursor re-entering either area, **Then** the tooltip is dismissed.
9. **Given** the tooltip is visible, **When** the user moves the cursor from the commit node into the tooltip area, **Then** the tooltip remains visible and interactive (e.g., allowing scrolling or clicking external reference links).

---

### User Story 2 - View Worktree Status (Priority: P2)

As a developer working with multiple worktrees, I want the tooltip to show whether a commit is currently checked out in an active worktree and where that worktree is located, so I can avoid conflicts and lock issues when working across multiple local workspaces.

**Why this priority**: Worktree awareness is important for developers using multiple workspaces, but it applies to a narrower audience than reference viewing. It prevents real but less common issues (git lock errors, accidental concurrent modifications).

**Independent Test**: Can be tested by hovering over a commit that is checked out in a worktree and verifying the tooltip displays worktree status and path. Also testable by hovering over a commit not in any worktree and confirming no worktree indicator is shown.

**Acceptance Scenarios**:

1. **Given** a commit is checked out in an active worktree, **When** the tooltip appears, **Then** a worktree indicator is displayed along with the absolute local path of the worktree.
2. **Given** a commit is not checked out in any worktree, **When** the tooltip appears, **Then** no worktree indicator is shown (the section is omitted, not shown as empty).
3. **Given** a commit is checked out in the main working directory (not an additional worktree), **When** the tooltip appears, **Then** the worktree indicator reflects that it is the primary workspace.

---

### User Story 3 - Access External System Links (Priority: P3)

As a developer, I want the tooltip to display associated Pull Request links or Issue Tracker IDs when available, so I can quickly navigate to code review or project management context directly from the commit graph.

**Why this priority**: This is an extensibility feature that bridges git history with external project management tools. While valuable, it depends on external integrations and is additive — the tooltip provides full value from local git data alone.

**Independent Test**: Can be tested by hovering over a commit whose message contains a PR reference or issue ID pattern, verifying the tooltip displays a clickable link to the external system.

**Acceptance Scenarios**:

1. **Given** a commit message contains a recognized PR reference (e.g., `#42`), **When** the tooltip appears, **Then** the PR reference is displayed as a clickable link that opens the PR in the user's browser.
2. **Given** a commit message contains a recognized issue tracker ID (e.g., `JIRA-123`), **When** the tooltip appears, **Then** the issue ID is displayed as a text label. It is not clickable unless a base URL for the issue tracker is configured (deferred to future iteration).
3. **Given** a commit message contains no recognized external references, **When** the tooltip appears, **Then** no external links section is shown.

---

### Edge Cases

- **Commit with no containing references**: If a commit is an orphan or unreachable from any branch, tag, stash, or HEAD path, the tooltip shows the short hash header and omits all empty reference subsections. If no data is available for any section, the tooltip displays minimal content (header only).
- **Commit with many refs**: When a commit has a large number of containing branches (e.g., 20, 50, or more), all branches are displayed without a cap. The tooltip uses a scrollable area within its max-height constraint so the tooltip does not grow excessively large.
- **Ref color mismatch risk**: When a hovered commit is contained by refs from different lane colors, each ref badge must keep the color of the source ref's own lane, not the hovered commit's lane, so `main` and `dev` remain visually distinguishable.
- **Fast mouse movement across nodes**: Moving quickly across multiple commit nodes does not trigger multiple tooltips simultaneously; only the most recently hovered node's tooltip appears (if hover duration exceeds 200ms).
- **Hover then scroll**: If the user scrolls the graph while a tooltip is visible, the tooltip is dismissed.
- **Narrow viewport**: The tooltip repositions itself to remain fully visible within the webview viewport, avoiding overflow beyond screen edges.
- **Commit node partially visible**: If a commit node is only partially visible due to scrolling, hovering over the visible portion still triggers the tooltip.
- **Async data fetch failure**: If fetching containing branches, worktree data, or external references fails, the affected tooltip section shows an error indicator while other sections remain unaffected.
- **Empty repository or error state**: If the graph has no commits or is in an error state, no tooltip functionality is expected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a tooltip when the user hovers over a commit node's graph cell circle/dot for at least 200ms. Hovering over other parts of the commit row (text, metadata) does not trigger the tooltip. The tooltip is mouse-only; no keyboard trigger is required.
- **FR-002**: System MUST dismiss the tooltip 150ms after the cursor leaves both the commit node and the tooltip area. If the cursor re-enters either area within 150ms, dismissal is cancelled. The tooltip appears and disappears instantly (no fade or animation) once the respective delay timer elapses.
- **FR-003**: The tooltip MUST be interactive — users MUST be able to move the cursor into the tooltip area to interact with its content (scroll, click external reference links) without the tooltip disappearing. The tooltip does not include copy-to-clipboard buttons.
- **FR-004**: The tooltip header MAY display the commit's short hash for identification. The tooltip MUST NOT duplicate commit metadata (author, date, message) already visible in the commit row. Tooltip sections MUST display in fixed order: Short Hash header → References → Worktree Status → External Links. Inside References, visible subsections MUST appear in this fixed order: HEAD → Branches → Tags → Stashes. Each visible subsection after the first MUST be separated by a divider line. Sections with no data are omitted but the relative order of visible sections is preserved.
- **FR-005**: The tooltip MUST display all branches (local and remote) that **contain** the hovered commit in their history (i.e., branches where the commit is an ancestor of the branch tip). Branch display MUST follow the existing app branch badge pattern: local-only branches show name only, remote-only branches show `prefix/name` (e.g., `origin/main`), and paired local+remote branches show grouped format (e.g., `dev ⇄ origin`). The containing-branches data MUST be fetched asynchronously (e.g., via `git branch -a --contains <hash>`) with a loading indicator while in progress. On timeout or error, display "Branch info unavailable." Results MUST be cached per commit for the session and reused on subsequent hovers until the graph data refreshes.
- **FR-006**: The tooltip MUST treat HEAD, tags, and stashes with the same "contains" semantic as branches when determining visibility: if the hovered commit is an ancestor of the current HEAD commit, a tag target commit, or a stash commit, the corresponding HEAD/tag/stash reference MUST be shown. HEAD, tag, and stash detection may be computed from already-loaded frontend graph data rather than additional backend RPC calls.
- **FR-007**: The tooltip MUST visually distinguish between different reference types (branches, tags, stashes, HEAD) by reusing the existing badge/label styling from `CommitRow` and a distinct HEAD indicator. Badge colors in the tooltip MUST preserve per-reference lane colors: each containing branch badge uses the lane color of that branch's own tip commit, each tag/stash badge uses the lane color of the commit the tag or stash points to, and HEAD uses the current branch lane color.
- **FR-008**: The tooltip MUST display worktree status (active worktree path) when the commit is checked out in a worktree; the section MUST be omitted when not applicable. Worktree data MUST be bulk-fetched via `git worktree list` once on graph load, cached, and matched per commit on hover.
- **FR-009**: The tooltip MUST display clickable links for recognized external references (PR numbers, issue tracker IDs) found in the commit message. The base URL for links MUST be auto-detected from the git remote URL. GitHub is supported initially; other hosting platforms may be added later.
- **FR-010**: The tooltip MUST show locally-available data immediately and display a loading state for any data that requires asynchronous fetching (e.g., containing branches). If an async data fetch fails, the affected section MUST display an error indicator (e.g., "Branch info unavailable") while other sections display normally. Tooltip async data (containing branches) MUST be cached per commit for the session and reused on subsequent hovers until the graph data refreshes.
- **FR-011**: Only one tooltip MUST be visible at a time — hovering a new commit node replaces the previous tooltip.
- **FR-012**: The tooltip MUST reposition itself to remain fully visible within the webview viewport boundaries. The tooltip MUST use auto-width sizing with a maximum of `min(800px, 80% of available viewport width)` and auto-height sizing with a maximum of `min(600px, 80% of viewport height)`. Content exceeding the max height MUST scroll within the tooltip. The tooltip MUST use VS Code theme CSS variables for all colors, borders, and text styling to match dark, light, and high contrast themes.
- **FR-013**: The tooltip MUST be dismissed when the user scrolls the graph view.

### Key Entities

- **Commit Node**: A visual element in the graph representing a single git commit. Key attributes: hash, short hash, author, date, message, parent hashes.
- **Git Reference**: A named pointer related to a commit. For branches, tags, stashes, and HEAD, the tooltip interprets reference visibility using history containment: the hovered commit is shown under that ref when it is an ancestor of the commit currently pointed to by the ref. A commit may have zero or more visible references of each type.
- **Worktree**: An active git worktree linked to the repository. Key attributes: path (absolute local directory), associated branch/commit.
- **External Reference**: A PR number or issue tracker ID extracted from a commit message, linked to an external system URL.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view the short hash, tags, stashes, HEAD, worktree status, and external links within 300ms of hovering over a commit node (200ms hover delay + 100ms render). Containing branches load asynchronously with a visible loading indicator and appear promptly once fetched.
- **SC-002**: The tooltip displays complete, accurate reference information for 100% of commits in the loaded graph — all containing branches, containing tags, containing stashes, and containing HEAD are shown with no missing or incorrect associations.
- **SC-003**: Users can interact with the tooltip (scroll content, click links/buttons) without the tooltip flickering or dismissing unexpectedly during normal cursor movement.
- **SC-004**: Graph scrolling and navigation remain smooth (no frame drops) while tooltips are active, even in repositories with 1000+ commits.
- **SC-005**: Users can discover and access external references (PRs, issues) from the tooltip in a single click, reducing context-switching time compared to manually searching commit messages.

## Clarifications

### Session 2026-03-27

- Q: Which area of the commit row triggers the tooltip — graph cell only, entire row, or both? → A: Only the graph cell circle/dot triggers the tooltip.
- Q: Should the tooltip be accessible via keyboard navigation? → A: No, mouse hover only — no keyboard trigger for the tooltip.
- Q: How long is the dismissal delay when cursor leaves the tooltip/node? → A: 150ms.
- Q: Should the tooltip display commit metadata (author, date, message)? → A: No. The tooltip header may show the short hash for identification, but must not duplicate metadata already visible in the commit row.
- Q: Should the tooltip include copy-to-clipboard buttons? → A: No, the tooltip is informational only — no clipboard actions.
- Q: How should external link base URLs be determined for PR/issue links? → A: Auto-detect from the git remote URL. Initially supports GitHub; other hosts can be added later.
- Q: What happens if a tooltip data fetch fails (e.g., containing branches, worktree)? → A: Show an error indicator in the failed section (e.g., "Branch info unavailable"). Other successfully loaded sections display normally.
- Q: How should local and remote branches be displayed in the tooltip? → A: Follow the existing app branch badge pattern: local-only branches show name only, remote-only branches show prefix/name (e.g., `origin/main`), paired local+remote branches show grouped format (e.g., `dev ⇄ origin`).

### Session 2026-03-28

- Q: Should there be an explicit out-of-scope section? → A: Yes — add out-of-scope section listing: no commit actions (cherry-pick, revert, checkout), no inline editing, no tooltip on graph edges/lines, no tooltip on row text.
- Q: Should the tooltip have visual transition/animation on appear/disappear? → A: No — instant show/hide after delay timers, no animation.
- Q: What is the maximum width for the tooltip? → A: Auto-width with a max of min(800px, 80% available viewport width).
- Q: What is the maximum height for the tooltip? → A: Auto-height with a max of min(600px, 80% viewport height), scroll overflow for content exceeding the limit.
- Q: Should the tooltip follow the VS Code color theme? → A: Yes — use CSS variables from the VS Code theme API for colors, borders, and text to match dark/light/high contrast themes.
- Q: How should the backend determine remote sync status? → A: ~~Removed — sync status is now derived from the containing-branches list in FR-005. If remote branches contain the commit, it is pushed. No separate sync status section needed.~~
- Q: Should tooltip data be cached or re-fetched on every hover? → A: Cache per session — fetch once per commit, reuse until graph data refreshes.
- Q: How should worktree data be fetched — bulk on graph load or on-demand per hover? → A: Bulk fetch — run `git worktree list` once on graph load, cache the full list, match per commit on hover.
- Q: Should tooltip sections have a fixed display order? → A: Yes — fixed order: Short Hash header → References (branches, tags, HEAD, stashes) → Worktree Status → External Links.
- Q: Should the sync status check have a timeout, and what happens on timeout? → A: ~~Removed — sync status section eliminated. The containing-branches fetch in FR-005 uses the existing GitExecutor 30s timeout with its own loading/error handling.~~
- Q: Should the tooltip show only refs that directly point to a commit, or all branches that contain the commit in their history? → A: Branches MUST use "contains" semantics — show all branches (local and remote) whose history includes the hovered commit (equivalent to `git branch -a --contains <hash>`), matching standard Git UI tools. The implementation was later extended so tags, stashes, and HEAD also use containment semantics within the loaded graph, because users expect earlier commits to show all refs that include them.
- Q: Should the separate "Remote Sync Status" section (FR-007) be kept now that FR-005 shows all containing branches including remote ones? → A: Remove it. The presence or absence of remote branches in the containing-branches list already conveys sync status. A commit with remote branches listed is pushed; one with only local branches is local-only. This eliminates a redundant git command and simplifies the tooltip layout.
- Q: Should the tooltip cap the number of displayed containing branches (e.g., "+N more" after 20)? → A: No cap — show all containing branches. The tooltip's scrollable area within its max-height constraint handles large lists.
- Q: How should the references section be organized once multiple ref types are shown via containment? → A: Split it into conditional subsections in this order: HEAD, Branches, Tags, Stashes, with divider lines between visible subsections.
- Q: How should badge colors work in the tooltip when a hovered commit is contained by refs from different lanes? → A: Use per-reference colors, not a single hovered-commit color. Branch badges use the lane color of their branch tip, tag and stash badges use the lane color of the commit they point to, and HEAD uses the current branch lane color.

## Out of Scope

- **No commit actions from tooltip**: The tooltip will not provide actions such as cherry-pick, revert, checkout, reset, or any other git operations. It is read-only and informational.
- **No inline editing**: Tooltip content is not editable — users cannot rename branches, edit tags, or modify any data from the tooltip.
- **No tooltip on graph edges/lines**: Only commit node circles/dots trigger tooltips. Hovering over connection lines, merge paths, or other graph decorations does not show a tooltip.
- **No tooltip on row text**: Hovering over commit message text, author name, date, or other metadata in the commit row does not trigger the tooltip.

## Assumptions

- **Ref scope**: "References" means all loaded refs whose pointed-to commit history contains the hovered commit. Branches use backend `git branch -a --contains`; HEAD, tags, and stashes are derived from already-loaded graph data using the same ancestor test. This matches the user expectation that older commits show every ref that includes them.
- **External reference patterns**: PR and issue references are identified by conventional patterns in commit messages (e.g., `#123` for GitHub PRs, common issue tracker prefixes like `JIRA-123`). Link base URLs are auto-detected from the git remote URL. GitHub is the initially supported host. Custom patterns and additional hosts may be added in the future.
- **Hover delay**: The 200ms hover delay is a reasonable default to prevent tooltip flickering during fast mouse movements. This value may be tunable in future iterations but is fixed for the initial release.
- **Tooltip positioning**: The tooltip appears adjacent to the hovered commit node, with automatic repositioning to stay within viewport bounds. Exact placement algorithm (above/below/left/right) is an implementation detail.

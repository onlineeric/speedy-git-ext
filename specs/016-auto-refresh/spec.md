# Feature Specification: Auto-Refresh on Git State Changes

**Feature Branch**: `016-auto-refresh`
**Created**: 2026-03-19
**Status**: Draft
**Input**: User description: "Extension requires manual refresh/fetch to show latest git history. When user performs git operations via VSCode Source Control panel (commit, push, pull, sync, checkout, create branch), the extension does not auto-refresh. Other extensions like Git Graph detect these changes automatically via VSCode's built-in git extension events."

## Clarifications

### Session 2026-03-19

- Q: Should auto-refresh be configurable via a user setting? → A: Always on, no setting (matches Git Graph behavior)
- Q: What visual feedback during auto-refresh? → A: Subtle indicator (brief spinner on refresh button or loading signal in toolbar) with refresh/fetch buttons disabled while in progress
- Q: What if VSCode's built-in git extension is unavailable? → A: Fall back silently to filesystem watching only
- Q: How to handle concurrent refresh requests? → A: Drop the new request if a refresh is already running
- Q: What happens to commit details panel during auto-refresh? → A: Keep panel open with current data; close only if selected commit no longer exists after refresh

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-Refresh After VSCode Git Operations (Priority: P1)

As a developer using the Speedy Git extension, when I perform git operations through VSCode's Source Control panel (commit, push, pull, sync, checkout, create/delete branch), the git graph automatically updates to reflect the new state without requiring me to click a manual refresh button.

**Why this priority**: This is the core pain point. Users expect the graph to stay in sync with their git state. Every other popular git visualization extension handles this, making the manual refresh feel broken by comparison.

**Independent Test**: Perform a commit via VSCode's Source Control panel while the Speedy Git graph is open. The graph should update to show the new commit automatically within a few seconds.

**Acceptance Scenarios**:

1. **Given** the Speedy Git graph is open, **When** I commit changes via VSCode Source Control panel, **Then** the graph refreshes to show the new commit automatically
2. **Given** the Speedy Git graph is open, **When** I push via VSCode Source Control panel, **Then** the graph refreshes to show updated remote refs
3. **Given** the Speedy Git graph is open, **When** I pull via VSCode Source Control panel, **Then** the graph refreshes to show newly fetched commits
4. **Given** the Speedy Git graph is open, **When** I checkout a different branch via VSCode Source Control panel, **Then** the graph refreshes to highlight the new current branch
5. **Given** the Speedy Git graph is open, **When** I sync (push + pull) via VSCode Source Control panel, **Then** the graph refreshes to reflect the synchronized state
6. **Given** the Speedy Git graph is open, **When** I create or delete a branch via VSCode, **Then** the graph refreshes to show the updated branch list

---

### User Story 2 - Auto-Refresh After External Git Operations (Priority: P2)

As a developer who also uses the terminal or other tools to run git commands, when I perform git operations outside of VSCode's Source Control panel (e.g., via integrated terminal, external terminal, or other extensions), the git graph detects the change and refreshes automatically.

**Why this priority**: Many developers use the terminal for git operations. Detecting these changes ensures the graph stays accurate regardless of how git is used. This relies on filesystem-level detection since external tools don't go through VSCode's git API.

**Independent Test**: Run `git commit` in the integrated terminal while the Speedy Git graph is open. The graph should detect the change and refresh within a few seconds.

**Acceptance Scenarios**:

1. **Given** the Speedy Git graph is open, **When** I run `git commit` in the integrated terminal, **Then** the graph refreshes to show the new commit
2. **Given** the Speedy Git graph is open, **When** I run `git checkout` in the integrated terminal, **Then** the graph refreshes to show the new current branch
3. **Given** the Speedy Git graph is open, **When** I run `git pull` in an external terminal, **Then** the graph refreshes when VSCode detects the filesystem changes

---

### User Story 3 - Debounced and Non-Disruptive Refresh (Priority: P2)

As a developer, when auto-refresh triggers, I want the experience to be smooth and non-disruptive. Rapid successive git operations should not cause excessive refreshes, and the graph should not flash, jump scroll position, or lose my current selection during refresh.

**Why this priority**: A poorly implemented auto-refresh can be worse than manual refresh if it disrupts the user's workflow. Debouncing and state preservation are essential for a good experience.

**Independent Test**: Perform a `git rebase` that replays multiple commits in quick succession. The graph should refresh once (debounced), not flash repeatedly, and should preserve scroll position and any selected commit.

**Acceptance Scenarios**:

1. **Given** multiple git state changes happen within a short time window, **When** the auto-refresh triggers, **Then** only one refresh occurs (debounced)
2. **Given** I have scrolled down in the graph and selected a commit, **When** auto-refresh triggers, **Then** my scroll position and selection are preserved if the selected commit still exists
3. **Given** I am in the middle of typing in a search or filter field, **When** auto-refresh triggers, **Then** my input state is not disrupted
4. **Given** an auto-refresh is in progress, **When** the refresh/fetch buttons are shown, **Then** they appear disabled until the refresh completes
5. **Given** an auto-refresh is in progress, **When** a subtle loading indicator is displayed, **Then** it disappears once the refresh completes

---

### User Story 4 - Manual Refresh Still Available (Priority: P3)

As a developer, I still want the ability to manually trigger a refresh when I know the graph is stale or want to force-fetch from remote.

**Why this priority**: Auto-refresh handles the common case, but users may want explicit control, especially for fetch operations that involve network requests.

**Independent Test**: Click the existing refresh button while auto-refresh is active. The graph should perform a full refresh immediately.

**Acceptance Scenarios**:

1. **Given** no refresh is in progress, **When** I click the refresh button, **Then** a full refresh occurs immediately, bypassing any debounce delay
2. **Given** auto-refresh is active, **When** I use the manual refresh, **Then** it behaves identically to the current refresh behavior
3. **Given** an auto-refresh is already in progress, **When** I click the refresh button, **Then** the manual request is dropped since a refresh is already running

---

### Edge Cases

- What happens when the extension webview is not visible (tab in background)? Refresh should be deferred until the webview becomes visible again.
- What happens when git operations fail mid-operation (e.g., merge conflict)? The extension should still detect the state change and refresh to show the conflict state.
- What happens during long-running git operations like large fetches or rebases? Debouncing should prevent partial/intermediate state refreshes.
- What happens when the repository is very large? Auto-refresh should not cause performance degradation or excessive git process spawning.
- What happens when the user switches between multiple workspace folders with different repositories? Auto-refresh should track the correct active repository.
- What happens when the commit details panel is open and auto-refresh triggers? The panel stays open with current data; it closes only if the selected commit no longer exists after refresh (e.g., after history rewrite).
- What happens when a refresh is already in progress and another trigger fires? The new request is dropped; the in-flight refresh will return the latest state.
- What happens when VSCode's built-in git extension is disabled or unavailable? The system falls back silently to filesystem watching only, with no warning or degraded experience for the user.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST listen to VSCode's built-in git extension state change events to detect when git operations occur through VSCode's Source Control panel or other extensions
- **FR-002**: System MUST detect git state changes from external sources (terminal, other tools) by monitoring relevant git filesystem artifacts (e.g., HEAD, refs, index)
- **FR-003**: System MUST debounce rapid successive state change events to prevent excessive refreshes, coalescing multiple changes within a short window into a single refresh
- **FR-004**: System MUST preserve user's current scroll position and selected commit during auto-refresh when the selected commit still exists after refresh
- **FR-005**: System MUST defer auto-refresh when the webview panel is not visible and trigger a single refresh when the panel becomes visible again
- **FR-006**: System MUST continue to support manual refresh via the existing refresh button, which bypasses debounce delay
- **FR-007**: System MUST properly dispose of all event listeners and filesystem watchers when the extension is deactivated or the webview is closed
- **FR-008**: System MUST NOT auto-fetch from remote repositories; auto-refresh only re-reads local git state. Fetching remains a manual user action
- **FR-009**: System MUST always have auto-refresh enabled with no user-facing setting to disable it
- **FR-010**: System MUST show a subtle loading indicator (e.g., spinner on refresh button) and disable the refresh/fetch buttons while an auto-refresh is in progress
- **FR-011**: System MUST fall back silently to filesystem watching when VSCode's built-in git extension is unavailable, with no warning or degraded user experience
- **FR-012**: System MUST drop incoming refresh requests (auto or manual) if a refresh is already in progress, rather than queuing or canceling
- **FR-013**: System MUST keep the commit details panel open with its current data during auto-refresh; the panel closes only if the selected commit no longer exists after refresh

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any git operation performed through VSCode's Source Control panel, the graph updates within 2 seconds without user intervention
- **SC-002**: After any git operation performed via the terminal, the graph updates within 3 seconds without user intervention
- **SC-003**: During rapid successive git operations (e.g., interactive rebase replaying 10+ commits), the graph refreshes at most once after the operations complete, not once per commit
- **SC-004**: Users no longer need to click the refresh button after routine git operations (commit, push, pull, checkout, branch create/delete)
- **SC-005**: Auto-refresh does not degrade extension responsiveness or cause visible UI disruption (no scroll jumps, no selection loss, no input field resets)

## Assumptions

- VSCode's built-in git extension (`vscode.git`) is available and active in the user's workspace. This is the default for all standard VSCode installations. If unavailable, the system degrades gracefully to filesystem watching.
- The built-in git extension exposes a stable API (v1) that includes repository state change events.
- Filesystem watching for `.git/` directory changes is a reliable secondary mechanism for detecting external git operations.
- A debounce window of 500ms-1000ms is appropriate for coalescing rapid git events without introducing noticeable delay.
- Auto-fetch from remote is intentionally excluded from scope to avoid unexpected network requests and potential credential prompts.

# Feature Specification: Miscellaneous Improvements - Branch Filter Dropdown & GitHub Avatar

**Feature Branch**: `015-misc-improvements`
**Created**: 2026-03-18
**Status**: Draft
**Input**: User description: "Branch filter dropdown improvements (icon, width, centralized refresh) and GitHub avatar support with Gravatar fallback"

## Clarifications

### Session 2026-03-18

- Q: When the repository remote is not GitHub (e.g., GitLab, Bitbucket, self-hosted), should the system attempt GitHub avatar fetching? → A: Skip GitHub avatar fetching entirely for non-GitHub repos; use Gravatar only.
- Q: What should the user see while a GitHub avatar is being fetched for the first time? → A: Show Gravatar immediately; GitHub avatar replaces it on next graph render once cached (no in-place swap, no flicker).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Centralized Refresh Preserves Branch Filter (Priority: P1)

As a user, when I perform any action that refreshes the git history graph (pull, push, fetch, rebase, checkout, cherry pick, search, refresh button, etc.), the branch filter I have set should remain active after the refresh. Currently, the filter breaks after certain actions because each action handles refresh independently.

**Why this priority**: This is the most impactful issue. The branch filter is a core navigation feature, and it silently breaking after common actions makes it unreliable and frustrating. A centralized refresh approach also prevents the same bug from recurring when new actions are added in the future.

**Independent Test**: Can be tested by setting a branch filter, performing any refresh-triggering action, and verifying the filter remains applied to the refreshed graph.

**Acceptance Scenarios**:

1. **Given** the user has set a branch filter, **When** the user right-clicks a branch and selects "Pull", **Then** the git history graph refreshes with the branch filter still applied.
2. **Given** the user has set a branch filter, **When** the user clicks the Fetch button in the top menu, **Then** the git history graph refreshes with the branch filter still applied.
3. **Given** the user has set a branch filter, **When** the user right-clicks a commit and selects "Rebase", **Then** the git history graph refreshes with the branch filter still applied.
4. **Given** the user has set a branch filter, **When** the user right-clicks a branch and selects "Checkout", **Then** the git history graph refreshes with the branch filter still applied.
5. **Given** the user has set a branch filter, **When** the user performs a search, **Then** the git history graph refreshes with the branch filter still applied.
6. **Given** the user has set a branch filter, **When** the user clicks the Refresh button, **Then** the git history graph refreshes with the branch filter still applied.
7. **Given** the user has set a branch filter, **When** the user right-clicks a commit and selects "Cherry Pick", **Then** the git history graph refreshes with the branch filter still applied.
8. **Given** a new action is added that triggers a git history refresh, **When** that action is invoked, **Then** the branch filter is automatically preserved because all refresh-triggering actions go through a single centralized refresh method.

---

### User Story 2 - Branch Filter Dropdown Visual Improvements (Priority: P2)

As a user, I want the branch filter dropdown to have a dropdown arrow icon on the right side (matching the nested repo dropdown style) and be wider so I can read longer branch names without truncation.

**Why this priority**: This is a usability improvement that makes the branch filter more discoverable (arrow icon signals it's a dropdown) and more practical for repositories with longer branch naming conventions.

**Independent Test**: Can be tested by visually inspecting the branch filter dropdown for the arrow icon and verifying that longer branch names are fully visible without truncation.

**Acceptance Scenarios**:

1. **Given** the branch filter dropdown is visible, **When** the user looks at the input field, **Then** a dropdown arrow icon is displayed on the right side of the input field, consistent with the nested repo dropdown style.
2. **Given** the repository has branches with long names (e.g., "feature/JIRA-1234-implement-user-authentication-flow"), **When** the user opens the branch filter dropdown, **Then** the dropdown is wide enough to display longer branch names without excessive truncation.

---

### User Story 3 - GitHub Avatar Support (Priority: P3)

As a user, I want to see commit authors' GitHub profile avatars in the git history graph. If a GitHub avatar is not available for a given author, the system should fall back to Gravatar (the current behavior).

**Why this priority**: Avatars enhance the visual experience and help users quickly identify commit authors. GitHub avatars are higher quality and more commonly set than Gravatar, improving the overall user experience.

**Independent Test**: Can be tested by viewing commits from authors with GitHub accounts and verifying their GitHub profile pictures appear, and by viewing commits from authors without GitHub accounts and verifying Gravatar is used as fallback.

**Acceptance Scenarios**:

1. **Given** a commit author has a GitHub account with a profile avatar and the avatar is already cached, **When** the git history graph is displayed, **Then** the author's GitHub avatar is shown.
2. **Given** a commit author has a GitHub account but the avatar is not yet cached, **When** the git history graph is displayed, **Then** the author's Gravatar is shown immediately; the GitHub avatar is fetched in the background and appears on the next graph render.
3. **Given** a commit author does not have a GitHub account or the GitHub API cannot resolve their avatar, **When** the git history graph is displayed, **Then** the author's Gravatar is shown as a fallback.
4. **Given** the GitHub API rate limit has been exceeded, **When** new avatars need to be fetched, **Then** the system pauses GitHub API requests until the rate limit resets and uses Gravatar as a fallback in the meantime.
5. **Given** a commit author's GitHub avatar has been fetched previously, **When** the same author appears in the git history graph again, **Then** the cached avatar is displayed without making an additional API request.

---

### Edge Cases

- What happens when the branch being filtered on is deleted by an action (e.g., after a merge that deletes the branch)? The filter should be cleared and the full graph shown.
- What happens when the GitHub API returns a non-rate-limit error (e.g., network timeout, 500 error)? The system should gracefully fall back to Gravatar for that author.
- What happens when a commit author email does not match any GitHub account? The system should fall back to Gravatar.
- What happens when the user is offline or has no internet access? Avatar fetching should fail silently and use Gravatar (which may also show a default/placeholder).
- What happens when the rate limit resets? The system should automatically resume GitHub API requests without requiring user action.
- What happens if the cached avatar becomes stale (e.g., user changes their GitHub profile picture)? Cached avatars should have a reasonable expiration period.
- What happens when the repository remote is not hosted on GitHub (e.g., GitLab, Bitbucket, self-hosted)? GitHub avatar fetching is skipped entirely; Gravatar is used directly.
- What happens when a commit author uses a different email locally than their GitHub account email? The GitHub API may not resolve the avatar for that commit. The system should fall back to Gravatar for unresolved authors.

## Requirements *(mandatory)*

### Functional Requirements

**Branch Filter - Centralized Refresh**

- **FR-001**: All actions that trigger a git history graph refresh MUST go through a single centralized refresh method that preserves the current branch filter state.
- **FR-002**: The centralized refresh method MUST re-apply the active branch filter after fetching updated git history data.
- **FR-003**: If the filtered branch no longer exists after a refresh, the system MUST clear the filter and display the full graph.

**Branch Filter - Visual Improvements**

- **FR-004**: The branch filter dropdown MUST display a dropdown arrow icon on the right side of the input field, matching the style of the nested repo dropdown.
- **FR-005**: The branch filter dropdown MUST be wide enough to display branch names of reasonable length without excessive truncation.

**GitHub Avatar**

- **FR-006**: The system MUST attempt to fetch a commit author's avatar from the GitHub public API before falling back to Gravatar, only when the repository remote is hosted on GitHub. For non-GitHub repositories, the system MUST use Gravatar directly.
- **FR-007**: The system MUST cache fetched GitHub avatar URLs in memory per author email to minimize API calls. The browser loads avatar images directly from GitHub's CDN using the cached URL. Note: this differs from the original idea spec which suggested downloading image binaries; caching URLs is simpler, avoids disk I/O, and aligns with the existing Gravatar pattern.
- **FR-008**: The system MUST monitor the GitHub API rate limit by checking the `x-ratelimit-remaining` response header, and pause all GitHub API avatar requests when the limit reaches zero.
- **FR-009**: When the GitHub API rate limit is exceeded, the system MUST fall back to Gravatar until the rate limit resets (as indicated by the `x-ratelimit-reset` header).
- **FR-010**: When the GitHub API returns an error or cannot resolve an avatar for an author, the system MUST fall back to Gravatar for that author.
- **FR-011**: Cached avatars MUST have a 24-hour expiration period to account for profile picture changes.
- **FR-012**: While a GitHub avatar is being fetched for the first time, the system MUST display the Gravatar immediately. The GitHub avatar MUST only appear on the next graph render after it has been cached (no in-place image swap).

### Key Entities

- **Branch Filter State**: The currently applied branch filter value, maintained across graph refreshes.
- **Author Avatar**: An author's profile image, sourced from GitHub or Gravatar, cached locally per author email/account.
- **Rate Limit State**: Tracks remaining GitHub API requests and reset time to control when GitHub avatar fetching is paused or resumed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Branch filter remains active and correctly applied after 100% of actions that trigger a git history graph refresh (pull, push, fetch, rebase, checkout, cherry pick, search, refresh button).
- **SC-002**: No branch filter regression is introduced when new refresh-triggering actions are added, due to the centralized refresh approach.
- **SC-003**: The branch filter dropdown arrow icon is visually consistent with the existing nested repo dropdown icon.
- **SC-004**: Branch names up to 60 characters are visible in the branch filter dropdown without truncation.
- **SC-005**: For commit authors with GitHub accounts, GitHub avatars are displayed instead of Gravatar avatars.
- **SC-006**: The system never exceeds the GitHub API rate limit (60 unauthenticated requests per hour) by respecting rate limit headers.
- **SC-007**: Previously fetched GitHub avatars are served from cache without additional API calls, reducing redundant network requests.
- **SC-008**: When GitHub avatar fetching fails for any reason, the user experience is unaffected - Gravatar fallback is seamless with no error messages shown to the user.

## Assumptions

- The GitHub public API endpoint for fetching commit/user details is accessible without authentication and returns avatar URLs in the response.
- The system detects whether the repository remote is GitHub-hosted (e.g., by inspecting the remote URL) to determine whether to attempt GitHub avatar fetching.
- The existing Gravatar integration remains unchanged and serves as the universal fallback.
- The unauthenticated GitHub API rate limit of 60 requests per hour is sufficient for typical usage patterns (avatar fetching is cached, so repeated views of the same authors do not consume additional requests).
- The nested repo dropdown uses a native `<select>` element with a browser-provided arrow. The branch filter dropdown (Radix Popover) requires an explicit inline SVG chevron-down icon to achieve a similar visual appearance.
- A cache expiration of 24 hours for GitHub avatars is a reasonable default to balance freshness with API usage.
- The centralized refresh method will be used by all current and future actions that trigger git history graph updates.

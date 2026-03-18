# Research: 015-misc-improvements

## Decision 1: Centralized Refresh Strategy

**Decision**: Store `currentFilters` in `WebviewProvider` and apply as default in `sendInitialData()`.

**Rationale**: The root cause is that ~30+ action handlers call `sendInitialData()` without passing filters. Storing filters in the backend instance and defaulting to them is the minimal-change fix that covers all current and future actions. Only 3 lines change in `sendInitialData()` method signature, and 0 changes needed in individual action handlers.

**Alternatives considered**:
- Frontend-side: Intercept 'commits' response and re-request with filters. Rejected: adds extra round-trip, flicker, and complexity.
- Pass filters in every action message. Rejected: requires changing every message type and every caller (~30+ places).

## Decision 2: GitHub Avatar API Endpoint

**Decision**: Use `/repos/{owner}/{repo}/commits/{hash}` to extract `author.avatar_url` from the response.

**Rationale**: This endpoint maps a commit directly to a GitHub user avatar. The repo owner/name can be parsed from the remote URL. Since commits are already loaded, we have hashes available.

**Alternatives considered**:
- `/users/{username}`: Requires knowing the GitHub username, which is not directly available from commit email.
- `/search/users?q={email}`: More direct email-to-user mapping, but search API has stricter rate limits.

## Decision 3: Avatar Cache Strategy

**Decision**: In-memory cache in the backend service (`Map<email, {url, fetchedAt}>`), with 24h TTL. Send URL mapping to frontend via message passing.

**Rationale**: Follows existing in-memory caching pattern (gravatar.ts cache). The backend handles API calls (per constitution Principle V). URLs are small strings, so memory impact is negligible. 24h TTL balances freshness with API usage.

**Alternatives considered**:
- VS Code globalState persistence: Survives restarts but adds complexity. Can be added later if needed.
- Frontend-only fetching: Violates Principle V (no network calls in webview).

## Decision 4: GitHub Remote Detection

**Decision**: Parse the `origin` remote URL for `github.com` domain.

**Rationale**: Simple string match on remote URL (e.g., `git@github.com:owner/repo.git` or `https://github.com/owner/repo`). Remote URLs are already fetched by `getRemotes` in the existing flow.

**Alternatives considered**:
- Check all remotes: Over-engineered for initial implementation. Can expand later.

## Decision 5: Dropdown Arrow Icon

**Decision**: Add an inline SVG chevron-down icon inside the trigger button.

**Rationale**: The `RepoSelector` uses native `<select>` which has a browser-provided arrow. Since `FilterableBranchDropdown` uses Radix Popover (not native select), we need an explicit icon. An inline SVG is lightweight and requires no additional dependencies.

**Alternatives considered**:
- Using a codicon font icon: Would require importing VS Code codicons. Adds dependency.
- CSS-only triangle: Less consistent across themes.

# Implementation Plan: Miscellaneous Improvements - Branch Filter Dropdown & GitHub Avatar

**Branch**: `015-misc-improvements` | **Date**: 2026-03-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-misc-improvements/spec.md`

## Summary

Three improvements: (1) Centralize graph refresh to preserve branch filter across all actions, (2) improve branch filter dropdown visuals (arrow icon + wider), (3) add GitHub avatar support with Gravatar fallback. This is a small incremental improvement using the existing tech stack.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: React 18, Zustand, @radix-ui/react-popover (already installed), VS Code Extension API, esbuild, Vite
**Storage**: In-memory caching (existing pattern in gravatar.ts)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code Extension (desktop)
**Project Type**: VS Code Extension (backend + webview)
**Performance Goals**: No perceptible lag when switching between filtered/unfiltered views; avatar fetching must not block graph rendering
**Constraints**: GitHub API unauthenticated rate limit of 60 req/hour; avatar fetching must be async and non-blocking
**Scale/Scope**: Typical repos with dozens of unique authors; 500+ commits

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Avatar fetching is async/non-blocking; Gravatar shown immediately while GitHub avatar loads in background; cached for O(1) subsequent lookups |
| II. Clean Code & Simplicity | PASS | Centralizing refresh reduces code duplication; avatar service follows existing service patterns |
| III. Type Safety & Explicit Error Handling | PASS | New message types added to shared/messages.ts; Result pattern used for GitHub API calls |
| IV. Library-First | PASS | Using existing @radix-ui/react-popover; Node 18 global `fetch` for API calls (purpose-built HTTP API); no new dependencies needed |
| V. Dual-Process Architecture | PASS | GitHub API calls in backend (extension host); avatar URL mapping sent to frontend via message passing; no git subprocess in webview |

## Project Structure

### Documentation (this feature)

```text
specs/015-misc-improvements/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Research findings
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
src/
├── WebviewProvider.ts           # MODIFY: Store currentFilters, apply to all sendInitialData() calls
├── services/
│   └── GitHubAvatarService.ts   # NEW: Fetch avatar URLs from GitHub public API with rate limiting

shared/
├── types.ts                     # MODIFY: Add AvatarUrlMap type
└── messages.ts                  # MODIFY: Add avatarUrls response message type

webview-ui/src/
├── components/
│   ├── FilterableBranchDropdown.tsx  # MODIFY: Add dropdown arrow icon, increase width
│   └── AuthorAvatar.tsx             # MODIFY: Use GitHub avatar URL when available
├── stores/
│   └── graphStore.ts                # MODIFY: Add gitHubAvatarUrls state
└── rpc/
    └── rpcClient.ts                 # MODIFY: Handle avatarUrls response message
```

## Research Findings

### Centralized Refresh - Root Cause

`WebviewProvider.sendInitialData(filters?)` is called ~30+ times across action handlers. Only 3 callers pass filters (`refresh`, `fetch`, `getCommits`). All other actions (pull, push, checkout, rebase, cherry pick, stash ops, revert, delete branch, rename branch, create branch, tag ops) call `sendInitialData()` with NO filters, causing the branch filter to be lost.

**Solution**: Store `currentFilters` as instance state in `WebviewProvider`. When `getCommits`/`refresh`/`fetch` are called with filters, update `currentFilters`. In `sendInitialData()`, default to `currentFilters` when no explicit filters are passed. If the filtered branch no longer exists in the refreshed branch list, clear the filter.

### Branch Filter Dropdown - Current State

- `FilterableBranchDropdown.tsx` uses Radix Popover
- Trigger button: `min-w-[120px] max-w-[200px]` (too narrow for long branch names)
- Popover content: `w-[280px]` (reasonable but could be wider)
- No dropdown arrow icon on trigger button
- `RepoSelector.tsx` uses native `<select>` (has built-in arrow) - NOT a direct style reference

**Solution**: Add a chevron-down SVG icon inside the trigger button. Increase `max-w` on trigger and `w` on popover content.

### GitHub Avatar - Approach

- Existing `AuthorAvatar.tsx` loads Gravatar via Image object with in-memory cache
- `gravatar.ts` has MD5 hashing, URL building, initials/color generation
- Commit type has `authorEmail` field used for Gravatar hash

**Solution**:
1. Backend `GitHubAvatarService` fetches avatar URLs from GitHub API (`/repos/{owner}/{repo}/commits/{hash}` to get `author.avatar_url`) using Node 18 global `fetch`, returning `Result<T, GitError>` per the project's error handling convention
2. Detect GitHub remote by parsing remote URL for `github.com`
3. After loading commits, extract unique author emails, fetch avatar URLs sequentially from GitHub API (one request per unique email, using a representative commit hash)
4. Cache `email -> avatarUrl` URL mapping in memory with 24h TTL (caching URLs not image binaries - browser loads images directly from GitHub CDN, matching the existing Gravatar pattern)
5. Send mapping to frontend via new `avatarUrls` message type
6. `AuthorAvatar` component checks GitHub URL first, falls back to Gravatar
7. Rate limit tracking: monitor `x-ratelimit-remaining` header, pause when 0

## Complexity Tracking

No constitution violations. All changes follow existing patterns.

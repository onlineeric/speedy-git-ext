# Implementation Plan: Fix Checkout with Uncommitted Changes Behavior

**Branch**: `013-fix-checkout-stash` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-fix-checkout-stash/spec.md`

## Summary

The current checkout flow pre-checks for a dirty working tree and forces stashing before any checkout. This deviates from git's default behavior, which allows checkout when uncommitted changes don't conflict with the target. The fix removes the pre-check, attempts checkout directly, and only offers stash-and-checkout when git rejects due to conflicts.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: VS Code Extension API, esbuild (backend), Vite + React 18 (webview), Zustand, Radix UI
**Storage**: N/A — git repository on the filesystem
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code 1.80+ (Node.js extension host + webview)
**Project Type**: VS Code extension (desktop-app)
**Performance Goals**: Checkout operations should feel instant; no unnecessary dialogs or round-trips
**Constraints**: Must match native `git checkout` behavior for non-conflicting changes
**Scale/Scope**: Single extension, ~2 files modified

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Removing pre-check eliminates one unnecessary git command (`git status --porcelain`) before checkout. Fewer round-trips = faster. |
| II. Clean Code & Simplicity | PASS | Simplifies checkout flow by removing the dirty-tree pre-check branch. Less code, clearer intent. |
| III. Type Safety & Explicit Error Handling | PASS | Conflict detection via `isCheckoutConflict(error)` boolean helper using `GitError.message` (stderr captured by `GitExecutor`). `Result<T, GitError>` pattern preserved. No new error code needed. |
| IV. Library-First & Purpose-Built Tools | PASS | No new libraries needed. Uses git's own stderr output for conflict detection. |
| V. Dual-Process Architecture Integrity | PASS | Changes are entirely in the backend (WebviewProvider checkout handlers). Message types and frontend UI remain unchanged — existing stash dialogs and state management are reused. |

**Gate result: PASS** — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/013-fix-checkout-stash/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files to modify)

```text
src/
├── WebviewProvider.ts           # Modify checkoutBranch + checkoutCommit handlers
└── services/
    └── GitBranchService.ts      # Add conflict detection helper (isCheckoutConflict)
```

**Structure Decision**: No new files needed. All changes modify existing files in the current backend architecture (`shared/errors.ts` is NOT modified). The frontend (webview-ui/) requires zero changes — the existing `checkoutNeedsStash` / `checkoutCommitNeedsStash` messages and stash confirmation dialogs are reused as-is.

**Scale/Scope update**: ~2 files modified (down from 3 — `shared/errors.ts` no longer needs changes).

## Complexity Tracking

> No violations — table not needed.

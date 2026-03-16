# Implementation Plan: Checkout Commit (Detached HEAD)

**Branch**: `012-checkout-commit-detached-head` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-checkout-commit-detached-head/spec.md`

## Summary

Add "Checkout this commit" to the commit row context menu. On selection, show a `ConfirmDialog` warning about detached HEAD state. After confirmation, the frontend sends `checkoutCommit` to the backend. The backend checks for a dirty working tree — if dirty, it responds `checkoutCommitNeedsStash` and the frontend presents a stash-and-proceed dialog; if clean, it runs `git checkout <hash>` and sends back `success` followed by a graph refresh. This mirrors the existing `checkoutBranch` → `checkoutNeedsStash` → `stashAndCheckout` pattern.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**: React 18, Vite (webview), esbuild (extension host), Zustand, `@radix-ui/react-context-menu`, `@radix-ui/react-alert-dialog`, VS Code Extension API
**Storage**: N/A — git repository on the filesystem
**Testing**: vitest — backend service unit tests in `src/__tests__/`
**Target Platform**: VS Code Extension Host (Node 18) + Webview (Chromium-based)
**Project Type**: VS Code extension (desktop app with embedded React webview)
**Performance Goals**: Complete commit checkout flow in under 5 seconds on a healthy repository (SC-001)
**Constraints**: TypeScript strict mode; webview↔extension message-passing only (no direct backend access); `Result<T,E>` monad for all git operations
**Scale/Scope**: ~5–7 file changes; no new files required beyond specs artifacts

## Constitution Check

Project constitution v1.0.0 (ratified 2026-03-16) is in effect. Assessment against Core Principles I–V:

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | ✅ | `checkoutCommit` runs via `GitExecutor` (30 s hard timeout). Graph refreshes via `sendInitialData()`. No new list rendering — virtual scrolling unchanged. |
| II. Clean Code | ✅ | Mirrors `checkoutBranch` pattern exactly. Single-responsibility additions to existing files only. No new abstractions. |
| III. Type Safety | ✅ | New git op returns `Result<string, GitError>`. New message types added to `shared/messages.ts` union + exhaustive maps. Existing type guards cover narrowing. |
| IV. Library-First | ✅ | No new packages. Reuses `@radix-ui/react-alert-dialog`, `GitExecutor`, Zustand. |
| V. Dual-Process | ✅ | Backend handles all git I/O. Frontend handles UI only. Cross-boundary communication via `shared/messages.ts` contracts exclusively. |

**Required build gates** (§Build & Validation Gates — all MUST pass before done):
1. `pnpm typecheck` — zero TypeScript errors
2. `pnpm lint` — zero ESLint errors
3. `pnpm build` — clean build of extension and webview
4. Manual smoke test via VS Code "Run Extension" launch config

## Project Structure

### Documentation (this feature)

```text
specs/012-checkout-commit-detached-head/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output (/speckit.plan)
├── data-model.md        # Phase 1 output (/speckit.plan)
├── quickstart.md        # Phase 1 output (/speckit.plan)
├── contracts/           # Phase 1 output (/speckit.plan)
│   └── messages.md      # New message type contracts
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
shared/
└── messages.ts          # Add checkoutCommit, stashAndCheckoutCommit requests;
                         # Add checkoutCommitNeedsStash response

src/
├── WebviewProvider.ts        # Add checkoutCommit + stashAndCheckoutCommit handlers
└── services/
    └── GitBranchService.ts   # Add checkoutCommit(hash) method

webview-ui/src/
├── components/
│   └── CommitContextMenu.tsx  # Add menu item + ConfirmDialog (detached HEAD warn + stash prompt)
├── rpc/
│   └── rpcClient.ts           # Add checkoutCommit(), stashAndCheckoutCommit(); handle checkoutCommitNeedsStash
└── stores/
    └── graphStore.ts          # Add pendingCommitCheckout: { hash: string } | null
```

**Structure Decision**: Follows the existing single-project layout. Backend in `src/`, webview in `webview-ui/src/`, shared types in `shared/`. No new files needed in source — all changes are additions to existing files.

## Constitution Alignment

All five Core Principles are met — see [§Constitution Check](#constitution-check) above. No amendments or exceptions required.

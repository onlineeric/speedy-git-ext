# Implementation Plan: Commit Node Hover Tooltip

**Branch**: `025-commit-node-tooltip` | **Date**: 2026-03-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/025-commit-node-tooltip/spec.md`

## Summary

Display an interactive hover tooltip on commit node circles in the graph view, showing git references, remote sync status, worktree status, and external links (GitHub PRs/issues). The tooltip uses the existing `@radix-ui/react-popover` for positioning, communicates with the backend via VS Code message passing for async data (sync status), and bulk-fetches worktree data on graph load. All data is cached per session.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: React 18, Zustand, `@radix-ui/react-popover` (already installed), `@tanstack/react-virtual`, esbuild (backend), Vite (frontend)
**Storage**: In-memory caches (Zustand store + component state)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code Extension (1.80+), webview
**Project Type**: VS Code extension (dual-process: Node.js backend + React webview)
**Performance Goals**: Tooltip appears within 100ms after 200ms hover delay (300ms total). No frame drops during hover/scroll.
**Constraints**: <100ms tooltip render after delay; cached data reused until graph refresh; tooltip must escape virtual scroll clipping via Portal
**Scale/Scope**: Repos with 500+ commits, many branches, multiple worktrees

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Hover delay prevents flickering; data cached per session; worktree bulk-fetched on load; no re-renders outside hovered component; Portal avoids scroll container re-layout |
| II. Clean Code & Simplicity | PASS | Single-purpose tooltip component; reuses existing Popover pattern (OverflowRefsBadge); no over-engineering |
| III. Type Safety & Explicit Error Handling | PASS | New shared types for WorktreeInfo and tooltip messages; Result<T,E> for new git operations; existing `isCommitPushed` already uses Result pattern |
| IV. Library-First & Purpose-Built | PASS | Uses existing `@radix-ui/react-popover` for positioning; reuses `GitHubAvatarService.parseGitHubRemote()` for URL detection; no new package installs needed |
| V. Dual-Process Architecture Integrity | PASS | Backend handles git I/O (worktree list, sync status); frontend handles rendering and hover state; shared types in `shared/` |
| Agent Restrictions | PASS | No auto-installs; no git mutations |
| Build & Validation Gates | PASS | typecheck + lint + build + smoke test |

## Project Structure

### Documentation (this feature)

```text
specs/025-commit-node-tooltip/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── messages.md      # New message type contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
shared/
├── types.ts             # ADD: WorktreeInfo, ExternalRef types
└── messages.ts          # ADD: getWorktreeList/worktreeList message types (sync status reuses existing isCommitPushed/commitPushedResult)

src/
├── services/
│   └── GitWorktreeService.ts    # NEW: git worktree list parsing
├── WebviewProvider.ts           # MODIFY: handle new tooltip messages, bulk-fetch worktrees on load
└── ExtensionController.ts       # MODIFY: instantiate GitWorktreeService

webview-ui/src/
├── components/
│   ├── GraphCell.tsx             # MODIFY: add hover handlers on SVG circle
│   ├── CommitRow.tsx             # MODIFY: pass tooltip state/callbacks
│   ├── GraphContainer.tsx        # MODIFY: scroll dismiss, tooltip portal host
│   └── CommitTooltip.tsx         # NEW: tooltip component using Radix Popover
├── stores/
│   └── graphStore.ts             # MODIFY: add worktreeList, tooltipSyncStatusCache
├── rpc/
│   └── rpcClient.ts              # MODIFY: add getWorktreeList, handle worktreeList response
└── utils/
    └── externalRefParser.ts      # NEW: parse commit message for PR/issue references
```

**Structure Decision**: Follows existing project layout. New files are minimal — one backend service, one frontend component, one utility. All other changes are modifications to existing files.

## Complexity Tracking

No constitution violations to justify.

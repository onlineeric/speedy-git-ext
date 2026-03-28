# Implementation Plan: Commit Node Hover Tooltip

**Branch**: `025-commit-node-tooltip` | **Date**: 2026-03-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/025-commit-node-tooltip/spec.md`

## Summary

Display a detailed tooltip popup when a user hovers over a commit node circle in the graph view. The tooltip shows: short hash header, all branches (local and remote) that **contain** the commit in their history (fetched asynchronously via `git branch -a --contains <hash>`), plus HEAD, tags, and stashes that contain the commit within the loaded graph, rendered in split subsections with per-reference badge colors. It also shows worktree status and clickable external reference links (GitHub PRs/issues). Uses Radix Popover for positioning, timer-based hover/dismiss logic, and Zustand for tooltip state with per-commit session caching.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: React 18, Zustand, `@radix-ui/react-popover` (already installed), `@tanstack/react-virtual`, esbuild (backend), Vite (frontend)
**Storage**: In-memory caches (Zustand store + component state)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code Extension (1.80+)
**Project Type**: VS Code Extension (desktop-app)
**Performance Goals**: Tooltip render within 100ms of hover delay elapsing; containing branches load asynchronously with loading indicator
**Constraints**: Git process timeout 30s (GitExecutor), no new packages needed
**Scale/Scope**: Repositories with 500+ commits, dozens of branches

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Containing branches fetched async with loading indicator; cached per session; worktree bulk-fetched on load; HEAD/tags/stashes derived from already-loaded graph data without extra backend calls |
| II. Clean Code & Simplicity | PASS | Custom `useTooltipHover` hook encapsulates timer logic; `CommitTooltip` keeps refs/worktree/external links isolated; `externalRefParser` and `commitReachability` remain pure utilities |
| III. Type Safety & Explicit Error Handling | PASS | New types (`WorktreeInfo`, `ExternalRef`, `ContainingBranchesResult`) in `shared/types.ts`; new messages with type guards; `Result<T, GitError>` for git operations |
| IV. Library-First | PASS | Radix Popover (already installed) for positioning; no regex for structured data parsing (porcelain git output) |
| V. Dual-Process Architecture | PASS | Backend handles `git branch --contains` and `git worktree list`; frontend handles rendering and state; communication via message passing only |

## Project Structure

### Documentation (this feature)

```text
specs/025-commit-node-tooltip/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── messages.md      # Message contract definitions
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
shared/
├── types.ts             # Add WorktreeInfo, ExternalRef, ContainingBranchesResult
├── messages.ts          # Add getContainingBranches/containingBranches, getWorktreeList/worktreeList messages
└── errors.ts            # No changes

src/
├── ExtensionController.ts   # Instantiate GitWorktreeService
├── WebviewProvider.ts        # Handle getContainingBranches, getWorktreeList messages
└── services/
    └── GitWorktreeService.ts # NEW: Parse git worktree list --porcelain

webview-ui/src/
├── components/
│   ├── CommitTooltip.tsx     # NEW: Tooltip component with split reference sections and per-ref badge colors
│   ├── GraphCell.tsx         # Add hover event handlers on SVG circle
│   ├── CommitRow.tsx         # Pass tooltip-related props
│   └── GraphContainer.tsx    # Scroll dismiss listener, tooltip portal rendering
├── hooks/
│   └── useTooltipHover.ts    # NEW: Timer-based hover/dismiss logic
├── stores/
│   └── graphStore.ts         # Add tooltip state (hover, worktree cache, containing branches cache)
├── rpc/
│   └── rpcClient.ts          # Add getContainingBranches(), getWorktreeList(), handle responses
└── utils/
    ├── externalRefParser.ts  # NEW: Extract PR/issue refs from commit messages
    └── commitReachability.ts # Reused to derive containing HEAD/tags/stashes from loaded commits
```

**Structure Decision**: Follows existing dual-process architecture. Backend services in `src/services/`, shared types in `shared/`, frontend components/hooks/utils in `webview-ui/src/`. No new directories needed.

## Complexity Tracking

No constitution violations. No complexity justifications needed.

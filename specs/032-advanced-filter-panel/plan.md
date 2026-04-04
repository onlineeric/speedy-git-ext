# Implementation Plan: Advanced Filter Panel

**Branch**: `032-advanced-filter-panel` | **Date**: 2026-04-04 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/032-advanced-filter-panel/spec.md`

## Summary

Add an advanced filter panel to the commit graph view with three filter dimensions (author, date range, branch badges), right-click context menu integration, a centralized reset mechanism, and reusable shared components (generic MultiSelectDropdown, AuthorBadge). All filtering is server-side via git flags. The filter panel has no fixed height — only the branch badge and author badge display areas independently cap at ~3-4 lines with overflow scrolling. Branch badges in the filter panel reuse the same `RefLabel` component with graph-line-based colors from the commit table.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**: React 18, Zustand (state), Radix UI (popovers, context menus), @tanstack/react-virtual (virtual scrolling), Vite (webview build), esbuild (extension build)
**Storage**: In-memory (Zustand store); filter state is transient, not persisted across sessions
**Testing**: Manual smoke test via VS Code "Run Extension" launch config; `pnpm typecheck`, `pnpm lint`, `pnpm build`
**Target Platform**: VS Code Extension (webview runs in Chromium)
**Project Type**: VS Code extension (dual-process: Node.js backend + React webview frontend)
**Performance Goals**: Filter results within 2 seconds on 10K+ commit repos; 150ms debounce on date inputs
**Constraints**: No new packages; reuse existing Radix UI, native Chromium date picker; server-side filtering only
**Scale/Scope**: Supports repos with 10K+ commits, hundreds of contributors

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | All filtering server-side via git flags. No client-side filtering. Debounce on date inputs. Badge areas scroll independently (no full-panel re-layout). |
| II. Clean Code & Simplicity | PASS | Generic MultiSelectDropdown extracted (DRY). AuthorBadge shared component. RefLabel reused for branch badges. No over-engineering. |
| III. Type Safety & Explicit Error Handling | PASS | New types in `shared/types.ts`. New messages in `shared/messages.ts`. Result<T> pattern for git ops. |
| IV. Library-First & Purpose-Built Tools | PASS | Uses existing Radix UI for dropdowns/menus. Native Chromium date picker. No new packages needed. |
| V. Dual-Process Architecture Integrity | PASS | Backend handles git I/O (GitLogService). Frontend handles rendering. Communication via VS Code message passing. Shared types in `shared/`. |

## Project Structure

### Documentation (this feature)

```text
specs/032-advanced-filter-panel/
├── plan.md              # This file
├── research.md          # Phase 0 output — research decisions
├── data-model.md        # Phase 1 output — entity definitions
├── quickstart.md        # Phase 1 output — implementation order reference
├── contracts/
│   ├── messages.md      # Phase 1 output — message protocol contracts
│   └── components.md    # Phase 1 output — React component contracts
└── tasks.md             # Phase 2 output — implementation tasks
```

### Source Code (repository root)

```text
# Backend (extension host)
src/
├── extension.ts                    # Entry point (unchanged)
├── ExtensionController.ts          # Lifecycle orchestration (unchanged)
├── WebviewProvider.ts              # Handle getAuthors message, pass new filters
├── services/
│   ├── GitExecutor.ts              # Git process spawning (unchanged)
│   ├── GitLogService.ts            # Add getAuthors(), extend getCommits() with author/date flags
│   ├── GitDiffService.ts           # Unchanged
│   └── GitBranchService.ts         # Unchanged
└── utils/
    └── gitParsers.ts               # Unchanged

# Frontend (webview)
webview-ui/src/
├── components/
│   ├── MultiSelectDropdown.tsx     # NEW: Generic multi-select dropdown
│   ├── AuthorBadge.tsx             # NEW: Shared author badge (avatar + name + optional X)
│   ├── FilterWidget.tsx            # REWRITE: Full 3-section filter panel
│   ├── MultiBranchDropdown.tsx     # REFACTOR: Use MultiSelectDropdown<Branch>
│   ├── ControlBar.tsx              # MODIFY: Unhide filter button, update filterColor
│   ├── CommitDetailsPanel.tsx      # MODIFY: Use AuthorBadge for author display
│   ├── CommitTableRow.tsx          # MODIFY: Context menu triggers on author/date cells
│   ├── BranchContextMenu.tsx       # MODIFY: Add branch filter menu items
│   ├── GraphContainer.tsx          # MODIFY: Empty state for filtered zero results
│   ├── RefLabel.tsx                # REUSE: Branch badges in filter panel use this component
│   └── ...
├── stores/
│   └── graphStore.ts               # MODIFY: authorList, resetAllFilters(), extended hasFilter
├── rpc/
│   └── rpcClient.ts                # MODIFY: getAuthors(), authorList handling, extended filters
├── utils/
│   ├── colorUtils.ts               # REUSE: getLaneColorStyle() for branch badge colors
│   ├── graphTopology.ts            # REUSE: topology.nodes for branch→lane→color lookup
│   └── filterUtils.ts              # NEW: Utility for branch-to-color resolution
└── types/
    └── displayRefs.ts              # REUSE: DisplayRef types for branch badges

# Shared (cross-boundary contracts)
shared/
├── types.ts                        # MODIFY: Add Author, extend GraphFilters
├── messages.ts                     # MODIFY: Add getAuthors/authorList, update exhaustive maps
└── errors.ts                       # Unchanged
```

**Structure Decision**: Follows existing dual-process architecture. No structural changes — new files are added within existing directory conventions. Branch badge color resolution uses existing `graphTopology` → `colorUtils` pipeline.

# Implementation Plan: Advanced Filter Panel

**Branch**: `032-advanced-filter-panel` | **Date**: 2026-04-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/032-advanced-filter-panel/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add an advanced filter panel to the VS Code extension webview that enables filtering commits by author (multi-select), date range (from/to with optional time), and displays branch filter badges — all with AND logic. The panel is toggled via the existing hidden filter button in the ControlBar. Right-click context menus on author, date, and branch cells provide quick add/remove filter actions. A centralized reset mechanism ensures atomic filter state management across all reset triggers (session open, repo change, manual reset).

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**: React 18, Zustand (state), Radix UI (popovers, context menus), @tanstack/react-virtual (virtual scrolling), Vite (webview build), esbuild (extension build)
**Storage**: In-memory (Zustand store); filter state is transient, not persisted across sessions
**Testing**: Manual smoke testing via VS Code "Run Extension" launch config
**Target Platform**: VS Code Extension (1.80+), webview runs in Chromium sandbox
**Project Type**: VS Code extension (desktop-app) with dual-process architecture (Node.js backend + React webview frontend)
**Performance Goals**: Filter results update within 2 seconds on 10,000+ commit repositories
**Constraints**: Git process timeout 30s (via GitExecutor), virtual scrolling required for lists, graph topology computed in frontend
**Scale/Scope**: Repositories with 500+ commits, many branches, potentially hundreds of authors

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Author/date filtering uses git's native `--author`/`--after`/`--before` flags (server-side). Author dropdown uses existing popover pattern with search filtering. No new expensive client-side computation. |
| II. Clean Code & Simplicity | PASS | Spec explicitly requires DRY: shared AuthorBadge component (FR-017), generic MultiSelectDropdown (FR-018), centralized reset (FR-025). Will extract reusable patterns from existing MultiBranchDropdown. |
| III. Type Safety & Explicit Error Handling | PASS | New types added to `shared/types.ts` (Author, extended GraphFilters). Message contracts updated in `shared/messages.ts`. Result monad used for new git operations. |
| IV. Library-First & Purpose-Built Tools | PASS | Uses Chromium's native date input (`<input type="date">`/`<input type="time">`) — no third-party date picker needed. Radix UI for popovers/context menus (already in stack). |
| V. Dual-Process Architecture Integrity | PASS | Author list fetched via backend git command, sent to frontend via message passing. Date/author filters passed to backend via existing `getCommits` message. No git subprocess spawning in webview. |

### Agent Restrictions Check

| Restriction | Status |
|-------------|--------|
| No auto-install packages | PASS — no new packages required |
| No git commits/merges | PASS — readonly operations only |

**Gate result**: ALL PASS — proceed to Phase 0.

### Post-Design Re-Check (after Phase 1)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | All filtering server-side via git flags. Author list fetched once, not per-filter-change. Date input debounced 150ms. No new expensive client-side computation. |
| II. Clean Code & Simplicity | PASS | DRY enforced: MultiSelectDropdown shared by branch/author dropdowns, AuthorBadge shared by filter panel/details panel, centralized resetAllFilters() prevents code duplication across reset triggers. |
| III. Type Safety & Explicit Error Handling | PASS | New `Author` type and extended `GraphFilters` in `shared/types.ts`. New message types with exhaustive map updates. Result monad for `getAuthors()`. |
| IV. Library-First & Purpose-Built Tools | PASS | No new packages. Uses Chromium native date inputs and existing Radix UI. |
| V. Dual-Process Architecture Integrity | PASS | Author list fetched via backend git command. All filter parameters passed via message passing. No git operations in webview. New types in `shared/`. |

**Post-design gate result**: ALL PASS.

## Project Structure

### Documentation (this feature)

```text
specs/032-advanced-filter-panel/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Backend (extension host)
src/
├── services/
│   ├── GitLogService.ts          # MODIFY: Add --after/--before args, add getAuthors() method
│   └── GitExecutor.ts            # No changes needed
├── WebviewProvider.ts            # MODIFY: Handle new message types (getAuthors), pass date filters
└── ExtensionController.ts        # No changes expected

# Frontend (webview)
webview-ui/src/
├── components/
│   ├── FilterWidget.tsx           # REWRITE: Full filter panel (branch badges, author filter, date range)
│   ├── AuthorBadge.tsx            # NEW: Shared author badge component (avatar + name, optional remove)
│   ├── MultiSelectDropdown.tsx    # NEW: Generic multi-select dropdown extracted from MultiBranchDropdown
│   ├── MultiBranchDropdown.tsx    # MODIFY: Refactor to use MultiSelectDropdown internally
│   ├── CommitTableRow.tsx         # MODIFY: Add context menu triggers for author/date cells
│   ├── CommitContextMenu.tsx      # MODIFY: Add author filter and date filter context menu items
│   ├── BranchContextMenu.tsx      # MODIFY: Add "Add/Remove branch to/from filter" items
│   ├── ControlBar.tsx             # MODIFY: Unhide filter button, update filter color logic
│   ├── CommitDetailsPanel.tsx     # MODIFY: Replace plain-text author with AuthorBadge component
│   └── GraphContainer.tsx         # MODIFY: Show empty state message when filters produce zero commits
├── stores/
│   └── graphStore.ts              # MODIFY: Add author/date filter state, centralized reset, author list
├── rpc/
│   └── rpcClient.ts               # MODIFY: Add getAuthors(), update getCommits() signature for date filters

# Shared types
shared/
├── types.ts                       # MODIFY: Extend GraphFilters (afterDate, beforeDate, authors), add Author type
└── messages.ts                    # MODIFY: Add getAuthors request, authorList response, update filter payloads
```

**Structure Decision**: Follows existing dual-process architecture. No new directories — all new components live alongside existing ones in `webview-ui/src/components/`. Shared types extended in existing `shared/types.ts`. Backend changes isolated to `GitLogService` and `WebviewProvider`.

## Complexity Tracking

> No constitution violations detected. No complexity justifications needed.

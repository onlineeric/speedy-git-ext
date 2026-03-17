# Implementation Plan: Filterable Branch Dropdown

**Branch**: `014-filterable-branch-dropdown` | **Date**: 2026-03-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-filterable-branch-dropdown/spec.md`

## Summary

Replace the native HTML `<select>` branch filter in ControlBar with a custom filterable dropdown built on `@radix-ui/react-popover` (already installed). The component provides a text input for case-insensitive substring filtering, keyboard navigation (Tab → arrow keys → Enter), and the combobox type-to-redirect pattern. No new packages required.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**: React 18, Zustand, `@radix-ui/react-popover` (already installed), Tailwind CSS
**Storage**: N/A — all state is in-memory (Zustand store + local component state)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code Extension webview (browser sandbox)
**Project Type**: VS Code extension (desktop-app)
**Performance Goals**: Filter response < 100ms per keystroke; dropdown open/close feels instant
**Constraints**: Client-side filtering only (branches already in Zustand store); no new packages
**Scale/Scope**: Repositories with 100+ branches; single dropdown component replacement

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | ✅ Pass | Filtering is O(n) over in-memory branch array — no git/network calls during typing. RPC call only on selection. List scrolls via CSS overflow, not virtual scrolling (branch count rarely exceeds hundreds; virtual scrolling reserved for commit lists per constitution). |
| II. Clean Code & Simplicity | ✅ Pass | Single new component (`FilterableBranchDropdown`). Reuses existing Radix Popover pattern from `OverflowRefsBadge.tsx`. No new abstractions. |
| III. Type Safety & Explicit Error Handling | ✅ Pass | Uses existing `Branch` and `GraphFilters` types from `shared/types.ts`. No new shared types needed. Component props fully typed. |
| IV. Library-First & Purpose-Built Tools | ✅ Pass | Uses `@radix-ui/react-popover` (already installed) for positioning, portal rendering, and click-outside dismissal. No manual implementations. No new packages to install. |
| V. Dual-Process Architecture Integrity | ✅ Pass | Change is entirely in webview (`webview-ui/src/components/`). No backend changes. Uses existing store interface (`branches`, `filters`, `setFilters`) and RPC client (`rpcClient.getCommits`). |

**Agent Restrictions**: ✅ No commits, no package installs. Install commands provided if needed (none needed here).

## Project Structure

### Documentation (this feature)

```text
specs/014-filterable-branch-dropdown/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
webview-ui/src/
├── components/
│   ├── ControlBar.tsx                  # MODIFY: Replace <select> with FilterableBranchDropdown
│   └── FilterableBranchDropdown.tsx    # NEW: Custom filterable dropdown component
├── stores/
│   └── graphStore.ts                   # NO CHANGE: Existing store interface sufficient
└── rpc/
    └── rpcClient.ts                    # NO CHANGE: Existing getCommits method sufficient

shared/
└── types.ts                            # NO CHANGE: Existing Branch and GraphFilters types sufficient
```

**Structure Decision**: This feature adds a single new component file and modifies one existing file. No new directories, no backend changes, no shared type changes. The existing Zustand store API (`branches`, `filters`, `setFilters`) and RPC interface (`rpcClient.getCommits`) are used as-is.

## Complexity Tracking

| Deviation | Why Acceptable | Virtual Scrolling Rejected Because |
|-----------|----------------|-------------------------------------|
| Branch list uses CSS `overflow-y: auto` instead of virtual scrolling (Principle I: "any list rendering more than a few dozen rows") | The dropdown viewport shows ~15 items at a time with max-height constraint. Total DOM node count is bounded by branch count (typically < 500). Filtering further reduces visible items. | Virtual scrolling (`@tanstack/react-virtual`) adds complexity for a list that is already constrained to a small viewport. The performance cost of rendering < 500 lightweight `<div>` elements is negligible compared to the commit graph (thousands of rows with SVG). Constitution intent targets unbounded large lists like the commit log, not bounded dropdown menus. |

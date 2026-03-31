# Implementation Plan: Multi-Branch Filter Selection

**Branch**: `028-multi-branch-filter` | **Date**: 2026-03-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/028-multi-branch-filter/spec.md`

## Summary

Convert the branch filter dropdown from single-select to multi-select, allowing users to filter the commit graph by multiple branches simultaneously. The approach creates a new `MultiBranchDropdown` component (copied from the existing `FilterableBranchDropdown`) with checkbox toggle behavior, preserving the original as a reusable single-select component. The full data pipeline (`GraphFilters` → RPC → `GitLogService`) is updated from `branch?: string` to `branches?: string[]`. No new dependencies required.

## Technical Context

**Language/Version**: TypeScript 5.x (strict with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)  
**Primary Dependencies**: React 18, Zustand, @radix-ui/react-popover, @tanstack/react-virtual, esbuild (backend), Vite (frontend)  
**Storage**: N/A (in-memory Zustand store, transient selections)  
**Testing**: Manual smoke test via VS Code "Run Extension" launch config  
**Target Platform**: VS Code Extension (webview + extension host)  
**Project Type**: VS Code extension (desktop-app)  
**Performance Goals**: Graph updates with same perceived responsiveness as current single-branch filter. Text filter responsive for repos with 200+ branches.  
**Constraints**: No new npm dependencies. Bundle size must not increase meaningfully. Dropdown must remain open during multi-select.  
**Scale/Scope**: Repos with 500+ commits, 200+ branches.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | No new dependencies, extends existing component, git log natively supports multiple ref args |
| II. Clean Code & Simplicity | PASS | Extending existing component rather than adding a library; minimal changes to data flow |
| III. Type Safety & Explicit Error Handling | PASS | `GraphFilters.branches?: string[]` added to `shared/types.ts` as single source of truth; Result pattern unchanged |
| IV. Library-First & Purpose-Built Tools | PASS | No new library needed; existing Radix Popover sufficient for multi-select UX |
| V. Dual-Process Architecture | PASS | Changes respect backend/frontend separation; shared types updated in `shared/`; message passing unchanged |

No violations. No complexity justification needed.

## Project Structure

### Documentation (this feature)

```text
specs/028-multi-branch-filter/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (files to modify)

```text
shared/
├── types.ts             # GraphFilters: branch?: string → branches?: string[]
└── messages.ts          # loadMoreCommits filter type alignment

src/
├── WebviewProvider.ts   # Multi-branch validation, filter merging
└── services/
    └── GitLogService.ts # Push multiple branch refs to git log args

webview-ui/src/
├── components/
│   ├── FilterableBranchDropdown.tsx  # Preserved as single-select component (no changes)
│   ├── MultiBranchDropdown.tsx       # New multi-select version, based on FilterableBranchDropdown
│   └── ControlBar.tsx               # Switch from FilterableBranchDropdown to MultiBranchDropdown
├── stores/
│   └── graphStore.ts                # hasFilter check updated for branches array
└── rpc/
    └── rpcClient.ts                 # Extract branches[] for prefetch and RPC calls
```

**Structure Decision**: One new file created (`MultiBranchDropdown.tsx`). The existing `FilterableBranchDropdown.tsx` is preserved unchanged as a reusable single-select component. All other changes modify existing files.

# Implementation Plan: Compare Refs (A vs B)

**Branch**: `042-compare-refs` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/042-compare-refs/spec.md`

## Summary

Speedy Git currently inspects exactly one commit at a time. This feature adds an A-vs-B
comparison flow that matches the standard pattern in competing extensions (Git Graph, GitLens,
Git History): a third toggle panel ("Compare") alongside Filter and Search, plus right-click
entry points on commit / branch / tag / multi-selection / uncommitted rows. Each slot accepts
any commit-ish — full or short hash, branch, tag, `HEAD`, typed `git rev-parse` expression
(`HEAD~3`), or the `Working Tree` sentinel — through a single combobox primitive
(`FilterableSingleSelectDropdown`, already in the codebase). A 2-dot / 3-dot toggle controls
the diff form; defaults are computed from slot kinds (3-dot for branch-vs-branch, 2-dot
otherwise; 3-dot disabled when `Working Tree` is involved). Results render in the existing
`CommitDetailsPanel` reusing its file-list virtualization and loading spinner.

The technical approach is deliberately minimal: one new shared type bundle (`SlotValue`,
`CompareSelection`, `CompareResult`), one new backend service method
(`GitDiffService.compareRefs`), `AbortSignal` plumbing on `GitExecutor` for the FR-025b cancel
affordance, three new RPC messages (`compareRefs`, `cancelCompare`, `openCompareDiff`), and one
new response (`compareResult`). The `git-show://` URI scheme used for per-file diff is reused
unchanged. Compare state is stored in the Zustand graph store (session-only, cleared on repo
switch and window reload — FR-030 / FR-031); it is intentionally NOT added to
`PersistedUIState`. Decisions captured in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x strict (`noUnusedLocals`, `noUnusedParameters`,
`noImplicitReturns`) — both extension host and webview.
**Primary Dependencies**: VS Code Extension API 1.80+; React 18 + Zustand + Tailwind +
`@radix-ui/react-popover` (already used by `FilterableSingleSelectDropdown`);
`@tanstack/react-virtual` (existing file-list virtualization).
**Storage**: None new. Compare state lives in Zustand store (transient, session-only).
`PersistedUIState` (VS Code globalState) is NOT extended.
**Testing**: Vitest unit tests for `compareRefs` parser, slot-equality, default-mode rules,
and abort plumbing. Manual smoke via `pnpm build` + `Run Extension` per
[quickstart.md](./quickstart.md).
**Target Platform**: VS Code 1.80+ desktop and web (linux/macOS/Windows; webview sandboxed).
**Project Type**: VS Code extension — dual-process (Node.js extension host + React webview)
sharing typed contracts via `shared/`.
**Performance Goals**: Per SC-003, compare results with <1,000 changed files render within 2 s
of the Compare action. Inherits virtual-scrolling design from Constitution Principle I.
**Constraints**: 30 s `GitExecutor` timeout; abort path resolves with new `'CANCELLED'` error
code; no shell string concatenation (args[]-only); no auto-install of packages.
**Scale/Scope**: ~5 new components / methods (CompareWidget, compareRefs service, abort
plumbing, store fields, panel header). No new dependencies. Estimated <800 lines of net
production code across backend + webview.

## Constitution Check

Evaluated against the five Core Principles in `.specify/memory/constitution.md` v1.0.0.

| Principle | Status | Justification |
|---|---|---|
| **I. Performance First** | ✅ Pass | File-list virtualization is reused (no new path); abort plumbing prevents UI freeze on large compares (FR-025b); auto-refresh integration only re-runs compare when a slot is `Working Tree` (FR-033 — explicitly avoids unnecessary work for ref-vs-ref). 30 s `GitExecutor` timeout retained. |
| **II. Clean Code & Simplicity** | ✅ Pass | Reuses existing combobox (`FilterableSingleSelectDropdown`), existing panel (`CommitDetailsPanel`), existing URI scheme (`git-show://`), and existing toolbar three-state color convention. Net new types are limited to what the feature genuinely needs (`SlotValue` discriminated union, `CompareSelection`, `CompareResult`); no speculative abstractions. No regex parsing — git's `--name-status -z` is parsed by the existing `parseDiffNameStatus`. |
| **III. Type Safety & Explicit Error Handling** | ✅ Pass | All new types added to `shared/types.ts`; new RPC messages added to `shared/messages.ts` with corresponding entries in `REQUEST_TYPES` / `RESPONSE_TYPES` so an exhaustiveness violation fails the type check. `compareRefs` returns `Result<CompareResult, GitError>`. New `'CANCELLED'` error code added explicitly to `shared/errors.ts`. No throw-based control flow. |
| **IV. Library-First & Purpose-Built Tools** | ✅ Pass | No new third-party packages. Cancellation uses Node's standard `AbortSignal` (built-in). The combobox primitive is already in the codebase. The empty-tree hash uses the well-known constant from git itself, not a homegrown computation. |
| **V. Dual-Process Architecture Integrity** | ✅ Pass | All git I/O remains in `src/services/GitDiffService.ts`. Webview never spawns processes or imports `vscode`. New RPC messages are the only cross-boundary surface; types live in `shared/`. Graph topology and result rendering remain in webview. |

**No violations.** Complexity Tracking section below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/042-compare-refs/
├── plan.md              # This file
├── research.md          # Phase 0 decisions (combobox reuse, abort plumbing, lazy resolve, …)
├── data-model.md        # Phase 1 types (SlotValue, CompareSelection, CompareResult, store)
├── contracts/
│   ├── rpc-messages.md  # compareRefs / cancelCompare / openCompareDiff / compareResult
│   └── ui-contracts.md  # CompareWidget, CommitDetailsPanel header, context menus
├── quickstart.md        # 10-scenario manual smoke test mapped to acceptance criteria
├── spec.md              # Feature specification (already authored)
├── checklists/          # Existing checklists (out of scope for this plan)
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root) — net additions only

```text
shared/
├── types.ts                    # +SlotValue, +CompareMode, +CompareSelection, +CompareResult,
│                               #  +ComparePanelUIState, +EMPTY_TREE_HASH, +EMPTY_COMPARE_SELECTION
├── messages.ts                 # +compareRefs req, +cancelCompare req, +openCompareDiff req,
│                               #  +compareResult res; update REQUEST_TYPES / RESPONSE_TYPES maps
└── errors.ts                   # +GitErrorCode 'CANCELLED'

src/                            # Extension host (Node.js)
├── services/
│   ├── GitExecutor.ts          # +abortSignal?: AbortSignal on GitExecOptions; abort plumbing
│   └── GitDiffService.ts       # +compareRefs(refA, refB, mode, abortSignal?) method
└── WebviewProvider.ts          # +Routes for compareRefs / cancelCompare / openCompareDiff;
                                #  +AbortController per active compare (latest-wins)

webview-ui/src/                 # Frontend (React + Zustand)
├── components/
│   ├── CompareWidget.tsx       # NEW — slot A/B comboboxes, swap, mode toggle, Compare button,
│   │                           #        inline error/notice
│   ├── CommitDetailsPanel.tsx  # +Compare-mode header rendering, +Cancel button during loading,
│   │                           #  +file-row click dispatches openCompareDiff
│   ├── ControlBar.tsx          # Remove `style={{ display: 'none' }}` on Compare button;
│   │                           #  add three-state color (idle / open / pending)
│   ├── CommitContextMenu.tsx   # +Set as Base, +Compare with Base, +Compare these commits
│   ├── BranchContextMenu.tsx   # +Set as Base, +Compare with Base
│   ├── UncommittedContextMenu.tsx # +Set as Base, +Compare with Base (using Working Tree)
│   ├── CommitRow.tsx           # +A/B graph row badges
│   └── CommitTableRow.tsx      # +A/B graph row badges
├── stores/
│   └── graphStore.ts           # +compareSelection, +compareResult, +comparePanelUI;
│                               #  +setSlotA, +setSlotB, +swapSlots, +setCompareModeOverride,
│                               #  +clearCompareState, +beginCompare, +endCompare*
└── rpc/
    └── rpcClient.ts            # +compareRefs(...), +cancelCompare(...), +openCompareDiff(...)
                                #  client methods
```

**Structure Decision**: This is a VS Code extension with the dual-process layout already
documented in `CLAUDE.md`. The compare feature does not justify any new top-level directories;
all changes fit inside the existing `shared/` / `src/` / `webview-ui/src/` triad. The single
new file is `webview-ui/src/components/CompareWidget.tsx` (already imported in `TogglePanel.tsx`
and referenced in `ActiveToggleWidget`); everything else is targeted edits to existing files.

## Complexity Tracking

> No constitution violations — this section is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| _none_ | _n/a_ | _n/a_ |

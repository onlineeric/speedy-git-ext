# Implementation Plan: Replace Submodule Mode with Submodule Selector

**Branch**: `041-submodule-selector` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/041-submodule-selector/spec.md`

## Summary

Replace the legacy "submodule mode" (header row + Back-to-parent button) with a compact, filterable
**submodule selector** placed next to the existing repo selector in the top-menu `ControlBar`. The
new submodule selector lists, in order: a `<parent name> (parent)` option followed by the parent's
**initialized** submodules (sorted alphabetically, case-insensitive). Selecting a submodule switches
the graph view to that submodule's repo via a `switchRepo`-style flow, while the repo selector
visibly remains on the parent. Selecting the parent option returns the view to the parent.

The repo selector is upgraded to a filterable combo box matching the existing branches filter
combo box's behavior. The new submodule selector and the upgraded repo selector reuse a single
shared filterable single-select combo-box building block. The branches filter combo box (existing
`MultiBranchDropdown` / `MultiSelectDropdown`) is treated as the keyboard / focus / filter
behavior contract by reference; it is **not** required to be upgraded.

A left-to-right reset/refresh chain is introduced across the top menu:

- Repo selector change → resets submodule selector (default to parent option, or hide) **and**
  resets the entire filter/search group's content (branches filter cleared, filter panel
  internals cleared, search panel internals cleared). The open/closed toggle state of the
  filter/search panels is **preserved**.
- Submodule selector change → resets only the filter/search group's content (same preservation
  rule).
- The internal reset/refresh logic of the filter/search group's individual controls is owned
  outside this feature's scope — only the existing reset entry point on each is invoked.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: React 18, Zustand, Radix UI (`@radix-ui/react-popover`,
`@radix-ui/react-context-menu`), Tailwind CSS, `@tanstack/react-virtual`. Backend host: VS Code
Extension API ≥ 1.80, `child_process` (via `GitExecutor`).
**Storage**: VS Code `context.globalState` for UI state (panel sizes, layout). **No** persistence
for submodule selection (FR-008a).
**Testing**: Vitest unit tests for store reducers, parsers, and topology helpers. Manual smoke test
via VS Code "Run Extension" launch config (constitution gate).
**Target Platform**: VS Code 1.80+ on Linux, macOS, Windows. Webview runs in a sandboxed
Chromium-based context.
**Project Type**: Single VS Code extension with dual-process architecture (extension host
backend in `src/`, webview frontend in `webview-ui/src/`, shared contracts in `shared/`).
**Performance Goals**: Top-menu interactions < 16 ms perceived latency. Submodule selector open
< 50 ms with up to 50 initialized submodules. Filter typeahead must remain in-frame on all three
filterable selectors at workspace sizes ≥ 100 entries.
**Constraints**: Graph topology computation must remain in the webview (constitution principle I).
Git processes must use `GitExecutor`'s 30-second timeout (constitution principle I). All git
operations targeting the displayed repo must continue to use the existing service singletons
re-bound by `reinitServices` — no new submodule "mode" or modal state at the operation level
(FR-016).
**Scale/Scope**: A typical workspace has 1–20 repos. A typical parent has 0–10 submodules.
Worst case targeted: 100 repos / 50 submodules. Single level of submodule nesting (FR-015).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.0. **All gates pass**.

| Principle | Status | Notes |
|---|---|---|
| I. Performance First | PASS | Submodule selector is a single compact control; uses existing virtualization-free dropdown (≤ 50 items). No new long-running git calls; reuses `GitSubmoduleService.getSubmodules()` already plumbed through the decoupled `submodulesData` message. Reset chain is purely synchronous store updates. |
| II. Clean Code & Simplicity | PASS | One shared filterable single-select combo box building block consolidates duplication (FR-020). Removed UI (header row + Back-to-parent button) deletes more code than it adds. Reset chain centralizes left→right invalidation in the store rather than spreading it across components. |
| III. Type Safety & Explicit Error Handling | PASS | New shared types added to `shared/types.ts` before use. RPC contracts defined in `shared/messages.ts` (no new message types are required — submodule navigation reuses `switchRepo`). `Result<T, GitError>` is preserved for any new submodule-related backend call. |
| IV. Library-First & Purpose-Built Tools | PASS | Combo box uses `@radix-ui/react-popover` (already a dependency). No regex on git output beyond what `GitSubmoduleService` already does. No new packages required. |
| V. Dual-Process Architecture Integrity | PASS | All git I/O stays in the backend `services/`. Submodule resolution (parent path + relative submodule path → absolute repo path) is computed in the backend on `switchRepo`. Webview owns dropdown rendering, filter input, and reset orchestration. `shared/` is the only location for new types. |

No complexity violations to track.

## Project Structure

### Documentation (this feature)

```text
specs/041-submodule-selector/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── webview-rpc.md   # RPC message contract additions/changes
├── checklists/          # Pre-existing checklists
└── spec.md              # Feature spec
```

### Source Code (repository root)

This feature touches both halves of the dual-process architecture (backend extension host
and webview frontend) plus shared contracts.

```text
src/                                  # Backend (extension host) — esbuild → dist/extension.js
├── ExtensionController.ts            # MODIFY: simplify submodule navigation handlers; switchActiveRepo accepts submodule paths
├── WebviewProvider.ts                # MODIFY: remove openSubmodule / backToParentRepo branches; ensure submodulesData refresh on every switchRepo
└── services/
    └── GitSubmoduleService.ts       # MODIFY: populate Submodule.initialized in parseSubmoduleLine (status !== 'uninitialized' && <sub>/.git exists)

webview-ui/src/                       # Frontend — Vite + React → dist/webview/
├── App.tsx                           # NO CHANGE
├── components/
│   ├── ControlBar.tsx                # MODIFY: render <RepoSelector /> + <SubmoduleSelector /> in left-to-right order
│   ├── RepoSelector.tsx              # MODIFY: replace native <select> with filterable single-select combo box
│   ├── SubmoduleSelector.tsx         # NEW: filterable single-select listing parent option + initialized submodules
│   ├── FilterableSingleSelectDropdown.tsx  # NEW: shared building block (single-select sibling of MultiSelectDropdown)
│   ├── SubmoduleBreadcrumb.tsx       # DELETE: legacy header row + Back-to-parent button
│   ├── GraphContainer.tsx            # MODIFY: remove <SubmoduleBreadcrumb /> and <SubmoduleSection /> renders
│   └── FilterableBranchDropdown.tsx  # DELETE if unused after consolidation (currently has 0 imports outside its own file)
├── stores/
│   └── graphStore.ts                 # MODIFY: add displayedRepoPath / activeParentRepoPath split; add resetTopMenuGroup() entry-point; revise setActiveRepo to drive reset chain; remove submoduleStack push/pop usage from selector flow
├── rpc/
│   └── rpcClient.ts                  # MODIFY: remove openSubmodule / backToParentRepo helpers (if no longer used) — submodule navigation routes through switchRepo

shared/
├── types.ts                          # MODIFY: extend RepoInfo or introduce DisplayedRepoState if needed; keep Submodule unchanged; SubmoduleNavEntry / submoduleStack become unused (mark deprecated, remove if no callers)
└── messages.ts                       # MODIFY: deprecate openSubmodule / backToParentRepo if no longer reachable; keep submodulesData (still used to populate submodule selector)
```

**Structure Decision**: Existing dual-process layout (backend `src/`, webview
`webview-ui/src/`, shared `shared/`) is preserved unchanged. The feature lives almost entirely
in the webview (new `SubmoduleSelector`, shared dropdown, reset orchestration in the store) plus
small backend cleanups in `ExtensionController` / `WebviewProvider` to retire the
`openSubmodule` / `backToParentRepo` flow. No new top-level directories are introduced.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. Section intentionally empty.

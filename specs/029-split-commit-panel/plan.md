# Implementation Plan: Responsive Split Layout for Bottom Commit Details Panel

**Branch**: `029-split-commit-panel` | **Date**: 2026-03-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/029-split-commit-panel/spec.md`

## Summary

Make the commit details panel responsive when it is positioned at the bottom: keep the existing stacked layout on narrow widths, switch to an automatic side-by-side layout on wider widths, and preserve the current right-side panel behavior unchanged. The implementation stays entirely in the webview layer by restructuring `CommitDetailsPanel` into reusable sections, measuring the panel width locally, and applying split-layout styling with independent section scrolling.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)  
**Primary Dependencies**: React 18, Zustand, Tailwind CSS utilities, esbuild (backend), Vite (frontend)  
**Storage**: Existing VS Code `context.globalState` persistence unchanged; no new persisted state  
**Testing**: Manual smoke test via VS Code "Run Extension" launch config; `pnpm typecheck`, `pnpm lint`, `pnpm build`  
**Target Platform**: VS Code Extension (webview + extension host)  
**Project Type**: VS Code Extension (desktop-app)  
**Performance Goals**: Layout switching must remain lightweight during panel resize; commit list virtualization and existing panel interactions must remain responsive in repositories with 500+ commits and commits containing 100+ changed files  
**Constraints**: Bottom-panel split mode is automatic-only with no user-controlled divider; right-panel layout must remain unchanged; no backend or shared message changes; no new package installs  
**Scale/Scope**: 1 primary component refactor (`CommitDetailsPanel.tsx`), 1 existing resize pattern reused (`ResizeObserver`), 0 backend files, 0 shared contract changes, 0 new persisted settings

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Width observation is local to the panel and mirrors the existing `ResizeObserver` usage in `GraphContainer`; no new work touches graph virtualization or git execution |
| II. Clean Code & Simplicity | PASS | The panel will be split into focused section components instead of layering conditionals into one long column renderer |
| III. Type Safety & Explicit Error Handling | PASS | Any new layout mode type can stay frontend-local; no new cross-boundary messages or untyped state are required |
| IV. Library-First & Purpose-Built Tools | PASS | Existing browser `ResizeObserver` is sufficient; no new package is needed for width measurement or split layout |
| V. Dual-Process Architecture Integrity | PASS | The feature is webview-only; backend git services, RPC contracts, and shared message types remain unchanged |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/029-split-commit-panel/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
webview-ui/src/
├── components/
│   └── CommitDetailsPanel.tsx    # MODIFY: split panel into reusable sections and responsive bottom layout
├── stores/
    └── graphStore.ts            # NO CHANGE expected; existing panel size and position state reused
└── App.tsx                       # OPTIONAL MODIFY: only if panel integration needs a minor guard for right-side layout behavior

shared/
└── types.ts                     # NO CHANGE expected; no shared state or RPC contract additions

src/
└── WebviewProvider.ts           # NO CHANGE expected; persistence schema unchanged
```

**Structure Decision**: Keep the feature entirely inside the existing webview frontend. `CommitDetailsPanel.tsx` is the main change point because it already owns panel size, position, and section rendering. Shared types and backend files remain untouched unless implementation reveals a narrowly scoped local type extraction need.

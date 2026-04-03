# Implementation Plan: Resizable Commit Columns

**Branch**: `031-resize-commit-columns` | **Date**: 2026-04-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/031-resize-commit-columns/spec.md`

## Summary

Add a second commit-list presentation mode that renders commits as a customizable table with resizable, reorderable, and hideable columns while keeping the existing classic row layout as the fallback. The implementation keeps virtualization in `GraphContainer`, introduces a shared table-layout model for header and row alignment, surfaces column controls from an in-webview settings popover, and persists mode/layout preferences through the existing `PersistedUIState` flow in `WebviewProvider`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)  
**Primary Dependencies**: VS Code Extension API, React 18, Zustand, `@tanstack/react-virtual`, `@radix-ui/react-popover`, `@dnd-kit/core`, `@dnd-kit/sortable`, Vite, esbuild  
**Storage**: VS Code `context.globalState` via the existing persisted UI state object  
**Testing**: Manual smoke test via VS Code "Run Extension" launch config; `pnpm typecheck`; `pnpm lint`; `pnpm build`  
**Target Platform**: VS Code 1.85+ desktop extension host + sandboxed webview  
**Project Type**: VS Code extension (desktop app with extension-host/backend and React webview/frontend)  
**Performance Goals**: Preserve virtualized scrolling performance on 500+ commit histories; keep resize/reorder/visibility interactions visually immediate; add no new git round-trips for layout changes  
**Constraints**: No new npm packages; classic view must remain available and unchanged as fallback; graph column stays visible and first; no horizontal scrollbar introduced in table mode; existing selection/search/context-menu interactions must continue working  
**Scale/Scope**: One new commit-list mode, six configurable columns, one shared persisted layout object, primarily webview changes plus extension-host validation for persisted state

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Virtualization stays in `GraphContainer`; no backend recomputation is added for layout changes; width resolution is local and synchronous in the webview |
| II. Clean Code & Simplicity | PASS | Classic and table render paths are separated cleanly; a dedicated layout helper centralizes width/order/visibility rules instead of spreading them across components |
| III. Type Safety & Explicit Error Handling | PASS | Shared persisted-layout types live in `shared/types.ts`; extension-host validation guards malformed saved state before hydration |
| IV. Library-First & Purpose-Built Tools | PASS | Reuses already-installed `@dnd-kit` for reorder UI and Radix Popover for the column/settings surface; no manual drag/drop framework needed |
| V. Dual-Process Architecture Integrity | PASS | Rendering and interaction remain in the webview; persistence stays in the extension host through message passing and `globalState` |

**Post-Phase 1 Re-check**: All principles still pass after the design decisions in [research.md](research.md), [data-model.md](data-model.md), and [contracts/messages.md](contracts/messages.md). No violations require justification.

## Project Structure

### Documentation (this feature)

```text
specs/031-resize-commit-columns/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── messages.md      # Persisted UI state contract updates
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
shared/
└── types.ts                                 # Add commit-list mode and commit-table layout types/defaults

src/
└── WebviewProvider.ts                       # Validate and persist commit list mode + table layout in globalState

webview-ui/src/
├── stores/
│   └── graphStore.ts                        # Hold hydrated mode/layout state and mutation actions
├── utils/
│   └── commitTableLayout.ts                 # NEW: default widths/order + responsive width resolution
└── components/
    ├── ControlBar.tsx                       # Commit-list settings/column chooser entry point
    ├── GraphContainer.tsx                   # Switch between classic and table virtualization paths
    ├── CommitRow.tsx                        # Existing classic view fallback (unchanged behavior)
    ├── CommitTableHeader.tsx                # NEW: table header + resize handles
    ├── CommitTableRow.tsx                   # NEW: aligned table-mode row renderer
    └── CommitListSettingsPopover.tsx        # NEW: mode switch, column visibility, reorder UI
```

**Structure Decision**: Keep the feature inside the existing extension-host/webview split. Shared persisted types belong in `shared/types.ts`, persistence validation stays in `src/WebviewProvider.ts`, and all commit-list rendering/customization logic stays in `webview-ui/src/`.

## Phase 0: Research

See [research.md](research.md) for full findings. Key decisions:

1. Expose mode switching and column management from an in-webview settings popover so users can change layouts without leaving the commit list.
2. Reuse the current `PersistedUIState` pipeline instead of splitting this feature across VS Code settings and separate UI storage.
3. Use `@dnd-kit/sortable` for optional-column reordering and keep the graph column pinned first by design.
4. Resolve effective column widths in a shared helper where the message column is the primary flexible column, other visible optional columns can compress to minimum widths after the message column, and the graph width respects topology needs.
5. Keep virtualization in `GraphContainer`, render a non-virtualized header, and allow the rendered table to overflow off the right edge once minimum width is reached.

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](data-model.md).

Core additions:
- `CommitListMode = 'classic' | 'table'`
- `CommitTableColumnId = 'graph' | 'hash' | 'refs' | 'message' | 'author' | 'date'`
- `CommitTableLayout` with persisted order, visibility, and preferred widths
- `PersistedUIState` extended with `commitListMode` and `commitTableLayout`

### Interface Contracts

See [contracts/messages.md](contracts/messages.md).

Contract impact:
- No new message names are needed.
- Existing `persistedUIState` and `updatePersistedUIState` payloads expand to include commit-list mode and table layout.
- `WebviewProvider` remains responsible for per-field validation and default fallback before sending state to the webview.

### Rendering / Interaction Design

```text
ControlBar
└── CommitListSettingsPopover
    ├── mode switch (classic / table)
    ├── optional-column visibility toggles
    └── sortable optional-column order list

GraphContainer
├── classic mode
│   └── existing CommitRow virtualization
└── table mode
    ├── CommitTableHeader          # non-virtualized header, resize handles
    └── virtualized CommitTableRow # same resolved grid template as header
```

### Responsive Width Rules

```text
Inputs:
- persisted preferred widths
- column minimum widths
- current container width
- current graph-content width from topology

Rules:
1. graph effective width = max(saved graph width, required graph width, graph min width)
2. non-message columns keep preferred width unless explicitly resized
3. message effective width expands toward its saved preferred width when space exists
4. when width is tight, message shrinks first down to its minimum
5. if more compression is needed, other visible optional columns may shrink toward their minimum widths while graph remains protected
6. once minimum table width is reached, the table stops shrinking and may extend off the right edge
```

## Complexity Tracking

No constitution violations. No additional complexity justification is required.

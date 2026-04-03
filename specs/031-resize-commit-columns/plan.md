# Implementation Plan: Resizable Commit Columns

**Branch**: `031-resize-commit-columns` | **Date**: 2026-04-04 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/031-resize-commit-columns/spec.md`

## Summary

Add a second commit-list presentation mode that renders commits as a customizable table with resizable, reorderable, and hideable columns while keeping the existing classic row layout as the fallback. The table uses five columns: graph, hash, message, author, and date, with ref badges rendering inline in the message column rather than occupying a separate column. The implementation keeps virtualization in `GraphContainer`, introduces a shared table-layout model for header and row alignment, surfaces column controls from an in-webview settings popover, and persists mode/layout preferences through the existing `PersistedUIState` flow in `WebviewProvider`.

**Post-implementation refinements**:
1. Default view mode is `'table'` so new and upgraded users experience the feature immediately.
2. Column configuration controls remain visible but disabled when Classic mode is active.
3. Column layout preferences (widths, order, visibility) are stored per repository, while the view mode remains global.
4. The commit-list settings popover is no longer part of the exclusive filter/search/compare toggle system; it manages its own open state and must not close or be closed by those toolbar panels.
5. The commit-list settings trigger moves to the right-aligned utility controls between the loaded-count indicator and Manage Remotes, and the toolbar divider between icon-button groups is upgraded from a short text glyph to a full-height visual separator aligned with adjacent icon buttons.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)  
**Primary Dependencies**: VS Code Extension API, React 18, Zustand, `@tanstack/react-virtual`, `@radix-ui/react-popover`, `@dnd-kit/core`, `@dnd-kit/sortable`, Vite, esbuild  
**Storage**: VS Code `context.globalState` for global UI state and per-repo keyed column-layout entries  
**Testing**: Manual smoke test via VS Code "Run Extension" launch config; `pnpm typecheck`; `pnpm lint`; `pnpm build`  
**Target Platform**: VS Code 1.85+ desktop extension host with sandboxed webview  
**Project Type**: VS Code extension with extension-host/backend and React webview/frontend  
**Performance Goals**: Preserve virtualized scrolling performance on 500+ commit histories; keep resize, reorder, visibility, and toolbar interactions visually immediate; add no new git round-trips for layout or toolbar state changes  
**Constraints**: No new npm packages; classic view must remain available and unchanged as fallback; graph column stays visible and first; no horizontal scrollbar introduced in table mode; filter/search/compare remain mutually exclusive; the commit-list settings popover must remain independent from those exclusive panels  
**Scale/Scope**: One new commit-list mode, five configurable columns, one shared persisted layout model, one independent toolbar popover control, and one visual toolbar separator update, implemented primarily in the webview with extension-host validation for persisted state

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Virtualization stays in `GraphContainer`; toolbar-state changes are local and synchronous; no backend recomputation or extra git work is introduced for the new popover behavior or separator polish |
| II. Clean Code & Simplicity | PASS | Classic and table render paths remain separated cleanly; column-layout logic stays centralized; settings-popover exclusivity is removed instead of adding more cross-control coupling |
| III. Type Safety & Explicit Error Handling | PASS | Shared persisted-layout types remain in `shared/types.ts`; no new cross-boundary message types are introduced; invalid persisted state still falls back safely in `WebviewProvider` |
| IV. Library-First & Purpose-Built Tools | PASS | Reuses existing Radix Popover and `@dnd-kit`; toolbar separator polish uses existing SVG/icon patterns rather than new dependencies |
| V. Dual-Process Architecture Integrity | PASS | Rendering and toolbar interaction remain in the webview; persistence stays in the extension host through existing message passing and `globalState` |

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
└── types.ts                                 # Commit-list mode and persisted table-layout types/defaults

src/
└── WebviewProvider.ts                       # Validate and persist commit-list mode + per-repo table layout

webview-ui/src/
├── stores/
│   └── graphStore.ts                        # Hold hydrated mode/layout state and exclusive toggle state
├── utils/
│   └── commitTableLayout.ts                 # Default widths/order + responsive width resolution
└── components/
    ├── ControlBar.tsx                       # Toolbar layout, exclusive toggle buttons, separator, utility controls
    ├── GraphContainer.tsx                   # Switch between classic and table virtualization paths
    ├── CommitRow.tsx                        # Existing classic view fallback (unchanged behavior)
    ├── CommitTableHeader.tsx                # Table header + resize handles
    ├── CommitTableRow.tsx                   # Aligned table-mode row renderer
    ├── CommitListSettingsPopover.tsx        # Mode switch, column visibility, reorder UI, local open state
    └── icons.tsx                            # Shared SVG icons, including any dedicated toolbar separator icon
```

**Structure Decision**: Keep the feature inside the existing extension-host/webview split. Shared persisted types belong in `shared/types.ts`, persistence validation stays in `src/WebviewProvider.ts`, and all commit-list rendering plus toolbar interaction logic stays in `webview-ui/src/`.

## Phase 0: Research

See [research.md](research.md) for full findings. Key decisions:

1. Expose mode switching and column management from an in-webview settings popover so users can change layouts without leaving the commit list.
2. Reuse the current `persistedUIState` pipeline, with global mode persistence and per-repo column-layout storage, instead of introducing a second transport or storage system.
3. Use `@dnd-kit/sortable` for optional-column reordering and keep the graph column pinned first by design.
4. Resolve effective column widths in a shared helper where the message column is the primary flexible column, other visible optional columns can compress to minimum widths after the message column, and the graph width respects its fixed minimum.
5. Keep virtualization in `GraphContainer`, render a non-virtualized header, and allow the rendered table to overflow off the right edge once minimum width is reached.
6. Keep the commit-list settings popover independent from the exclusive filter/search/compare toggle state so toolbar panels do not close one another unexpectedly.
7. Replace the short text separator in the toolbar with a dedicated full-height visual divider aligned to the icon-button affordance.

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](data-model.md).

Core additions:
- `CommitListMode = 'classic' | 'table'`
- `CommitTableColumnId = 'graph' | 'hash' | 'message' | 'author' | 'date'`
- `CommitTableLayout` with persisted order, visibility, and preferred widths stored per repository
- `PersistedUIState` extended with `commitListMode` globally and `commitTableLayout` in the webview payload
- local settings-popover open state that is intentionally independent from `activeToggleWidget`

### Interface Contracts

See [contracts/messages.md](contracts/messages.md).

Contract impact:
- No new message names are needed.
- Existing `persistedUIState` and `updatePersistedUIState` payloads continue to carry commit-list mode and table layout.
- The independent settings popover state and the toolbar separator styling do not cross the extension-host boundary and therefore do not change the message contract.
- `WebviewProvider` remains responsible for per-field validation and default fallback before sending state to the webview.

### Rendering / Interaction Design

```text
ControlBar
├── left toolbar group
│   ├── filter toggle            # exclusive with search/compare
│   ├── search toggle            # exclusive with filter/compare
│   ├── full-height separator
│   ├── refresh button
│   ├── fetch button
│   └── compare toggle           # exclusive with filter/search
└── right utility group
    ├── loaded-count indicator
    ├── CommitListSettingsPopover trigger  # independent local popover state
    ├── Manage Remotes button
    └── Extension settings button

GraphContainer
├── classic mode
│   └── existing CommitRow virtualization
└── table mode
    ├── CommitTableHeader          # non-virtualized header, resize handles
    └── virtualized CommitTableRow # same resolved grid template as header
                                   # ref badges render inline in message column
```

### Double-Click Auto-Fit

When the user double-clicks a column resize handle, the system computes the optimal width for that column using `canvas.measureText()` across all loaded commits and sets the column's preferred width to that value. See [research.md](research.md) R6 for the measurement strategy per column. The auto-fit result is persisted immediately via the existing `persistUIState` flow.

### Responsive Width Rules

```text
Inputs:
- persisted preferred widths
- column minimum widths
- current container width

Rules:
1. graph effective width = max(saved graph width, graph min width) — graph content clips when column is narrower than topology requires
2. non-message columns keep preferred width unless explicitly resized
3. message effective width expands toward its saved preferred width when space exists
4. when width is tight, message shrinks first down to its minimum
5. if more compression is needed, other visible optional columns may shrink toward their minimum widths while graph remains protected
6. once minimum table width is reached, the table stops shrinking and may extend off the right edge
7. ref badges in the message column maintain fixed size; only the commit message text truncates
```

## Complexity Tracking

No constitution violations. No additional complexity justification is required.

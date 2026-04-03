# Research: Resizable Commit Columns

**Date**: 2026-04-03

## R1: Commit-List Mode and Column Settings Entry Point

**Decision**: Expose the classic/table mode switch and the column chooser from an in-webview commit-list settings popover in the control bar, rather than relying on the VS Code Settings editor.

**Rationale**:
- The spec requires users to switch modes and resize columns without leaving the commit list.
- The control bar already hosts list-affecting controls, so a local popover keeps the interaction near the data it changes.
- This avoids adding a second source of truth between a VS Code configuration setting and a webview-only layout state model.

**Alternatives considered**:
- **VS Code Settings only**: Rejected because it conflicts with SC-001's "without leaving the commit list" requirement.
- **Context menu only**: Rejected because mode switching and column management are persistent view settings, not row-specific actions.

## R2: Persistence Model

**Decision**: Extend the existing `PersistedUIState` object to store both `commitListMode` and `commitTableLayout`, and keep using the current `persistedUIState` / `updatePersistedUIState` message flow.

**Rationale**:
- The persistence pipeline already exists, is global across repositories, and is validated in `WebviewProvider`.
- Column widths, visibility, and order are structured UI preferences better suited to `globalState` than to user-editable VS Code settings.
- Reusing the existing message flow avoids introducing new transport concepts or a second persistence mechanism.

**Alternatives considered**:
- **Store mode in `UserSettings` and layout in `PersistedUIState`**: Rejected because it splits one feature across two persistence systems and complicates hydration order.
- **Persist layout in local storage inside the webview**: Rejected because the extension host already owns durable state and validation.

## R3: Column Reordering and Visibility UI

**Decision**: Use the already-installed `@dnd-kit/sortable` package for optional-column reordering inside the popover, and use explicit visibility toggles for show/hide.

**Rationale**:
- `@dnd-kit` is already part of the webview dependencies, so no package changes are needed.
- Reordering in the popover is clearer than trying to make the narrow table header support both resize and reorder gestures.
- The graph column can stay pinned first by simply excluding it from the sortable optional-column list.

**Alternatives considered**:
- **Native HTML drag-and-drop**: Rejected because `@dnd-kit` is already available and provides cleaner React ergonomics.
- **Header drag-to-reorder**: Rejected because it conflicts with resize handles and adds higher precision requirements to a dense toolbar/table UI.

## R4: Width Resolution Strategy

**Decision**: Persist per-column preferred widths, but compute effective rendered widths in a shared layout helper where the message column is the primary flexible column and the graph column's effective width never drops below the space required by the rendered topology.

**Rationale**:
- The spec distinguishes between a saved preferred width and the effective width when space gets tight.
- A shared width-resolution helper keeps header and row cells aligned because both consume the same computed result.
- Using the current topology-derived graph width prevents dense histories from clipping the graph when users switch repositories or narrow the panel.

**Alternatives considered**:
- **Treat all columns as equally shrinkable**: Rejected because the spec explicitly makes the message column the primary flexible column.
- **Persist only effective widths**: Rejected because it loses the user's preferred message width after temporary viewport shrinkage.

## R5: Table Rendering Structure

**Decision**: Keep virtualization in `GraphContainer`, add a non-virtualized table header above the scroll container, and render virtualized table rows with the same resolved grid template as the header.

**Rationale**:
- The current performance model already depends on row virtualization and should remain intact.
- A non-virtualized header is simpler than folding a sticky header into the virtual row list.
- The scroll container can remain vertical-only (`overflow-y`) while the table itself is allowed to extend beyond the right edge once the minimum viable width is reached, satisfying FR-020.

**Alternatives considered**:
- **Replace virtualization with a semantic `<table>`**: Rejected because it would regress performance on large histories.
- **Use horizontal scrolling for narrow widths**: Rejected because the spec explicitly disallows introducing a horizontal scrollbar.

# Research: Resizable Commit Columns

**Date**: 2026-04-04

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

**Decision**: Keep using the current `persistedUIState` / `updatePersistedUIState` message flow, with `commitListMode` stored globally and `commitTableLayout` stored per repository in extension-host state.

**Rationale**:
- The persistence pipeline already exists and is validated in `WebviewProvider`.
- Column widths, visibility, and order are structured UI preferences better suited to `globalState` than to user-editable VS Code settings.
- Reusing the existing message flow avoids introducing new transport concepts or a second persistence mechanism while still allowing repo-specific layouts.

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

**Decision**: Persist per-column preferred widths, but compute effective rendered widths in a shared layout helper where the message column is the primary flexible column. The graph column's minimum width is a fixed constant (enough to display the header label); the graph content clips naturally when the user narrows the column below the topology's rendered width.

**Rationale**:
- The spec distinguishes between a saved preferred width and the effective width when space gets tight.
- A shared width-resolution helper keeps header and row cells aligned because both consume the same computed result.
- The graph column uses a fixed minimum width rather than a topology-derived floor, allowing users to crop the graph when they prefer more space for other columns. This avoids forcing a very wide graph column in dense repositories.

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

## R6: Double-Click Auto-Fit Column Width

**Decision**: Use `canvas.measureText()` to compute the maximum content width across all loaded commits for the target column, then set the column's preferred width to that value. For the graph column, derive the width from the maximum lane count in the topology.

**Rationale**:
- All commit data is already available in the Zustand store, so no async work or additional git calls are needed.
- `canvas.measureText()` is synchronous and fast even for 500+ commits, avoiding DOM measurement complexity.
- Virtual scrolling means only a subset of rows are in the DOM at any time, so DOM-based measurement would be inaccurate. Data-driven measurement is both more accurate and more performant.
- The existing `setCommitTableColumnPreferredWidth` and `persistUIState` flow handles persistence with no new plumbing.

**Per-column measurement strategy**:
- `graph`: Max lane count × LANE_WIDTH, clamped to min width.
- `hash`: Monospace text measurement of the longest `abbreviatedHash`.
- `message`: Measurement of the longest `commit.subject` plus a fixed padding estimate for inline ref badges and icons.
- `author`: Measurement of the longest `commit.author` plus avatar width if enabled.
- `date`: Measurement of the longest formatted date string using the current date format setting.

**Alternatives considered**:
- **DOM-based measurement**: Rejected because virtual scrolling only renders a subset of rows, making DOM measurement inaccurate.
- **Temporary off-screen rendering**: Rejected because it's complex and slow for hundreds of rows.
- **Fixed heuristic widths**: Rejected because they can't adapt to actual data length variations across repositories.

## R7: Default View Mode for New/Upgraded Users

**Decision**: Default `commitListMode` to `'table'` instead of `'classic'` so that users upgrading to this version immediately see the new table-style view.

**Rationale**:
- The table-style view is the primary value of this feature. Defaulting to classic would hide the feature from users who don't discover the settings popover.
- Users who prefer the classic view can switch back with one click in the settings popover.

**Alternatives considered**:
- **Default to classic**: Rejected because it hides the new feature and requires users to discover the mode switch on their own.

## R8: Disable Column Config in Classic Mode

**Decision**: When Classic mode is selected, visually disable and make non-interactive all column configuration controls (visibility toggles, drag-to-reorder) in the settings popover.

**Rationale**:
- Column layout settings only affect the table-style view. Allowing changes in Classic mode would be confusing since the user can't see the effect.
- Disabling rather than hiding preserves discoverability — users can see what controls are available and understand they become active when switching to Table mode.

**Alternatives considered**:
- **Hide column controls entirely in Classic mode**: Rejected because it reduces discoverability of the table feature and makes the popover look empty.
- **Allow changes in Classic mode**: Rejected because it would confuse users who don't see any effect from their changes.

## R9: Per-Repository Column Layout Storage

**Decision**: Store column layout preferences (widths, order, visibility) per repository using a hashed repo-path key in `globalState`, while keeping the view mode (classic/table) global.

**Rationale**:
- Different repositories have different graph densities, author name lengths, branch naming conventions, and overall structure. A layout optimized for one repo may not suit another.
- The view mode preference is user-level ("I prefer table view") while column layout is repo-level ("this repo needs a wider graph column").
- Using `globalState` with a per-repo key pattern keeps the implementation simple — no new persistence mechanism is needed.
- The key uses a SHA-256 hash of the repo path to avoid issues with special characters in file system paths used as storage keys.

**Alternatives considered**:
- **Keep layout global**: Rejected because user feedback indicates column widths need to differ between repos with different characteristics.
- **Use `workspaceState` instead of keyed `globalState`**: Rejected because `workspaceState` is tied to the workspace folder, not the individual repo, and multi-root workspaces with multiple repos would share state.
- **Persist layout in the repo itself** (e.g., `.vscode/settings.json`): Rejected because this is UI preference data that shouldn't be committed to version control.

## R10: Independent Commit-List Settings Popover State

**Decision**: Keep the commit-list settings popover outside the exclusive filter/search/compare toggle state. Its open or closed state is managed locally by the popover control and does not read from or write to `activeToggleWidget`.

**Rationale**:
- The updated spec requires the settings control to operate as an independent utility action rather than a mutually exclusive panel toggle.
- Decoupling it prevents the filter, search, or compare panel from being closed as a side effect of opening settings, and vice versa.
- The color treatment can still reflect the local popover open state without introducing more shared-toolbar state.

**Alternatives considered**:
- **Keep using `activeToggleWidget` for settings**: Rejected because it violates the updated requirement that the settings popover must not close other toggle panels.
- **Create a second shared toolbar-state store just for utility controls**: Rejected because local popover state is simpler and avoids unnecessary global coupling.

## R11: Toolbar Divider Rendering

**Decision**: Replace the short text separator between toolbar icon groups with a dedicated visual divider rendered at icon-button height.

**Rationale**:
- A text glyph separator is aligned to the font box rather than the icon-button affordance, which makes it look visually short in the toolbar.
- A dedicated divider component or icon allows consistent alignment, thickness, and theming without depending on text metrics.
- This keeps the control bar visually coherent as more utility controls are added.

**Alternatives considered**:
- **Keep the `|` text separator and adjust line-height**: Rejected because it remains font-metric dependent and fragile across themes and zoom levels.
- **Remove the divider entirely**: Rejected because the visual grouping between exclusive toolbar actions and adjacent controls would become weaker.

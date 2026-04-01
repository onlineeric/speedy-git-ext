# Research: Responsive Split Layout for Bottom Commit Details Panel

**Date**: 2026-03-31

## R1: Bottom-Panel Width Detection

**Decision**: Measure the rendered commit details panel width in the webview and derive the bottom-panel layout mode from that local width, reusing the existing `ResizeObserver` pattern already used elsewhere in the frontend.

**Rationale**:
- The feature requirement is based on the panel's available width, not the overall VS Code window size
- `ResizeObserver` already exists in `GraphContainer`, so the pattern is established in this codebase
- Measuring the panel container avoids coupling the feature to unrelated layout assumptions in `App.tsx`

**Alternatives considered**:
- **Window-level resize listeners**: Rejected because the bottom panel width can change independently of overall window width
- **Static CSS breakpoint only**: Rejected because the panel width depends on the current layout and panel sizing, not just viewport width

## R2: Layout Structure and Scrolling

**Decision**: Refactor the panel body into explicit commit-details and files-changed sections, and in bottom split mode render them as sibling columns with independent overflow handling rather than one shared scrolling column.

**Rationale**:
- The current single scroll container is the core reason the bottom layout wastes horizontal space and compresses vertical visibility
- Independent section scrolling allows long metadata/signature content and long file lists to remain usable at the same time
- Reusable section components preserve the existing content while making the two layouts straightforward to express

**Alternatives considered**:
- **Keep one shared scroll container and only change outer flex direction**: Rejected because one section can still dominate the available height and hide the other section's content
- **Duplicate section markup for stacked vs split layouts**: Rejected because it increases maintenance cost and risk of drift

## R3: Split-Mode Width Allocation

**Decision**: Use an automatic responsive flex-based split with minimum usable widths for both sections and no user-controlled divider between them.

**Rationale**:
- This matches the clarified requirement: automatic responsive split only
- Flex-based sizing is simpler than introducing a second resize interaction inside an already resizable panel
- Minimum widths provide a clear cutoff for when the layout must fall back to stacked mode

**Alternatives considered**:
- **Manual divider between left and right sections**: Rejected by clarified spec and would add new interaction and persistence questions
- **Fixed 50/50 split with no minimums**: Rejected because very different content densities can make one side unusable on borderline widths

## R4: Scope of State Changes

**Decision**: Keep layout-mode state local to the component (or a dedicated local hook) and do not persist it in `PersistedUIState`.

**Rationale**:
- The spec defines layout mode as a pure function of current panel position and available width
- Persisting the split/stacked mode would create stale state that conflicts with responsive behavior
- Existing persisted settings for panel position, bottom height, right width, and file view already cover the user-controlled aspects

**Alternatives considered**:
- **Persist the current bottom layout mode**: Rejected because it is derived state, not a user preference
- **Add shared type or RPC support for layout mode**: Rejected because the feature does not cross the webview boundary

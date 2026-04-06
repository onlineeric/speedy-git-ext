# Research: Dotted-Line Graph Continuity

**Feature Branch**: `033-dotted-line-graph-continuity`  
**Date**: 2026-04-05

## R-001: Server-Side to Client-Side Author Filtering Migration

**Decision**: Remove all `--author` git log arguments. Backend always returns unfiltered commits (for the selected branches). Author filtering moves entirely to the frontend via `computeHiddenCommitHashes()`.

**Rationale**: When `--author` is applied server-side, git omits non-matching commits entirely — the frontend never sees them. This breaks parent chain resolution in `graphTopology.ts` (line 58-59: `commitIndexByHash.get(parentHash)` returns `undefined` for filtered-out parents). By fetching all commits and filtering client-side, the topology algorithm has full ancestry data to compute dotted connections through hidden segments.

**Alternatives considered**:
- **Two-pass fetch** (fetch unfiltered for topology, filtered for display): Doubles git I/O; unnecessary since a single unfiltered fetch serves both needs.
- **Backend returns hidden commit metadata** (hashes + parent refs only): Adds API complexity and still requires backend awareness of which filters are "visibility" vs "structural." Moving filtering to the client is simpler and enables instant filter toggling (FR-005).

---

## R-002: Topology Algorithm Adaptation for Hidden Commits

**Decision**: `calculateTopology()` receives ALL commits (including hidden) plus a `hiddenHashes: Set<string>`. It processes all commits for lane assignment but excludes hidden commits from the output `nodes` map. A post-pass creates skip connections (dotted lines) from visible commits to their nearest visible ancestors.

**Rationale**: Processing all commits maintains correct lane reservations and prevents lane collisions. If hidden commits were excluded from lane assignment, a visible commit could be assigned a lane already occupied by a passing connection through a hidden segment. The skip-connection post-pass is a clean separation: the main loop handles lane assignment; the post-pass handles visual skip connections.

**Alternatives considered**:
- **Process only visible commits, infer gaps from parent hash mismatches**: Loses lane continuity — hidden commits' lane reservations would be missing, causing lane overlap and incorrect graph layout.
- **Virtual "placeholder" nodes for hidden commits**: Adds visual complexity (what to render for placeholders?), increases render count, and provides no user benefit over dotted lines.

---

## R-003: Prefetch Adaptation for Visible-Row-Based Triggering

**Decision**: When visibility filters are active, use a threshold-based trigger: fire prefetch when `rangeEnd >= mergedCommits.length - prefetchThreshold`. Add auto-retry for empty batches (up to 3 consecutive), with a gap indicator when the cap is reached.

**Rationale**: The current trigger compares `rangeEnd` (visible-row index from virtualizer) against `lastBatchStartIndex` (total-loaded index). With client-side filtering, visible rows can be much fewer than total loaded, so `rangeEnd` may never reach `lastBatchStartIndex`. A visible-position threshold ensures the trigger fires correctly. The 3-batch cap prevents runaway fetching when filters exclude most commits.

**Alternatives considered**:
- **Track `lastBatchStartIndex` in visible-row terms**: Fragile — the visible count at batch boundaries changes when filters are toggled. A simple threshold (`mergedCommits.length - threshold`) is more robust.
- **Increase batch size when filters active**: Rejected by spec clarification — per-batch size stays constant; auto-retry compensates.

---

## R-004: SVG Dotted Line Rendering

**Decision**: Use `strokeDasharray="4 3"` with `opacity: 0.7` on SVG `<line>` and `<path>` elements for dotted connections. Same approach for passing-lane lines through hidden segments.

**Rationale**: `strokeDasharray` is the standard SVG mechanism for dashed/dotted strokes. The `4 3` pattern (4px dash, 3px gap) provides clear visual distinction from solid lines at 28px row height. Reduced opacity further differentiates dotted from solid without changing color, preserving lane color consistency (FR-002).

**Alternatives considered**:
- **CSS `border-style: dotted`**: Not applicable — graph is SVG-rendered, not DOM elements.
- **Canvas-based dashed lines**: Would require rewriting the SVG-based graph renderer; unnecessary complexity.
- **Animated dashes**: Distracting for a static graph display.

---

## R-005: Tooltip for Hidden Commit Count

**Decision**: Add `title` attribute on dotted connection SVG elements with text "N hidden commits" where N is `hiddenCount`. Use SVG `<title>` element for native browser tooltip.

**Rationale**: SVG `<title>` provides native tooltip behavior with zero dependencies. The tooltip shows only the count per spec clarification (no author names or commit details). This is simpler and more performant than a custom tooltip component.

**Alternatives considered**:
- **Radix UI Tooltip component**: Heavier; requires wrapping SVG elements in React components, managing open/close state. Overkill for a simple count display.
- **Custom hover overlay**: Requires mouse position tracking and z-index management within the SVG viewport. Unnecessary complexity.

---

## R-006: `commitIndexByHash` and `passingLanesByRow` Indexing

**Decision**: `commitIndexByHash` maps commit hashes to their **visible row index** (position in `mergedCommits`). `passingLanesByRow` is keyed by visible row index. The topology algorithm maintains an internal `allCommitIndexByHash` (all commits including hidden) for lane assignment, but outputs only visible-indexed structures.

**Rationale**: The virtualizer renders visible rows only. `GraphCell` receives `index` as the visible row position. All render-time lookups must use visible indices. The internal all-commit index is needed during topology computation for correct lane reservation ordering but is not exposed.

**Alternatives considered**:
- **Single unified index with hidden rows marked**: Would require the virtualizer to skip hidden rows, breaking `@tanstack/react-virtual`'s contiguous index assumption.
- **Dual public maps (all-index and visible-index)**: Exposes implementation detail; only visible-indexed maps are needed by consumers.

---

## R-007: Passing Lanes Through Hidden Segments

**Decision**: When `computePassingLanes()` processes connections that span hidden commits (skip connections with `isDotted: true`), it marks the passing lane entries with `isDotted: true` for all intermediate visible rows. `GraphCell` renders these as dashed vertical lines.

**Rationale**: A connection from visible commit A (row 0) to visible commit C (row 5) with 3 hidden commits in between creates passing lanes on rows 1-4. These passing lanes should be visually dotted to indicate hidden commits exist in the gap, matching the dotted connection style.

**Alternatives considered**:
- **Solid passing lanes through hidden segments**: Misleading — suggests the lane has continuous visible commits.
- **No passing lanes through hidden segments**: Creates visual gaps in the lane, which is the exact problem this feature solves.

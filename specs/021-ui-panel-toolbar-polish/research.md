# Research: UI Panel & Toolbar Polish

**Branch**: `021-ui-panel-toolbar-polish` | **Date**: 2026-03-24

## R1: Right-Side Panel Resize Bug Root Cause

**Decision**: The resize handle for right-side panel uses `absolute` positioning (`absolute bottom-0 left-0 top-0 z-10 w-1`), but the panel container `<div>` does not have `position: relative`. This means the handle positions itself relative to a higher ancestor instead of the panel itself. Adding `relative` to the panel container's className when in right position will fix the resize.

**Rationale**: The bottom resize handle uses static flow (`flex-shrink-0 h-1`) which works without relative positioning. The right handle needs absolute positioning to overlay the panel's left edge, but requires its parent to be the positioning context.

**Alternatives considered**:
- Changing the right handle to use static positioning like bottom — rejected because the handle needs to span the full height of the panel's left edge, which requires absolute positioning
- Using a separate wrapper div with relative positioning — unnecessary complexity when adding `relative` to the existing panel div solves it

## R2: Maximum Width Constraint Implementation

**Decision**: Calculate max width during resize by reading the parent container's width and subtracting 200px (minimum graph area). Use `Math.min(maxWidth, newSize)` in the resize handler.

**Rationale**: The parent container (`flex flex-1 overflow-hidden` div in App.tsx) contains both the graph and panel. Its width represents the total available space. Subtracting 200px ensures the graph area remains usable.

**Alternatives considered**:
- Using CSS `max-width` with `calc()` — not viable because the constraint is dynamic and based on the container width at resize time
- Using a ResizeObserver to track container width — over-engineering for a simple drag operation where we can read the container width on mousedown

## R3: SVG Icon Pattern for New Icons

**Decision**: Follow the existing pattern in `webview-ui/src/components/icons/index.tsx`. All icons use 12×12px viewBox, inherit `currentColor`, accept `IconProps` (className, style). The new CloudIcon, CloseIcon, MoveRightIcon, and MoveBottomIcon will follow this same pattern.

**Rationale**: Consistency with the 9 existing icons. All use stroke-based rendering with strokeWidth 1.2-1.5px.

**Alternatives considered**:
- Using a third-party icon library (lucide-react, heroicons) — rejected per constitution Principle IV (no auto-install), and the project already has a custom icon pattern that's lightweight and consistent
- Using Unicode characters — this is the current approach and it's causing the garbled close button issue

## R4: State Clearing on Repo Switch

**Decision**: Modify `setActiveRepo` in graphStore.ts to immediately clear: `selectedCommit`, `selectedCommitIndex`, `selectedCommits`, `lastClickedHash`, `commitDetails`, and `detailsPanelOpen`. This happens before the `switchRepo` RPC is sent, ensuring no stale UI state is visible during the loading transition.

**Rationale**: Currently `setActiveRepo` only sets `isLoadingRepo: true` and clears `pendingCommitCheckout`. The `setCommits` call that arrives later preserves `selectedCommit` if the hash exists in new data (which it won't across repos). Clearing eagerly prevents a brief flash of stale commit details.

**Alternatives considered**:
- Clearing state in `setRepos` or `setCommits` response — too late; user sees stale panel during loading overlay
- Adding a `clearCommitSelection` action and calling it separately — unnecessary indirection when we can inline the state reset in `setActiveRepo`

## R5: Toolbar Layout Order

**Decision**: New ControlBar order (left to right):
1. RepoSelector (conditional)
2. FilterableBranchDropdown
3. Refresh button (primary)
4. Fetch button (secondary)
5. Search button (secondary)
6. `ml-auto` spacer (loaded commits count)
7. CloudIcon button (Manage Remotes)
8. Settings gear button (⚙)
9. RemoteManagementDialog (hidden, render-only)

**Rationale**: Refresh is the most frequent action (local state refresh), then Fetch (remote), then Search. The Manage Remotes button moves to the right section as an icon-only button since it's infrequently used, grouping it with other utility/settings controls.

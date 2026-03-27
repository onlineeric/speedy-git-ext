# Research: Commit Node Hover Tooltip

## R1: Tooltip Rendering Approach — Radix Popover vs Custom CSS

**Decision**: Use `@radix-ui/react-popover` with controlled open state.

**Rationale**: Already installed and used in `OverflowRefsBadge.tsx`. Provides Portal rendering (escapes virtual scroll `overflow:hidden`), automatic repositioning within viewport bounds, configurable `side`/`align`/`sideOffset`, and arrow rendering. The controlled `open` prop allows timer-based show/hide logic.

**Alternatives considered**:
- `@radix-ui/react-tooltip` — Not installed; would require a new package. Also, Radix Tooltip is designed for simple text hints and does not support interactive content (hovering into the tooltip). Popover supports interactive content natively.
- Custom CSS positioning with `position: fixed` — Would require manual viewport boundary detection, no Portal, and reimplementation of collision avoidance. More code, more bugs.

## R2: Hover Delay & Dismiss Timer Implementation

**Decision**: Use `useRef` timers (`setTimeout`/`clearTimeout`) in a custom `useTooltipHover` hook.

**Rationale**: Timer-based hover/dismiss is a common pattern. Using `useRef` to store timer IDs avoids stale closure bugs. The hook encapsulates: 200ms show delay, 150ms dismiss delay, cancel-on-reenter logic, and single-tooltip enforcement (clearing previous timer when hovering a new node).

**Alternatives considered**:
- CSS `:hover` with `transition-delay` — Cannot implement the "cursor moves from node into tooltip" bridge behavior. CSS hover on SVG circles doesn't extend to a Portal-rendered popover.
- `@floating-ui/react` — More powerful but a new dependency. Radix Popover uses Floating UI internally already.

## R3: Hover State Management — Local State vs Zustand Store

**Decision**: Use a lightweight Zustand store slice (`hoveredCommitHash`, `tooltipAnchorRect`) for hover state.

**Rationale**: The tooltip is rendered in a Portal (outside the `CommitRow` component tree). The hovered commit hash and anchor position must be accessible from the Portal-level `CommitTooltip` component. Zustand provides this without prop drilling. The store slice is minimal (2 fields) and only triggers re-renders of the tooltip component.

**Alternatives considered**:
- React Context — Would require a new context provider wrapping `GraphContainer`. Works but adds a layer vs. using the existing Zustand store.
- Local state in `GraphContainer` with prop drilling — Would require passing callbacks through `CommitRow` → `GraphCell`, causing unnecessary re-renders.

## R4: Sync Status — Existing `isCommitPushed` Reuse

**Decision**: Reuse the existing `isCommitPushed` RPC call and `commitPushedResult` response.

**Rationale**: `GitHistoryService.isCommitPushed()` already runs `git branch -r --contains <hash>` with the GitExecutor 30s timeout. The `isCommitPushed`/`commitPushedResult` message pair already exists in `shared/messages.ts`. The RPC client already has `rpcClient.isCommitPushed(hash)` returning a `Promise<boolean>`. No backend changes needed for sync status.

**Alternatives considered**:
- New dedicated message type — Unnecessary duplication of existing infrastructure.
- Bulk pre-fetch sync status for all commits — Too expensive (`git branch -r --contains` per commit on load would spawn hundreds of git processes).

## R5: Worktree Data — New Backend Service

**Decision**: Create `GitWorktreeService` with `listWorktrees()` method that parses `git worktree list --porcelain`.

**Rationale**: The `--porcelain` flag gives machine-parseable output with `worktree`, `HEAD`, `branch` fields per entry. Bulk-fetching once on graph load is efficient since repos typically have very few worktrees (1-5). The data maps commit hashes to worktree paths.

**Alternatives considered**:
- Parse non-porcelain output — Brittle; human-readable format changes across git versions.
- On-demand per hover — Redundant; would re-run the same command every time.

## R6: External Reference Link Parsing

**Decision**: Create `externalRefParser.ts` utility that extracts `#123` (GitHub PR/issue) and `JIRA-123`-style patterns from commit messages, using the git remote URL (from existing `RemoteInfo` in store) to construct clickable URLs.

**Rationale**: Reuse `GitHubAvatarService.parseGitHubRemote()` to detect GitHub repos and extract `owner/repo`. For GitHub, `#N` maps to `https://github.com/{owner}/{repo}/issues/{N}` (GitHub auto-redirects issues/pulls). JIRA-style patterns (`[A-Z]+-\d+`) are recognized but not linked without a configured base URL (deferred to future).

**Alternatives considered**:
- Full commit message body parsing — Would require fetching the full message body (not just subject) from backend. The subject line (already in `commit.subject`) is sufficient for most reference patterns.
- Regex-free parsing — Overkill for simple patterns like `#123`. Regex is appropriate here since we're matching simple numeric patterns, not parsing structured data.

## R7: Tooltip Positioning Strategy

**Decision**: Use Radix Popover with `side="right"` (preferred), `align="center"`, `sideOffset={8}`, and `collisionPadding={8}`. Radix handles automatic flip/shift within viewport.

**Rationale**: The SVG circle is on the left side of the row. Positioning the tooltip to the right of the circle avoids overlapping the graph lanes. Radix Popover's built-in collision detection handles narrow viewports by flipping to `left`, `top`, or `bottom` as needed. The `avoidCollisions` prop (true by default) combined with `collisionBoundary` handles the FR-012 requirement.

**Alternatives considered**:
- Always position below — Would overlap adjacent commit rows in the virtual list.
- Custom position calculation — Unnecessary given Radix's built-in collision handling.

## R8: Scroll Dismiss Implementation

**Decision**: Add a scroll event listener on the `GraphContainer` scroll container (`containerRef`) that clears the hovered commit hash, dismissing the tooltip.

**Rationale**: The virtual scroll container already has a ref (`containerRef`). Adding a passive scroll listener is zero-cost and immediately clears tooltip state. This satisfies FR-013.

**Alternatives considered**:
- `IntersectionObserver` on the hovered row — More complex, same result.
- Radix Popover `onOpenAutoFocus` prevention — Doesn't handle scroll natively.

## R9: VS Code Theme Integration

**Decision**: Use VS Code CSS custom properties for all tooltip styling: `--vscode-editorHoverWidget-background`, `--vscode-editorHoverWidget-border`, `--vscode-editorHoverWidget-foreground`, `--vscode-editorHoverWidget-statusBarBackground`.

**Rationale**: These are the standard VS Code hover widget theme tokens, available in all themes (dark, light, high contrast). Using these ensures the tooltip matches the native VS Code hover experience. The existing codebase uses `--vscode-menu-background` for context menus — the hover widget tokens are more semantically appropriate for tooltips.

**Alternatives considered**:
- `--vscode-menu-*` tokens — Less semantically correct for a hover tooltip.
- Custom hardcoded colors — Would break in non-default themes.

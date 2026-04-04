# Research: Advanced Filter Panel

**Feature Branch**: `032-advanced-filter-panel`
**Date**: 2026-04-04

## Research Tasks & Findings

### R1: Git Author Filtering — `--author` flag behavior

**Decision**: Use git's native `--author` flag for server-side author filtering.

**Rationale**:
- `git log --author=<pattern>` performs substring/regex matching on the author field (name + email).
- Multiple `--author` flags use OR semantics: `--author=Alice --author=Bob` returns commits by Alice OR Bob.
- The existing `GitLogService.getCommits()` already accepts a single `author?: string` in `GraphFilters` and passes it as `--author=`. This needs to be extended to support multiple authors.
- For multi-author filtering, pass multiple `--author=` arguments (one per selected author). Git handles OR logic natively.
- Author matching is case-insensitive by default for `--author`.

**Alternatives considered**:
- Client-side filtering: Rejected — would require loading all commits first, defeating the purpose of `maxCount` pagination and hurting performance on large repos.
- Single regex pattern combining all authors: Rejected — fragile with special characters in names/emails. Multiple `--author=` flags are the canonical approach.

### R2: Git Date Range Filtering — `--after`/`--before` flags

**Decision**: Use git's `--after` and `--before` flags for server-side date filtering.

**Rationale**:
- `git log --after=<date>` shows commits strictly after the given date (exclusive). The spec says "from that date onward" (inclusive). Using start-of-day `T00:00:00` for date-only inputs effectively includes the full day. Note: if a user enters an exact time, commits at that precise second are excluded — this is a minor behavioral difference accepted as a tradeoff for using git's native flags.
- `git log --before=<date>` shows commits before or on the given date.
- Both accept ISO 8601 date strings (e.g., `2026-01-15`, `2026-01-15T14:30:00`).
- When From Date has no time, default to start-of-day `T00:00:00`. When To Date has no time, default to end-of-day `T23:59:59`.
- These flags combine with `--author` using AND logic (git's default), which matches the spec's requirement (FR-011).

**Alternatives considered**:
- `--since`/`--until`: These are aliases for `--after`/`--before` respectively. Functionally identical; `--after`/`--before` chosen for clarity.
- Client-side date filtering: Rejected for the same performance reasons as author filtering.

### R3: Fetching the Full Author List

**Decision**: Add a `getAuthors` backend command that runs `git log --all --format='%an%x00%ae'` and deduplicates by email.

**Rationale**:
- The spec requires the author list to be sourced from the full repository history across all branches (FR-003), deduplicated by email.
- Running `git log --all --format='%an%x00%ae'` is the most direct way to get all unique authors. Using null-byte separator ensures reliable parsing (consistent with existing LOG_FORMAT pattern).
- Deduplication by email happens server-side to minimize data transfer.
- The author list is fetched once on initial load and refreshed on fetch/refresh operations (per spec Assumptions), not on every filter change.
- For very large repos, `git shortlog -sne --all` is an alternative but returns a different format; `git log --all --format` is more consistent with existing patterns in this codebase.

**Alternatives considered**:
- `git shortlog -sne --all`: Simpler output but different parsing pattern. The `git log --format` approach is consistent with the existing `GitLogService` code patterns.
- Extract from loaded commits: Rejected — would only show authors from the current loaded batch (500 commits by default), not the full history.

### R4: Date Input UX in VS Code Webview

**Decision**: Use native HTML `<input type="date">` and `<input type="time">` for date/time input.

**Rationale**:
- The spec assumes the built-in Chromium date picker in the VS Code webview provides adequate UX (Assumptions section).
- VS Code webviews run in Chromium, which supports `<input type="date">` and `<input type="time">` with built-in pickers.
- No third-party date picker library needed — aligns with Constitution Principle IV (Library-First only when needed; native is sufficient here).
- Date field is required; time field is optional (FR-006). Two separate inputs (date + time) keep the UX clear.
- The date input returns `YYYY-MM-DD` format, and time input returns `HH:MM` format. These are concatenated to form the ISO 8601 string sent to the backend.
- Debounce 150ms on date field changes (FR-019) before triggering a data reload.

**Alternatives considered**:
- Third-party date picker (react-datepicker, etc.): Rejected — adds a dependency for minimal gain. Chromium's native picker is well-supported and familiar.
- Single datetime-local input: Considered but rejected — the spec treats date as required and time as optional, which maps better to two separate inputs.

### R5: Extracting a Generic MultiSelectDropdown Component (FR-018)

**Decision**: Extract common dropdown logic from `MultiBranchDropdown` into a generic `MultiSelectDropdown` component. Both `MultiBranchDropdown` and the new author filter dropdown will consume it.

**Rationale**:
- The existing `MultiBranchDropdown` (357 lines) contains reusable patterns: Radix Popover, search filtering, keyboard navigation (Tab/Arrow/Enter), auto-scroll, multi-select with checkmarks, grouped items.
- The author dropdown needs identical interaction patterns: search, multi-select, keyboard navigation.
- FR-018 explicitly requires extracting a generic multi-select dropdown.
- The generic component handles: open/close state, search input, filtered item list, keyboard navigation, selection toggling, "Select All/None" option.
- Domain-specific rendering (branch grouping, author avatar+email display) is handled via render props or slot patterns.

**Key design decisions for MultiSelectDropdown**:
- Generic type parameter `<T>` for item type.
- Props: `items: T[]`, `selectedItems: T[]`, `onToggle: (item: T) => void`, `onClearAll: () => void`, `getKey: (item: T) => string`, `getSearchText: (item: T) => string`, `renderItem: (item: T, selected: boolean) => ReactNode`, `renderTrigger: (selectedCount: number) => ReactNode`, `groupBy?: (item: T) => string`, `placeholder?: string`.
- Internal state: search text, highlighted index, list navigation mode (matching existing keyboard pattern).

**Alternatives considered**:
- Keep MultiBranchDropdown as-is and duplicate for author: Rejected — violates DRY principle and Constitution Principle II.
- Use a third-party multi-select library: Rejected — the existing custom implementation is well-tailored to VS Code's look-and-feel. Introducing a library would create styling inconsistencies.

### R6: Centralized Filter Reset (FR-025)

**Decision**: Add a single `resetAllFilters()` action in the Zustand store that atomically resets branches, authors, date range, and triggers a data reload.

**Rationale**:
- The spec explicitly calls out a previous bug where partial resets occurred (FR-025 clarification: "Previous version had bugs where partial resets occurred").
- A single method ensures: (1) all filter state is cleared, (2) the commit list is reloaded, (3) the filter panel UI reflects the reset state — all atomically.
- All reset triggers (session open/`setCommits`, repo change/`setRepos`/`setActiveRepo`, manual Reset All button) must call this single method.
- The method resets: `filters` to `{ maxCount }` only, `activeToggleWidget` stays as-is (panel stays open on manual reset), `totalLoadedWithoutFilter` to null.

**Alternatives considered**:
- Multiple reset paths with shared helper: Rejected — the spec explicitly warns against this pattern as the source of previous bugs.
- Event-based reset (pub/sub): Rejected — overengineered for a single-store Zustand setup. A direct action is simpler and more explicit.

### R7: Context Menu Integration for Quick Filtering (FR-014, FR-015, FR-016)

**Decision**: Extend existing `CommitContextMenu` and `BranchContextMenu` with filter actions. Add new context menu wrapping around author and date cells in `CommitTableRow`.

**Rationale**:
- The existing `CommitContextMenu` wraps the entire commit row. For author-specific and date-specific context menus, we need to intercept right-clicks on specific cells.
- **Author cell**: Wrap the author cell content in a new context menu trigger. Menu items: "Add Author to filter" / "Remove Author from filter" (conditional on current filter state).
- **Date cell**: Wrap the date cell content in a new context menu trigger. Menu items: "Filter from this date" / "Filter to this date".
- **Branch badges**: The existing `BranchContextMenu` already wraps branch refs. Add "Add branch to filter" / "Remove branch from filter" items.
- Context menus need access to the store's filter state to show correct items (add vs. remove).

**Implementation approach**:
- For author/date cells in `CommitTableRow`: use nested Radix `ContextMenu.Root` elements. Radix supports nested context menus — the innermost matching trigger wins on right-click.
- The outer `CommitContextMenu` still wraps the full row for general commit actions (copy hash, etc.), but author/date cells have their own inner context menus that take priority.

**Alternatives considered**:
- Single context menu with all items: Rejected — would create a very long menu for every right-click. Better UX to show contextual items based on what was clicked.
- Separate component files for author/date context menus: Will evaluate during implementation — if the menus are small (2-3 items each), inline Radix menus within CommitTableRow may be cleaner than separate files.

### R8: Filter Panel Layout and Height Management (FR-020)

**Decision**: Use CSS flexbox layout with `max-height` and `overflow-y: auto` for the filter panel.

**Rationale**:
- The filter panel sits in the `TogglePanel` area (between ControlBar and commit list), same as SearchWidget.
- Panel content: three rows — (1) branch filter badges, (2) author filter with dropdown + badges, (3) date range fields + Reset All button.
- Badges within each row use `flex-wrap: wrap` so they flow to multiple lines naturally.
- `max-height` capped at approximately 3-4 lines of content (~120-160px). When content exceeds this, `overflow-y: auto` enables internal scrolling (FR-020).
- Panel height adjusts dynamically based on content up to the cap.

**Alternatives considered**:
- Fixed height panel: Rejected — wastes space when few filters are active. Dynamic height provides better UX.
- Accordion/collapsible sections: Rejected — adds interaction complexity for minimal benefit. The panel is already compact with 3 rows.

### R9: Author Badge Component Design (FR-017)

**Decision**: Create a shared `AuthorBadge` component used in both the filter panel and the commit details panel.

**Rationale**:
- FR-017 requires visual consistency between filter panel author badges and commit details panel author display.
- Component props: `name: string`, `avatarUrl?: string`, `onRemove?: () => void`. When `onRemove` is provided, an X button is rendered (filter panel variant). When omitted, it's display-only (commit details panel variant).
- Uses the existing `AuthorAvatar` component (already in codebase) for the avatar icon.
- Styled with VS Code theme variables for consistency.

**Alternatives considered**:
- Two separate components: Rejected — violates DRY and FR-017's explicit requirement for a shared component.

### R10: Empty State When Filters Produce Zero Commits (FR-011)

**Decision**: Show an empty state message in the commit list area (both table and classic views) when active filters result in zero matching commits.

**Rationale**:
- Currently, when `mergedCommits.length === 0` and `loading === false`, no special message is shown.
- Add a conditional render in `GraphContainer.tsx` and/or `CommitTable.tsx`: when `mergedCommits.length === 0 && !loading && hasActiveFilters`, display "No commits match the current filters."
- `hasActiveFilters` is a derived check: `filters.branches?.length > 0 || filters.authors?.length > 0 || filters.afterDate || filters.beforeDate`.

**Alternatives considered**:
- Always show empty state (even without filters): Not appropriate — zero commits without filters is a different situation (empty repo) and should have a different message or no message.

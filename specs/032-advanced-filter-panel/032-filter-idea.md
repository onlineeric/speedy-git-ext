# Filter enhancement idea

We already have a filter button now invisible in the control bar, it will show a empty panel under the control bar when clicked.
We need to implement our advanced filter feature in this panel.

## Existing branch filter feature

We already have a branch filter dropdown in the control bar, it is a part of the filter feature.
- On the filter panel, the first info we need to show is the branch filtering data, we need to show the branches badges that are currently selected in the branch filter dropdown. 
- The badges should be same as commit list branch badges, we should reuse the same code to render the badges. Same style if both local and remote branches are selected, we show one combined badge.
- Add a X remove button to the end of the badge to remove the branch from the filter.
- To add branch, user should use the branch filter dropdown on the control bar.

## Advanced filter feature

We need to implement our advanced filter feature in the filter panel.
- The first text field is the above section branch filter data.
- Then we should have 2 major sections in the filter panel, and one reset button to reset all filters in the panel, which exclude the branch filter.

### Filter section 1: Author filter

- We need a filter dropdown same style as the branch filter dropdown, multi-select Author to apply the filter. User can type in author name in the filter text field, and the filter will be applied, user multi-select authors to apply the filter. The first option in the dropdown should be "All Authors" and always show in the dropdown.

- Under the author filter dropdown, we should have a field to show the selected author badges, they should be in the style as the commit details panel Author column, that with an avator icon and the author name. Add X remove button to the end of the badge to remove the author from the filter.

### Filter section 2: Date range filter

- We need a From Date and To Date field, they should be a date time picker and allow to input the date manually. The date field should be clearable.
- If only From Date field is filled, it means to filter commits from that commit date to any commit date after that.
- If only To Date field is filled, it means to filter commits from any commit date before or on that date time.
- If both From Date and To Date fields are filled, it means to filter commits from that commit date to the To Date.
- If both From Date and To Date fields are NOT filled, it means no date range filter is applied.

### The panel design
The panel should has a similar arrangement like this:
```
Branch filtered: [branch badge1] [branch badge2] [branch badge3] ....
--------------------------------
Author filter: [Author filter dropdown]                    [Reset All button]
Author filtered: [author badge1] [author badge2] [author badge3] ....
--------------------------------
Date range filter from [From Date field] to[To Date field]
```
Remarks:
- Branch filtered badges, Author filtered badges are wrapped into multiple lines if width is not enough. The panel height should be auto adjusted to the content height.
- [Reset All button] is right aligned. It reset Authors and Date range filters, but keep the branch filter.
- share the code to make the Author badges with commit details panel Author column. We need to enhance the current style to a badge style, has a border and a background color. Only in filter panel has the X remove button.
- Author filtered badges reuse the same badge as the commit details panel Author column, that with an avator icon and the author name, and adding a X button at the end. Allow to click a X button to remove it from the filter.
- [From Date field] and [To Date field] are date time pickers, it should allow user to input the date time manually on the field, and a button to open the date time picker, the field is clearable and optional, time is optional when date is filled, but cannot only input time. It should have validation for manual input date time.


### Right click menu on commit list

Add the below new menu items to the right click menu on commit list:
- Right click menu on an author
    - show "Add Author to filter" if author is NOT in the author filter
    - show "Remove Author from filter" if author is in the author filter
- Right click menu on a date, show:
    - "Filter from this date": add this date time to the From Date field
    - "Filter to this date": add this date time to the To Date field
- Right click menu on a branch badge, show:
    - "Add branch to filter" if branch is NOT in the branch filter
    - "Remove branch from filter" if branch is in the branch filter
    - If the branch badge is a local branch, add only the local branch to the branch filter
    - If the branch badge is a remote branch, add only the remote branch to the branch filter
    - If the branch badge is a local + remote branch, add both the local and remote branch to the branch filter, which will be 2 selected branches in the branch filter dropdown

---

## Q&A / Design Decisions

### Q1. Author filter type: single string vs array, and server-side vs client-side filtering?

**Decision:** Change `GraphFilters.author?: string` to `authors?: string[]`.

**Server-side vs client-side filtering discussion:**

| | Server-side (`git log --author`) | Client-side (filter loaded commits in JS) |
|---|---|---|
| **Correctness** | Filters across ALL commits in the repo. If an author's commits are deep in history (beyond loaded batch), they still appear. | Only filters the currently loaded batch (e.g., 500 of 10,000). Author with commits only deep in history would show zero results — misleading. |
| **Performance** | Each filter change spawns a new `git log` process + full reload. Git is highly optimized for this — sub-second even on large repos. | Instant toggle with no round-trip. But breaks pagination logic — client can't know if there are more matching commits to load. |
| **Consistency** | Matches existing branch filter pattern (already server-side via `rpcClient.getCommits`). | Introduces a second filtering paradigm, increasing complexity. |
| **Developer complexity** | Minimal — git supports multiple `--author` flags with OR semantics natively. Just push multiple `--author=<value>` args in `GitLogService.getCommits()`. | Needs client-side filter logic, needs to handle interaction with pagination/infinite scroll, needs "load more" to be filter-aware. |

**Conclusion:** Server-side is better for both correctness and developer simplicity. It matches the existing branch filter pattern, git handles multi-author OR natively, and pagination/load-more logic stays clean. The same applies to date range filtering — git provides `--after` and `--before` flags.

### Q2. Author identity: what uniquely identifies an author?

**Decision:** In the dropdown filter, typing text filters both author name and email with OR logic (either match shows the option). Use email as the grouping/dedup key in the dropdown list.

**Git's author model:** In git, author identity is a free-form `Name <email>` pair per commit. Email is NOT a guaranteed unique key — one person may commit with different emails (work vs personal), and theoretically two people could share an email. However, in practice, email is the best available identifier and is what git tooling (e.g., `git shortlog`, `.mailmap`) uses as the primary key.

**Practical approach:**
- The author list API returns deduplicated entries keyed by email (via `git shortlog -sne`).
- The dropdown displays each author as: avatar + name + email.
- The filter text field in the dropdown matches against both name and email (OR).
- When an author is selected, the filter value sent to the backend is the author's name or email (git's `--author` flag does substring matching against the full `Author: Name <email>` line, so either works).
- If `.mailmap` is configured in the repo, git will automatically merge identities — we get this for free.

### Q3. Where does the full author list come from?

**Decision:** New backend API using `git shortlog -sne --all` to get the complete, deduplicated author list.

This returns output like:
```
   142  Alice Smith <alice@example.com>
    37  Bob Jones <bob@work.com>
```
- Covers all commits across all branches, not just the loaded batch.
- Respects `.mailmap` for identity consolidation.
- Requires a new message type (e.g., `getAuthors` request / `authorsResult` response).
- The list can be fetched once on initial load and refreshed on fetch/refresh operations.

### Q4. Right-click context menu on author/date cells — architecture

**Current architecture:**
- `CommitContextMenu` wraps the **entire row** (`CommitTableRow.tsx:148-151`). Right-clicking anywhere on the row opens this menu.
- `BranchContextMenu` wraps **individual ref badges** inside the message column (`CommitTableRow.tsx:238`). It calls `e.stopPropagation()` on its wrapper to prevent the row-level `CommitContextMenu` from also triggering.
- Each column cell is a `<div>` rendered by the `renderColumn()` function.

**Options considered:**

**Option A — Per-cell context menu components (recommended):**
Create `AuthorContextMenu` and `DateContextMenu` components. Wrap the author cell content in `AuthorContextMenu` and the date cell content in `DateContextMenu`, with `onContextMenu={e => e.stopPropagation()}` on their wrappers — identical to how `BranchContextMenu` already works.
- Pros: Follows the existing `BranchContextMenu` pattern exactly. Minimal refactor. Each menu is a small, focused component. `CommitContextMenu` (the row-level menu) continues to work for all other cells (graph, hash, message text).
- Cons: Two new small components to create. Adds a Radix context menu root per author/date cell per row — but this is exactly what `BranchContextMenu` already does per ref badge, so it's a proven pattern.

**Option B — Single context menu with cell detection:**
Modify `CommitContextMenu` to detect which cell was right-clicked (via `event.target` inspection or data attributes) and conditionally show different menu items.
- Pros: Single component, no new context menu roots.
- Cons: Mixes multiple concerns into one large component (`CommitContextMenu` is already 443 lines). Fragile DOM inspection. Harder to maintain.

**Option C — Row-level refactor with cell awareness:**
Pass clicked cell ID as state to `CommitContextMenu`, render different sections based on it.
- Pros: Centralized menu.
- Cons: Requires significant refactor of how the context menu is triggered. Breaks current separation of concerns.

**Decision: Option A.** It follows the proven `BranchContextMenu` pattern. The `AuthorContextMenu` receives `{ author, authorEmail }` and shows "Add/Remove Author to/from filter". The `DateContextMenu` receives `{ authorDate }` and shows "Filter from this date" / "Filter to this date". Both are small components (~30–50 lines each).

### Q5. Date picker component options

**Options evaluated for VS Code webview (Chromium-based):**

| Option | Dependency size | Calendar popup | VS Code theme compat | Time support | Keyboard input |
|---|---|---|---|---|---|
| **A. `<input type="date">` + optional `<input type="time">`** | 0 KB (native) | Built-in Chromium calendar | Partial — can style with CSS vars but limited | Separate field | Yes |
| **B. `<input type="datetime-local">`** | 0 KB (native) | Built-in Chromium date+time picker | Partial — same limitations | Integrated | Yes |
| **C. `react-datepicker`** | ~50 KB, 22K stars, 8M weekly downloads | Yes, fully custom | Full control via CSS | Configurable | Yes |
| **D. `@mantine/dates`** | Heavy (pulls `@mantine/core`) | Yes | Full control | Yes | Yes |
| **E. Custom text input with validation** | 0 KB | No popup calendar | Perfect match | Via format | Yes |

**Discussion:**
- Options A/B are zero-dependency and work well in Chromium webviews. The built-in calendar popup satisfies the "button to open date picker" requirement. Styling is limited but acceptable — we can use CSS custom properties and the `color-scheme` CSS property to get a dark-mode calendar that reasonably matches VS Code. The main limitation is the calendar UI is browser-controlled and can't be fully themed.
- Option C (`react-datepicker`) is the most popular React date picker. Fully customizable styling, good keyboard support, supports optional time. But adds a dependency.
- Option D is overkill for our needs.
- Option E provides perfect theme matching but no calendar popup.

**Recommendation:** Start with **Option A** (`<input type="date">` + optional `<input type="time">`). Zero dependencies, built-in validation, built-in calendar popup in Chromium. If the styling limitations become a problem during implementation, upgrade to **Option C** (`react-datepicker`). This follows the project's preference for lightweight solutions and avoiding unnecessary dependencies.

### Q6. Date precision for right-click "Filter from/to this date"

**Decision:**
- **"Filter from this date"**: Sets the From Date to the **date portion only** (time = 00:00:00). This means "show commits from the start of this day onward."
- **"Filter to this date"**: Sets the To Date to the **date portion only**. The backend filter uses `< toDate + 1 day at 00:00` to include all commits on that day.
- When time is not specified in the date fields, From defaults to start-of-day (00:00) and To defaults to end-of-day (effectively `< next day 00:00`).
- When time IS specified, use the exact time.

### Q7. Author badge component — shared between filter panel and details panel

**Decision:** The scope includes modifying the Author column in `CommitDetailsPanel` so both places share the same component.

**Implementation approach:**
- Create an `AuthorBadge` component that wraps `AuthorAvatar` + author name into a styled badge (border + background color or transparent).
- Props: `author`, `email`, `showRemoveButton?: boolean`, `onRemove?: () => void`.
- **Filter panel**: renders `AuthorBadge` with `showRemoveButton={true}` and `onRemove` callback.
- **CommitDetailsPanel**: renders `AuthorBadge` with `showRemoveButton={false}` (or omitted), replacing the current plain text `Author: name <email>`.
- The existing `AuthorAvatar` component remains unchanged — `AuthorBadge` composes it.

### Q8. Classic (non-table) commit list mode

**Decision:** No additional effort on classic view. Classic view is going to be deprecated and removed soon. If any shared component naturally applies to classic view, no need to specially disable or remove it — just leave it as-is. No feature implementation specifically for classic view.

### Q9. Filter interaction logic — AND or OR between filter types?

**Decision:** All filters are AND-ed. When branch + author + date filters are all active, show only commits that match ALL active filters. Git does this naturally when combining `--author`, `--after`/`--before`, and branch revision args in a single `git log` call.

### Q10. Debouncing date input changes

**Decision:** Debounce date field changes at **150ms** before triggering a server-side reload.

**Why debouncing is needed:** Native `<input type="date">` only fires `change` on valid date completion, so individual keystrokes aren't an issue. However, rapid sequential changes still cause unnecessary reloads:
- User fills date (reload), then immediately fills time (another reload).
- User clears a date (reload with no filter), then types a new date (another reload).

A 150ms debounce coalesces these rapid changes into a single reload — fast enough that users perceive instant response, but avoids wasted git process spawns. The author dropdown does NOT need debouncing since it's discrete selection (same as the branch dropdown).

### Q11. Filter icon color when any filter is active

**Decision:** The filter icon in the control bar should reflect the combined state of ALL filters:
- **Filtered color (yellow):** Any filter is active — branch filter has selections (not "All Branches"), OR author filter has selections, OR date range has any value filled.
- **Active color (sky blue):** Filter panel is open (toggle widget is 'filter'), regardless of filter state.
- **Inactive color:** No filters applied at all AND panel is not open.

This updates the current logic in `ControlBar.tsx:103-109` which only checks branch filters.

### Q12. Unhide the filter button

**Decision:** Remove `style={{ display: 'none' }}` from the filter button in `ControlBar.tsx:130` as part of this feature implementation. The existing TODO comment (`// TODO: remove this once the filter button is wired to the toggle panel`) confirms this was always the plan.

### Q13. Extract generic MultiSelectDropdown component

**Decision:** Extract a reusable `MultiSelectDropdown<T>` from the existing `MultiBranchDropdown` (~400 lines). Both the branch dropdown and the new author dropdown will use it.

**Approach:**
- The generic component handles: search/filter text input, multi-select with checkboxes, "All" option, keyboard navigation, Radix Popover, highlighted index management.
- Generic type `T` for items, with props for: `items: T[]`, `selectedItems`, `onToggle`, `onClearAll`, `getLabel(item: T): string`, `getKey(item: T): string`, `matchesFilter(item: T, query: string): boolean`, `renderItem?(item: T): ReactNode` (optional custom rendering).
- `MultiBranchDropdown` becomes a thin wrapper that passes branch-specific grouping (local/remote headers) and rendering.
- `AuthorDropdown` becomes a thin wrapper that passes author-specific rendering (avatar + name + email) and filter logic (match name OR email).

This follows DRY and keeps both dropdowns consistent in behavior and appearance.

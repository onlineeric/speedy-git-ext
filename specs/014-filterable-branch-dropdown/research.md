# Research: Filterable Branch Dropdown

**Feature**: 014-filterable-branch-dropdown | **Date**: 2026-03-17

## Research Tasks & Findings

### 1. Custom Dropdown Approach: Radix Popover vs. Radix Select vs. Custom

**Decision**: Use `@radix-ui/react-popover` as the dropdown container.

**Rationale**:
- Already installed and used in the project (`OverflowRefsBadge.tsx`).
- Provides portal rendering, click-outside dismissal, positioning (side/align/offset), and focus management out of the box.
- Radix Popover allows fully custom content (text input + list), unlike Radix Select which enforces its own item model and doesn't support an embedded search input natively.
- No new dependency needed.

**Alternatives considered**:
- `@radix-ui/react-select`: Purpose-built for select dropdowns but does not support a text input within its content. Would require workarounds or hacks. Not installed.
- `@radix-ui/react-combobox`: Does not exist in Radix UI (no official combobox primitive).
- `cmdk` (command menu library): Popular for command-palette UIs but adds a new dependency and is overkill for a simple branch filter. Not aligned with "no new packages" constraint.
- Plain `<div>` with manual positioning: Would require reimplementing click-outside detection, portal rendering, and positioning — work already handled by Popover.

### 2. Keyboard Navigation Pattern: WAI-ARIA Combobox

**Decision**: Implement the WAI-ARIA combobox pattern with manual focus management.

**Rationale**:
- The combobox pattern (input + listbox) is the standard accessible pattern for filterable dropdowns.
- Key ARIA attributes: `role="combobox"` on the input, `role="listbox"` on the list, `role="option"` on items, `aria-activedescendant` to track highlighted item.
- Focus stays on the input conceptually; the list uses `aria-activedescendant` rather than moving DOM focus to list items. This naturally supports the "type to redirect" combobox pattern from the clarification.
- Tab from input: moves `aria-activedescendant` to first item and switches keyboard handler to arrow-key mode.
- Typing while in arrow-key mode: redirects back to the input (appending the character).

**Alternatives considered**:
- Moving DOM focus to list items with `tabIndex`: More complex, requires managing focus between input and list items. Breaks the combobox pattern where the input retains focus.
- Using Radix's built-in roving focus: Not applicable here since we need a single focused input with a virtual active descendant.

### 3. Filtering Strategy: Client-Side Substring Match

**Decision**: Case-insensitive substring matching on the full display name, performed synchronously in the component.

**Rationale**:
- Branches are already loaded in the Zustand store (typically < 500 items). Filtering is O(n) string comparison — negligible cost.
- No debouncing needed since there are no network calls during filtering. The RPC call (`rpcClient.getCommits`) happens only when a branch is *selected*.
- Substring matching (not starts-with) is more forgiving for users who don't remember the exact prefix.
- For remote branches, match against the full `remote/name` display string.

**Alternatives considered**:
- Fuzzy matching (e.g., fzf-style): More powerful but harder to predict. Users expect exact substring matching in developer tools. Would add complexity without clear benefit for branch names.
- Regex matching: Overly powerful and error-prone for this use case.
- Debounced filtering: Unnecessary since filtering is synchronous and sub-millisecond.

### 4. Scroll Behavior with Keyboard Navigation

**Decision**: Auto-scroll the highlighted item into view using `scrollIntoView({ block: 'nearest' })`.

**Rationale**:
- When the user arrow-keys through a long list, the highlighted item must remain visible.
- `scrollIntoView({ block: 'nearest' })` scrolls only the minimum amount needed — no jarring jumps.
- This is the standard behavior in VS Code's own quick-open and command palette.

**Alternatives considered**:
- Virtual scrolling (`@tanstack/react-virtual`): Overkill for branch lists (typically < 500 items). Constitution reserves virtual scrolling for commit lists (thousands of rows). Simple CSS overflow + scrollIntoView is sufficient.
- Manual scroll position calculation: Unnecessary when `scrollIntoView` handles it natively.

### 5. Component State Design

**Decision**: Use local React state for dropdown-specific UI state; connect to Zustand store only for branch data and filter selection.

**Rationale**:
- **Local state** (within `FilterableBranchDropdown`): `filterText` (string), `highlightedIndex` (number), `isListNavigationMode` (boolean to track Tab-into-list state).
- **Zustand store** (existing, no changes): `branches` (data source), `filters.branch` (selected value), `setFilters` (selection handler).
- The filter text and highlight index are transient UI state that resets when the dropdown closes. No reason to persist in the global store.
- Popover open/close state is managed by Radix Popover's controlled `open` prop.

**Alternatives considered**:
- Storing filter text in Zustand: Would pollute global state with transient UI concerns. No other component needs this value.
- Using `useRef` for highlight index: Would prevent re-renders when highlight changes. Need re-renders to update visual highlight.

### 6. "All Branches" Option Handling

**Decision**: "All Branches" is a permanent first item in the list, always visible regardless of filter text.

**Rationale**:
- Users must always be able to reset the branch filter. Hiding "All Branches" when filter text is present would trap users who filtered and then want to clear.
- This matches the current behavior where "All Branches" is the default `<option value="">`.
- The "All Branches" item maps to `undefined` for the branch filter value, same as today.

**Alternatives considered**:
- Filtering "All Branches" like any other item: Could hide the reset option when user types text that doesn't match "all branches". Bad UX.
- Adding a separate "Clear" button: Adds UI complexity; unnecessary when "All Branches" serves this purpose.

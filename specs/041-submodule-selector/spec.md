# Feature Specification: Replace Submodule Mode with Submodule Selector

**Feature Branch**: `041-submodule-selector`
**Created**: 2026-04-28
**Status**: Draft
**Input**: User description: "read @specs/submodule-enh.md , it is the idea spec." (extended 2026-04-28 with: filterable combo-box style for repo and submodule selectors, optional consolidation into a reusable combo box, and an explicit left-to-right reset/refresh chain across the top-menu controls)

## Clarifications

### Session 2026-04-28

- Q: Should the submodule selector remember its selection across panel reload / VS Code restart? → A: Always start at the parent option on every panel load (no persistence); the submodule selector resets to the parent option on panel reload, VS Code restart, and any repo selector change.
- Q: Which submodules of a parent should appear in the submodule selector? → A: Only initialized submodules (those with a working `.git` and reachable on disk). Submodules declared in `.gitmodules` but not yet initialized are omitted from the selector.
- Q: In what order should submodule options appear in the submodule selector? → A: Alphabetical by submodule name, case-insensitive. The parent option always remains first; only the submodule options after it are sorted.
- Note (scope extension, 2026-04-28): The feature scope is extended to also (a) make the repo selector and the new submodule selector both filterable combo boxes matching the existing branches filter combo-box style, (b) prefer a single reusable combo-box component shared across all three selectors (consolidating duplication if any exists), and (c) make the top-menu reset/refresh chain explicit and consistent left-to-right across repo selector → submodule selector → filter/search group. The internal reset/refresh logic of the filter/search group itself is out of scope and is treated as a black box.
- Q: How strict is the "shared/reusable filterable combo box" requirement (FR-020 / SC-012)? → A: **Soft preference** (Option B). Prefer a single shared component, but allow multiple parallel implementations as long as net combo-box duplication does not increase. Visual and behavioral parity across the three selectors remains a hard requirement.
- Q: What keyboard and focus behavior must the filterable combo box have? → A: Match the existing branches filter combo box exactly. Whatever keyboard navigation, focus-on-open, Enter/Esc handling, and arrow-key behavior that combo box has today is the contract for all three filterable selectors (repo, submodule, branches filter). No new keyboard behavior is introduced by this feature, and the existing branches filter is not required to be upgraded.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View a parent repo's submodule via a dedicated selector (Priority: P1)

A user opens a parent repo that has submodules. Instead of seeing a row of submodule headers above the graph, they see the existing repo selector and a new submodule selector next to it. The submodule selector defaults to the parent option. When they pick a submodule from the submodule selector, the graph view switches to that submodule and shows the same data and controls as if the submodule had been opened directly. When they pick the parent option, the graph returns to the parent repo.

**Why this priority**: This is the core replacement for the current submodule headers. Without it, users have no way to navigate from a parent repo to its submodules in the new design. It is the smallest slice that delivers the entire core value of the redesign.

**Independent Test**: Open a parent repo that has submodules. Confirm the header row above the graph is gone, the submodule selector appears next to the repo selector, and switching between the parent option and a submodule option in the submodule selector switches the graph view accordingly.

**Acceptance Scenarios**:

1. **Given** the user has selected a parent repo with submodules in the repo selector, **When** the page loads, **Then** the submodule selector is visible next to the repo selector with the parent option selected by default and the parent's graph is shown.
2. **Given** a parent repo is selected and the submodule selector shows the parent option, **When** the user picks a submodule from the submodule selector, **Then** the graph switches to that submodule's commits and the repo selector remains on the parent.
3. **Given** a submodule is currently displayed via the submodule selector, **When** the user picks the parent option in the submodule selector, **Then** the graph returns to the parent repo's commits.
4. **Given** the user has selected a repo that has no submodules, **When** the page loads, **Then** the submodule selector is not visible and only the repo selector is shown.

---

### User Story 2 - Switch directly between submodules without going back to the parent first (Priority: P2)

A user is viewing a submodule of a parent repo and wants to view a different submodule of the same parent. They pick the other submodule from the submodule selector and the graph switches directly to it. They do not have to first return to the parent.

**Why this priority**: Removes a long-standing friction point in the current submodule mode (the "Back to parent" detour). It is dependent on Story 1 being in place but adds clear, day-to-day value once it is.

**Independent Test**: With a parent repo that has at least two submodules, switch from one submodule to another using only the submodule selector and confirm the graph updates with no intermediate parent view and no "Back to parent" button is needed or shown anywhere.

**Acceptance Scenarios**:

1. **Given** submodule A is currently displayed via the submodule selector, **When** the user picks submodule B from the submodule selector, **Then** the graph switches directly from A to B without first showing the parent.
2. **Given** any submodule view is active, **When** the user looks at the UI, **Then** there is no "Back to parent" button and no submodule header row anywhere on screen.

---

### User Story 3 - Repo selector and submodule selector behave consistently with shared and auto-discovered submodules (Priority: P3)

A workspace contains two parent repos (`parent1` and `parent2`) that both connect to a shared submodule (`sub1`), and `parent1` additionally connects to `sub2`. Both submodules are also auto-discovered as standalone sub-repos in the repo selector. The user can reach `sub1` either via `parent1`'s submodule selector, via `parent2`'s submodule selector, or directly via the repo selector. All three paths produce the same graph view, the same controls, and the same git operation behavior. Switching the repo selector at any time resets the submodule selector to the parent option of the new selection.

**Why this priority**: Solidifies the consistency guarantees of the new design (one repo => one view, regardless of how it was reached) and removes the duplication / confusion caused by specially-added submodule entries in the repo selector. Important for correctness but not blocking for a basic working selector.

**Independent Test**: Set up two parent repos that share a submodule. Verify that selecting the shared submodule via either parent's submodule selector or directly via the repo selector all produce identical graph views, that the duplicated specially-added submodule entries no longer appear in the repo selector, and that switching the repo selector resets the submodule selector.

**Acceptance Scenarios**:

1. **Given** two parent repos `parent1` and `parent2` share submodule `sub1`, **When** the user selects `sub1` via `parent1`'s submodule selector, then via `parent2`'s submodule selector, then directly via the repo selector's auto-discovered entry, **Then** all three paths show the same commits, the same controls, and behave the same way.
2. **Given** the user is viewing `sub2` via `parent1`'s submodule selector, **When** the user changes the repo selector to `parent2`, **Then** the submodule selector resets to `parent2 (parent)` and the graph shows `parent2`. The previously-selected `sub2` is not carried over.
3. **Given** the repo selector previously listed both auto-discovered sub-repo entries and specially-added submodule entries, **When** the new design is in place, **Then** only the auto-discovered sub-repo entries remain and the specially-added duplicate entries are gone.
4. **Given** any submodule is currently displayed (reached via submodule selector or directly via repo selector), **When** the user invokes any git control (filter, search, refresh, fetch, pull, push, checkout, cherry-pick, rebase, reset, tag, stash, etc.), **Then** the operation targets only the currently displayed submodule's repo.

---

### User Story 4 - Filterable combo-box style for repo and submodule selectors (Priority: P3)

A user with many repos in their workspace, or a parent with many initialized submodules, opens the repo selector or the submodule selector and sees a text-filter input at the top of the dropdown. As they type, the list narrows to entries whose label matches the typed text. Picking an entry closes the dropdown and switches the view. The interaction matches the existing branches filter combo box, so users have one consistent way to filter list-style selectors anywhere in the top menu.

**Why this priority**: Long lists are hard to scan. Without a typeahead filter, large workspaces and many-submodule parents force the user to scroll. Reuses the existing pattern for consistency. Functionally independent of Stories 1–3: if Stories 1–2 are in place but this is not, the feature still works — it's just less ergonomic at scale.

**Independent Test**: With at least 10 repos in the workspace (or 10 initialized submodules under a parent), open the relevant selector, type a partial substring of an entry's label, confirm the list narrows to matching entries, pick one, and confirm the view switches.

**Acceptance Scenarios**:

1. **Given** the repo selector dropdown is open with multiple entries, **When** the user types text in the filter input at the top, **Then** only entries whose visible label contains the typed text (case-insensitive substring match) remain in the list.
2. **Given** the submodule selector dropdown is open with multiple options (parent option plus initialized submodules), **When** the user types text in the filter input at the top, **Then** only options whose visible label contains the typed text remain in the list (the parent option is matched against its `<parent name> (parent)` label and may or may not remain depending on the typed text).
3. **Given** all three filterable selectors (repo selector, submodule selector, branches filter combo box) are inspected, **When** a user opens each in turn, **Then** they share the same dropdown layout (text filter input at the top of the option list), the same filter behavior (case-insensitive substring matching against the visible label), and the same general look and feel.
4. **Given** the user typed text in a filterable selector and then closes the dropdown without selecting, **When** the user reopens the dropdown later, **Then** the filter input is empty and the list shows the full unfiltered set of options. The current selection is unchanged.
5. **Given** the typed filter text matches no entries, **When** the user looks at the dropdown, **Then** the option list is empty (no entries shown). Clearing the filter input restores the full list.

---

### User Story 5 - Top-menu reset/refresh chain works left-to-right (Priority: P3)

The top menu has a left-to-right priority order: repo selector, submodule selector (new), then the filter/search group (branches filter combo box, filter toggle button + filter panel, search toggle button + search panel). When a higher-priority control changes, all lower-priority controls reset their content. When the repo selector changes, the submodule selector resets to the parent option (or hides) AND the filter/search group resets its content. When the submodule selector changes, only the filter/search group resets. The toggle (open/closed) state of the filter and search panels is preserved across these resets — only the content inside them is cleared, never the user's choice of whether the panel is shown.

**Why this priority**: A change in a higher-level scope (the displayed repo, or the displayed submodule of a parent) implicitly invalidates lower-scope state (active filters/searches), so the user is presented with a clean slate for the new context. Preserving the toggle state respects the user's panel-layout preference. This solidifies a consistent mental model across all top-menu controls. Independent of Story 4 (filterable combo box) and complementary to Story 3 (which only covered the submodule selector reset).

**Independent Test**: Open the filter panel via its toggle button and set a filter. Switch the repo selector to a different repo. Confirm: filter contents are cleared, filter panel is still visibly open. Now switch the submodule selector to a different option. Confirm: filter contents are cleared again, filter panel is still visibly open. Repeat with the search panel.

**Acceptance Scenarios**:

1. **Given** the repo selector is on parent A and the filter/search group has active filter and/or search content, **When** the user changes the repo selector to repo B, **Then** the submodule selector resets to its default (the parent option of B, or it becomes hidden if B has no submodules) AND the filter/search group's content is reset (branches filter cleared, filter panel content cleared, search panel content cleared).
2. **Given** a submodule of parent A is currently displayed via the submodule selector and the filter/search group has active filter and/or search content, **When** the user changes the submodule selector to a different option (the parent option, or a different submodule of the same parent), **Then** the filter/search group's content is reset and the repo selector remains on parent A.
3. **Given** the filter panel toggle is currently expanded (or the search panel toggle is expanded), **When** any reset is triggered by a left-side control change (repo selector or submodule selector), **Then** the panel's contents are reset BUT its open/closed toggle state remains exactly as it was before the change.
4. **Given** the filter/search group's individual controls (branches filter combo box, filter panel internals, search panel internals) have their own internal reset/refresh logic, **When** this feature is implemented, **Then** that internal logic is NOT modified or replaced; the only change is that left-side control changes invoke the existing reset entry point on the group.

---

### Edge Cases

- **Repo with zero submodules**: The submodule selector is hidden entirely; only the repo selector is shown.
- **Parent with declared but uninitialized submodules**: Uninitialized submodules (declared in `.gitmodules` but missing a working `.git` / not reachable on disk) are omitted from the submodule selector. If a parent has only uninitialized submodules, the submodule selector is hidden as if the parent had none. Initializing such a submodule (e.g. via `git submodule update --init`) and refreshing causes it to appear in the selector on the next render.
- **Parent with many submodules**: The submodule selector remains a single compact control regardless of how many submodules the parent has, so no vertical space is consumed by submodule navigation.
- **Multiple parents sharing submodules**: Each parent's submodule selector lists only that parent's direct submodules. Switching parents resets the submodule selector to the new parent option; no submodule selection is remembered across repo selector changes.
- **Nested submodules (depth > 1)**: The submodule selector covers only one level of nesting at a time. To view a sub-submodule, the user selects the intermediate repo from the repo selector (relying on auto-discovery to surface it) and then uses that intermediate repo's submodule selector.
- **Auto-scan depth too shallow to discover a nested submodule**: That nested submodule is unreachable through this UI; the user is expected to increase their scan depth setting. This is accepted and out of scope.
- **Repo selector list previously contained both an auto-discovered entry and a specially-added entry for the same submodule**: After this change, only the auto-discovered entry remains. Selecting it produces the same view as selecting that submodule via the parent's submodule selector.
- **Display bug ("test-repo / Current" title)**: Implicitly resolved because the header row that produced the misleading title is removed entirely.
- **Filter input with no matching entries**: The dropdown shows an empty list (no options). Clearing the filter input restores the full list. The current selection on the underlying selector is unchanged.
- **Dropdown closed without selecting after typing**: The selection is unchanged. On the next open, the filter input is empty and the full list is shown (filter input is not persisted across open/close cycles).
- **Reset triggered while a panel is open**: The filter/search panel content is cleared but the panel remains visibly open. The user retains their layout choice (open/closed) without re-clicking the toggle button.
- **Filter input matches the parent option of the submodule selector**: The parent option behaves like any other option for matching purposes (matched against its full visible label, e.g. `parent1 (parent)`). It is not pinned visible during filtering.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST remove the submodule header row currently shown above the graph for parent repos with submodules.
- **FR-002**: System MUST remove the "Back to parent" button from the UI.
- **FR-003**: System MUST remove the legacy `<repo> / Current` title formatting that accompanied the header row.
- **FR-004**: System MUST display a submodule selector control next to the existing repo selector whenever the currently selected repo is a parent that has at least one submodule.
- **FR-005**: System MUST hide the submodule selector when the currently selected repo has no submodules.
- **FR-006**: The submodule selector MUST list, in this order: (a) a first option labeled with the parent repo's name followed by `(parent)`, then (b) one option per direct **initialized** submodule, labeled with the submodule's name, **sorted alphabetically by submodule name (case-insensitive)**. Submodules declared in `.gitmodules` but not initialized (no working `.git`, not reachable on disk) MUST be omitted from the selector. The selector becomes hidden (per FR-005) when the parent has zero initialized submodules even if `.gitmodules` declares some.
- **FR-007**: When a parent repo is selected in the repo selector, the submodule selector MUST default to the parent option. The system MUST NOT auto-select a submodule.
- **FR-008**: Any change in the repo selector MUST reset the submodule selector to the parent option of the newly selected repo (or hide the submodule selector if the new repo has no submodules). The previously-selected submodule MUST NOT be remembered across repo selector changes.
- **FR-008a**: The submodule selector MUST also default to the parent option on panel reload and on VS Code restart. The previously-selected submodule MUST NOT be persisted across panel reloads or VS Code restarts; no per-repo "last submodule" memory is kept.
- **FR-009**: Selecting a submodule from the submodule selector MUST switch the graph view to that submodule's commits while leaving the repo selector on the parent.
- **FR-010**: Selecting the parent option from the submodule selector MUST return the graph view to the parent repo's commits.
- **FR-011**: System MUST remove the specially-added submodule entries (those injected by the extension's submodule logic, e.g. `<parent>-submodules/<submodule>`) from the repo selector list.
- **FR-012**: System MUST keep auto-discovered sub-repo entries (those surfaced by the workspace's repository scan setting) in the repo selector list unchanged in scope and labeling.
- **FR-013**: A submodule reached via a parent's submodule selector and the same submodule reached directly via an auto-discovered sub-repo entry in the repo selector MUST produce the same graph view: same commits, same controls, same UI affordances, no special header, no "Back to parent" button, no submodule mode.
- **FR-014**: When any submodule view is active (via either entry path), all UI controls MUST operate on the currently displayed submodule's repo only. This MUST include at minimum: filter, search, refresh, fetch, pull, push, and the right-click / context menu operations checkout, push, cherry-pick, rebase, reset, tag, and stash, as well as their dialogs and command previews.
- **FR-015**: The submodule selector MUST handle exactly one level of submodule nesting (a parent and its direct submodules). Deeper nesting MUST be reached by selecting an intermediate repo from the repo selector first, after which that intermediate repo's submodule selector lists its own direct submodules.
- **FR-016**: System MUST NOT introduce a new "submodule mode" or any modal state at the UI or operation level. The currently displayed repo is the sole target for all git operations.
- **FR-017**: When the user has selected a parent repo and a submodule via the submodule selector, the repo selector MUST visibly remain on the parent (not jump to the submodule).
- **FR-018**: The repo selector MUST be a filterable combo box: opening it MUST present a dropdown with a text filter input at the top of the option list. Typing in that input MUST narrow the visible options to those whose label contains the typed text (case-insensitive substring match). The current selection MUST NOT change just because the user types in the filter.
- **FR-019**: The submodule selector MUST be a filterable combo box with the same filter UX as the repo selector (FR-018). The parent option is included in the filterable set; it is matched against its full visible label (e.g. `parent1 (parent)`).
- **FR-020**: The repo selector, the submodule selector, and the existing branches filter combo box MUST share the same filter behavior and the same dropdown style (text filter input at the top, identical match semantics, identical empty-state, identical keyboard and focus behavior). The keyboard and focus contract is defined by reference: it MUST match whatever the existing branches filter combo box does today. No new keyboard behavior is added by this feature, and the existing branches filter combo box is NOT required to be upgraded as part of this feature. Implementations SHOULD consolidate this into a single reusable combo-box building block; if multiple parallel implementations of a filterable combo box already exist, this feature MUST NOT increase that duplication and SHOULD reduce it where practical without breaking unrelated functionality.
- **FR-021**: The text typed into a filterable combo-box's filter input MUST be cleared whenever the dropdown closes. Reopening the dropdown MUST present an empty filter input and the full unfiltered option list. The combo-box's currently selected value MUST be unaffected by closing/reopening.
- **FR-022**: When the repo selector value changes, the system MUST: (a) reset the submodule selector to the parent option of the new repo or hide it (per FR-008), AND (b) reset the content of the entire filter/search group (branches filter selection, filter panel internal state, search panel internal state) using each control's existing reset entry point.
- **FR-023**: When the submodule selector value changes (parent option ↔ submodule, or submodule ↔ submodule of the same parent), the system MUST reset the content of the filter/search group only. The repo selector MUST remain on the same parent.
- **FR-024**: Resets triggered by FR-022 or FR-023 MUST NOT change the open/closed toggle state of the filter panel button or the search panel button. Only the panel content is reset; whether the panel is shown is preserved exactly as it was before the reset.
- **FR-025**: This feature MUST NOT modify the existing internal reset/refresh logic of the filter/search group's individual controls (branches filter combo box, filter panel, search panel). The only change is that left-side control changes invoke the existing reset entry point on each of those controls; their internal behavior on reset stays as-is.

### Key Entities

- **Parent repo**: A repository in the workspace that declares one or more git submodules. Acts as the top-level selection in the repo selector and the anchor for a submodule selector.
- **Submodule**: A git submodule of a parent repo, addressable as its own repository for graph viewing and git operations. May also appear separately in the repo selector as an auto-discovered sub-repo when the workspace scan depth permits.
- **Repo selector**: The existing top-level control that lists workspace repos and auto-discovered sub-repos. Unchanged in scope by this feature except for the removal of specially-added submodule entries.
- **Submodule selector**: The new control placed next to the repo selector. Conditional on the selected repo being a parent with submodules. Lists the parent option followed by its direct submodules. Resets on any repo selector change.
- **Graph view**: The commit graph and its surrounding controls for the currently displayed repo. Identical regardless of whether the displayed repo was reached via the repo selector or via a parent's submodule selector.
- **Filterable combo box**: A list-style selector control whose dropdown includes a text-filter input at the top. Typing narrows the option list by case-insensitive substring match against each option's visible label. Used by the repo selector, the submodule selector, and the existing branches filter. Behavior and style are shared across all three.
- **Filter/search group**: The right portion of the top menu, comprising the branches filter combo box, the filter toggle button + filter panel, and the search toggle button + search panel. Treated as a unit by the reset chain: a left-side control change resets the group's content (via each control's existing reset entry point) but never changes the open/closed toggle state of its panels.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After this change, no parent repo with submodules shows any submodule header row above its graph, and no "Back to parent" button appears anywhere in the UI (verified by inspection across all repos that previously triggered submodule mode).
- **SC-002**: For any parent repo with submodules, a user can switch from the parent view to any of its submodules in a single interaction with the submodule selector (one click / one selection), with no intermediate navigation step required.
- **SC-003**: For any parent repo with at least two submodules, a user can switch directly from one submodule to another in a single interaction with the submodule selector, without first returning to the parent.
- **SC-004**: For any submodule that is reachable both via a parent's submodule selector and as an auto-discovered sub-repo in the repo selector, the resulting graph view is functionally identical between the two entry paths (same commits listed, same set of controls available, same operation targets) — verified by spot-checking at least one shared submodule across both paths.
- **SC-005**: The repo selector no longer contains any specially-added submodule duplicate entries; for every submodule of every parent in the workspace, the repo selector contains at most one entry for it (the auto-discovered sub-repo entry, when scan depth allows).
- **SC-006**: Changing the repo selector while a submodule is being viewed results in the submodule selector showing the parent option (or being hidden) on the very next render — no stale submodule selection persists across repo selector changes.
- **SC-007**: All git operations triggered while a submodule is displayed (via either entry path) target only the displayed submodule's repository — verified by spot-checking representative operations such as fetch, pull, push, checkout, rebase, and stash, none of which act on the parent repo while a submodule is the displayed repo.
- **SC-008**: All three filterable selectors (repo selector, submodule selector, branches filter combo box) present the same dropdown layout (text-filter input at top of the option list) and the same filter behavior — verified by direct interaction across the three selectors and confirming that typing the same substring narrows each list using identical match semantics.
- **SC-009**: After changing the repo selector while filter and/or search content is set, on the very next render the filter/search group's content is empty (branches filter cleared, filter panel content cleared, search panel content cleared). The open/closed toggle state of the filter and search panels is preserved exactly as before the change (verified for both panels in both states).
- **SC-010**: After changing the submodule selector while filter and/or search content is set, on the very next render the filter/search group's content is empty. The repo selector value does not change. The open/closed toggle state of the filter and search panels is preserved exactly as before the change.
- **SC-011**: For workspaces with at least 10 repos, or parents with at least 10 initialized submodules, a user can locate and select a target entry by typing a partial substring of its label without scrolling — verified by setting up a fixture with ≥10 entries and confirming a typeahead workflow works for the relevant selector.
- **SC-012**: The codebase contains at most one shared implementation of the filterable combo-box behavior used by these three selectors, OR the count of distinct combo-box implementations is no greater after this feature than it was before — verified by inspecting the components used by the repo selector, submodule selector, and branches filter and confirming a single shared building block (or no net increase in duplication).

## Assumptions

- The repo selector's auto-discovery of sub-repos (driven by VS Code's `Git: Repository Scan Max Depth` setting) is preserved as-is and is the sole mechanism for surfacing submodules as standalone repo entries after this change.
- One level of submodule nesting in the submodule selector is sufficient for the supported workflow; deeper nesting is reached by re-selecting the intermediate repo in the repo selector and is acceptable to leave to the user.
- If a nested submodule falls outside the user's configured scan depth, it is acceptable for that submodule to be unreachable through this UI; users who need deeper access are expected to adjust the scan depth setting.
- The currently displayed repo is the single source of truth for all git operations; there is no need to preserve any "operate on parent" affordance once the header row and "Back to parent" button are removed.
- The submodule selector is a single compact control (label format: `<parent name> (parent)` for the parent option, submodule name for each submodule option). With FR-018/FR-019 it is also a filterable combo box matching the repo selector and the existing branches filter combo box, even though the option count for any one parent is typically small — uniformity across selectors is preferred over per-control optimization.
- A reusable, shared filterable combo-box building block is the desired implementation approach for the three filterable selectors. If the codebase already provides one (e.g. the building block currently used by the branches filter), it should be reused or generalized; if multiple parallel implementations exist, this feature is the appropriate place to consolidate them. Net combo-box duplication must not increase as a result of this feature.
- The "match" semantics for the combo-box filter follow the existing branches filter pattern: case-insensitive substring match applied to each option's visible label.
- The filter/search group is treated as a black box for this feature: it exposes a "reset content" entry point that the top-menu reset chain calls; its internal reset/refresh logic for individual controls is owned outside this feature's scope and is not modified here.
- The existing toggle-state-preserved-across-resets behavior of the filter and search panel buttons is correct and intentional; this feature must not change it.

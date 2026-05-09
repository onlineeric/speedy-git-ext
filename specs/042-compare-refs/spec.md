# Feature Specification: Compare Refs (A vs B)

**Feature Branch**: `042-compare-refs`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: "read @specs/compare-idea.md, it is idea spec, you should re-investigate and produce a complete spec, provide all edge cases and clarifications, will execute clarify after the spec created."

## Summary

Speedy Git currently inspects only one commit at a time. Competing graph extensions (Git Graph, Git History, GitLens) all make A-vs-B comparison a first-class flow — pick two points in history and see everything that changed between them. This feature closes that gap by adding a third toggle panel ("Compare") alongside Filter and Search, plus right-click entry points on commit / branch / tag rows, that let a user pick any two commit-ish references (or the working tree) and view the consolidated diff in the existing Commit Details panel.

The comparison model is deliberately simple: both sides are *just* a "commit-ish" — a commit hash, branch, tag, `HEAD`, `HEAD~3`, `origin/main`, or the working tree sentinel — so a single combobox per slot handles every input type. A two-dot / three-dot toggle controls whether the user sees endpoint-to-endpoint state diff or "what B added since branching off A," matching what GitHub's PR "Files changed" tab shows.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compare two commits via right-click (Priority: P1)

A developer is reviewing recent history on the graph. They right-click a commit and select "Select for compare," then right-click a second commit and select "Compare with selected." The Commit Details panel opens with the combined list of files changed between the two commits and per-file diffs.

**Why this priority**: This is the fastest and most direct way to use the feature, exercises the entire pipeline (selection → backend diff → result rendering), and is the minimum useful slice. It alone delivers the most common single-task value: "what changed between these two points?"

**Independent Test**: With any repo open, right-click commit X then right-click commit Y and choose "Compare with selected." Verify the Commit Details panel shows the union of changed files between X and Y, that opening any file shows the X→Y diff, and that the panel header clearly identifies both ends of the comparison.

**Acceptance Scenarios**:

1. **Given** a graph with at least two commits visible, **When** the user right-clicks commit X → "Set as Compare Base" then right-clicks commit Y → "Compare with Base," **Then** the Commit Details panel shows the consolidated A=X, B=Y diff with a header that names both ends.
2. **Given** commit X has been selected for compare, **When** the user right-clicks commit X again, **Then** the "Compare with Base" item is disabled (cannot compare a commit with itself).
3. **Given** commit X has been selected for compare, **When** the user right-clicks a different commit Z, **Then** "Compare with Base" appears enabled and uses Z as B; "Set as Compare Base" also still appears so the user can override A.
4. **Given** no prior selection, **When** the user right-clicks a commit, **Then** only "Set as Compare Base" appears (no "Compare with Base" until A is set).
5. **Given** an active comparison is showing in the Commit Details panel, **When** the user clicks a single commit row, **Then** the panel returns to single-commit detail view for that commit (compare result is dismissed by normal commit selection, just like any other detail view).

---

### User Story 2 - Compare any two refs via the Compare panel (Priority: P2)

A developer wants to compare branch `feature/x` against `main`, or tag `v1.4.0` against `v1.5.0`. They open the Compare toggle panel, type or pick `main` in slot A, type or pick `feature/x` in slot B, and click Compare. The result renders in the Commit Details panel.

**Why this priority**: Right-click only works for items currently visible in the graph. Users routinely compare refs that may be off-screen (older tags, remote-only branches) or not represented as a single graph row (the typed ref `HEAD~5`). The panel is the universal entry point and supports the most common ref-vs-ref use cases (PR diff, release diff, drift check).

**Independent Test**: Open the Compare panel from the toolbar, type `main` in slot A, type `feature/x` in slot B (or pick from the dropdown), and click Compare. Verify the result appears in the Commit Details panel and matches `git diff main...feature/x` (three-dot is the default for branch-vs-branch).

**Acceptance Scenarios**:

1. **Given** the Compare panel is open with both slots empty, **When** the user clicks the Compare button, **Then** the button is disabled and no request is sent.
2. **Given** slot A and slot B both contain the same ref, **When** the user attempts to Compare, **Then** the Compare button is disabled with an inline "A and B are the same" hint.
3. **Given** slot A contains `main` and slot B contains `feature/x`, **When** the user clicks Compare, **Then** a comparison request is dispatched and the result renders in the Commit Details panel.
4. **Given** slot A and slot B are both filled, **When** the user clicks the swap (⇄) button, **Then** the values exchange and any visible result is dismissed (a fresh Compare click is required to re-run with swapped direction).
5. **Given** slot A is filled, **When** the user clicks the per-slot clear (✕) affordance, **Then** slot A becomes empty and the Compare button disables.
6. **Given** the Compare panel is closed but slot A is filled (pending state), **When** the user reopens the panel, **Then** slot A is still filled (within-session persistence) and the toolbar toggle button shows the pending color (light yellow).
7. **Given** slot A and slot B are filled and a result is showing, **When** the user closes the VS Code window and reopens it, **Then** slots A and B are empty (cross-session state is cleared because refs may no longer resolve).
8. **Given** the user types a non-existent ref like `not-a-branch` into a slot, **When** the user clicks Compare, **Then** the panel shows an inline error ("Unknown ref: not-a-branch") and no result is rendered.
9. **Given** the user switches the active repository, **When** the new repo loads, **Then** slots A and B are cleared (refs from the previous repo do not apply).

---

### User Story 3 - Compare working tree against any ref (Priority: P3)

A developer wants to see how their uncommitted local edits differ from `origin/main` (or any past commit / tag). They pick `Working Tree` in one slot and the ref in the other and click Compare.

**Why this priority**: Reviewing local changes against a moving baseline is a common pre-commit / pre-PR workflow. It is also the only way to compare uncommitted state — branches and tags can't represent it. Users will reach for it; missing it would push them back to the terminal.

**Independent Test**: With local uncommitted changes present, open the Compare panel, choose `Working Tree` in slot B and `HEAD` (or any branch/tag) in slot A, click Compare. Verify the result lists exactly the files modified locally with the correct diffs.

**Acceptance Scenarios**:

1. **Given** the Working Tree sentinel is selectable from the slot combobox, **When** the user picks `Working Tree` in slot B and `HEAD` in slot A, **Then** the comparison reflects the unstaged + staged changes against `HEAD`.
2. **Given** `Working Tree` is in either slot, **When** the panel renders the two-dot / three-dot toggle, **Then** the three-dot option is disabled with a tooltip explaining three-dot does not apply to a working tree.
3. **Given** a working-tree comparison is showing and the user edits a file on disk, **When** the next graph auto-refresh fires, **Then** the comparison result updates to reflect the new working tree contents (working-tree comparisons follow the same auto-refresh signal as the graph).
4. **Given** no local changes, **When** the user compares `HEAD` vs `Working Tree`, **Then** the result shows "No changes" with an empty file list (not an error).

---

### User Story 4 - Compare a range of commits at once (Priority: P3)

A developer wants to see what a specific feature work spanning N commits introduced. They multi-select those commits in the graph (Ctrl/Cmd+click), right-click and choose "Compare these commits." The result is the diff from the parent of the oldest selected commit to the newest selected commit.

**Why this priority**: This is the way users naturally express "show me what this batch of work added." Without it, users must manually identify and pick the parent of the oldest commit, which is friction. Same plumbing as Story 1 with one extra entry point.

**Independent Test**: Multi-select two or more commits in the graph, right-click → "Compare these commits." Verify the Commit Details panel shows the union diff that matches `git diff <oldest>^ <newest>`.

**Acceptance Scenarios**:

1. **Given** the user has multi-selected ≥2 commits in the graph, **When** they right-click and choose "Compare these commits," **Then** slot A is filled with `<oldest>^` (parent of the oldest selected commit) and slot B with `<newest>`, and the comparison runs immediately.
2. **Given** the user has multi-selected exactly 1 commit, **When** the right-click menu opens, **Then** "Compare these commits" is hidden (single-commit selection has no range; "Set as Compare Base" is still offered).
3. **Given** the multi-selection includes non-contiguous commits, **When** the user runs "Compare these commits," **Then** the system collapses the selection to its endpoints (oldest → newest) — non-contiguous selection does not produce a separate model; the user is shown the resulting endpoint pair in slots A and B.
4. **Given** the oldest selected commit is a root commit (no parent), **When** "Compare these commits" runs, **Then** A is set to the empty-tree sentinel so the diff shows "everything in B" (matches `git diff` against the empty tree).

---

### User Story 5 - Two-dot vs three-dot toggle for branch comparison (Priority: P3)

A developer comparing branch `feature/x` against `main` wants to see "what `feature/x` adds since it branched off `main`" (PR-style) — not the symmetric difference that includes commits on `main` since the branch point. The Compare panel exposes a two-dot / three-dot toggle whose default depends on the slot types.

**Why this priority**: This is the single biggest behavioral switch in compare flows. Getting the default wrong silently shows the wrong content. This story is independently shippable on top of Story 2: the toggle changes the comparison request payload and the result renders identically.

**Independent Test**: Compare two branches (e.g., `main` vs `feature/x`). Verify the toggle defaults to three-dot, the result matches `git diff main...feature/x`, and that flipping to two-dot re-runs and produces `git diff main feature/x`.

**Acceptance Scenarios**:

1. **Given** both slots contain branches or tags, **When** the panel renders, **Then** the toggle defaults to three-dot.
2. **Given** both slots contain commit hashes (or one is a typed expression like `HEAD~3`), **When** the panel renders, **Then** the toggle defaults to two-dot.
3. **Given** either slot contains the Working Tree sentinel, **When** the panel renders, **Then** three-dot is disabled (greyed out) with an explanatory tooltip and the active mode is two-dot regardless of slot types.
4. **Given** a comparison result is showing and the user flips the toggle, **When** the toggle changes, **Then** the result is dismissed and a fresh Compare click is required to re-run (consistent with combobox-edit behavior — see clarification Q3).
5. **Given** A and B share no common ancestor, **When** the user runs a three-dot comparison, **Then** the system falls back to two-dot and shows an inline notice ("No common ancestor; showing endpoint diff").

---

### Edge Cases

The following edge cases must be handled. Where a default is listed, the default is the required behavior unless the spec is later revised.

**Selection / slot input**

- A == B: Compare button disabled; right-click "Compare with Base" disabled. Inline hint explains why.
- One slot empty: Compare button disabled.
- User pastes a 7-char short hash that is unique in the repo: resolves to the full hash, treated as a commit-ish.
- User pastes a short hash that is ambiguous: panel shows an inline error from git's resolution failure; Compare not run.
- User pastes a syntactically valid expression that does not resolve (`feature/missing`, `HEAD~999`): inline error on Compare click; no result rendered.
- User clears slot A while a result is showing: the result is dismissed (consistent with FR-020); the next Compare click runs against the current slot values.
- User swaps slots while a result is showing: any showing result is dismissed; user must click Compare to re-run with the swapped direction.

**Graph context-menu entry points**

- Right-click on a commit row whose hash is identical to slot A's resolved hash (e.g., A is `main` which points to the right-clicked commit): "Compare with Base" is disabled.
- Right-click on a branch label: same flow as right-clicking the commit it points to, but the slot stores the branch *name*, not the hash, so future ref movement is reflected.
- Right-click on the "Uncommitted" / working-tree pseudo-row at the top of the graph: "Set as Compare Base" and "Compare with Base" appear and use the `Working Tree` sentinel; the three-dot disable rule applies if this sentinel ends up in either slot.
- Right-click on a stash entry: compare entries are NOT offered (out of scope for v1; see Out of Scope).
- Multi-select in the graph then right-click on a row that is not part of the selection: VS Code conventions apply — the context menu reflects either the right-clicked row only or the full multi-selection per platform behavior; "Compare these commits" appears only when the operative selection is ≥2 commits.

**Repo / submodule state**

- User switches active repo: slots A and B are cleared; any showing compare result is dismissed.
- User navigates into a submodule via the submodule selector: same as above (the new repo is a different commit-ish namespace).
- User runs auto-refresh and a branch in slot A advances: the slot still shows the branch *name*; the next Compare click resolves it to the new tip.
- A working-tree comparison auto-updates with auto-refresh; a ref-vs-ref comparison does NOT auto-update (the user explicitly asked for that snapshot).

**Diff result**

- A and B are content-identical: result is empty file list with a "No changes" indicator (not an error).
- A and B differ only in mode/permissions: file appears in the list with a mode-change indicator; per-file diff shows the mode-change line.
- A and B differ in binary files: file appears with a "binary" indicator; per-file diff shows the binary placeholder rather than text hunks.
- File renamed between A and B: rename detection follows the same configuration the rest of the extension uses (consistent with current single-commit details).
- Submodule pointer changes between A and B: shown as a single-line change in the submodule's gitlink (same representation the extension already uses for single-commit details).
- Result is very large (thousands of files): the file list virtualizes (consistent with existing graph virtualization performance design).
- Three-dot comparison where A and B share no merge base: fall back to two-dot with an inline notice.

**Visual indicators**

- A and B both visible in the graph viewport: each row shows a subtle marker / "A" or "B" badge on the commit row.
- A or B is a non-graph ref (Working Tree, a hash that isn't currently rendered because of pagination, an ancestor outside the loaded window): no graph marker appears; the panel slot chip is the only indicator.
- The visible commit for A is also tagged or branched: the marker coexists with existing ref labels (does not replace them).

**Toolbar toggle button (matches Filter button convention)**

- Idle (panel closed, no slots filled): default color.
- Open (panel visible, regardless of slot state): "open" color (light blue).
- Pending (panel closed but at least one slot filled): "pending" color (light yellow), so users don't lose track of A after closing the panel.

**Persistence**

- Within session: slots A and B persist across panel open/close, repo refresh, and view toggles, but NOT across active-repo switches.
- Across sessions (window reload, VS Code restart): slots are cleared. The pending toggle-button state therefore also resets.

**Errors**

- Backend git diff fails (corrupted repo, permission denied, etc.): error surfaces in the Commit Details panel area in the same style as other operation errors (toast + inline message), and the slots are NOT cleared so the user can retry.

## Requirements *(mandatory)*

### Functional Requirements

#### Compare panel & toggle button

- **FR-001**: System MUST provide a third toggle panel ("Compare") alongside the existing Filter and Search panels, using the same panel framework.
- **FR-002**: The toolbar Compare button MUST follow the existing Filter-button three-state convention: Idle (panel closed and both slots empty) → default color; Open (panel visible) → light blue; Pending (panel closed AND at least one slot filled) → light yellow.
- **FR-003**: The Compare panel MUST contain: slot A combobox (labeled **Base**), slot B combobox (labeled **Target**), swap (⇄) button between them, a two-dot / three-dot toggle, a Compare action button, and a per-slot clear (✕) affordance.

#### Slot input

- **FR-004**: Each slot MUST be a single searchable combobox that accepts: the `Working Tree` sentinel, the `HEAD` sentinel, local branches, remote branches, tags, a typed/pasted commit hash (full or short), and typed `git rev-parse`-compatible expressions (e.g., `HEAD~3`, `origin/main^2`).
- **FR-005**: The slot combobox MUST surface recently-used items at the top of its dropdown.
- **FR-006**: Each slot MUST display the chosen value as a chip showing both the kind (sentinel / branch / tag / commit) and the value, so the user can tell whether `main` is a branch or a typed expression.
- **FR-007**: When the user types a ref that does not resolve, the system MUST show an inline error on Compare click (validation deferred to Compare so users can keep typing without spurious mid-typing errors).
- **FR-007a**: Slot values MUST be stored by user intent (lazy resolve), not by frozen commit hash. Specifically: branch and tag slots store the ref name; typed expressions (e.g., `HEAD~3`, `origin/main^2`) store the expression text; only raw commit hashes pasted by the user are stored as the resolved full hash. Resolution to a hash happens at Compare-click time so that branch movement, fetched updates, or HEAD changes between slot fill and Compare are reflected in the result.
- **FR-008**: A slot MAY be filled programmatically by right-click context menu actions; when this happens AND the panel is closed, the toolbar toggle MUST move to the Pending color so the user knows state has changed.

#### Two-dot / three-dot toggle

- **FR-009**: System MUST default to three-dot when both slots resolve to branches or tags.
- **FR-010**: System MUST default to two-dot when at least one slot resolves to a commit hash or typed expression.
- **FR-011**: System MUST disable the three-dot option (with a tooltip) whenever either slot contains the `Working Tree` sentinel; the active mode MUST be two-dot in that case regardless of slot types.
- **FR-012**: When a three-dot comparison resolves to two refs with no common ancestor, the system MUST fall back to two-dot and show an inline notice ("No common ancestor; showing endpoint diff").

#### Right-click entry points

- **FR-013**: Commit row, branch label, and tag label context menus MUST include "Set as Compare Base" whenever the right-clicked target is a single commit-ish.
- **FR-014**: Those same context menus MUST include "Compare with Base" whenever slot A is set, disabled when the right-clicked target resolves to the same commit-ish as slot A.
- **FR-015**: When the user right-clicks a multi-selection of ≥2 commits, the menu MUST include "Compare these commits," which fills slot A with `<oldest>^` and slot B with `<newest>` and runs the comparison immediately. For non-contiguous multi-selections the system MUST collapse to oldest/newest endpoints.
- **FR-016**: When the oldest selected commit is a root commit (no parent), the system MUST use the empty-tree sentinel for slot A so the diff shows the full content of B.
- **FR-017**: Stash row context menus MUST NOT include any compare entries (out of scope for v1).
- **FR-018**: The "Uncommitted" / working-tree pseudo-row context menu MUST include "Set as Compare Base" and "Compare with Base" using the `Working Tree` sentinel.

#### Auto-trigger & explicit-trigger rules

- **FR-019**: Right-click "Compare with Base" and "Compare these commits" MUST run the comparison immediately (the user has committed intent).
- **FR-020**: Combobox edits, slot swaps, slot clears, and toggle changes in the panel MUST NOT auto-run; they require an explicit click of the Compare button. Any showing compare result MUST be dismissed when one of these inputs changes (the prior result no longer matches the inputs).
- **FR-021**: The Compare button MUST be disabled when either slot is empty or A == B.

#### Result rendering

- **FR-022**: The compare result MUST render in the existing Commit Details panel (file list + per-file diff), with a header that names both ends of the comparison and the active mode (2-dot or 3-dot).
- **FR-023**: Selecting a single commit row in the graph MUST replace any showing compare result with the single-commit details for that row (compare result is dismissed by normal commit selection).
- **FR-024**: When A and B are content-identical, the panel MUST show an explicit "No changes" empty state (not an error).
- **FR-025**: The result file list MUST handle large diffs (thousands of files) without freezing the UI, consistent with the project's performance-first design (virtualization).
- **FR-025a**: While a comparison is being computed, the Commit Details panel MUST display the same loading indicator it already uses for single-commit detail loading. No compare-specific loading UI is introduced.
- **FR-025b**: While a comparison is in flight, the loading indicator MUST expose a **Cancel** affordance. Clicking Cancel MUST abort the underlying git process, clear the loading state, and leave slot A and slot B unchanged so the user can adjust inputs and retry.
- **FR-025c**: There MUST NOT be a hard size cap on compare results in v1. Render-side performance for large results is handled by file-list virtualization (FR-025).

#### Visual graph markers

- **FR-026**: When the resolved A commit is currently visible in the graph, its row MUST be marked with an "A" indicator. Same for B.
- **FR-027**: Markers MUST coexist with existing ref labels (branch / tag chips, HEAD pointer) without replacing them.
- **FR-028**: When A or B is the `Working Tree` sentinel, no graph marker MUST be applied (only the slot chip in the panel indicates the value).

#### Persistence

- **FR-029**: Slots A and B and the two-dot/three-dot toggle MUST persist within a session across panel close/open and across graph refreshes.
- **FR-030**: Slots A and B MUST be cleared when the user switches the active repository.
- **FR-031**: Slots A and B MUST be cleared on VS Code window reload / extension reactivation (cross-session state is not retained because refs may no longer resolve).

#### Working-tree comparison behavior

- **FR-032**: When either slot is `Working Tree` and the underlying repo state changes (auto-refresh signal fires), the system MUST refresh the showing compare result automatically.
- **FR-033**: When neither slot is `Working Tree`, auto-refresh MUST NOT change a showing compare result (the user asked for a snapshot of two refs).

#### Error handling

- **FR-034**: When the underlying git diff command fails, the system MUST show the error inline (consistent with other Speedy Git operation errors) and MUST NOT clear slots A and B (so the user can retry).
- **FR-035**: When a typed/pasted ref no longer resolves (e.g., the branch was deleted between the time it was selected and the time Compare was clicked), the panel MUST show an inline "Unknown ref" error and MUST NOT clear the slot.

### Key Entities

- **Ref** (commit-ish): A single value the user can put in slot A or B. Variants: commit hash (full or short), branch (local or remote, identified by name), tag (identified by name), `HEAD` sentinel, `Working Tree` sentinel, raw typed expression (e.g., `HEAD~3`). The `Index` (staged) sentinel is **out of scope for v1** (resolved Session 2026-05-07).
- **Compare Selection**: The pair (A, B) plus the two-dot / three-dot mode. Persists within session, cleared across sessions and on repo switch.
- **Compare Result**: The set of files changed between A and B (per the chosen mode), each with status (added / modified / deleted / renamed / mode-changed / binary), plus per-file diff content. Rendered in the existing Commit Details panel.
- **Compare Entry Points**: The places a compare can be initiated: panel combobox + Compare button, commit/branch/tag row context menus, multi-commit selection context menu, and the "Uncommitted" pseudo-row context menu.

## Clarifications

### Session 2026-05-07

- Q: Should the staged-index area (`git diff --staged` semantics) be a selectable sentinel in v1? → A: Defer; no `Index` sentinel in v1. Only `Working Tree` and `HEAD` are sentinels.
- Q: Should stash entries appear in the compare flow in v1? → A: Skip entirely; stashes do not appear in slot combobox and stash row context menus contain no compare items.
- Q: What user-facing wording labels the two slots? → A: "Base / Target". Slot A is labeled **Base**; slot B is labeled **Target**. The right-click menu items become **Set as Compare Base** (formerly "Select for compare") and **Compare with Base** (formerly "Compare with selected"). Multi-select item remains **Compare these commits**.
- Q: What does the user see while a comparison is being computed? → A: Reuse the existing Commit Details panel loading indicator (same spinner/skeleton already shown when single-commit details are loading). No new compare-specific loading UI.
- Q: When does a slot's value resolve to a commit hash — at slot fill or at Compare click? → A: Lazy resolve at Compare click for branches, tags, and typed expressions (e.g., `HEAD~3`). Only raw commit hashes are stored as their resolved hash. The slot's user intent ("compare against `main` as it currently is") is preserved across panel close/open and across graph refreshes.
- Q: How are very large compare results handled — hard cap, soft cap with confirmation, or unbounded? → A: No hard cap; the loading indicator exposes a **Cancel** affordance that aborts the in-flight git process and clears the loading state. Virtualization handles render-side performance for any size that completes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with a graph open can complete a commit-vs-commit comparison via the right-click flow in 2 actions or fewer (Select for compare → Compare with selected).
- **SC-002**: A user can complete a branch-vs-branch comparison via the panel in under 30 seconds when neither branch tip is currently visible in the graph (i.e., the user types both refs).
- **SC-003**: For a repository at the project's typical size, a comparison whose result has fewer than 1,000 changed files renders in the Commit Details panel within 2 seconds of the Compare action being committed (right-click or button click).
- **SC-004**: The default two-dot / three-dot mode chosen by the panel matches the user's expectation in at least 90% of branch-vs-branch and commit-vs-commit cases without an override (validated via internal review of the default rules vs. competitor behavior).
- **SC-005**: After a single onboarding session (first feature use), users can re-discover the Compare entry points unaided — the toolbar toggle, the right-click items on commit / branch / tag, and the panel layout are recognizable on second use.
- **SC-006**: The pending-state color on the toolbar toggle (light yellow when slots are filled and panel closed) is correctly visible 100% of the time when slots A or B are non-empty and the panel is not visible.
- **SC-007**: When the user switches active repositories or reloads the VS Code window, slots A and B are cleared in 100% of cases (no stale refs from a previous repo).
- **SC-008**: When either slot is `Working Tree`, the result reflects the current on-disk state within one auto-refresh tick after a file is edited.

## Assumptions

The following assumptions were made while drafting this spec; flag any that are wrong before `/speckit.plan`:

- The compare result reuses the existing Commit Details panel. A separate dedicated panel may be considered later if compare-specific affordances accumulate, but is not required for v1.
- The slot combobox uses the same UI conventions already in use elsewhere in Speedy Git for similar pickers, so the choice of underlying combobox primitive is an implementation detail and not specified here.
- "Compare these commits" is offered as a separate menu item rather than overloading "Set as Compare Base" for multi-selection (idea spec preference, clearer intent).
- Recently-used items in slot comboboxes are tracked per session and cleared on repo switch / session end (matches slot persistence rules).
- Right-click on Speedy Git's "Uncommitted" pseudo-row uses the `Working Tree` sentinel; the implementation must be careful to only show compare items where they make sense (no compare items on stash rows).
- All comparisons are scoped to the currently active repository — there is no cross-repo or cross-submodule compare.
- For root-commit edge cases, the diff against the empty tree is supported (matches existing single-commit detail behavior for root commits).
- Editing slot inputs (typing, swap, clear, toggle flip) dismisses any visible compare result and requires an explicit Compare click to re-run. This keeps panel state and visible result strictly in sync at the cost of one extra click after edits.

## Out of Scope (v1)

- **`git range-diff` (range vs range)**: Niche, used by patch-series workflows almost no VS Code user does. Skipped.
- **3+ non-contiguous commit selection as its own model**: Collapses to oldest/newest endpoints; no separate "multi-commit set" model is introduced.
- **Stash compare**: Skipped for v1 (resolved Session 2026-05-07). Stash entries are not selectable in slot comboboxes and stash row context menus contain no compare items. Stash compare may be reconsidered in a later iteration.
- **Index sentinel**: Deferred for v1 (resolved Session 2026-05-07). Users wanting "what have I staged?" can keep using `git diff --staged` in the terminal.
- **Cross-repo / cross-submodule compare**: Not supported. Each comparison is scoped to the active repository.
- **Saving / sharing a named comparison configuration**: No "save this compare" feature; recently-used is the only history aid.
- **Compare-specific keyboard shortcuts beyond what falls out of the panel framework**: Not in v1.

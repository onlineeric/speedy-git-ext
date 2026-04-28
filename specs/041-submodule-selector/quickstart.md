# Quickstart — Submodule Selector

**Feature**: `041-submodule-selector` | **Date**: 2026-04-28

How to validate the feature manually after implementation. Use this as the smoke test for
the constitution gate (manual smoke test via VS Code "Run Extension" launch config).

## Prerequisites

- A test workspace with at least one parent repo that has ≥ 2 initialized submodules.
- Run `pnpm generate-test-repo` to materialize a deterministic fixture at `test-repo/` if
  one is not already present. (The fixture's structure is owned by
  `scripts/generate-test-repo.ts` and is documented separately.)
- `pnpm build` clean (typecheck + esbuild + Vite all succeed).

## Launch

1. Open VS Code in the project root.
2. F5 → "Run Extension" (or "Run Extension (Watch)").
3. In the spawned Extension Development Host, open the `test-repo/` folder.
4. Run command: `Speedy Git: Show Graph` (or click the status bar `⚡ Speedy Git`).

## Smoke checklist

Tick each item; all must pass for the feature to ship.

### A. UI structure (FR-001, FR-002, FR-003)

- [ ] **A1.** Above the graph, there is **no** submodule header row (`SubmoduleSection`),
      **no** breadcrumb (`SubmoduleBreadcrumb`), and **no** "Back to parent" button.
- [ ] **A2.** No commit row or panel title displays the literal text `Current` after the
      `/` separator (the legacy `<repo> / Current` formatting is gone).
- [ ] **A3.** The top menu shows the repo selector at the leftmost position; immediately
      to its right is the new submodule selector (when applicable per A4).

### B. Submodule selector visibility & options (FR-004, FR-005, FR-006)

- [ ] **B1.** Selecting a parent repo with ≥ 1 initialized submodule shows the submodule
      selector. The first option is `<parent name> (parent)` and is selected by default.
- [ ] **B2.** Subsequent options are the parent's initialized submodules, sorted
      alphabetically (case-insensitive) by submodule basename.
- [ ] **B3.** Selecting a repo without submodules hides the submodule selector entirely
      (toolbar consumes no extra horizontal space).
- [ ] **B4.** A parent that declares submodules in `.gitmodules` but has not initialized
      them (no `<sub>/.git`) shows the submodule selector with **only** the parent option
      and the initialized subset — uninitialized submodules are absent from the list.
- [ ] **B5.** If a parent declares submodules but **none** are initialized, the submodule
      selector is hidden (same as B3).

### C. Navigation behavior (FR-007, FR-008, FR-009, FR-010, FR-017)

- [ ] **C1.** Picking a submodule from the submodule selector switches the graph to that
      submodule's commits. The repo selector remains on the parent (does NOT jump).
- [ ] **C2.** Picking the parent option returns the graph to the parent's commits.
- [ ] **C3.** Picking submodule A, then submodule B (without going to parent first) shows
      B's graph. No intermediate parent view; no "Back to parent" required.
- [ ] **C4.** Changing the repo selector while a submodule is selected resets the
      submodule selector to the new parent's `(parent)` option (or hides it). The
      previously-selected submodule does **not** persist.

### D. Persistence behavior (FR-008a)

- [ ] **D1.** Select submodule X. Close the Speedy Git panel. Reopen it. The submodule
      selector defaults to `(parent)`.
- [ ] **D2.** Select submodule X. Reload the VS Code window (`Developer: Reload Window`).
      Reopen the panel. The submodule selector defaults to `(parent)`.

### E. Filterable combo-box parity (FR-018, FR-019, FR-020, FR-021)

- [ ] **E1.** Open the repo selector. The dropdown has a filter input at the top. Typing
      narrows the list by case-insensitive substring on the visible label.
- [ ] **E2.** Open the submodule selector. Same dropdown layout. Typing narrows the same
      way; the parent option is matched against its full label `<parent> (parent)`.
- [ ] **E3.** Open the existing branches filter combo box (`MultiBranchDropdown`). The
      dropdown layout (filter input at top), the match semantics, and the keyboard
      behavior all visibly match the new selectors. (Specifically: Tab into list, Arrow
      Up/Down to navigate, Enter to select, Esc to close, type-to-redirect from list
      back to filter input.)
- [ ] **E4.** Type filter text in any of the three selectors, then close the dropdown
      without selecting. Reopen — the filter input is empty and the list is fully expanded.
- [ ] **E5.** Type filter text matching no entries — the list is empty. Clear the filter
      to restore the full list.

### F. Reset/refresh chain (FR-022, FR-023, FR-024, FR-025)

- [ ] **F1.** Open the filter panel toggle (so it's expanded). Apply at least one filter
      (e.g., select an author or set a date range) and at least one branches-filter entry.
      Open the search panel toggle and type a search term. **Confirm**: filters and search
      content are visible and applied.
- [ ] **F2.** Change the repo selector to a different repo. **Confirm**:
      - branches filter is cleared (now shows "All Branches");
      - filter panel is still **visibly open** (toggle state preserved) but its contents
        are reset (no author selected, no date range);
      - search panel is still **visibly open** (toggle state preserved) but its query is
        empty;
      - submodule selector reset to `(parent)` of the new repo or hidden.
- [ ] **F3.** Repeat F1 then change the **submodule selector** (parent → sub, or sub →
      sub). **Confirm**: same content-reset / toggle-preservation as F2; the repo
      selector value does **not** change.
- [ ] **F4.** Open the filter panel via its toggle, then close it. Change the repo
      selector. Reopen the filter panel. The panel's contents are still empty (reset
      on the change), confirming the reset is on content, not visibility.

### G. Operations target the displayed repo (FR-014, FR-016, SC-007)

- [ ] **G1.** With submodule X displayed (via the submodule selector), invoke each of:
      `Refresh`, `Fetch all remotes`, right-click → `Pull`, right-click → `Push`,
      right-click on a commit → `Cherry-pick`, right-click → `Reset branch to commit`,
      right-click → `Create tag`. Confirm each operation acts on **submodule X's repo**
      (not the parent). Spot-check via `git log` in a terminal opened at the submodule's
      path.
- [ ] **G2.** With submodule X reached via the repo selector's auto-discovered entry
      (instead of via the parent's submodule selector), repeat one operation from G1.
      Confirm the resulting graph view is **identical** to G1's pre-state (same commits,
      same controls, same dialogs).

### H. No regressions

- [ ] **H1.** `pnpm typecheck` succeeds.
- [ ] **H2.** `pnpm lint` succeeds.
- [ ] **H3.** `pnpm build` succeeds (extension + webview).
- [ ] **H4.** Existing keyboard shortcuts (`r` to refresh, `Ctrl+F` to search, `F3` next
      match, `Esc` close panels) still work in both parent and submodule views.

## Failure recovery

If any item fails, capture:

- The failing item ID (e.g., `F2`).
- The repo / submodule names involved.
- A screenshot of the toolbar and panel state.
- The contents of the VS Code Output channel `Speedy Git`.

Open an issue or message on the feature branch with the above. Do **not** mark the
feature complete until every item passes.

## Acceptance criteria mapping

| Smoke item | Spec FR | Spec SC |
|---|---|---|
| A1 | FR-001, FR-002 | SC-001 |
| A2 | FR-003 | SC-001 |
| B1–B2 | FR-004, FR-006 | SC-002 |
| B3, B5 | FR-005 | — |
| B4 | FR-006 (initialized filter) | — |
| C1, C3 | FR-009 | SC-002, SC-003 |
| C2 | FR-010 | — |
| C4 | FR-008 | SC-006 |
| D1, D2 | FR-008a | SC-006 |
| E1–E5 | FR-018, FR-019, FR-020, FR-021 | SC-008, SC-011 |
| F1–F4 | FR-022, FR-023, FR-024, FR-025 | SC-009, SC-010 |
| G1, G2 | FR-013, FR-014, FR-016 | SC-004, SC-007 |
| H1–H3 | (constitution gates) | — |

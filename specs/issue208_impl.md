# Issue #208 — "Always show badged commits" filter option

Implementation spec. Written to be picked up in a fresh session; read it fully before starting.

GitHub issue: https://github.com/onlineeric/speedy-git-ext/issues/208 (by @tbuyukliev)

## 1. Problem

A user filters the graph to their own commits (Filter panel → Authors). Branch tips authored by
someone else (e.g. the latest commit on `main`) are hidden along with every other foreign commit, so
the user cannot right-click the tip of `main` to create a new topic branch from it.

The request is the moral equivalent of:

```bash
git log --simplify-by-decoration --decorate-refs=<visible ref kinds>
```

unioned with "my commits": keep every commit that carries a ref decoration, even when it fails the
author/text filter.

## 2. Decisions (agreed with the maintainer)

| # | Decision |
| --- | --- |
| D1 | New checkbox in the Filter panel labelled **"Always show badged commits"**. |
| D2 | The option relaxes **only the client-side visibility filters: Authors and Message (text)**. It does **not** affect Dates or Branches (both are applied by `git log` in the backend; commits outside them are never loaded, and a branch filter is an explicit choice of refs that must not be overridden). |
| D3 | "Badged" = the commit shows at least one ref badge **after** `filterDisplayRefsBySettings` (the single source of truth for which badges a row displays), **or** it is the HEAD commit (attached or detached). See §4. |
| D4 | Rows that are visible **only because of this option** (they fail the author/text filter but are badged) are rendered **dimmed**. |
| D5 | The checkbox value is stored as **persisted UI state** (`PersistedUIState`, global, not per repo). Default `false`. |
| D6 | **No telemetry** for this feature. |
| D7 | Default OFF → zero change for existing users. |

## 3. Current behavior (code map)

- `webview-ui/src/utils/commitVisibility.ts` — `computeHiddenCommitHashes(commits, filters)`.
  Hides a commit if its `authorEmail` is not in `filters.authors`, or (AND) its subject/hash doesn't
  match `filters.textFilter`. Stash and uncommitted pseudo-commits are always skipped (never hidden).
  Tests: `webview-ui/src/utils/__tests__/commitVisibility.test.ts`.
- `webview-ui/src/stores/graphStore.ts` — every recompute calls `computeHiddenCommitHashes` then
  `computeMergedTopology(..., hiddenCommitHashes, ...)`. Call sites: `setCommits`, `appendCommits`,
  `setUncommittedChanges`, `recomputeVisibility`, `setInitialData` (search for
  `computeHiddenCommitHashes(`; there are 5–6). `setStashes` reuses the stored set.
  Store state: `hiddenCommitHashes: Set<string>`.
- `webview-ui/src/utils/mergedCommits.ts` / `graphTopology.ts` — hidden commits are removed from
  `mergedCommits` and the topology bridges edges across them. Nothing to change there.
- `webview-ui/src/utils/mergeRefs.ts` — `mergeRefs(commit.refs)` → `{ isHead, headBranchName, displayRefs }`;
  `filterDisplayRefsBySettings(displayRefs, { showTags, showRemoteBranches })` drops tags / remote
  branches per View settings and degrades a `merged-branch` to `local-branch` when remotes are hidden.
  Note: a detached HEAD produces **no** display ref (only `isHead = true`).
- `webview-ui/src/components/FilterWidget.tsx` — the Filter panel: header (Reset All, Close), rows
  Branches / Authors / Dates / Message. Author/text changes call `setFilters(...)` then
  `recomputeVisibility()`.
- `webview-ui/src/components/AuthorContextMenu.tsx` — "Add Author to filter" sets filters and
  re-fetches via `rpcClient.getCommits` (lands in `setCommits`).
- `webview-ui/src/components/GraphContainer.tsx` renders `CommitTableRow` (memoized) with boolean
  props such as `isSearchMatch`.
- `webview-ui/src/rpc/rpcClient.ts` — Go to HEAD / navigation read `store.hiddenCommitHashes`
  (`isHiddenClientSide`). Keeps working unchanged: a commit kept by this option is simply not hidden.
- Persisted UI state: `shared/types.ts` (`PersistedUIState`, `DEFAULT_PERSISTED_UI_STATE`),
  `src/webview/PersistedUIStateStore.ts` (`loadPersistedUIState`, `savePersistedUIState`, both
  validate field by field), webview side `graphStore.hydratePersistedUIState` and
  `rpcClient.persistUIState(partial)` (example caller: `FileChangeShared.tsx` for `fileViewMode`).
  Tests: `src/__tests__/PersistedUIStateStore.test.ts`.

## 4. Definition of "badged commit"

A commit is badged when **either**:

1. `mergeRefs(commit.refs).isHead` is true (HEAD points here, attached or detached), **or**
2. `filterDisplayRefsBySettings(mergeRefs(commit.refs).displayRefs, { showTags, showRemoteBranches })`
   contains at least one entry whose `type !== 'stash'`.

Consequences:

- Local branch, merged local+remote branch → badged.
- Remote-only branch → badged only when `showRemoteBranches` is on.
- Tag → badged only when `showTags` is on.
- Stash / uncommitted pseudo-commits → unaffected (already never hidden).

Reuse `mergeRefs` + `filterDisplayRefsBySettings`; do **not** write a second switch over ref types
(CLAUDE.md: "a second `switch` over `DisplayRef` is how a row lights up with nothing boxed").

Put this predicate in one exported pure function, e.g. `isBadgedCommit(commit, badgeSettings)` in
`commitVisibility.ts` (or `mergeRefs.ts` beside `filterDisplayRefsBySettings` — implementer's choice,
prefer `mergeRefs.ts` since it is about badges).

Optimisation: `commit.refs.length === 0` → not badged, skip `mergeRefs` (the vast majority of rows).

## 5. Implementation

### 5.1 Pure visibility logic — `webview-ui/src/utils/commitVisibility.ts`

Replace / extend `computeHiddenCommitHashes` so one pass yields both sets:

```ts
export interface VisibilityOptions {
  alwaysShowBadgedCommits: boolean;
  badgeSettings: { showTags: boolean; showRemoteBranches: boolean };
}

export interface CommitVisibility {
  /** Commits removed from the graph by the Author / Message filters. */
  hiddenCommitHashes: Set<string>;
  /** Commits that fail those filters but stay visible because they carry a badge (rendered dimmed). */
  badgeKeptCommitHashes: Set<string>;
}

export function computeCommitVisibility(
  commits: Commit[],
  filters: GraphFilters,
  options: VisibilityOptions,
): CommitVisibility
```

Algorithm per commit (skip stash/uncommitted as today):

1. Evaluate author + text filters exactly as now → `failsFilter`.
2. If `!failsFilter` → visible, not dimmed.
3. Else if `options.alwaysShowBadgedCommits && isBadgedCommit(commit, options.badgeSettings)` →
   add to `badgeKeptCommitHashes`.
4. Else → add to `hiddenCommitHashes`.

When no author/text filter is active, both sets are empty (fast path as today).

Either keep `computeHiddenCommitHashes` as a thin wrapper or migrate all callers — migrating is
cleaner; there are only a handful of call sites, all in `graphStore.ts`.

### 5.2 Store — `webview-ui/src/stores/graphStore.ts`

- New state: `alwaysShowBadgedCommits: boolean` (initial `DEFAULT_PERSISTED_UI_STATE.alwaysShowBadgedCommits`)
  and `badgeKeptCommitHashes: Set<string>` (initial empty set).
- New action: `setAlwaysShowBadgedCommits(value: boolean)` → sets the flag, then recomputes
  visibility (same as `recomputeVisibility`) **only if an author or text filter is active** (§10 P2).
- Add a small local helper, e.g. `visibilityOptionsOf(state)`, building `VisibilityOptions` from
  `state.alwaysShowBadgedCommits` and `state.userSettings.showTags/showRemoteBranches`. Every place
  that currently calls `computeHiddenCommitHashes(commits, filters)` calls
  `computeCommitVisibility(commits, filters, visibilityOptionsOf(get()))` and stores **both** sets.
- `hydratePersistedUIState` copies `alwaysShowBadgedCommits` and recomputes visibility if the value
  changed and commits are loaded (hydration can arrive after commits).
- **`setUserSettings` must recompute visibility** when `showTags` or `showRemoteBranches` changed and
  `alwaysShowBadgedCommits` is on, otherwise toggling "Show tags" in View settings leaves stale rows.
  Respect the existing `state.loading → pendingUserSettings` branch (the pending path is applied
  later through `setInitialData`, which already recomputes).
- `appendCommits`' empty-batch tracking counts "visible" commits via `hiddenCommitHashes` — a
  badge-kept commit counts as visible. That falls out naturally; just don't count it as hidden.
- `resetAllFilters` does **not** touch `alwaysShowBadgedCommits` (it's a preference, not a filter value).

### 5.3 Persisted UI state

- `shared/types.ts`: add `alwaysShowBadgedCommits: boolean` to `PersistedUIState`; default `false`
  in `DEFAULT_PERSISTED_UI_STATE`. **Do not bump `version`** — a version mismatch discards the user's
  whole stored UI state; a missing field must just fall back to the default.
- `src/webview/PersistedUIStateStore.ts`:
  - `loadPersistedUIState`: `typeof raw.alwaysShowBadgedCommits === 'boolean' ? raw… : defaults…`.
  - `savePersistedUIState`: accept the field into `globalValidated` only when it is a boolean.
- It is global UI state, so it follows the existing cross-tab rule: applies immediately to the tab
  that changed it, written back as the saved default, seeds tabs opened later, never pushed live into
  other open tabs.
- Webview: on checkbox change, `setAlwaysShowBadgedCommits(value)` then
  `rpcClient.persistUIState({ alwaysShowBadgedCommits: value })`.

### 5.4 Filter panel UI — `webview-ui/src/components/FilterWidget.tsx`

- Add a checkbox row **after the Message row** (it modifies the Authors/Message filters, so it sits
  below them), label: **Always show badged commits**.
- Tooltip (`title`) on the label: `Keep commits that show a branch, tag or HEAD badge visible even when they don't match the Authors or Message filter. Does not affect Branches or Dates.`
- Always enabled — even with no author/text filter active (it is a remembered preference; per the
  project rule, don't disable/hide controls that behave consistently).
- Use a native `<input type="checkbox">` styled like the existing dialog checkboxes (see
  `PushDialog.tsx`), colors via `var(--vscode-*)` tokens only (the theme-color test enforces it).
- It does **not** count toward `hasAnyFilters` (Reset All enablement) nor the toolbar's "filters
  active" indicator in `ControlBar.tsx`.

### 5.5 Dimmed rows

- `GraphContainer.tsx`: read `badgeKeptCommitHashes` from the store and pass
  `isBadgeKept={badgeKeptCommitHashes.has(commit.hash)}` to `CommitTableRow` (a boolean prop keeps
  the memo effective).
- `CommitTableRow.tsx`: when `isBadgeKept`, dim the row's **text content** (subject text, author,
  date, hash, avatar) — `opacity: 0.6` on those cells (see §10 P6) — but keep the **graph column**
  (lane lines must stay continuous with neighbours) and the **ref badges** at full opacity, since the
  badges are the reason the row is shown. Selection / search-match backgrounds are unchanged.
- No new color; opacity only, so no theme-token concern.
- Hovering the dimmed row needs no special handling.

### 5.6 Out of scope

- Dates / Branches interaction (D2).
- "Me" author shortcut / recent authors (issue's secondary request) — separate follow-up.
- Telemetry (D6).
- Detached-worktree badges (`detachedWorktreesByHead`) — not part of `commit.refs`; excluded (§9 Q1).

## 6. Tests (Vitest)

`webview-ui/src/utils/__tests__/commitVisibility.test.ts` — extend (keep existing cases passing via
the new function):

- Option off → identical results to today; `badgeKeptCommitHashes` empty.
- Option on + author filter: foreign commit with a local branch → in `badgeKept`, not `hidden`.
- Foreign commit with no refs → hidden.
- Own commit with a branch → visible, **not** in `badgeKept` (only filter failures are dimmed).
- Tag: badged when `showTags`, hidden when `!showTags`.
- Remote-only branch: badged when `showRemoteBranches`, hidden when not.
- Local+remote same name with `!showRemoteBranches` → still badged (degraded to local).
- Detached HEAD (`{ type: 'head', name: 'HEAD' }`) → badged.
- Text filter only (no author filter) → same rules apply.
- No author/text filter → both sets empty regardless of the option.
- Stash / uncommitted → never in either set.

`isBadgedCommit` — direct unit tests for the predicate if it lives in `mergeRefs.ts`.

`src/__tests__/PersistedUIStateStore.test.ts`:

- Load: missing field → `false`; non-boolean → `false`; `true` round-trips.
- Save: boolean accepted; non-boolean ignored; other fields untouched.
- Stored state from before this change (no field, `version: 1`) keeps all other values.

Store-level (if a graphStore test file exists for visibility, add there):

- Toggling `setAlwaysShowBadgedCommits` with an author filter active recomputes `mergedCommits`;
  with no author/text filter it leaves `mergedCommits`/`topology` identity unchanged (§10 P2).
- Changing `showTags` via `setUserSettings` with the option on and a filter active recomputes
  visibility; with the option off it does not.

Finish with `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## 7. Docs / housekeeping

- `docs/architecture.md`: update the `commitVisibility.ts` entry (and `mergeRefs.ts` if
  `isBadgedCommit` lands there); refresh the "last reconciled" date.
- `CLAUDE.md`: consider one line under *Shared Logic* that `filterDisplayRefsBySettings` now also
  drives "badged commit" visibility (third consumer besides the renderer and the search matcher).
- `README.md`: mention the option in the filter section if one exists.
- `CHANGELOG.md` / What's New: **ask the maintainer** — never add a What's New entry on your own.
- Reply on issue #208 is the maintainer's call.

## 8. Manual verification (test repo `~/repos/test-repo`)

1. Filter Authors to one author. Option off → other authors' branch tips disappear (unchanged).
2. Tick the option → `main`/`dev`/feature tips by other authors reappear, dimmed; graph lines join
   cleanly; badges are full opacity.
3. Right-click a dimmed tip → Create Branch works.
4. View settings: hide tags → tag-only foreign commits disappear; hide remote branches → remote-only
   tips disappear, `main` (local+remote) stays.
5. Message filter only → same behavior.
6. Reset All → filters cleared, checkbox keeps its state.
7. Reload window / open a new graph tab → checkbox state restored.
8. Light and dark theme check of the checkbox and dimmed rows.

## 9. Resolved questions

- **Q1 — Detached worktree badges: not included.** The worktree badge on a detached-worktree commit
  comes from `detachedWorktreesByHead`, not `commit.refs`, and does not make a commit "badged".
- **Q2 — Dim strength: `opacity: 0.6`** on the text content (see §5.5). Readable on every theme
  while clearly distinct from normal rows.

## 10. Performance requirements (project rule: performance first)

The feature must add no measurable cost when the option is off, and only proportional cost when on.

- **P1 — Badge check only on filter failures with refs.** `isBadgedCommit` runs only when the
  option is on, the commit already failed the author/text filter, **and** `commit.refs.length > 0`.
  Check `refs.length` before calling `mergeRefs` (which allocates). Commits that pass the filter
  never touch ref logic. The pass stays one O(n) loop — no second pass over commits.
- **P2 — No recompute when nothing can change.** `setAlwaysShowBadgedCommits` recomputes visibility
  only when an author or text filter is active; otherwise it just stores the flag (the sets are empty
  either way). Same rule for `hydratePersistedUIState` (also skip when the value is unchanged), and
  for `setUserSettings`: recompute only when `showTags`/`showRemoteBranches` actually changed **and**
  the option is on **and** an author/text filter is active. Every needless recompute re-runs
  `computeMergedTopology` and re-renders the graph.
- **P3 — Row memo stays intact.** `CommitTableRow` receives a **boolean** `isBadgeKept`, never the
  Set. The O(1) `Set.has` lookup happens in `GraphContainer` alongside the existing per-row props.
- **P4 — No extra store subscriptions per row.** Rows must not subscribe to `badgeKeptCommitHashes`
  or `alwaysShowBadgedCommits` themselves.
- **P5 — Store both sets in the same `set()` call** as `hiddenCommitHashes`, `mergedCommits` and
  `topology`, so one recompute = one render, never two.
- **P6 — Dimming is a static class.** Apply one opacity class to the dimmed cells (a single
  wrapper per cell, not per span); no inline style objects created per render, no transitions.
- **P7 — No backend work.** Nothing new on the commit-load path; no extra git calls. The persisted
  flag rides on the existing `persistedUIState` hydration message.

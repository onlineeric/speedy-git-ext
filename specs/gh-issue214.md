# GH #214 — "Go to" always reaches the commit: reveal filtered-out commits

Status: **decided, not implemented**. This doc is self-contained: it summarises the design discussion
and the maintainer's decisions so implementation can start in a fresh session without chat history.

## 1. The request

Follow-up to **#208** ("add filtering option to always show branch tips"), which shipped in v5.20.0 as
the Filter panel's **Always show badged commits** checkbox (badge-kept commits render dimmed).

#214 — *"provide a way to show fork points in a filtered view"* — by the same reporter:

> it's useful to see the fork point of a topic branch, regardless of author, so that Reset Current
> Branch to Here can be used, to tidy up the branch history before posting for review. this can be
> done in two ways:
>
> 1. add Always show fork points check box that includes the results of `git merge-base --fork-point`
>    for the visible branch tips.
> 2. add way to manually include a parent commit to the view, overriding filtering. when in detailed
>    commit view, next to the parent commit hash there's a crosshair that can be clicked. currently,
>    when this parent is not in the filtered view, a "The parent commit is hidden by the current
>    author or search filter." error is shown. instead, you can make the crosshair always work, by
>    adding the commit.
>
> of the above, i think option 2 is more generally useful … option 1 has some value too.

### The use case, concretely

```
main:     A ── B ── X ── C ── D        (main badge on D)
                     \
feature:              m1 ── m2 ── m3   (feature badge on m3; m1–m3 authored by the user)
```

The user filters **Author = Me** + **Always show badged commits**. They see `D`, `m3`, `m2`, `m1`.
`X` — the commit `feature` grew from — is someone else's and carries no badge, so it is hidden. To
tidy the branch (squash m1–m3) they want to right-click `X` → **Reset Current Branch to Here** or
**Interactive Rebase onto This Commit**, but `X` is not on the graph.

## 2. What we decided (and why)

### Rejected alternatives

| Idea | Why not |
| --- | --- |
| "Inclusive" menu actions on `m1` (`rebase -i m1^`, `reset m1^`) — no visibility change | Works, but acts on a node the user cannot see. **Maintainer's principle: users must see the exact node they act on, to feel safe.** |
| Option 1 as written (`git merge-base --fork-point` per visible tip) | Backend git call per branch tip on every load (violates performance-first); reflog-based heuristic that needs an upstream and can silently return nothing |
| "Always show boundary commits" checkbox (option 1 done exactly: show the hidden first parent of every visible commit, à la `git log --boundary`) | Viable and cheap, but deferred. Option 2 is what the reporter prefers, adds no setting, and fixes an existing dead-end toast. Can be added later on the same mechanism (§4.8) |

### Chosen: every "Go to" always reaches its commit

Applies to **all three** navigations, which already share one state machine
(`webview-ui/src/utils/headNavigation.ts`):

- details panel **Go to parent** (crosshair next to a parent hash)
- details panel **Go to child** (crosshair next to a child hash) — *maintainer: must behave exactly
  like Go to parent*
- toolbar **Go to HEAD** — *maintainer: yes, include it*

Clicking always shows the target and scrolls to it, regardless of filters. A commit shown this way is
a **revealed commit**: it renders dimmed exactly like a badge-kept commit and is an ordinary row
(right-click menus, selection, details) — the point is that the user right-clicks `X`.

Integrity of the rule ("sometimes it can reveal, sometimes it can't" is bad UX) — every case is
covered:

| Why the target is not on screen | Today | After |
| --- | --- | --- |
| Not loaded yet, but in the filtered stream | `locateHead` + targeted load-more, then scroll | **Unchanged** |
| Loaded, hidden by Author / Message filter (client-side) | Toast `hiddenByFilter`, dead end | Added to revealed set → shown dimmed → scroll |
| Not in the filtered stream (backend Date filter; for HEAD also the Branch filter) | Toast `notInView`, dead end | Fetch that single commit by hash (one `git log`) → shown dimmed → scroll |

Notes behind the table:

- Date and Branch filters are backend `git log` args (`src/services/GitLogService.ts` `buildLogArgs`);
  Author and Message filters are client-side (`webview-ui/src/utils/commitVisibility.ts`).
- For **parent / child**, the Branch filter can never exclude the target: it passes refs as
  revisions, so every ancestor of a visible commit is in the walk, and a listed child is by
  construction a loaded commit. Only the Date filter can put a *parent* outside the stream.
- For **HEAD**, both Date and Branch filters can exclude it (HEAD's branch not selected) — the same
  single-fetch path covers it.
- Do **not** single-fetch a commit that *is* in the stream but not loaded yet — inserting it alone
  would leave a gap of unloaded commits above it. Keep the existing load-more path for that case.
- The load-more 12-attempt cap (`MAX_GO_TO_HEAD_LOADS`) is a deliberate performance guard and stays,
  with its existing `unreachable` toast. A parent/child sits next to its relative in date order, so
  hitting it there is practically impossible.

### Go to child — the one asymmetry, by design

Parents come from git (`CommitDetails.parents`), so every parent is known and clickable. Children do
not: git stores no child pointers, so the panel derives them from loaded commits
(`webview-ui/src/utils/commitRelations.ts` `buildChildLinks`). Consequences:

- A listed child is always loaded → it is either visible (scroll) or hidden client-side (**reveal**).
  It never needs the single-fetch path.
- A child **outside the Date filter** is never loaded, so it is **not listed**. Discovering it would
  mean walking history from every ref on each details open, which performance-first rules out.
  **Maintainer's rule: when an edge case cannot be shown without breaking the performance rule, don't
  show it — show a warning instead.** So the Children row carries a note when the list may be
  incomplete (§4.4). Every link the panel *does* show can be clicked and always lands.
- Children must be derived from loaded commits **plus revealed extra commits** (§4.3), otherwise a
  commit revealed by fetch would disappear from its own parent's Children row. Same for
  `buildParentLinks`' subject lookup.

### Lifetime of the revealed list

Per graph tab, session-only (view state in that tab's `graphStore`; never persisted, never shared).

| Event | Revealed list |
| --- | --- |
| Any filter change — Author, Message, Date, Branch, **Reset All** | **Cleared** |
| Repo switch / submodule navigation (both go through `resetAllFilters`) | **Cleared** |
| Chip's **Hide** button (§4.7) | **Cleared** |
| Refresh / auto-refresh (including the one right after resetting onto `X`) | Kept |
| Load more batches, scroll | Kept |
| Display settings (badge visibility, columns, opacity) | Kept |
| A revealed commit no longer exists (e.g. rebased away) | That entry dropped (§4.3) |

Rationale: a reveal is an exception *to the current filter combination*; once filters change it means
nothing, and stale dimmed rows would be unexplained. Keeping it across refresh is load-bearing — the
user reveals `X`, resets onto it, and the auto-refresh must not make `X` vanish.

### Performance

Nothing on the load or scroll paths changes. Cost is per click only: at most one cheap `git log`
spawn (out-of-stream case) plus one visibility + topology recompute — the same cost as changing a
filter. With an empty revealed list, every new code path must be a no-op (no extra allocation/pass).

## 3. Current code you will touch

| Concern | Location |
| --- | --- |
| Crosshair click | `webview-ui/src/components/CommitDetailsPanel.tsx` `RelatedCommitsRow` → `rpcClient.goToRelatedCommit(hash, target)`; `CommitRelations` builds the links from `state.commits` |
| Parent/child links (pure) | `webview-ui/src/utils/commitRelations.ts` `buildParentLinks`, `buildChildLinks`, `findChildCommits` |
| Navigation driver | `webview-ui/src/rpc/rpcClient.ts` `goToRelatedCommit`, Go to HEAD entry point, `applyHeadNavigation`, and the `headLocation` / `commitsAppended` continuation handlers |
| Navigation decisions (pure) | `webview-ui/src/utils/headNavigation.ts` — `decideLoadedCommitNavigation`, `decideHeadNavigation`, `decideHeadContinuation`, `HEAD_NAVIGATION_MESSAGES`, `COMMIT_NAVIGATION_MESSAGES`. **CLAUDE.md: one state machine for HEAD and parent/child — don't build a second flow** |
| Client-side visibility | `webview-ui/src/utils/commitVisibility.ts` `computeCommitVisibility` → `{ hiddenCommitHashes, badgeKeptCommitHashes }` |
| Merge + topology | `webview-ui/src/utils/mergedCommits.ts` `computeMergedTopology(commits, stashes, filters, hiddenHashes, uncommitted, badgeKeptHashes)` |
| Store | `webview-ui/src/stores/graphStore.ts` — every call of `computeCommitVisibility` (`setCommits`, `appendCommits`, `setUncommittedChanges`, `recomputeVisibility`, the batched initial-data setter ~L1336); `setFilters` (~L803) and `resetAllFilters` (~L1289) are the choke points for filter changes (repo switch reaches `resetAllFilters` via `setRepos` / `resetTopMenuGroup`) |
| Dimmed rendering | `webview-ui/src/components/GraphContainer.tsx` (`badgeKeptOpacity=…`), `CommitTableRow.tsx` |
| Filter panel | `webview-ui/src/components/FilterWidget.tsx` (Always show badged commits lives here) |
| Backend locate | `src/webview/handlers/graphDataHandlers.ts` `locateHead` → `GitLogService.getCommitPosition` (`-1` = not in filtered stream) |
| Commit parsing | `src/services/GitLogService.ts` `LOG_FORMAT`, `buildLogArgs`; `src/utils/gitParsers.ts` `parseCommitLine` |
| RPC types | `shared/messages.ts` |
| Telemetry catalog | `shared/telemetry.ts` (closed catalogs; `goToParent`/`goToChild` already exist), `telemetry.json` |

## 4. Implementation

### 4.1 Store state

Add to `graphStore` (view-scoped):

```ts
/** Commits the user navigated to while the filters hide them; shown dimmed (GH #214). */
revealedCommitHashes: Set<string>;
/** Revealed commits outside the backend-filtered stream, fetched one by one by hash. */
revealedExtraCommits: Commit[];
```

Actions:

- `revealCommit(hash)` — add to the set, `recomputeVisibility()`.
- `addRevealedExtraCommit(commit)` — append (dedupe by hash), add its hash to the set, recompute.
- `clearRevealedCommits()` — empty both, bump a `revealGeneration` counter (§4.5), recompute.
- `setFilters` and `resetAllFilters` empty both and bump the counter. Check whether the filter
  change already triggers a reload/recompute; only recompute explicitly if not.

**Never** put `revealedExtraCommits` into `store.commits`: pagination (`skip`) and
`totalLoadedWithoutFilter` count the loaded stream. Merge them only at visibility/topology time.

### 4.2 Visibility — one generalized "kept" set (decided)

Revealed commits get **exactly** the treatment badge-kept commits already get from all three
consumers, so they share one set rather than a parallel one:

| Consumer | Badge-kept today | Revealed needs |
| --- | --- | --- |
| `GraphContainer` / `CommitTableRow` | dimmed with `badgedCommitOpacity` | same |
| `computeMergedTopology` | a stash whose parent is badge-kept stays hidden | same — a reveal brings back the commit, not other people's stashes |
| `appendCommits` empty-batch count (L676) | not counted as a match (else auto-prefetch walks all history) | same — it is not a filter match |

So: **rename `badgeKeptCommitHashes` → `filterKeptCommitHashes`** (meaning: *fails the Author /
Message filter but is shown, dimmed*) across store, `computeMergedTopology` (`badgeKeptHashes` →
`filterKeptHashes`), rendering props (`badgeKeptOpacity` → `filterKeptOpacity`) and tests — ~34
references in 7 files, mechanical. Update the comments that say "for its badge" to name both reasons.

`computeCommitVisibility`:

- `VisibilityOptions` gains `revealedCommitHashes: ReadonlySet<string>`.
- A commit failing Author/Message is kept (→ `filterKeptCommitHashes`) when
  `alwaysShowBadgedCommits && isBadgedCommit(...)` **or** `revealedCommitHashes.has(hash)`;
  otherwise hidden.
- A revealed *loaded* commit that fails no client-side filter needs nothing — it is simply visible,
  not dimmed.
- Revealed **extra** commits (fetched because they are outside the backend stream) are always in
  `filterKeptCommitHashes`, even with no Author/Message filter: they are outside the filters too, and
  the dimming is what tells the user so. Handle this in the merge helper (§4.3) by passing their
  hashes as always-kept, not by faking a filter failure.
- `setAlwaysShowBadgedCommits` currently recomputes only when an Author/Message filter is active;
  keep that, it is still correct.

### 4.3 Merging extra commits — by date, never above a loaded child

One pure helper, e.g. `mergeRevealedExtraCommits(commits, extras): Commit[]` in
`webview-ui/src/utils/` with tests, used by every store path that runs visibility + topology (extract
one store helper so the six call sites cannot diverge):

- Skip extras whose hash is already in `commits` (it became loaded normally) — and prune them from
  `revealedExtraCommits` in the store when that happens.
- Insert each extra at the date-order position by `timestamp`, but **never above any loaded commit
  that lists it as a parent** (topology requires children before parents). Ties → after.
- Typical results: a parent excluded by `--after` is older than the whole stream → lands at the
  bottom; a HEAD excluded by the Branch filter lands at its date position. If more batches load
  later, re-merging per recompute keeps it in place.
- Because the merged list is recomputed, never stored, loading more pages needs no special handling.

Existence check: if a refresh happens while `revealedExtraCommits` is non-empty, re-validate them with
one batched `git log --no-walk --format=<LOG_FORMAT> --decorate=full <hashes…> --` (same RPC as §4.5,
batched payload) and replace the list with what comes back — this also refreshes their ref badges
and drops commits that no longer exist. Skip entirely when the list is empty. Revealed hashes that
are *loaded* commits need no check: if the commit is gone it is simply not in `commits` any more —
drop such hashes from `revealedCommitHashes` on recompute.

### 4.4 Commit relations

`CommitRelations` (`CommitDetailsPanel.tsx`) passes `state.commits` to `buildParentLinks` /
`buildChildLinks`. Pass `commits` + `revealedExtraCommits` instead (memoized; when the extras list is
empty, pass `commits` itself to keep identity). Update the `commitRelations.ts` header comment: a
child outside the Date filter is not listed (§2), and revealed extras participate.

**Incomplete-children warning.** Add a pure `childrenMayBeIncomplete(filters, isRevealedExtra)` to
`commitRelations.ts` (tested). It is true when:

- `filters.beforeDate` is set — children newer than the range are never loaded; or
- the selected commit is a revealed extra (outside the stream) — its children may also be outside it.

`afterDate` alone does not trigger it for a loaded commit: its children are newer, so they are in
range. The Branch filter never does (a child on an unselected branch is outside what the user asked
to see, same as today). We cannot know whether hidden children actually exist, so the wording says
"may": in the Children row (render the row even when no child is listed), a muted line with the
`warning` codicon in `WARNING_COLOR`:

> Some children may not be shown in the current view.

**The message is deliberately generic — it never names the reason** (maintainer decision). The
predicate is the single place that knows *why*; a future cause of unlisted children is one more
condition inside `childrenMayBeIncomplete`, never a new message. Keep the predicate reason-agnostic
in its name and return type (a boolean, not a reason enum).

When no Date filter is active the row behaves exactly as today.

### 4.5 Navigation flow

All in the one state machine (`headNavigation.ts` + `rpcClient.applyHeadNavigation`), for all three
targets (`head`, `parent`, `child`):

1. `decideLoadedCommitNavigation` / `decideHeadNavigation`: `isHiddenClientSide` → new kind
   `reveal` (replaces `hiddenByFilter`). `applyHeadNavigation` → `store.revealCommit(hash)`, then the
   `scrollTo` behaviour (select, scroll, flash, refresh details panel).
2. `decideHeadContinuation`: `isHiddenClientSide` after a targeted batch → `reveal`.
3. `decideHeadNavigation` after `locateHead`: `index === -1` (not in the filtered stream) → new kind
   `fetchSingle` (replaces that use of `notInView`). `applyHeadNavigation` sends `getCommitsByHash`
   (§4.6); on reply, `addRevealedExtraCommit(commit)` then scroll. Empty reply / error → keep the
   `notInView` toast (genuine stale view).
4. `index === null` (stale displayed-HEAD race), `unresolved` and `unreachable` keep their toasts.
5. `hiddenByFilter` messages become dead — remove them from `HEAD_NAVIGATION_MESSAGES` /
   `relatedCommitMessages` along with the decision kind, and update tests.
6. **Generic "can't show" wording** (same maintainer decision as §4.4): the remaining failures where
   the commit exists but cannot be brought on screen — `notInView` and `unreachable` — share one
   reason-free message per target, e.g. *"The parent commit can't be shown in the current view."*
   (`HEAD` / `child` likewise). The decision kinds stay separate (they are tested and executed
   differently); only the text converges. `unresolved` keeps its own text — it means the commit does
   not exist (empty repo / stale hash), which is a different statement, not a reason for not showing.
6. Go to HEAD's `locateHead` fast path (`displayedHeadHash`) is unaffected.

Stale replies: capture `revealGeneration` (§4.1) with the `getCommitsByHash` request; if it changed
(filters changed / repo switched / chip Hide) by the time the reply lands, drop it and end the
navigation quietly. Reuse the existing fetch-generation mechanism instead if it already covers repo
switches — but it must also cover filter changes.

Busy state: the navigation must stay in its existing `goToHeadState` busy state until the fetch
replies, so a second click cannot start a parallel navigation.

### 4.6 Backend RPC

`shared/messages.ts`:

```ts
| { type: 'getCommitsByHash'; payload: { hashes: string[] } }                 // request
| { type: 'commitsByHash'; payload: { commits: Commit[] } }                   // response
```

One RPC serves both the single navigation fetch and the refresh re-validation (§4.3). Register in
`WebviewMessageRouter` (exhaustive map). Handler in `graphDataHandlers.ts` resolves
`context.services.current().gitLogService` **at request time**. Service method:

```
git log --no-walk --format=<LOG_FORMAT> --decorate=full <hash…> --
```

Reuse `LOG_FORMAT` / `parseCommitLine` so revealed commits carry refs exactly like loaded ones (they
may have badges). Validate every hash as hex before passing it to git; a missing object makes
`git log` fail for the whole batch — on failure, fall back to querying hashes individually or filter
first with `git cat-file --batch-check`; pick the simpler during implementation. Read-only, not a
user operation → no telemetry wrapper, no peer mirroring.

### 4.7 UI

- Dimming: revealed commits use the existing `badgedCommitOpacity` setting through the renamed
  `filterKeptOpacity` prop. No new setting.
- **Chip (decided)**: in `FilterWidget`, directly under the **Always show badged commits** row (the
  related "shown despite the filters" control), render only when `revealedCommitHashes.size > 0`:

  ```
  ◉ 2 revealed commits   [Hide]
  ```

  - Text: `1 revealed commit` / `N revealed commits`, in `descriptionForeground`, with the codicon
    `eye`.
  - `[Hide]`: compact secondary button (`buttonSecondaryClassName` or its compact color variant —
    never a background-less clickable). Calls `clearRevealedCommits()`.
  - Tooltip on the text: *"Shown dimmed because you navigated to them although the filters hide them.
    Cleared when the filters change."*
  - All colors via theme tokens / `themeColors.ts`; must fit a narrow panel (wrap, no overflow).
- The chip is the only new control; the Go to buttons look the same.

### 4.8 Future (not now)

"Always show boundary commits" checkbox = in `computeCommitVisibility`, keep the hidden first parent
of each visible commit in `filterKeptCommitHashes`. One O(n) pass, zero cost when off, same rendering.
Only if users ask.

## 5. Checklist

- [ ] Pure logic in utils with Vitest tests (`__tests__/` beside the code):
  - `commitVisibility` — revealed hash keeps a filter-failing commit; badge + reveal both feed
    `filterKeptCommitHashes`; empty set = unchanged output
  - `mergeRevealedExtraCommits` — date placement, never above a loaded child, dedupe, empty = same array
  - `headNavigation` — `reveal` / `fetchSingle` for `head`, `parent`, `child`; remaining toasts intact
  - `commitRelations` — children found among revealed extras; `childrenMayBeIncomplete` cases
  - store — `setFilters` / `resetAllFilters` / `clearRevealedCommits` clear; refresh keeps; stale
    `commitsByHash` reply after a filter change is dropped
- [ ] Rename `badgeKept*` → `filterKept*` everywhere, comments included
- [ ] Backend: `GitLogService` method + handler + message types; service test with `GitExecutor` mocked
- [ ] Telemetry review: navigations already tracked (`goToParent`, `goToChild`, Go to HEAD's existing
      id). Add a fixed action id for the chip's Hide (e.g. `clearRevealedCommits`) to the closed
      catalog in `shared/telemetry.ts` + `telemetry.json`. Never send hashes or counts beyond a
      coarse bucket
- [ ] `docs/architecture.md`: entries for touched/new files; refresh the "last reconciled" date
- [ ] `CLAUDE.md` *Shared Logic*: the `headNavigation.ts` bullet must say navigation **reveals**
      filter-hidden targets and **fetches** out-of-stream ones, so nobody re-adds the dead-end
      toast; the `filterDisplayRefsBySettings` / `isBadgedCommit` bullet mentions "Always show badged
      commits" — check its wording against the renamed set
- [ ] `CHANGELOG.md` via the maintainer's process. What's New entry only if the maintainer decides —
      never on your own; #214's reporter is a contributor, so **ask** about crediting them
- [ ] `pnpm typecheck && pnpm lint && pnpm test`
- [ ] Manual check in `~/repos/test-repo` (see CLAUDE.md for its location):
  - Author filter hides a parent → Go to parent reveals it dimmed → right-click Reset works →
    auto-refresh keeps it → change any filter clears it
  - Same for Go to child on a hidden child, and Go to HEAD with HEAD hidden by Author filter
  - Date filter excluding the parent → Go to parent fetches it, shown at the bottom, dimmed
  - Branch filter excluding HEAD's branch → Go to HEAD fetches and shows it
  - Chip appears/counts/Hide clears; light theme + narrow panel check

## 6. Decisions log

| Question | Decision |
| --- | --- |
| Option 1 vs option 2 | Option 2 (reveal on navigation); boundary checkbox deferred |
| When is the revealed list cleared | Any filter change, Reset All, repo/submodule switch, chip Hide. Kept across refresh |
| Go to HEAD included | **Yes** (maintainer) |
| Go to child included | **Yes, same as Go to parent** (maintainer). Children outside the Date filter remain unlisted — git has no child pointers and discovering them would cost a history walk |
| Edge cases that can't be shown within the performance rule | **Don't show them; show a warning** (maintainer). Applies to children outside the Date filter (§4.4); every other "can't reach" outcome keeps a toast |
| Warning wording | **Generic, never the specific reason** (maintainer), so new causes reuse the message instead of each needing its own. Children note: *"Some children may not be shown in the current view."*; navigation toasts: *"The <target> commit can't be shown in the current view."* (§4.5 step 6) |
| Separate revealed set vs. shared with badge-kept | Shared, renamed `filterKeptCommitHashes` — all three consumers need identical treatment |
| Chip | Under "Always show badged commits": eye icon, `N revealed commits`, secondary `Hide` button, tooltip |

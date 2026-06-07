# Git Worktree feature phase 2

Status: **clarified / ready for implementation**
Depends on: `046-git-worktrees` (worktree list, panel, create/remove dialogs, RPCs)

## Summary

Phase 1 (046) shipped a Worktree panel plus a per-commit worktree badge
(`WorktreeRowBadge` → `WorktreeBadgeMenu`). That badge is effectively invisible
in practice — a 12px low-contrast monochrome icon, unlabeled when a commit hosts
a single worktree, wedged between the branch badge and the commit message. Users
never notice it.

Phase 2 **replaces** that badge with worktree indicators that live where the user
is already looking: an icon **inside the branch badge** for branch worktrees, and
a dedicated **`detached`** badge for branchless ones. Actions move to the
established **right-click** model used by every other ref in the graph.

## Clarifications

### Session 2026-06-06

- Q: Should Phase 2 keep using the existing public `worktreeByHead` store key or rename it to `worktreesByHead`? → A: Keep `worktreeByHead` as the all-worktrees-by-HEAD lookup to minimize churn; add `worktreeByBranch` and `detachedWorktreesByHead` alongside it.
- Q: Should current linked worktrees be hidden like the main worktree? → A: No. Exclude only `isMain` from rendering lookups. A linked worktree that is also `isCurrent` still shows its indicator; only removal is blocked.
- Q: Which row renderers must get the new branch/detached indicators? → A: Both `CommitRow` and `CommitTableRow` must render the same worktree-enhanced refs and detached badges.
- Q: How should detached worktree badges be styled? → A: Use a neutral ref-badge style with the `WorktreeIcon` as the semantic signal, not a new accent color family.
- Q: Should `CommitTooltip` gain a second badge-style worktree treatment? → A: No. Preserve the existing all-worktrees-at-this-commit tooltip status, updated only as needed for store lookup naming.
- Q: What should happen for prunable worktrees whose folder is missing? → A: Keep showing the badge. `git worktree remove <path>` succeeds for a missing prunable worktree in Git, so the menu may open `RemoveWorktreeDialog`; if removal fails, show the existing error and leave panel-level prune as the fallback.
- Q: How should Worktree panel refresh track overlapping requests? → A: Add explicit worktree-list loading state in the webview store and have `rpcClient` clear it on `worktreeList` or `error`; disable refresh/prune while it is true.

## Goals

- Make it obvious, at a glance, which branches/commits have a linked worktree.
- Let the user open or remove a worktree directly from its badge.
- Let the user manually refresh the Worktree panel's records.
- Remove the old, unnoticed popover badge entirely.
- No backend changes — reuse existing worktree data, RPCs, and dialogs.
- Preserve existing commit-tooltip worktree status unless explicitly replaced by
  an equivalent tooltip implementation.

## Non-goals

- No backend service / RPC changes.
- No create/remove dialog behavior changes beyond launching the existing dialogs
  from the new menu placements.
- No new worktree creation entry points (already covered in 046).

## Background — what exists today (046)

- `graphStore` eagerly loads worktrees on every graph load
  (`WebviewProvider.sendDeferredRepoData` → `listWorktrees()`), and stores them as
  `worktreeList` + `worktreeByHead: Map<commitHash, WorktreeInfo[]>`
  (`buildWorktreeByHead`, includes the main worktree).
- `WorktreeInfo` carries `path`, `head`, `branch` (`refs/heads/<name>` or `''`),
  `isMain`, `isDetached`, `isCurrent`, `isPrunable`.
- `CommitRow.tsx:197` renders `<WorktreeRowBadge hash={commit.hash} />` after the
  ref badges — a **left-click popover** (`WorktreeBadgeMenu`) listing
  "Open in new window" per worktree at that commit.
- Branch badges render via `RefLabel` (icon + label) wrapped in
  `BranchContextMenu` (right-click). `RemoveWorktreeDialog` takes a `WorktreeInfo`
  and handles force-remove + optional branch delete. RPCs `openWorktree(path)` and
  `removeWorktree(path, force)` exist.
- A branch can be checked out in **at most one** worktree (git enforces it), and
  that worktree's HEAD always equals the branch tip — so a branch and its worktree
  are always on the same row. The same **commit** can host multiple **detached**
  worktrees.

## Decisions (settled with user)

1. **Replace** the old `WorktreeRowBadge` / `WorktreeBadgeMenu` popup entirely —
   it does not survive phase 2.
2. **Branch worktree** → worktree icon shown **inside the branch badge**, next to
   the branch icon, with a tooltip exposing the worktree path.
3. **Detached worktree** → a dedicated badge rendered as
   `{icon} detached {folder-name}` for a single detached worktree.
4. **Only linked worktrees** are indicated. The **main** worktree gets no badge
   because the HEAD marker already identifies the active checkout. A linked
   worktree still gets an indicator even when it is the current repo window.
5. **Right-click only** for all worktree actions (matches branches/tags/stashes):
   - *Open Worktree in New Window* → `rpcClient.openWorktree(wt.path)`
   - *Remove Worktree…* → opens the existing `RemoveWorktreeDialog`
6. Label is **`detached`** (the git term), not "detected".
7. Worktree-related right-click actions should be visually grouped together:
   existing *Create Worktree…* entries and the new *Open Worktree in New Window* /
   *Remove Worktree…* entries belong in a dedicated worktree group separated from
   unrelated menu actions by `ContextMenu.Separator`.
8. The Worktree panel remains the source of truth for full worktree records and
   gets a manual refresh affordance next to *Prune*.

## Design

### Data (graphStore)

Add two rendering-focused lookups, both **excluding `isMain`**:

```ts
interface WorktreeLookups {
  // Existing all-worktrees-by-HEAD lookup remains available for tooltip/details
  // surfaces that need to show main/current/linked worktrees by commit.
  worktreeByHead: Map<string, WorktreeInfo[]>;
  // branch name (no refs/heads/) → the one linked worktree checking it out (1:1)
  worktreeByBranch: Map<string, WorktreeInfo>;
  // HEAD commit → detached (branchless) linked worktrees at that commit (array-valued)
  detachedWorktreesByHead: Map<string, WorktreeInfo[]>;
}
```

`buildWorktreeLookups(list)` iterates `worktreeList`: always populate the
existing all-worktrees-by-HEAD map exposed as `worktreeByHead`; for the rendering
lookups, skip `isMain` only; if
`isDetached || !branch` push into `detachedWorktreesByHead[head]`, else set
`worktreeByBranch[stripRefsHeads(branch)]`. Wire it into the same places the old
map was built/reset: initial state, `setWorktreeList`, `setInitialData`,
`setRepos`, `setActiveRepo`, and `setSubmoduleSelection`.

Keep the existing `worktreeByHead` store property name for the all-worktrees
lookup. `CommitTooltip` must continue to receive all worktrees at a commit,
including main/current worktrees.

Add explicit worktree-list loading state, e.g. `worktreeListLoading`, because the
manual Worktree panel refresh must disable overlapping refresh/prune requests
without relying on the graph-wide `loading` flag. `rpcClient.getWorktreeList()`
sets it before sending the request and clears it when either `worktreeList` or
`error` is received.

### Branch badge icon (RefLabel)

`RefLabel` gains an optional `worktree?: WorktreeInfo` prop. When present, render
a trailing `WorktreeIcon` inside the badge (after the label) and append the
worktree path to the badge `title`. Applies to `local-branch` and `merged-branch`
display refs (the local side). The icon inherits the badge's lane color via
`currentColor`, so it stays legible inside the colored badge.

`CommitRow` and `CommitTableRow` look up `worktreeByBranch.get(localName)` per
visible ref and pass it to `RefLabel`. The main worktree is the only worktree
excluded from branch-badge indicators. A linked worktree that is also
`isCurrent` still shows the icon; removal is blocked in the menu.

Refs with linked worktrees should be prioritized into the visible ref slots before
ordinary refs, so the indicator does not disappear behind `OverflowRefsBadge` on
rows with many refs. Preserve the existing relative ordering inside the two
groups: worktree refs first, then ordinary refs. Overflow refs still render the
same worktree-enhanced `RefLabel` inside the popover.

### Branch right-click (BranchContextMenu)

`BranchContextMenu` reads `worktreeByBranch` from the store and, for a local
branch with a worktree, adds two items + mounts `RemoveWorktreeDialog` (same
pattern as the other dialogs already wired there):

- *Open Worktree in New Window*
- *Remove Worktree…*

All worktree actions in right-click menus should appear in a dedicated group.
That group includes the existing *Create Worktree…* item plus the new
*Open Worktree in New Window* and *Remove Worktree…* items when they are
available. Separate the group from unrelated branch/commit mutation actions with
`ContextMenu.Separator` before and/or after the group as needed by the surrounding
menu. If `worktree.isCurrent` is true, keep *Open Worktree in New Window*
available but hide or disable *Remove Worktree…* with a tooltip/title explaining
that the current worktree cannot be removed. Backend validation already rejects
current/main worktree removal, but the badge menu should match `WorktreeWidget`'s
behavior.

### Detached badge + menu

- New `DetachedWorktreeBadge` component: renders `{WorktreeIcon} detached`
  styled like a neutral ref badge, wrapped in a right-click context menu offering
  the same *Open* / *Remove* items and mounting `RemoveWorktreeDialog`.
- `CommitRow` and `CommitTableRow` render detached badges from
  `detachedWorktreesByHead.get(commit.hash)` (alongside the branch/tag badges),
  replacing the old `WorktreeRowBadge` call.
- If multiple detached worktrees share the same HEAD commit, render one aggregate
  badge (`{WorktreeIcon} detached ×N`) instead of repeated identical `detached`
  badges. Its context menu lists each worktree by folder basename + path, with
  per-entry *Open Worktree in New Window* and *Remove Worktree…* actions. This
  keeps the row scannable while still supporting multiple branchless worktrees.
- For a single detached worktree, include the folder basename in the badge label,
  e.g. `{WorktreeIcon} detached 19eae44a9d`. The default detached worktree folder
  name is the 10-character short HEAD hash, with the existing numeric collision
  suffix style (`19eae44a9d-2`) when the folder already exists.
- Factor the shared *Open* / *Remove Worktree* menu items + dialog into a small
  reusable piece used by both `BranchContextMenu` and `DetachedWorktreeBadge`
  (DRY), e.g. a `WorktreeMenuItems` fragment + a `useRemoveWorktreeDialog` hook.

For stale detached worktrees (`isPrunable`), *Open Worktree in New Window* should
be disabled because the folder is missing. *Remove Worktree…* remains available:
`git worktree remove <path>` succeeds for missing prunable worktrees in Git, so
the existing `RemoveWorktreeDialog` can clean the record. If removal still fails,
surface the existing error and leave the Worktree panel's prune action as the
fallback.

### Worktree panel updates (WorktreeWidget)

Add a refresh button in the Worktree panel toolbar next to the existing *Prune*
button. The refresh action reloads all records shown in the panel by invoking the
existing worktree-list refresh path and replacing the panel data with the latest
result. It should not depend on a graph reload.

Use the existing icon-button styling and loading/disabled affordances from the
panel toolbar. If a worktree refresh is already in flight, the refresh button
and prune button are disabled, and the refresh button shows the same loading
affordance used by toolbar icon buttons.

Apply subtle zebra striping to Worktree panel table rows so multi-row worktree
lists are easier to scan. The alternate row background should be low contrast and
theme-aware, preserving hover/selected/error/prunable states as the stronger
visual state when those states are present.

### Removal

Delete `WorktreeBadgeMenu.tsx` and the `WorktreeRowBadge` helper in `CommitRow`.

## Affected files

- `webview-ui/src/stores/graphStore.ts` — new lookups; keep the existing
  all-worktrees-by-HEAD lookup as `worktreeByHead`; add worktree-list loading
  state.
- `webview-ui/src/rpc/rpcClient.ts` — set/clear worktree-list loading state
  around `getWorktreeList()` responses.
- `webview-ui/src/components/RefLabel.tsx` — optional worktree icon + tooltip.
- `webview-ui/src/components/CommitRow.tsx` — pass worktree to `RefLabel`; render
  detached badges; remove `WorktreeRowBadge`.
- `webview-ui/src/components/CommitTableRow.tsx` — same branch icon / detached
  badge behavior as `CommitRow` in table mode.
- `webview-ui/src/components/OverflowRefsBadge.tsx` — preserve worktree icons for
  refs hidden inside the overflow popover.
- `webview-ui/src/components/CommitTooltip.tsx` — keep using the all-worktrees by
  HEAD lookup.
- `webview-ui/src/components/BranchContextMenu.tsx` — worktree menu items + dialog.
- `webview-ui/src/components/CommitContextMenu.tsx` — keep existing
  *Create Worktree…* entries grouped with other worktree actions using separators.
- `webview-ui/src/components/DetachedWorktreeBadge.tsx` — **new**.
- `webview-ui/src/components/WorktreeWidget.tsx` — refresh button next to
  *Prune*; zebra-striped table rows.
- `webview-ui/src/components/WorktreeBadgeMenu.tsx` — **delete**.
- (optional) a shared `WorktreeMenuItems` / `useRemoveWorktreeDialog` helper.

No backend, RPC contract, or shared-type changes.

## Edge cases

- Multiple detached worktrees on one commit → one `detached ×N` aggregate badge
  whose menu exposes per-worktree actions.
- Single detached worktree on one commit → `detached {folder-name}`, where the
  default folder name is the 10-character short hash.
- Merged badge (local ⇄ remote): worktree icon reflects the **local** branch.
- Ref overflow: branches with linked worktrees are prioritized into visible refs;
  if still hidden, their worktree icon appears inside the overflow popover.
- Current linked worktree: show its indicator, allow opening, but do not allow
  deleting it from the badge menu.
- A worktree folder gone stale (`isPrunable`) still shows its badge; *Open* is
  disabled; *Remove Worktree…* opens `RemoveWorktreeDialog` and uses
  `git worktree remove <path>` to clean the missing-folder record. If that fails,
  surface the existing error and leave panel-level prune as the fallback.
- Remote-only badges never carry a worktree icon (a worktree is always a local
  checkout).

## Acceptance checks

- Branch-linked worktrees show a `WorktreeIcon` inside local and merged branch
  badges in both default row mode and table mode.
- The main worktree never creates a branch or detached badge. A current linked
  worktree does create an indicator, but its menu does not allow removal.
- Detached worktrees render as `detached {folder-name}` for one entry and
  `detached ×N` for multiple entries on the same commit.
- Worktree refs are prioritized into visible ref slots before ordinary refs, and
  overflow popovers preserve the same icons and menus.
- Worktree context-menu actions are grouped separately from unrelated branch,
  tag, and commit actions.
- Worktree panel refresh updates panel records without a graph reload and cannot
  overlap with another worktree-list refresh or prune.
- Existing commit tooltip worktree status remains available and still includes
  main/current worktrees.
- `WorktreeBadgeMenu.tsx` and the `WorktreeRowBadge` helper are removed.

## Test focus

- Store lookup tests for `worktreeByHead`, `worktreeByBranch`,
  `detachedWorktreesByHead`, `isMain` exclusion, and reset paths.
- Component tests or focused manual checks for branch icon rendering, detached
  aggregate rendering, overflow preservation, current-worktree remove disabling,
  and table-mode parity.
- Worktree panel checks for refresh loading/disabled state and zebra striping
  without overriding hover/prunable states.

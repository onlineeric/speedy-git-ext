# Git Worktree feature phase 2

Status: **idea / not started**
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

## Goals

- Make it obvious, at a glance, which branches/commits have a linked worktree.
- Let the user open or delete a worktree directly from its badge.
- Remove the old, unnoticed popover badge entirely.
- No backend changes — reuse existing worktree data, RPCs, and dialogs.
- Preserve existing commit-tooltip worktree status unless explicitly replaced by
  an equivalent tooltip implementation.

## Non-goals

- No changes to the Worktree panel (`WorktreeWidget`), create/remove dialogs, or
  any backend service / RPC.
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
   (the HEAD marker already shows the current checkout) → less noise, and avoids a
   redundant icon on the current branch.
5. **Right-click only** for all worktree actions (matches branches/tags/stashes):
   - *Open Worktree in New Window* → `rpcClient.openWorktree(wt.path)`
   - *Delete Worktree…* → opens the existing `RemoveWorktreeDialog`
6. Label is **`detached`** (the git term), not "detected".

## Design

### Data (graphStore)

Add two rendering-focused lookups, both **excluding `isMain`**:

```ts
interface WorktreeLookups {
  // Existing all-worktrees-by-HEAD lookup remains available for tooltip/details
  // surfaces that need to show main/current/linked worktrees by commit.
  worktreesByHead: Map<string, WorktreeInfo[]>;
  // branch name (no refs/heads/) → the one linked worktree checking it out (1:1)
  worktreeByBranch: Map<string, WorktreeInfo>;
  // HEAD commit → detached (branchless) linked worktrees at that commit (array-valued)
  detachedWorktreesByHead: Map<string, WorktreeInfo[]>;
}
```

`buildWorktreeLookups(list)` iterates `worktreeList`: always populate
`worktreesByHead`; for the rendering lookups, skip `isMain`; if
`isDetached || !branch` push into `detachedWorktreesByHead[head]`, else set
`worktreeByBranch[stripRefsHeads(branch)]`. Wire it into the same places the old
map was built/reset: `setWorktreeList`, `setInitialData`, and the three reset
blocks. Rename the old `worktreeByHead` to `worktreesByHead` if helpful, but do
not remove the all-worktrees-by-HEAD data without updating `CommitTooltip` and
any other consumers.

### Branch badge icon (RefLabel)

`RefLabel` gains an optional `worktree?: WorktreeInfo` prop. When present, render
a trailing `WorktreeIcon` inside the badge (after the label) and append the
worktree path to the badge `title`. Applies to `local-branch` and `merged-branch`
display refs (the local side). The icon inherits the badge's lane color via
`currentColor`, so it stays legible inside the colored badge.

`CommitRow` looks up `worktreeByBranch.get(localName)` per visible ref and passes
it to `RefLabel`. (A linked worktree never collides with the main window's current
branch, since git forbids two checkouts of the same branch — so the current branch
correctly shows no icon.)

Refs with linked worktrees should be prioritized into the visible ref slots before
ordinary refs, so the indicator does not disappear behind `OverflowRefsBadge` on
rows with many refs. Overflow refs still render the same worktree-enhanced
`RefLabel` inside the popover.

### Branch right-click (BranchContextMenu)

`BranchContextMenu` reads `worktreeByBranch` from the store and, for a local
branch with a worktree, adds two items + mounts `RemoveWorktreeDialog` (same
pattern as the other dialogs already wired there):

- *Open Worktree in New Window*
- *Delete Worktree…*

The worktree items should appear near the top of the branch menu, before general
branch mutation actions, with a separator after them. If `worktree.isCurrent` is
true, keep *Open Worktree in New Window* available but hide or disable
*Delete Worktree…* with a tooltip/title explaining that the current worktree
cannot be removed. Backend validation already rejects current/main worktree
removal, but the badge menu should match `WorktreeWidget`'s behavior.

### Detached badge + menu

- New `DetachedWorktreeBadge` component: renders `{WorktreeIcon} detached`
  styled like a ref badge, wrapped in a right-click context menu offering the same
  *Open* / *Delete* items and mounting `RemoveWorktreeDialog`.
- `CommitRow` renders one badge per entry in
  `detachedWorktreesByHead.get(commit.hash)` (alongside the branch/tag badges),
  replacing the old `WorktreeRowBadge` call.
- If multiple detached worktrees share the same HEAD commit, render one aggregate
  badge (`{WorktreeIcon} detached ×N`) instead of repeated identical `detached`
  badges. Its context menu lists each worktree by folder basename + path, with
  per-entry *Open Worktree in New Window* and *Delete Worktree…* actions. This
  keeps the row scannable while still supporting multiple branchless worktrees.
- For a single detached worktree, include the folder basename in the badge label,
  e.g. `{WorktreeIcon} detached 19eae44a9d`. The default detached worktree folder
  name is the 10-character short HEAD hash, with the existing numeric collision
  suffix style (`19eae44a9d-2`) when the folder already exists.
- Factor the shared *Open* / *Delete Worktree* menu items + dialog into a small
  reusable piece used by both `BranchContextMenu` and `DetachedWorktreeBadge`
  (DRY), e.g. a `WorktreeMenuItems` fragment + a `useRemoveWorktreeDialog` hook.

For stale detached worktrees (`isPrunable`), disable *Open Worktree in New Window*
or allow it to fail gracefully; *Delete Worktree…* should be tested against a
missing folder. If `git worktree remove <path>` cannot clean up a prunable entry,
the menu should point users to the Worktree panel's prune action instead of
presenting a broken delete path.

### Removal

Delete `WorktreeBadgeMenu.tsx` and the `WorktreeRowBadge` helper in `CommitRow`.

## Affected files

- `webview-ui/src/stores/graphStore.ts` — new lookups; keep an all-worktrees by
  HEAD lookup for tooltip/details consumers, optionally renamed to
  `worktreesByHead`.
- `webview-ui/src/components/RefLabel.tsx` — optional worktree icon + tooltip.
- `webview-ui/src/components/CommitRow.tsx` — pass worktree to `RefLabel`; render
  detached badges; remove `WorktreeRowBadge`.
- `webview-ui/src/components/OverflowRefsBadge.tsx` — preserve worktree icons for
  refs hidden inside the overflow popover.
- `webview-ui/src/components/CommitTooltip.tsx` — keep using the all-worktrees by
  HEAD lookup, or update to the renamed `worktreesByHead`.
- `webview-ui/src/components/BranchContextMenu.tsx` — worktree menu items + dialog.
- `webview-ui/src/components/DetachedWorktreeBadge.tsx` — **new**.
- `webview-ui/src/components/WorktreeBadgeMenu.tsx` — **delete**.
- (optional) a shared `WorktreeMenuItems` / `useRemoveWorktreeDialog` helper.

No backend / RPC / shared-type changes.

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
- A worktree folder gone stale (`isPrunable`) still shows its badge; *Delete* via
  `RemoveWorktreeDialog` handles cleanup only if git supports that path; otherwise
  the badge menu directs users to the panel-level prune action.
- Remote-only badges never carry a worktree icon (a worktree is always a local
  checkout).

## Open questions

- Visual treatment of the `detached` badge — reuse a neutral ref-badge style, or
  give worktree badges a distinct accent so they read as "worktree" not "branch"?
- Should the branch-badge worktree icon also appear in the commit tooltip
  (`CommitTooltip`) / details panel, or badge-only for now?
- Confirm the exact behavior of `git worktree remove <missing-path>` for prunable
  entries on macOS/Linux/Windows; use the Worktree panel's prune action if removal
  cannot clean stale records reliably.

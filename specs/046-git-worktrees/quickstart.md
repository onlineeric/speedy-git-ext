# Quickstart: Git Worktree Management — Manual Smoke Test

Prereqs: `pnpm build`, then launch via "Run Extension" (or "Run Extension (Watch)"). Open the graph on a repo with a few branches. A sibling folder `../<repo>.worktrees/` will be created by default.

## 1. Create a worktree for an existing branch (US1 / P1)

1. Right-click a local branch that is **not** checked out anywhere → **Create worktree…**.
2. Confirm the dialog defaults: source = that branch, mode = "existing branch", path = `../<repo>.worktrees/<branch>`, command preview = `git worktree add "<path>" <branch>`.
3. Confirm → a **new IDE window** opens on the worktree folder.
4. Back in the original window, verify the worktree panel + a graph badge appear without manual refresh.

✅ Pass: folder exists at the sibling path, new window opened, `git worktree list` shows it.

## 2. Worktree panel (US2 / P2)

1. Click the **Worktree** toggle in the toolbar → panel lists every worktree (path, branch/detached, short HEAD).
2. Main worktree shows the `main` badge and has **no** Remove. Current window's worktree shows "you are here" and is non-removable.
3. **Open** on another worktree → opens it in a new window. **Reveal in OS** → opens the folder in the file manager.

✅ Pass: list matches `git worktree list`; main + current non-removable; open/reveal work.

## 3. Create from a commit / tag / remote-only branch (US4, Q4)

1. Right-click a bare commit → dialog defaults to **new branch** mode (editable name), with a **detached** option.
2. Right-click a remote-only branch badge → defaults to new branch named after the remote branch, set to track it.
3. Confirm and verify the worktree is created on the right commit.

✅ Pass: new-branch default for non-branch sources; remote-only creates a tracking local branch.

## 4. Multiple worktrees on one commit (US5, FR-022)

1. Create a **new-branch** worktree from a commit that another branch already points at.
2. The shared commit's row badge menu lists **both** worktrees as separate "Open in new window" targets.

✅ Pass: neither badge target disappears.

## 5. Remove — clean, dirty, and branch deletion (US3 / P2)

1. Remove a **clean** worktree → confirm → folder + list entry gone, graph refreshes.
2. Make a change in another worktree, then Remove it → dialog warns "uncommitted changes will be lost" and requires force; confirm → removed.
3. Remove with **"Also delete branch"** checked → branch gone afterward. For an **unmerged** branch with safe delete: the git error surfaces, the dialog stays open, tick **force delete**, retry → branch deleted (worktree already removed).
4. Detached worktree → the "also delete branch" option is hidden/disabled.

✅ Pass: dirty needs force; unmerged-branch retry works; SC-005 data-loss guards hold.

## 6. Operate from inside a linked worktree (US6)

1. In a worktree window, open the panel → full list shown, main first, current marked, current non-removable.
2. Create a new worktree with defaults → it lands beside the **main** repo (e.g. `../<repo>.worktrees/<new>`), **not** nested inside the current worktree.

✅ Pass: SC-004 — no nesting; anchored to main.

## 7. Prune (FR-015, Q3)

1. Delete a worktree folder from disk outside the IDE.
2. Panel → **Prune** → confirmation lists the stale entry → confirm → entry removed, list refreshes.

✅ Pass: confirmation lists stale entries before pruning.

## 8. Edge / error surfacing

- Create on a branch already checked out elsewhere → dialog defaulted to new-branch; any residual refusal shows a readable message naming the conflicting worktree.
- Check out (in main window) a branch held by a worktree → readable error naming the worktree (not raw stderr).
- Path with spaces → preview quotes it; create succeeds.

## Validation gates (Constitution)

```bash
pnpm typecheck   # zero errors
pnpm lint        # zero errors
pnpm test        # GitWorktreeService + path-composition + gitCommandBuilder unit tests pass
pnpm build       # clean
```

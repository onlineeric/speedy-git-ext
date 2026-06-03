# 046 — Git Worktrees

Idea / brainstorm doc to feed the speckit workflow. Captures the intended UX,
storage convention, and the work needed on top of the existing worktree plumbing.

## Goal

Let users create, open, and remove git worktrees directly from the graph UI,
so they can check out multiple branches/commits side-by-side without switching
the main working tree.

## Basic workflow

The core loop this feature is designed around:

1. **Right-click a branch → "Create worktree…"** for that branch.
2. A **new IDE window opens** on the new worktree.
3. **Work** in that worktree window.
4. **Maybe merge** the branch (or not).
5. Go **back to the previous IDE window**, or **check out another branch** in the
   current IDE.
6. **Remove** the finished worktree when done.

Everything below should keep this loop fast and frictionless; richer worktree
session management is out of scope.

## What already exists

A lot of the plumbing is already in place (read-only):

- `GitWorktreeService.listWorktrees()` parses `git worktree list --porcelain` → `WorktreeInfo[]`
- End-to-end data flow already wired:
  - RPC `getWorktreeList` → response `worktreeList`
  - `graphStore` holds `worktreeList` + a `worktreeByHead: Map<head, WorktreeInfo>`
  - Surfaced today in `CommitTooltip`
- `WorktreeInfo` type in `shared/types.ts` (`path`, `head`, `branch`, `isMain`, `isDetached`)

**Missing:** create, remove (with optional branch delete), prune, and a dedicated
panel + graph badge. Lock/unlock is intentionally deferred (see panel note).

## Key decisions (confirmed)

1. **Storage location:** sibling folder, default `../${repoName}.worktrees/<sanitized-ref>`.
   - Keeps worktrees OUT of the watched working tree (avoids VS Code file-watcher /
     search / build traversal into a nested full checkout — protects the
     "performance first" design principle).
   - Make it a setting: `speedyGit.worktree.basePath` (default `../${repoName}.worktrees`),
     supporting `${repoName}` / `${branch}` tokens.
2. **Open behavior:** new editor window only.
   - `vscode.commands.executeCommand('vscode.openFolder', Uri.file(worktreePath), { forceNewWindow: true })`
   - Works identically in VS Code / Cursor / other forks (shared command).
3. **Graph badge:** commits that are a worktree HEAD get a badge on their row.
   Right-click the badge → "Open in new window" launches an IDE window for that
   worktree. See "Multiple worktrees per commit" below — the lookup must support
   more than one worktree pointing at the same commit.

## Storage details

- **Path composition:** final path = `<basePath>/<sanitized-ref>`.
  - `basePath` is **always a parent directory**; the sanitized ref is **always
    appended** as the leaf folder. There is no `${branch}` token in `basePath`
    (it would duplicate the appended ref). Only `${repoName}` is supported.
  - Default `basePath` = `../${repoName}.worktrees` → e.g.
    `../myrepo.worktrees/feature-foo` (sibling of repo root).
  - **Anchor to the main worktree, not the active repo** — see "Operating from
    within a worktree" below. Both the `..` in `basePath` and the `${repoName}`
    token resolve against the **main worktree** path, never the currently-open
    worktree's path.
- **Sanitize ref:** `feature/foo` → `feature-foo`; on collision append `-2`, `-3`, …
- **No `.gitignore` edits needed** since worktrees live outside the repo tree.

## Operating from within a worktree

When the user opens a worktree in a new IDE window (the checkbox flow), that
window's workspace root becomes `<basePath>/<sanitized-ref>` — a **linked
worktree**, not the main repo. The panel and menus must behave identically there
because git worktrees share one repository database (a linked worktree's `.git`
is a file pointing at `<main>/.git/worktrees/<name>`). Two things already work
for free, and two need explicit handling.

**Works for free (keep relying on it):**

- `git worktree list --porcelain` returns the **full set from any worktree**, so
  `GitWorktreeService.listWorktrees()` (run with `cwd: workspacePath`) shows the
  same list whether the active repo is main or a linked worktree.
- Porcelain output **always lists the main worktree first**, so `isMain: isFirst`
  stays correct regardless of which worktree we're in. `git worktree add/remove`
  likewise operate on the shared repo from any worktree, so create/remove menus
  work unchanged.

**Needs explicit handling:**

1. **Identify the current worktree.** `WorktreeInfo` flags `isMain` but nothing
   marks *which entry is the currently-open one*. Derive it by matching the
   active repo path against each `worktree.path` (expose e.g.
   `currentWorktreePath` / an `isCurrent` flag). Use it to:
   - render a "you are here" marker on the current worktree row, and
   - make the **current worktree non-removable** (in addition to `isMain`) — git
     refuses to remove the worktree you're standing in, same as it refuses to
     remove main.

2. **Anchor path composition to the main worktree.** If `basePath`'s `..` and
   `${repoName}` resolve against the active repo path while inside a worktree,
   new worktrees nest wrongly:
   - From main `/repos/myrepo` → `../myrepo.worktrees` = `/repos/myrepo.worktrees` ✓
   - From worktree `/repos/myrepo.worktrees/feature-x` → `../myrepo.worktrees` =
     `/repos/myrepo.worktrees/myrepo.worktrees` ✗ (nested), and `${repoName}`
     becomes `feature-x` not `myrepo`.

   Always resolve both against the **main worktree** path
   (`worktrees.find(w => w.isMain).path`). "Create worktree…" from inside a
   worktree then drops the new sibling next to the main repo, consistent with
   creating it from the main window.

## Multiple worktrees per commit (badge lookup)

The current store builds `worktreeByHead: Map<head, WorktreeInfo>`
(`graphStore.ts`, `setWorktreeList`). Keying by commit SHA collides: two
worktrees can point at the **same** HEAD commit — exactly what this feature
produces (create a new-branch worktree from a commit another branch/`main`
already points at). With a plain `Map`, the second worktree overwrites the
first and its badge silently disappears.

- Change the lookup to `Map<string, WorktreeInfo[]>` (head → all worktrees at
  that commit), or key by path and derive a per-commit grouping.
- The row badge and its context menu must handle N worktrees on one commit
  (e.g. list each "Open in new window" target).

## Creation workflow

Entry point: right-click a branch / commit / tag badge → **"Create worktree…"**.

Opens a dialog (consistent with existing `*Dialog.tsx` + `CommandPreview` pattern):

- **Source** — prefilled from the clicked badge/commit.
- **Branch mode** (drives the git command, handles git's one-checkout-per-branch rule):
  - *Existing local branch, not checked out elsewhere* → `git worktree add <path> <branch>`
  - *New branch* (default from a commit/tag/remote branch, or when the local
    branch is already checked out elsewhere) → `git worktree add -b <newName> <path> <ref>`
  - *Detached* → `git worktree add --detach <path> <ref>`
- **Target path** — prefilled from `basePath` + sanitized ref, editable.
- **"Open worktree in new window"** checkbox — **default checked**. When checked,
  open the worktree in a new IDE window (`vscode.openFolder` + `forceNewWindow`).
  When **unchecked**, open in the **current** window (`vscode.openFolder` without
  `forceNewWindow`, which replaces the current workspace folder).
- **`CommandPreview`** — live `git worktree add …` string (quote paths with spaces).

After create: open the worktree per the checkbox; refresh worktree list + graph
(see "Refresh after add/remove").

## Worktree panel (list / manage)

New toggle button in `ControlBar` → new `WorktreeWidget.tsx` inside `TogglePanel`
(same pattern as Filter / Search / Compare).

Per-row: path, branch (or "detached"), short HEAD, `main` badge.

Per-row actions:
- **Open** (new window) / **Reveal in OS** (`revealFileInOS`)
- **Remove** → `git worktree remove <path>` (`--force` if dirty) behind a confirm
  dialog. See "Remove dialog" below.
- The **main** worktree (`isMain`) is non-removable

Panel-level action:
- **Prune** stale entries → `git worktree prune`

> **Lock / Unlock is deferred.** It's not part of the core create→work→remove
> loop, and it would require extending the `--porcelain` parser and
> `WorktreeInfo` to carry `locked`/`prunable` state. Locking mainly matters for
> worktrees on removable/network media; for local sibling folders it's overkill.
> Revisit only if a concrete need appears.

## Remove dialog

Confirm dialog before `git worktree remove <path>`:

- If the worktree is **dirty**, removal needs `--force` → show a clear warning
  ("Uncommitted changes will be lost") and require `--force`.
- If the worktree is **currently open in another IDE window**, warn that the
  window will be left pointing at a deleted folder (git still removes it).
- **"Also delete branch `<name>`"** checkbox — **default unchecked**. Hidden /
  disabled for detached worktrees (no branch to delete).
  - When checked, after a successful `git worktree remove`, run
    `git branch -d <name>` (safe delete).
  - **"`-D` force delete"** checkbox — nested, **enabled only when "Also delete
    branch" is checked**, **default unchecked**. When checked, use
    `git branch -D <name>` instead.
  - If safe `-d` is refused (branch not merged), **surface the git error and
    stay on the dialog** so the user can tick "`-D` force delete" and retry.
    The worktree itself is already removed at this point — only the branch
    deletion is retried.

## Graph row badge

- Use the (collision-safe, see above) worktree lookup to mark rows whose commit
  is a worktree HEAD.
- Badge context menu → **"Open in new window"** (`vscode.openFolder` + `forceNewWindow`).
  If multiple worktrees sit on the same commit, list each as its own target.
- Complements the panel; improves discoverability of where a worktree points.

## Service surface to add (`GitWorktreeService`)

Each returns `Result<T, GitError>`:

```ts
addWorktree({ path, ref, newBranch?, detached?, force? }): Promise<Result<void>>
removeWorktree(path, { force? }): Promise<Result<void>>
pruneWorktrees(): Promise<Result<void>>
```

- Branch deletion on remove reuses the existing **`GitBranchService`** delete
  (`-d` / `-D`) rather than living in `GitWorktreeService`; the dialog calls it
  as a separate step after `removeWorktree` succeeds.
- `lockWorktree` / `unlockWorktree` are **deferred** (see panel note above).

Plus matching RPC request/response message pairs in `shared/messages.ts` and
handlers in `WebviewProvider.ts`, mirroring the existing `getWorktreeList` wiring.

## Edge cases

- A branch can be checked out in only one worktree — surface git's refusal clearly;
  default to "create new branch" when the source branch is already checked out.
- **Reverse conflict (checkout in the main IDE):** trying to check out a branch
  in the main working tree while a worktree already holds it makes git refuse.
  That checkout flows through `GitBranchService`, not the worktree code — make
  sure its error surfaces clearly (e.g. "`feature/x` is checked out in worktree
  `../myrepo.worktrees/feature-x`") instead of a raw git error.
- Removing a dirty worktree needs `--force` → confirm with a clear warning.
- Removing a worktree that's open in another IDE window leaves that window
  orphaned → warn in the confirm dialog.
- Worktree deleted externally → offer **Prune**.
- Paths with spaces → quote correctly in `CommandPreview` and when spawning.

## Refresh after add/remove

Worktree changes live under `.git/worktrees/`, which is **inside** `.git` and is
commonly excluded by file watchers — don't rely on `GitWatcherService` to catch
it. On every successful add / remove / prune, **explicitly re-request**
`getWorktreeList` + a graph refresh from the handler. Treat any watcher pickup as
a bonus, not the mechanism.

## Settings

- `speedyGit.worktree.basePath` — default `../${repoName}.worktrees`. **Parent
  directory only**; the sanitized ref is always appended as the leaf folder.
  Supports the `${repoName}` token (no `${branch}` token). Already registered in
  `package.json` `contributes.configuration` (string, default
  `../${repoName}.worktrees`); currently unread until this feature lands.

## Scope note

Opening a folder is a git/workspace action (in-scope), not editor-feature creep.
Keep the feature focused on create / open / list / remove — defer richer
worktree session management to the editor / GitLens.

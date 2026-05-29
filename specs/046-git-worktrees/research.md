# Phase 0 Research: Git Worktree Management

All Technical Context unknowns are resolved below. Each entry: Decision / Rationale / Alternatives.

## R1 — Path composition: backend helper vs frontend string-build

**Decision**: Compose the target path in the backend via a `resolveWorktreePath(ref | desiredLeaf)` helper exposed by a `resolveWorktreePath` RPC. It (a) reads `speedyGit.worktree.basePath`, (b) expands `${repoName}` and resolves a leading `..` against the **main** worktree path, (c) sanitizes the ref to a leaf name, (d) appends a numeric collision suffix when an entry already exists, and returns the absolute path + final leaf name.

**Rationale**: Principle V keeps Node `path` resolution and filesystem-aware collision logic on the extension host. The webview only needs the resolved string to seed the editable field and build the `CommandPreview`. One async RPC on dialog open does not block render (Principle I) and avoids cross-platform path bugs in the webview.

**Alternatives considered**:
- *Frontend string composition* (send `mainWorktreePath` + `basePath` to the webview): rejected — duplicates path logic, fragile on Windows separators, and collision detection needs backend knowledge.
- *Compute once and embed in the worktree list*: rejected — the leaf depends on the chosen ref/new-branch-name, which is only known inside the dialog.

## R2 — Anchor to the main worktree (FR-011)

**Decision**: Both the leading `..` in `basePath` and the `${repoName}` token resolve against `worktrees.find(w => w.isMain).path`, never the active repo path. `${repoName}` = `path.basename(mainWorktreePath)`.

**Rationale**: Creating a worktree from inside a linked worktree must drop the sibling next to the *main* repo, not nest it inside the current worktree (spec example: `/repos/myrepo.worktrees/feature-x` must not yield `…/feature-x/myrepo.worktrees`). The backend already lists worktrees (main is always first in porcelain output), so the main path is reliably available.

**Alternatives considered**: Anchor to `cwd` — rejected; produces nested/duplicated worktrees and wrong `${repoName}` when operating inside a worktree.

## R3 — `isCurrent` detection (FR-013/FR-014)

**Decision**: Enrich `listWorktrees()` with `isCurrent: boolean` by comparing each `worktree.path` to the service's `workspacePath` (the active repo cwd) after normalization (`path.resolve`, strip trailing separator, OS-appropriate case-sensitivity). The current worktree is rendered with a "you are here" marker and is non-removable (in addition to `isMain`).

**Rationale**: git itself refuses to remove the worktree you stand in; surfacing this as a disabled action avoids a guaranteed error. Path-match is the only signal available — there is no porcelain field for "current".

**Alternatives considered**: Frontend comparison — rejected; the webview does not reliably know the canonical active repo path, and normalization belongs with Node `path`.

## R4 — Branch mode selection (FR-002/FR-003/FR-001a)

**Decision**: Three modes drive the git command:
- **Existing local branch** (not checked out elsewhere) → `git worktree add <path> <branch>`
- **New branch** (default for commit/tag/remote-only source, or when the local branch is already checked out elsewhere) → `git worktree add -b <newName> <path> <ref>`
- **Detached** → `git worktree add --detach <path> <ref>`

For a **remote-only** source the dialog defaults to new-branch mode, pre-fills the new name from the remote branch (strip `origin/`), and the created local branch tracks the remote (git sets up tracking automatically when `-b <name> <remote>/<name>`).

**Rationale**: Encodes git's one-checkout-per-branch rule so the common path never hits an error. Mirrors the existing 043 remote-only handling.

**Alternatives considered**: Always `--detach` then branch later — rejected; worse UX, loses tracking.

## R5 — Open in new window / reveal in OS

**Decision**: New thin RPC handlers on the extension host:
- `openWorktree(path)` → `vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path), { forceNewWindow: true })`
- `revealWorktree(path)` → `vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path))`

Always `forceNewWindow: true` (Q2 resolved — no current-window option).

**Rationale**: `vscode.openFolder` is a shared command across VS Code and forks (Cursor, etc.) → SC-006. Must run on the host (Principle V); the webview cannot call workspace commands.

**Alternatives considered**: `env.openExternal` (used today for URLs) — wrong tool; doesn't open a workspace.

## R6 — "Open in another window" warning (FR-017) — accepted limitation

**Decision**: The remove dialog shows a **static** informational caution ("If this worktree is open in another window, that window will be left pointing at a deleted folder") rather than detecting the condition. The **current** window's worktree is detected (R3) and blocked from removal entirely.

**Rationale**: VS Code provides no API to enumerate folders open in other windows. A static caution satisfies the user-facing intent of FR-017 without a false-confidence detection. Documented in plan.md as an accepted limitation, not a constitution violation.

**Alternatives considered**: Lock-file probing of `.vscode`/IPC — rejected; brittle, unsupported, cross-fork-incompatible.

## R7 — Collision-safe per-commit lookup (FR-022/FR-023)

**Decision**: Change `worktreeByHead` from `Map<string, WorktreeInfo>` to `Map<string, WorktreeInfo[]>` in `graphStore` (`setWorktreeList` and `setBatchData`). The row badge renders when the array is non-empty; the badge context menu lists one "Open in new window" target per entry. Update `CommitTooltip`'s `WorktreeSection` to read the array (show first / list all).

**Rationale**: Two worktrees can point at the same HEAD commit — exactly what new-branch-from-commit produces. A scalar map silently drops the second. Array-valued map is O(1) lookup, preserving Principle I.

**Alternatives considered**: Key by path + derive grouping per render — rejected; extra per-row work, worse for virtual scrolling.

## R8 — Dialog reuse vs new components

**Decision**: Two new dialogs — `CreateWorktreeDialog` (source display, branch-mode radio, editable path, live `CommandPreview`) and `RemoveWorktreeDialog` (force warning when dirty, "also delete branch" + nested "force delete", retry-on-unmerged keeping the dialog open). **Prune** reuses `ConfirmDialog` with a rendered list of stale entries.

**Rationale**: Create and Remove have inputs/branching that `ConfirmDialog` cannot express (Principle II favors reuse, but these genuinely need bespoke forms — same judgment as existing `DeleteBranchDialog`). Prune is a yes/no with a list → `ConfirmDialog` fits.

**Alternatives considered**: One mega-dialog — rejected; violates single-responsibility.

## R9 — Dirty-worktree detection for the remove force gate (FR-016)

**Decision**: Determine dirtiness by attempting `git worktree remove <path>` without `--force` first; if git refuses because the worktree is dirty/locked, surface that and require the user to confirm force (`--force`). Alternatively pre-check via `git status --porcelain` in that worktree to drive the warning *before* the first attempt.

**Rationale**: Reuse the existing `isDirtyWorkingTree` query pattern (`utils/gitQueries.ts`) against the target worktree path to show the warning proactively, then run remove with `--force` when the user accepts. Avoids a confusing two-step failure.

**Alternatives considered**: Always pass `--force` — rejected; defeats the data-loss guard (SC-005).

## R10 — Branch deletion on remove (FR-018/FR-019/FR-020)

**Decision**: After `removeWorktree` succeeds, if "also delete branch" is checked, the dialog calls the existing `GitBranchService.deleteBranch(name, force)` as a **separate** step. Safe `-d` first; if it returns `BRANCH_NOT_FULLY_MERGED`, surface the error and keep the dialog open so the user can tick "force delete" and retry **only** the branch deletion (worktree already removed).

**Rationale**: Reuses the existing, already-tested delete path including its `BRANCH_NOT_FULLY_MERGED` error code (Principle II/III). No new deletion logic in the worktree layer.

**Alternatives considered**: A combined `removeWorktreeAndBranch` backend op — rejected; couples two concerns and complicates the retry semantics.

## R11 — Settings plumbing

**Decision**: Add `worktreeBasePath: string` to `UserSettings` + `DEFAULT_USER_SETTINGS` (`'../${repoName}.worktrees'`), add `speedyGit.worktree.basePath` to the `ExtensionController` settings read list, and read it in the path-composition helper. The setting key is already registered in `package.json`.

**Rationale**: Follows the existing settings provider flow (`getSettingsHandler` → `sendSettingsData`). Backend reads the raw setting for path composition; the webview never needs the raw template.

**Alternatives considered**: Read `getConfiguration` directly inside `GitWorktreeService` — acceptable, but routing through the established settings list keeps one source of truth.

## R12 — Refresh after mutations (FR-007/FR-021/FR-025)

**Decision**: In each successful `addWorktree` / `removeWorktree` / `pruneWorktree` RPC handler, explicitly (a) re-run `listWorktrees` and post `worktreeList`, and (b) call `sendInitialData()` to refresh the graph (badges). Do not depend on `GitWatcherService`.

**Rationale**: Worktree metadata lives under `.git/worktrees/`, commonly excluded by watchers. Explicit refresh guarantees SC-002. Reuses the existing `sendInitialData` refresh path.

**Alternatives considered**: Watcher-only — rejected; unreliable, violates SC-002.

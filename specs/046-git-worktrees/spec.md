# Feature Specification: Git Worktree Management

**Feature Branch**: `046-git-worktrees`
**Created**: 2026-05-29
**Status**: Draft
**Input**: User description: "read @specs/046-git-worktrees-idea.md, re-investigate the whole feature and workflow, make best decisions to create our spec (not strictly following the idea spec). Document anything uncertain for the next clarify step."

## Overview

Today the extension can only *read* worktrees: it lists them and surfaces them in a commit tooltip. Users cannot create, open, or remove worktrees from the graph. This feature closes that gap so a user can keep several branches checked out side-by-side — each in its own folder and IDE window — without disturbing their main working tree.

The feature is built around one fast loop:

1. Right-click a branch (or commit / tag) → **Create worktree…**
2. A new IDE window opens on the new worktree.
3. The user works in that window (and may merge the branch, or not).
4. The user returns to the original window, or checks out another branch.
5. When finished, the user removes the worktree (optionally deleting its branch).

Richer worktree *session* management (locking, naming schemes, multi-window orchestration) is explicitly out of scope; it is left to the editor / GitLens.

## Clarifications

### Session 2026-05-29

- Q: Default base ref for new-branch worktrees — clicked source ref vs. a fixed integration branch like `dev`? → A: Default base = the clicked source ref (the commit/tag/branch the user right-clicked); the new branch starts exactly where they clicked.
- Q: Should the create dialog offer "open in current window", or always open a new window? → A: Always open in a new window. Drop the checkbox entirely to keep the flow simple and avoid handling unsaved-file / workspace-replacement edge cases.
- Q: Should Prune run silently, and where is it offered? → A: Panel-level Prune button that shows a confirmation listing the stale entries to be pruned before running.
- Q: Can a worktree be created from a remote-only branch badge? → A: Yes. Offer Create worktree… on remote-only badges; it creates a new local branch tracking the remote (named after the remote branch), consistent with the existing fast-forward (043) pattern.
- Q: Should the target-path field have a native folder picker? → A: No. A plain editable text field pre-filled with the suggested default, matching the existing dialog + command-preview pattern.
- Q: If the target path's parent directory does not exist, create it or error? → A: Rely on git, which creates missing intermediate directories itself; surface a readable error only if the operation fails (e.g. permissions).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a worktree for an existing branch and open it (Priority: P1)

A user right-clicks a local branch in the graph and chooses **Create worktree…**. A dialog appears pre-filled with the branch as the source and a suggested target folder. The user confirms; the extension creates the worktree and opens it in a new IDE window so they can work on that branch alongside their current one.

**Why this priority**: This is the core value of the feature — getting a second branch checked out in its own window with one gesture. Without it, nothing else matters. It is the minimum viable slice.

**Independent Test**: Right-click a branch that is not checked out anywhere, run Create worktree…, confirm the dialog, and verify a new folder is created at the expected sibling location, a new IDE window opens on it, and `git worktree list` shows the new entry.

**Acceptance Scenarios**:

1. **Given** a local branch not checked out in any worktree, **When** the user runs Create worktree… and confirms with defaults, **Then** a worktree is created at `<basePath>/<sanitized-branch>`, opened in a new IDE window, and the worktree list and graph refresh to show it.
2. **Given** the create dialog is open, **When** the user reviews it, **Then** a live preview of the exact `git worktree add …` command is shown (paths with spaces quoted).
3. **Given** the chosen branch is already checked out in another worktree, **When** the dialog opens, **Then** it defaults to "create a new branch" mode (because git forbids checking out one branch in two worktrees) rather than failing on confirm.
4. **Given** the create operation fails (e.g. target path exists and is non-empty), **When** the error returns, **Then** the user sees a clear, human-readable message and the dialog stays open.

---

### User Story 2 - View and manage worktrees in a dedicated panel (Priority: P2)

A user opens a worktree panel from the toolbar and sees every worktree for the repository: its folder path, branch (or "detached"), short HEAD, and which one is the main worktree. From here they can open a worktree in a new window, reveal its folder in the OS file manager, or remove it.

**Why this priority**: Once worktrees exist, users need one place to see and act on them. It makes the feature discoverable and gives a home for remove/prune actions. It builds directly on the existing read-only worktree list.

**Independent Test**: With two or more worktrees present, open the panel and confirm every worktree is listed with correct path/branch/HEAD, the main worktree is marked and non-removable, and Open / Reveal actions launch correctly.

**Acceptance Scenarios**:

1. **Given** several worktrees exist, **When** the user opens the worktree panel, **Then** each worktree is listed with path, branch (or "detached"), short HEAD, and a badge on the main worktree.
2. **Given** the panel is open, **When** the user chooses Open on a non-current worktree, **Then** it opens in a new IDE window.
3. **Given** the panel is open, **When** the user chooses Reveal in OS, **Then** the worktree folder opens in the system file manager.
4. **Given** the main worktree row, **When** the user looks for a Remove action, **Then** it is unavailable (the main worktree cannot be removed).

---

### User Story 3 - Remove a worktree, optionally deleting its branch (Priority: P2)

A user removes a worktree they are done with. A confirmation dialog explains the consequences (especially for dirty or open worktrees) and offers to also delete the worktree's branch. The extension removes the worktree, optionally deletes the branch, and refreshes.

**Why this priority**: Removal closes the create→work→remove loop and prevents stale worktrees from accumulating. It is paired with US2 (the panel hosts the action) but is a distinct, independently testable slice with its own safety rules.

**Independent Test**: Remove a clean worktree and confirm the folder and `git worktree list` entry are gone; remove a dirty worktree and confirm a force warning is required; tick "also delete branch" and confirm the branch is gone afterward.

**Acceptance Scenarios**:

1. **Given** a clean, non-current worktree, **When** the user confirms removal, **Then** the worktree is removed and the list/graph refresh.
2. **Given** a worktree with uncommitted changes, **When** the user opens the remove dialog, **Then** a clear "uncommitted changes will be lost" warning is shown and removal requires an explicit force confirmation.
3. **Given** the remove dialog with "Also delete branch `<name>`" checked, **When** removal succeeds, **Then** the branch is deleted with a safe delete; the option is hidden/disabled for detached worktrees.
4. **Given** a safe branch delete is refused because the branch is unmerged, **When** the error returns, **Then** the worktree is already removed, the git error is surfaced, the dialog stays open, and the user can enable a force-delete and retry only the branch deletion.
5. **Given** a worktree currently open in another IDE window, **When** the user removes it, **Then** the dialog warns that the other window will point at a deleted folder before proceeding.

---

### User Story 4 - Create a worktree from a commit or tag (Priority: P3)

A user right-clicks a commit or a tag badge and chooses Create worktree…. Because a bare commit/tag has no branch to check out, the dialog defaults to creating a new branch from that point (or a detached worktree on request).

**Why this priority**: Extends creation beyond branches to any point in history. Valuable but secondary to the branch-driven core loop.

**Acceptance Scenarios**:

1. **Given** the user right-clicks a commit, **When** the dialog opens, **Then** "new branch" mode is the default with the commit as the source ref, and a detached-worktree option is available.
2. **Given** the user right-clicks a tag, **When** they confirm in new-branch or detached mode, **Then** the worktree is created on that tag's commit.

---

### User Story 5 - See where worktrees point in the graph (Priority: P3)

A commit whose HEAD is checked out in one or more worktrees shows a badge on its graph row. Right-clicking the badge offers to open the corresponding worktree window(s). Because two worktrees can sit on the same commit, the badge handles multiple targets.

**Why this priority**: Improves discoverability and orientation but is a complement to the panel, not a prerequisite for the core loop.

**Acceptance Scenarios**:

1. **Given** a commit that is the HEAD of a worktree, **When** the graph renders, **Then** that row shows a worktree badge.
2. **Given** two worktrees point at the same commit, **When** the user opens the badge menu, **Then** both worktrees are listed as separate "open in new window" targets (neither is hidden).

---

### User Story 6 - Manage worktrees while working inside a linked worktree (Priority: P3)

A user is working in a window opened on a linked worktree (not the main repo). The panel, create, and remove actions behave exactly as they do from the main window: the same full worktree list is shown, the currently-open worktree is marked "you are here" and cannot be removed, and newly created worktrees still land beside the main repo rather than nesting inside the current worktree.

**Why this priority**: Correctness guarantee for a natural usage pattern (the feature itself produces these extra windows). Lower priority because it refines behavior already largely correct rather than adding a new user-facing capability.

**Acceptance Scenarios**:

1. **Given** the active window is a linked worktree, **When** the panel opens, **Then** the full set of worktrees is shown with the main worktree first and the current worktree marked.
2. **Given** the active window is a linked worktree, **When** the user tries to remove the current worktree, **Then** the action is unavailable (git refuses to remove the worktree you are standing in).
3. **Given** the active window is a linked worktree, **When** the user creates a new worktree with default settings, **Then** the new folder is placed beside the **main** repo (not nested inside the current worktree), consistent with creating it from the main window.

---

### Edge Cases

- **Branch already checked out elsewhere**: creating a worktree directly on that branch is refused by git; the dialog defaults to "new branch" to avoid the failure, and any residual refusal is surfaced clearly.
- **Reverse conflict — checkout in the main window**: trying to check out (in the main working tree) a branch that a worktree already holds is refused by git. This flows through the existing checkout path, not the worktree code; the error MUST be surfaced clearly (e.g. "`feature/x` is checked out in worktree `…/feature-x`") rather than as a raw git error.
- **Dirty worktree removal**: requires explicit force with a data-loss warning.
- **Worktree open in another window during removal**: that window is left pointing at a deleted folder; warn before proceeding.
- **Worktree folder deleted outside the extension**: the entry becomes stale; the user can prune it.
- **Target path collision**: the suggested folder name collides with an existing one → a numeric suffix is appended (`-2`, `-3`, …); if the user edits the path to an existing non-empty folder, git's error is surfaced.
- **Missing parent directory**: if the target path's parent does not exist, git creates the intermediate directories itself; only a genuine failure (e.g. permissions) surfaces an error.
- **Paths containing spaces**: quoted correctly in the command preview and when the command is run.
- **Multiple worktrees on one commit**: both are tracked and shown; neither overwrites the other.
- **Worktree changes not caught by the file watcher**: worktree metadata lives inside `.git`, which watchers commonly ignore; the list and graph MUST be refreshed explicitly after every create/remove/prune rather than relying on the watcher.

## Requirements *(mandatory)*

### Functional Requirements

#### Creation

- **FR-001**: Users MUST be able to start worktree creation from a right-click on a local branch, a remote-only branch badge, a commit, or a tag badge in the graph, via a "Create worktree…" action.
- **FR-001a**: When the source is a remote-only branch, the dialog MUST default to "new branch" mode, pre-filling the new branch name from the remote branch and setting it to track that remote.
- **FR-002**: The create dialog MUST pre-fill the source ref from the clicked item and offer three branch modes: (a) check out an existing local branch that is not checked out elsewhere, (b) create a new branch from the source ref, (c) create a detached worktree at the source ref.
- **FR-003**: When the source branch is already checked out in another worktree, or when the source is a bare commit/tag/remote branch, the dialog MUST default to "new branch" mode.
- **FR-004**: The create dialog MUST show a suggested target folder path (derived from the configured base path plus a sanitized ref name) in a plain editable text field, with no native folder picker.
- **FR-005**: After creation, the worktree MUST always open in a new IDE window. The dialog offers no "open in current window" option, avoiding workspace-replacement and unsaved-file edge cases.
- **FR-006**: The create dialog MUST display a live preview of the exact git command that will run, with paths containing spaces quoted correctly.
- **FR-007**: After a successful create, the extension MUST open the worktree in a new IDE window and MUST explicitly refresh the worktree list and graph.

#### Path composition & settings

- **FR-008**: The target path MUST be composed as `<basePath>/<sanitized-ref>`, where `basePath` is a parent directory and the sanitized ref is always appended as the leaf folder.
- **FR-009**: The base path MUST be configurable via the existing `speedyGit.worktree.basePath` setting (default `../${repoName}.worktrees`), supporting a `${repoName}` token and resolving relative paths against the main worktree. There is no `${branch}` token.
- **FR-010**: Ref sanitization MUST convert path separators and unsafe characters into a filesystem-safe leaf name (e.g. `feature/foo` → `feature-foo`) and resolve collisions by appending a numeric suffix.
- **FR-011**: Path composition (both the leading `..` and the `${repoName}` token) MUST resolve against the **main** worktree's path, never the currently-open worktree's path, so worktrees created from inside a linked worktree are placed beside the main repo.

#### Panel & listing

- **FR-012**: A new toolbar toggle MUST open a worktree panel that lists every worktree with its path, branch (or "detached"), short HEAD, and a marker on the main worktree.
- **FR-013**: The panel MUST mark which worktree is the currently-open one ("you are here").
- **FR-014**: Each non-main, non-current worktree row MUST offer Open (new window), Reveal in OS, and Remove actions. The main worktree and the current worktree MUST NOT be removable.
- **FR-015**: The panel MUST offer a panel-level Prune action that, before running, shows a confirmation listing the stale entries (worktrees whose folders no longer exist) that will be pruned; after confirmation it prunes them and explicitly refreshes.

#### Removal & branch deletion

- **FR-016**: Removing a worktree MUST be confirmed via a dialog. If the worktree is dirty, the dialog MUST warn about data loss and require an explicit force confirmation.
- **FR-017**: If the worktree being removed is open in another IDE window, the dialog MUST warn that the other window will be left pointing at a deleted folder.
- **FR-018**: The remove dialog MUST offer an "Also delete branch `<name>`" option (unchecked by default), hidden/disabled for detached worktrees, with a nested "force delete" sub-option (unchecked by default, enabled only when "also delete branch" is checked).
- **FR-019**: Branch deletion MUST occur only after the worktree is successfully removed, reusing the existing branch-delete capability (safe delete by default, force delete when chosen).
- **FR-020**: If a safe branch delete is refused because the branch is unmerged, the extension MUST surface the git error and keep the dialog open so the user can enable force delete and retry the branch deletion alone (the worktree is already removed).
- **FR-021**: After a successful remove or prune, the extension MUST explicitly refresh the worktree list and graph.

#### Graph badge

- **FR-022**: Commits that are the HEAD of one or more worktrees MUST display a worktree badge on their graph row, using a lookup that supports multiple worktrees per commit without one overwriting another.
- **FR-023**: The badge's context menu MUST offer "Open in new window"; when multiple worktrees sit on the same commit, each MUST be listed as a separate target.

#### Error handling & refresh

- **FR-024**: All worktree operations MUST surface git failures as clear, human-readable messages rather than raw error text, including the branch-checked-out-elsewhere conflict in both directions.
- **FR-025**: The extension MUST NOT rely on the file watcher to detect worktree changes; refreshes after create/remove/prune MUST be explicitly requested.

### Out of Scope

- Locking / unlocking worktrees (deferred; would require extending the worktree metadata parser and matters mainly for removable/network media).
- Renaming or moving existing worktrees.
- Multi-window session orchestration beyond opening a single folder.
- Editor-feature integration beyond opening a folder (left to GitLens / the editor).

### Key Entities *(include if feature involves data)*

- **Worktree**: A checkout of the repository living in its own folder. Attributes: folder path, HEAD commit, branch (or detached), is-main flag, and (new) is-current flag relative to the active window. Several worktrees can share one HEAD commit.
- **Worktree creation request**: The user's intent to create a worktree. Attributes: source ref, branch mode (existing / new branch / detached), new branch name (when applicable), target path, and open-in-new-window preference.
- **Worktree removal request**: The user's intent to remove a worktree. Attributes: target worktree, force flag (for dirty trees), delete-branch flag, and force-delete-branch flag.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a worktree for an existing branch and have it open in a new window in 3 interactions or fewer (right-click → confirm dialog → window opens).
- **SC-002**: The worktree panel reflects the true state of `git worktree list` within one refresh cycle after any create, remove, or prune — with zero stale or missing entries, including when two worktrees share a commit.
- **SC-003**: 100% of worktree operation failures are presented as readable messages (no raw stderr shown to the user), and the branch-checked-out-elsewhere conflict names the conflicting worktree.
- **SC-004**: Creating a worktree from inside a linked worktree window places the new folder beside the main repo in 100% of cases (never nested inside the current worktree).
- **SC-005**: Removing a dirty worktree is impossible without an explicit force confirmation, and deleting an unmerged branch is impossible without an explicit force confirmation — preventing accidental data loss.
- **SC-006**: Opening worktrees from the graph performs identically across VS Code and its forks (Cursor, etc.), since it uses the shared open-folder workspace command.

## Assumptions

- **Default base for new branches**: When "new branch" mode is used, the new branch is created from the clicked source ref by default (resolved in Clarifications). The recorded `dev`-default preference applies to the generic "new branch" action, not to this branch-from-here gesture.
- **Open behavior is the shared workspace open-folder action**, which behaves identically in VS Code and forks (Cursor, etc.); this is treated as a git/workspace action and therefore in scope.
- **Worktrees live outside the watched working tree** (sibling folder by default), preserving the "performance first" principle by keeping a second full checkout out of file-watcher / search / build traversal. No `.gitignore` edits are needed.
- **Existing read-only plumbing is reused**: the worktree list parser, the `getWorktreeList` data flow, and the store's worktree state already exist; this feature adds create/remove/prune and the per-commit-collision-safe lookup, panel, badge, and dialogs on top.
- **Branch deletion reuses the existing branch-delete capability** rather than introducing a new one in the worktree layer.
- **Prune is a safe metadata cleanup** (it only removes records for already-missing folders); a confirmation listing the stale entries is shown for transparency rather than as a force/data-loss guard.

## Clarification Log

All open questions have been resolved in the Clarifications section (Session 2026-05-29). Tracking summary:

- **Q1 — Default base ref for new-branch worktrees** ✅ Resolved: default base = the clicked source ref.
- **Q2 — "Open in current window" option** ✅ Resolved: always open in a new window; the option is dropped.
- **Q3 — Prune scope and confirmation** ✅ Resolved: panel-level Prune with a confirmation listing the stale entries to be pruned.
- **Q4** ✅ Resolved: yes — remote-only badges offer Create worktree…, creating a new local branch tracking the remote.
- **Q5** ✅ Resolved: plain editable text field, no folder picker.
- **Q6** ✅ Resolved: rely on git to create intermediate directories; surface an error only on genuine failure.

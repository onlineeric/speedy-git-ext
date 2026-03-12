# Changelog

All notable changes to the "speedy-git-ext" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]
- None yet.

## [0.7.0] - 2026-03-12

### Added
- Revert any commit via right-click context menu, creating a new commit that undoes the selected commit's changes without rewriting history.
- Merge commit revert displays a parent selection dialog showing each parent's number, short hash, and commit message for precise undo targeting.
- Revert conflict detection with "Abort Revert" and "Continue Revert" notification actions; conflict resolution uses VS Code's built-in merge editor.
- Revert blocked with a warning when uncommitted changes exist, prompting the user to commit or stash first.
- GPG and SSH commit signature verification displayed on-demand in the commit details panel when selecting a commit.
- Signature status uses a simplified 4-level model: Good (green "Verified"), Bad (red "Invalid Signature"), Unknown (yellow "Unverified"), and None (no signature section shown).
- Signature details show signer name, key ID, and signature format (GPG or SSH); data is cached within the session and cleared on graph refresh.
- Graceful fallback ("Verification unavailable") when GPG or SSH verification tools are not installed on the system.
- Drop any non-merge, non-root commit on the current branch via right-click "Drop Commit" context menu item.
- Drop commit confirmation dialog warns about history rewriting; includes an additional force-push warning for already-pushed commits.
- Drop commit uses interactive rebase under the hood with full conflict handling (Abort Rebase / Continue Rebase actions).
- "Drop Commit" automatically disabled for merge commits, root commits, and commits not on the current branch.
- Revert and drop operations blocked when another Git operation (rebase, merge, cherry-pick) is already in progress.

## [0.6.0] - 2026-03-12

### Added
- Merge dialog now includes a "No commits, stage changes only" checkbox and a merge strategy toggle (Fast forward if possible / Create a new commit even if fast forward is possible) for full control over merge history.
- Checking out a remote-only branch automatically creates a local tracking branch (e.g., `origin/branch-1` → `branch-1`) without requiring a dialog.
- Checking out a branch that has both local and remote counterparts shows a dialog with a Pull / No pull toggle (Pull selected by default).
- If `git pull` fails due to an unreachable remote during checkout, an error notification is shown with a "Checkout without pull" fallback action.
- When initiating a checkout with uncommitted local changes that would be overwritten, the extension prompts to stash changes first; declining aborts the checkout with no changes made.
- "Merge into Current Branch" and "Checkout Branch" context menu items are hidden when right-clicking the currently checked-out branch.

### Fixed
- Loaded commit count now resets correctly when the branch filter changes, ensuring infinite scroll resumes properly for the newly selected branch filter.

## [0.5.0] - 2026-03-10

### Added
- Branch labels now display a branch icon, making it instantly clear whether a label is a local branch, remote branch, or merged local+remote pair.
- Tag labels now display a tag icon for quick visual identification.
- When a local branch and its remote counterpart (`origin/<name>`) share the same commit, they are merged into a single label (e.g., `main ⇄ origin`) instead of two separate labels, reducing visual clutter for tracked branches.
- When a local branch matches multiple remotes, all remote host names are listed in one merged label (e.g., `main ⇄ origin, upstream`); full qualified names are available on hover.
- The currently checked-out commit (HEAD) is highlighted with a visually larger graph node dot for immediate identification in long commit lists.
- A HEAD indicator icon appears as the first element on the checked-out commit's row, before any branch/tag labels and the commit message.
- HEAD visual indicators (enlarged dot and icon) update automatically after checkout operations, including detached HEAD state.

## [0.4.0] - 2026-03-10

### Added
- Commit counter in the top bar now shows `{n} loaded commits` (e.g., `2000 loaded commits`), reflecting the total commits fetched from the repository regardless of any active branch or author filter.
- Repo selector dropdown in the top menu lists all git repositories detected by VSCode (matching the Source Control panel list and order); hidden automatically when only one repo is present.
- Switching repositories via the dropdown reloads the commit graph in-panel without closing or reopening it; a loading overlay covers the graph area while the top menu remains fully interactive.
- Branch and author filters reset to "All Branches" automatically whenever the active repository changes.
- Repository list in the dropdown updates dynamically when repos are added to or removed from the workspace; if the currently displayed repo is removed, Speedy Git switches to the next available repo and shows a notification.
- Repositories sharing the same folder name are disambiguated in the dropdown using their relative path from the workspace root (e.g., `apps/packages` vs `libs/packages`).
- Lightning bolt icon ("Open in Speedy Git") in the Source Control panel inline actions for each detected repository; clicking it opens or focuses Speedy Git on that repo without resetting filters if the repo is already shown.
- `⚡ Speedy Git` button in the VS Code status bar opens or focuses the Speedy Git panel; hidden when no git repositories are detected in the workspace.
- In multi-root workspaces, clicking the status bar button opens Speedy Git for the repository of the currently active editor file.

## [0.3.0] - 2026-03-06

### Added
- Configurable batch commit size via VS Code Settings (`speedyGit.batchCommitSize`, default 500).
- Gear icon button in the toolbar opens the extension's Settings section directly.
- Background prefetch: the next batch loads automatically when the scroll position enters the last loaded batch, eliminating visible pauses during normal scrolling.
- Monotonic generation counter discards stale in-flight fetch results when filters change or a refresh is triggered mid-load.
- "Retry" action on the VS Code error notification when a batch fetch fails.
- Added this Changelog file to document future changes.

## [0.2.0] - 2026-03-05

### Added
- Extension icon and marketplace branding.
- Reset current branch to any commit with three modes: Soft (keep staged), Mixed (keep unstaged), and Hard (discard all changes).
- Cherry-pick: single-commit and multi-commit selection, with `-x` (append source reference) and `--no-commit` (stage only) options.
- Cherry-pick conflict detection: pauses with a banner showing conflicted files and provides Continue / Abort actions.
- Standard rebase: rebase the current branch onto any other branch via right-click context menu on the target branch label.
- Interactive rebase: drag-and-drop commit reordering with pick, squash, fixup, reword, and drop actions.
- Rebase conflict handling: pauses with a conflict banner and provides Continue / Abort actions.

### Fixed
- Dependency updates and rebase stability improvements.

## [0.1.0] - 2026-02-28

### Added
- Interactive Git history graph with virtual scrolling via `@tanstack/react-virtual`.
- Branch operations: create, rename, delete, checkout (local and remote tracking), and merge.
- Tag operations: create lightweight and annotated tags, delete, and push to remote.
- Stash operations: apply, pop, and drop stash entries displayed inline in the graph.
- Commit details panel (bottom or right) with file change list and diff viewer.
- Remote operations: fetch and push with upstream configuration.
- Pull operation for the currently checked-out branch (HEAD) via right-click context menu on the branch label.
- Remote management dialog: add, remove, and edit remotes without leaving the extension.

# Changelog

All notable changes to the "speedy-git-ext" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]
- None yet.

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

# Changelog

All notable changes to the "speedy-git-ext" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Filter by Author, date range.
- Search result switch between highlight and filter.
- Compare branches, commits, HEAD, etc.

## [2.0.0] - 2026-04-04

### Added
- Table-style commit list view with resizable columns, column reordering, and column visibility controls — customize which commit metadata (graph, hash, message, author, date) is shown and how wide each column appears.
- Double-click a column boundary to auto-fit the column width to its widest content across all loaded commits.
- Column chooser to show or hide optional columns; hidden columns restore with their last saved width and position when re-enabled.
- Per-repository column layout preferences (widths, order, visibility) persist across sessions and webview reloads.
- Commit list settings popover in the toolbar for switching between classic and table-style views and configuring table columns, operating independently from filter/search/compare panels.
- Icon-only buttons for all control bar actions (Filter, Search, Refresh, Fetch, Compare, Manage Remotes, Settings) with tooltips on hover, replacing text labels for a cleaner toolbar.
- Toggle panel below the control bar that displays one widget at a time — click Filter, Search, or Compare to open the corresponding panel; click again to close.
- Clicking a different toggle button while a panel is open switches to the new widget automatically.
- Toggle button color states: inactive (gray), active/panel-open (highlighted), and a distinct filter-applied color on the Filter button when filters are active but the panel is closed.
- Filter and Compare placeholder panels within the toggle panel, ready for future functionality.
- Existing search widget relocated into the toggle panel with identical highlight and clear-on-close behavior.

### Changed
- Default commit list view is now the table-style layout for new and upgrading users.
- Toolbar separators between icon-button groups now render as full-height vertical dividers matching adjacent button height.
- Message column acts as the primary flexible column, shrinking first when space is tight and expanding back toward the user's preferred width as space returns.

## [1.6.1] - 2026-04-01

### Added
- Speedy Git now explicitly notifies VS Code's Source Control panel to refresh after every extension-initiated git operation (checkout, fetch, push, pull, stash, merge, rebase, cherry-pick, revert, reset, tag, remote, and worktree operations), keeping the Source Control panel in sync immediately rather than waiting for filesystem watcher detection.
- `speedyGit.overScan` setting controls how many commit rows are rendered above and below the visible graph viewport. Increase for smoother fast-scroll experience; decrease to reduce DOM node count on lower-end hardware. Changes apply immediately without reloading.

### Changed
- Extension display name and panel title unified to "Speedy Git" across all surfaces (package.json, panel title, webview title, and tooltips), removing the redundant "Graph" suffix.
- `speedyGit.overScan` default raised from `10` to `50` for smoother scrolling out of the box; maximum capped at `200` in both the settings schema and the normalizer.
- `CommitRow` now receives `userSettings` as a prop from `GraphContainer` instead of subscribing to the Zustand store independently — eliminates one store subscription per visible row, reducing unnecessary re-renders during settings changes.
- Graph scroll container background explicitly set to `--vscode-list-background` to stay consistent with VS Code theme colors.

## [1.6.0] - 2026-03-31

### Added
- Commit details panel in bottom position now automatically switches to a side-by-side layout (commit details on the left, files changed on the right) when the panel is wide enough, making better use of horizontal space.
- Responsive layout automatically falls back to the original stacked arrangement (details above, files below) when the bottom panel width is too narrow for a comfortable split.
- Layout re-evaluates and transitions seamlessly as the panel is resized, with no manual toggle or setting required.
- Both sections in side-by-side mode scale their widths responsively to the available panel space rather than using fixed sizes.
- Right-side panel position continues to use the original stacked arrangement in all cases, preserving existing behavior.
- Branch filter dropdown now supports multi-select — select multiple branches to view only commits reachable from the selected set, with the graph updating immediately after each toggle.
- Text filter in the branch dropdown works alongside multi-select: type to narrow the list, select from filtered results, and clear the filter without losing selections.
- Check indicators next to each branch in the dropdown visually distinguish selected from unselected branches.
- Trigger button label reflects the current selection state: "All Branches" when none selected, the branch name when one is selected, or "3 branches selected" when multiple are selected.
- Dropdown stays open after each selection or deselection, closing only on Escape or click-outside, for efficient multi-branch workflows.
- "All Branches" option at the top of the dropdown clears all selections and returns to the unfiltered graph view.
- Branch selections automatically reconcile when the branch list changes (e.g., after fetch or prune) — deleted branches are silently removed from the selection.
- Full keyboard navigation preserved in multi-select mode: Tab to enter list, arrow keys to navigate, Enter to toggle selection, type-to-redirect back to filter input.

### Changed
- Fetch button now shows "Fetching..." label with a disabled state while the fetch operation is in progress, re-enabling automatically on success, error, or after a 30-second safety timeout.
- Filter updates (getCommits, fetch, refresh) now retain the existing `maxCount` value instead of allowing incoming filter payloads to overwrite it, preventing the loaded commit count from resetting unexpectedly during filter changes.

### Fixed
- Switching repositories now fully resets the branch filter to "All Branches" in both the dropdown UI and the underlying commit query, preventing stale branch-filtered results from carrying across repos or reappearing when switching back.

## [1.5.1] - 2026-03-30

### Fixed
- README screenshots (main screenshot, source control icon, status bar button) now render correctly on the VS Code Marketplace and Open VSX listing pages — previously excluded from the package by `.vscodeignore`.
- Fixed broken LICENSE link in README that pointed to `LICENSE` instead of `LICENSE.md`.

## [1.5.0] - 2026-03-30

### Added
- Commit details panel now remembers its position (bottom or right), file change view mode (list or tree), and panel size across panel close/reopen and VS Code reload.
- Panel UI preferences are restored instantly on reopen with no flash of default settings.
- Panel height (bottom position) and width (right position) are stored independently, so switching positions preserves the last-used size for each orientation.
- All toolbar icons (position toggle, view mode toggle) correctly reflect the restored state after reopening.
- Graceful fallback to defaults when stored preferences are missing or corrupted, with automatic recovery on next user interaction.
- Backtick-delimited text in commit messages (e.g., `functionName`) now renders with inline code styling (grey background, no visible backticks) across the commit list, details panel subject, and details panel body.
- Multiple inline code segments in a single commit message each render independently with their own styling.
- Unpaired backticks and empty backtick pairs render as literal characters with no special styling.
- Squash merge option (`--squash`) added to the merge dialog as the first checkbox, allowing all branch changes to be combined into a single staged change without creating a merge commit.
- Merge dialog option labels now display git flags (`--squash`, `--no-commit`, `--no-ff`) with inline code styling (grey background) to visually distinguish flags from descriptive text.

## [1.4.0] - 2026-03-28

### Added
- Hover tooltip on commit graph nodes: hover over any commit circle/dot for 200ms to see a detailed popup showing all branches, tags, stashes, and HEAD that contain the commit in their history — matching standard Git UI tools like SourceTree and GitLens.
- Worktree status in the tooltip displaying the absolute path when a commit is checked out in an active git worktree; omitted when not applicable.
- Clickable external reference links in the tooltip for GitHub PR numbers and issue tracker IDs found in commit messages, auto-detected from the git remote URL.
- Interactive tooltip: move the cursor into the tooltip to scroll long reference lists or click external links without the tooltip dismissing.
- Tooltip auto-repositions to stay fully visible within the webview viewport and adapts to VS Code dark, light, and high contrast themes.
- References area in the tooltip is split into conditional HEAD, Branches, Tags, and Stashes subsections with separators, making large mixed ref sets easier to scan.
- Tooltip ref badges preserve per-reference lane colors, so containing refs from different lanes remain visually distinguishable instead of sharing one fallback color.

## [1.3.0] - 2026-03-26

### Added
- Live git command preview across all major dialogs (Merge, Cherry-Pick, Rebase, Reset, Drop Commit, Checkout with Pull, Tag Creation, Delete Branch, Delete Remote Branch, Delete Tag, Drop Stash, Stash & Checkout, and Rename Branch), showing the equivalent CLI command that updates reactively as options change.
- One-click copy button on every command preview to copy the exact git command to the clipboard, with brief "Copied!" visual feedback.
- Cherry-pick command preview displays abbreviated commit hashes for readability and suppresses `-x` when `--no-commit` is active, accurately reflecting flag interactions.
- Drop Commit command preview shows `git rebase -i <hash>~1` with a comment clarifying the commit to be dropped.
- Checkout with Pull command preview displays `git checkout <branch> && git pull` or just `git checkout <branch>` depending on the pull toggle.
- Tag Creation command preview switches between lightweight and annotated tag command variants based on whether an annotation message is entered.
- Delete Branch, Force Delete Branch, and Delete Remote Branch confirmation dialogs now show the corresponding `git branch -d`, `git branch -D`, or `git push --delete` command.
- "Also delete remote branch" checkbox in the delete branch confirmation dialog when the branch has a remote counterpart, allowing local and remote deletion in a single action (unchecked by default to prevent accidental remote deletion).
- The remote-delete checkbox also appears in the force-delete dialog for unmerged branches with a remote counterpart.
- Command preview in the delete dialog updates dynamically when the remote-delete checkbox is toggled, showing the additional `git push --delete` command.

### Fixed
- Checking out a local branch that has a remote counterpart (even when diverged) now correctly shows the checkout-with-pull dialog, preventing users from unknowingly working on outdated code.
- Checking out a remote branch that already has a local counterpart now correctly shows the checkout-with-pull dialog instead of silently creating a new tracking branch.

### Changed
- Push dialog command preview refactored from inline implementation to shared, centralized components with no visual or behavioral changes.

## [1.2.1] - 2026-03-24

### Changed
- Commit details panel in right-side position now supports drag-to-resize width, matching the existing bottom panel height resize behavior, with a maximum width cap that preserves at least 200px for the graph area.
- Toolbar action buttons reordered to Refresh, Fetch, Search for a more logical workflow (refresh local state first, then fetch remote, then search).
- "Manage Remotes..." text button replaced with a compact cloud icon button, moved next to the settings gear to reduce toolbar clutter.
- Panel header "move" button now displays an icon with a descriptive label ("Move to right" or "Move to bottom") instead of a bare arrow symbol.
- Panel header close and move buttons are larger for easier click targeting.

### Fixed
- Close button in the commit details panel header now renders a proper X icon instead of garbled text caused by a Unicode rendering issue.
- Switching repositories via the dropdown now immediately closes the commit details panel and clears the selected commit highlight, preventing stale commit information from a different repository from being displayed.

## [1.2.0] - 2026-03-24

### Added
- Push Branch dialog with configurable options: `--set-upstream / -u` checkbox (on by default), push mode selection (Normal, `--force-with-lease`, `--force`), and remote dropdown for multi-remote repositories.
- Live command preview at the bottom of the push dialog showing the fully constructed `git push` command, updating in real time as options change.
- Copy button next to the command preview to copy the exact git command to the clipboard for manual terminal use.
- Yellow warning message and visual cues on the dialog when a force push mode (`--force` or `--force-with-lease`) is selected.
- Loading indicator with disabled controls while a push operation is in progress; dialog closes automatically on completion with a success or error notification.
- Consistent push workflow across all entry points in the extension — every "Push Branch" action opens the same dialog with the same options.

## [1.1.2] - 2026-03-23

### Fixed
- Stash commits no longer pull their parent onto the stash lane — stashes now render as dead-end leaf nodes with a short stub connecting to the parent's actual lane, matching standard git graph tools.
- Unrelated branch commits no longer visually stack on top of stash lines or other branch lines when lanes are freed by cross-lane connections — a new busy-lane tracking mechanism prevents lane reuse while a connection line still passes through.

## [1.1.1] - 2026-03-21

### Fixed
- Auto-refresh no longer fires when nothing has changed — a lightweight commit fingerprint check skips redundant updates, eliminating constant screen flashing during idle.
- Right-click context menus (commit, branch, stash) are no longer closed by auto-refresh. Auto-refresh now updates the graph in-place without unmounting the graph container or showing a loading screen.
- Increased watcher debounce (500ms → 1000ms) and added a 2-second minimum interval between refresh cycles to prevent refresh spam during rapid git operations (rebase, multi-file staging).
- Multi-commit selection and last-clicked state are now preserved across auto-refresh when the selected commits still exist in the updated graph.
- Graph lines from two different branches no longer overlap on the same lane when both branches share a common parent and one is a merge commit — each branch now renders on its own distinct lane.

## [1.1.0] - 2026-03-20

### Added
- Badge colors (branch, tag, stash) now match the commit's graph lane color, so users can visually associate each badge with its graph line at a glance.
- Badge text color automatically adjusts between light and dark to stay readable on any lane color background.
- Overflow "+N" badge and HEAD indicator also use the commit's lane color for visual consistency across the entire row.
- Badge colors update immediately when the graph color palette is changed in settings, staying in sync with graph lines without requiring a reload.
- Per-file addition and deletion counts (green/red) on each file row in the commit details panel, showing at a glance which files had the most churn.
- One-click file actions on hover: copy relative path (with inline checkmark feedback), open file at the selected commit revision (read-only), and open current working tree version.
- List/tree view toggle for the file changes panel — tree view groups files by directory hierarchy with collapsible folders, all expanded by default.
- Automatic folder compaction in tree view: single-child intermediate folders are merged into one node (e.g., `src/components/ui/buttons/`) to reduce nesting depth.
- Renamed files displayed with arrow notation (e.g., `newName.ts ← oldName.ts`) with the old path in muted style.
- Binary file changes show a "binary" indicator instead of line change counts.
- All file panel enhancements (per-file counts, action icons, tree view) apply consistently to both committed and uncommitted changes.

### Changed
- File changes header now shows only the total file count (e.g., "4 files changed") without aggregate addition/deletion totals.

## [1.0.6] - 2026-03-19

### Fixed
- VSIX packaging now excludes non-runtime and development-only folders (`test-repo`, `.claude`, `.codex`, `.specify`, `docs`, `scripts`, `specs`, and `webview-ui` source/config files) to reduce package size and avoid publishing internal artifacts.
- Extension packaging and publishing scripts now run with `--no-dependencies`, preventing dependency-scanning side effects from re-introducing ignored files.
- Production packaging no longer includes stale `dist/extension.js.map`; the production extension build now removes leftover source map files before bundling.

## [1.0.5] - 2026-03-19

### Added
- GitHub profile avatars for commit authors, with automatic Gravatar fallback when a GitHub avatar is unavailable or the repository is not hosted on GitHub.
- GitHub avatar caching per author email with 24-hour expiration to minimize API calls and keep avatars fresh.
- Automatic GitHub API rate limit handling — pauses avatar requests when the limit is reached and resumes after reset, falling back to Gravatar seamlessly.
- Dropdown arrow icon on the branch filter input, matching the nested repo dropdown style for better discoverability.
- Wider branch filter dropdown to display longer branch names (up to 60 characters) without truncation.
- Always-on auto-refresh for graph state changes triggered from VS Code Source Control actions and external git operations, with event coalescing via debounce.
- Auto-refresh now preserves selection/scroll state, keeps the details panel open unless the selected commit no longer exists, and defers updates while the webview is hidden until it becomes visible.
- Subtle refresh loading feedback in the toolbar: refresh/fetch actions show in-progress state and are disabled during active refresh.

### Fixed
- Branch filter now persists across all graph-refreshing actions (pull, push, fetch, rebase, checkout, cherry-pick, search, refresh button) via a centralized refresh method.
- Branch filter automatically clears when the filtered branch is deleted, showing the full graph instead of stale results.
- Branch badge context menu now shows `Rebase Current Branch onto This` in the same valid scenarios as commit-row rebase, including rebasing onto ancestor branches.
- Branch badge rebase visibility now correctly hides for self-target, detached HEAD, same-HEAD target, and in-progress rebase states; local and remote target branches remain supported.

## [1.0.4] - 2026-03-17

### Fixed
- Stash internal commits (index, untracked) no longer pollute the git graph — `refs/stash` is now excluded from the main log query since stashes are already fetched and displayed separately via the dedicated stash service.
- Latest stash entry no longer appears as a duplicate merge node in the graph.
- Stash refs appearing in commit decorations are now correctly identified as stash type instead of being misclassified as local branches.
- Right-clicking a stash label on a commit row now shows the stash context menu (Apply, Pop, Drop) instead of an empty menu.
- Stash commit rows now display the author name, avatar, and badge — previously blank because author data was not fetched from git.

## [1.0.3] - 2026-03-17

### Added
- Branch filter dropdown now includes a text input at the top for real-time, case-insensitive filtering — quickly find a branch in repositories with dozens or hundreds of branches.
- Filtered branch list preserves Local and Remote groupings; groups with no matches are hidden automatically.
- "All Branches" option always visible in the dropdown to reset the filter at any time.
- Keyboard-first branch selection: type to filter → Tab to move focus into the list → Up/Down arrows to navigate → Enter to select (combobox pattern, consistent with VS Code Command Palette).
- While the list is focused, typing any character automatically returns focus to the text input and appends the character, so filtering resumes without needing Shift+Tab.
- Clicking a branch in the list selects it and closes the dropdown; clicking outside closes it without changing the selection.
- Escape closes the dropdown and clears the filter text without changing the selected branch.
- Dropdown trigger displays the currently selected branch name (or "All Branches") in the closed state.
- Long branch names are truncated with ellipsis when they exceed the dropdown width.
- Dropdown styling uses VS Code theme variables for seamless integration with light and dark themes.

## [1.0.2] - 2026-03-16

### Fixed
- Branch and commit checkout no longer forces stashing when uncommitted changes don't conflict with the target, matching native `git checkout` behavior.
- Conflicting uncommitted changes now trigger a "Stash & Checkout" / "Cancel" dialog only when git actually rejects the checkout, instead of pre-emptively prompting on any dirty working tree.
- Checkout conflict detection applies consistently to both branch checkout and commit checkout (detached HEAD) operations.
- Non-conflict checkout errors (e.g., invalid ref) now show a distinct error message without offering the stash option.

## [1.0.1] - 2026-03-16

### Added
- "Checkout this commit" option in the commit row right-click context menu to check out any commit directly, entering detached HEAD state.
- Confirmation dialog before commit checkout identifies the commit by its short hash and explicitly warns about detached HEAD state, with Confirm and Cancel actions.
- When uncommitted changes exist, a stash prompt appears after confirming the detached HEAD dialog — preventing accidental data loss before the checkout completes.
- Graph HEAD indicator updates automatically after a successful commit checkout to reflect the new detached HEAD position.
- "Checkout this commit" is disabled while any git operation is in progress (loading, rebase, cherry-pick, or revert), consistent with Revert Commit and Drop Commit behavior.

## [1.0.0] - 2026-03-14

### Added
- Customizable graph line colors via `speedyGit.graphColors` setting with a default 10-color Material Design palette; changes apply instantly without manual refresh.
- Configurable date display format (`speedyGit.dateFormat`): choose between relative ("2 hours ago") and absolute ("2026-03-13 14:30") timestamps.
- Author avatars fetched from Gravatar with generated-initials fallback when no Gravatar image is available; toggle visibility with `speedyGit.avatars.enabled`.
- Settings to hide remote branch labels (`speedyGit.showRemoteBranches`) and tag labels (`speedyGit.showTags`) from the graph.
- All settings changes propagate to the graph in real time — no manual refresh or reload required.
- Invalid or empty settings values gracefully fall back to sensible defaults.
- Client-side search widget (toolbar button or Ctrl/Cmd+F) that filters loaded commits by message text, commit hash, or author name with instant, debounced results.
- Search match counter ("3 of 15") with Next/Previous navigation that auto-scrolls the virtual list to each match.
- Keyboard navigation: arrow keys to move between commits, Enter to open commit details, Escape to close panels, R to refresh the graph.
- All keyboard shortcuts registered through VS Code's keybinding system, fully customizable in the Keyboard Shortcuts editor.
- Submodule status display in the parent repository graph showing each submodule's checked-out commit hash and clean/dirty state.
- In-panel navigation from parent repository to submodule graph with a "Back to parent" breadcrumb — no extra panels opened.
- "Update Submodule" context menu action to sync a submodule to the parent's recorded commit ref.
- Detection of uninitialized submodules with an "Initialize Submodule" context menu action.

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

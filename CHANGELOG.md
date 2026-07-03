# Changelog

All notable changes to the "speedy-git-ext" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [5.2.2] - 2026-07-03

### Fixed
- **Fast-forwarding the currently checked-out branch no longer fails.** Right-clicking a remote branch badge and choosing **"Fast-forward Local Branch from Remote"** while that branch was checked out ran `git fetch <remote> <branch>:<branch>`, which git refuses on the current branch, surfacing a raw git error. The dialog now detects this case and performs a `git pull <remote> <branch>` instead — the message explains that the branch is checked out so a pull will run, the confirm button reads **Pull**, and the command preview shows the pull command. Fast-forwarding any other branch is unchanged.

## [5.2.1] - 2026-07-02

### Changed
- **Branch and remote names are now validated as you type, like tag names.** The Create Tag dialog's live git refname validation (introduced in 5.2.0) now also covers every other dialog that creates or renames a ref: **Create Branch**, **Rename Branch**, the new-branch name in **Create Worktree**, and the remote name in **Manage Remotes**. Invalid names (spaces, `..`, `~`, `^`, `:`, a trailing `.lock`, a leading `-`, etc.) show a specific error under the input and disable the confirm button, instead of letting the operation run and surfacing a raw git error afterwards. Branch names also reject the reserved name `HEAD`.

### Internal
- Generalized the shared tag-name validator into a ref-name validator with tag/branch/remote wrappers, and applied the same full refname rules to the backend creation paths (`git branch`, `git branch -m`, `git worktree add -b`, `git remote add`) for defense in depth.

## [5.2.0] - 2026-07-01

### Added
- **Tag badges now show useful metadata in their tooltip.** Hovering a tag badge can now show whether it is annotated or lightweight, plus the annotated tag message, tagger, and tag date when available. The metadata is read locally from `refs/tags` in one deferred git call and cached in the webview, so hovering tags does not run git or touch the network.
- **Create Tag can create and push in one flow.** The Create Tag dialog now has an **"Also push to remote"** checkbox, enabled by default when a remote exists, plus an opt-in **Force** checkbox for overwriting a diverged remote tag. The command preview shows the chained create-and-push command before confirmation.
- **Tag deletion can also delete from the remote.** Deleting a tag now opens a dialog with an **"Also delete from remote"** checkbox, enabled by default when a remote exists, and a command preview for the local and remote delete commands. If the remote tag is already missing, the remote delete is treated as a benign no-op after the local tag is removed.
- **Standalone Push Tag now supports force.** The Push Tag action now opens a confirmation dialog with an opt-in **Force** checkbox and command preview, so remote tag overwrite intent is explicit before running `git push --force refs/tags/<tag>`.

### Changed
- **Signature column settings now warn about CPU cost.** The column settings popover now warns that Signature checks run in the background and can use high CPU in large repositories, making the tradeoff clear before enabling the hidden-by-default Signature column.

### Internal
- Added stricter shared tag-name validation, extended tag RPC payloads for push/delete/force options, added tag metadata loading through deferred repo data, and covered the new service, parser, handler, and command-preview behavior with focused tests.

## [5.1.4] - 2026-06-28

### Fixed
- **The commit table can no longer collapse to a graph-only view.** In Table mode, if a repository's saved layout had a Graph column wider than the current pane, the Graph column filled the entire visible width and pushed every other column — Hash, Message, Author, Date, and their header labels — past the table's clipped right edge, where they couldn't be reached (Table mode has no horizontal scrollbar). The list appeared to show only the Graph column, even though clicking a commit still opened its details normally. Because column widths are stored per repository, a single affected repo showed this while every other repo looked fine. The Graph column now shrinks as a last resort — only when every other column is already at its minimum width and the table still overflows — so the other columns always stay visible. Existing layouts self-correct on load (no reset needed); previously the only workaround was **"Reset column widths to defaults"**.

## [5.1.3] - 2026-06-27

### Performance
- **Fast scrolling no longer leaves blank rows.** Flicking through history quickly — especially with a high-resolution, free-spinning mouse wheel (e.g. Logitech MX Master) — could outrun rendering and leave rows blank until scrolling stopped. The cause, present since the very first release, was that every visible commit row eagerly built its entire right-click context menu up front — including all of its dialogs and live store subscriptions — which made each row far too expensive to render fast enough to keep pace with a quick scroll. Context menus are now built lazily, only when you actually right-click a row, so rows render dramatically cheaper and the graph stays filled while scrolling at any speed. As a bonus, this also cuts re-render work on filtering and refresh, since visible rows no longer each carry their menu's store subscriptions.

## [5.1.2] - 2026-06-26

### Fixed
- **Long toast notifications no longer overflow off-screen.** Error/success notifications that contained long, unbreakable tokens (e.g. file paths or URLs in a merge-conflict message) could blow past the notification box and run off the right edge of the view. The message now wraps within the box, preserves its line breaks, and scrolls vertically when very long.

### Performance
- **Signature column verifies much faster and fills in row-by-row.** On large repositories the Signature column previously verified commits one at a time and only revealed a whole batch (~50 rows) at once after a long pause, so on a slower machine the column could appear stuck for 10–30 seconds at a time and take minutes to finish. Verification now runs several commits in parallel (scaled to your CPU cores, visible rows first) and streams each verdict to the column as it resolves, so glyphs appear progressively, row-by-row, and the whole repository completes far sooner.

## [5.1.1] - 2026-06-23

### Changed
- **"Verifying" spinner in the Signature column.** A commit that is known to be signed but whose verification verdict hasn't returned yet now shows a brief spinner in its Signature column cell instead of a blank cell, so a signed-but-not-yet-verified commit is no longer momentarily mistaken for an unsigned one. The spinner resolves to the appropriate glyph as soon as the async verdict lands.

## [5.1.0] - 2026-06-11

### Added
- **Copy `.env` files into a new worktree.** The Create Worktree dialog has a new opt-in checkbox, **"Copy .env files into the new worktree"**. Because `git worktree add` only checks out tracked files, gitignored secrets like `.env` and `.env.local` never appear in a new worktree and normally have to be copied by hand — this does it for you. The checkbox is unchecked by default and only enabled when gitignored `.env*` files actually exist, listing the files that will be copied; otherwise it's disabled with a hint (`no .env* file found` / `no .env* file is git-ignored`).
  - **Detection uses `git check-ignore`** (not `.gitignore` text parsing), so it correctly respects patterns, negations, nested `.gitignore` files, and global excludes.
  - **Security guard:** files are re-validated against the *new* worktree's branch before copying — any `.env*` file the target branch does **not** git-ignore is skipped (so a copied secret can never land as an untracked, commit-eligible file), and the dialog reports which files were left out and why.

### Documentation
- **Clearer signature-verification help.** Rewrote `docs/signing-verification.md` for readability: split the per-state and glyph reference into clean tables, reorganized SSH/GPG setup into numbered steps with `Bash`/`PowerShell` variants, and added a note that local verification requires `gpg` or OpenSSH 8.1+ (`ssh-keygen`) on your `PATH`.

## [5.0.4] - 2026-06-11

### Changed
- **Clearer worktree panel badge.** The badge marking the main worktree in the Worktree panel now reads **`main worktree`** instead of just `main`, making it less likely to be mistaken for the `main` branch.

## [5.0.3] - 2026-06-10

### Added
- **Date format shortcut in the commit table.** The Date column header now has a small gear icon — clicking it opens VS Code settings filtered directly to the **Speedy Git: Date Format** and **Date Format Custom** settings, so you can adjust how commit dates display without hunting through the full settings list.

### Internal
- Extended the `openSettings` RPC with an optional `query` so settings can be deep-linked to specific settings; extracted a shared `HeaderIconButton` for the commit table header's icon buttons.

## [5.0.2] - 2026-06-09

### Fixed
- **GitHub author avatars now load far more reliably.** Avatars no longer get stuck blank with no way to recover. Several issues were addressed:
  - Avatars for commits authored with a GitHub no-reply email now resolve instantly and offline, with no API call and no rate-limit cost.
  - Failed avatar lookups are now cached briefly, so a refresh, fetch, or pull no longer keeps re-spending the GitHub rate limit on the same unresolved authors — which previously left avatars stuck blank until the hourly reset.
  - When signed in to GitHub in VS Code, avatar lookups now use your session automatically, raising the rate limit from 60 to 5000 requests/hour.
  - The Output log now reports how many avatars resolved and warns, with guidance, when the unauthenticated rate limit is the reason avatars are missing.

### Internal
- Reworked `GitHubAvatarService`: optional authenticated requests, offline no-reply-email resolution, positive/negative TTL caching, and a single rate-limit policy shared by the fetch gate and the user-facing warning.
- Avatar-service initialization in `RepoDataLoader` now coalesces concurrent loads onto one attempt and retries after a transient or early failure (e.g. once `origin` is added), instead of latching off for the session.

## [5.0.1] - 2026-06-08
- Put v5.0.0 to release

## [5.0.0] - pre-release - 2026-06-07

### Added
- **Git worktrees** — keep several branches checked out side-by-side, each in its own folder and IDE window, without disturbing your main working tree.
  - **Create worktree…** from the right-click menu of any branch, commit, or tag. The dialog pre-fills the source ref and a suggested target folder, shows a live preview of the exact `git worktree add …` command, and opens the new worktree in a new IDE window. Branches already checked out elsewhere default to "create a new branch" mode (git forbids one branch in two worktrees), and remote-only branch badges create a local tracking branch named after the remote branch.
  - **Worktree panel** lists every worktree for the repository — folder path, branch (or detached), short HEAD, and which is the main worktree — with **Open in new window** and **Remove worktree…** actions. The main worktree is marked and cannot be removed.
  - **Prune** button removes stale worktree records, showing a confirmation that lists the entries to be pruned before running.
  - **Remove worktree…** optionally deletes the worktree's branch alongside the worktree folder.
- **At-a-glance worktree indicators in the graph** (Phase 2): branch-linked worktrees now show a worktree icon **inside the branch badge** (with the worktree path in its tooltip), and branchless worktrees render a dedicated **`detached {folder}`** badge — collapsing to `detached ×N` when several share the same commit. Branches with a linked worktree are prioritized into the visible ref slots so the indicator never hides behind the overflow badge. All worktree actions live in the right-click menu, grouped together and separated from unrelated actions.

### Changed
- The old low-contrast worktree popover badge (the unlabeled icon wedged between the branch badge and commit message) has been **removed** in favor of the new in-badge icon and `detached` badges. Worktree actions moved entirely to the established right-click model used by every other ref.
- The Worktree panel gained a **manual refresh** button next to Prune (reloads records without a full graph reload) and **zebra-striped rows** for easier scanning of multi-worktree lists. Refresh and Prune are disabled while a worktree-list request is in flight.

### Internal
- Refactored the backend webview host: `WebviewProvider` is now a thin compatibility facade, with panel lifecycle, runtime state, repo-bound git service registry, persisted UI state, repo data loading, refresh coordination, VS Code editor commands, operation guards, and typed RPC routing split into focused `src/webview/` modules.
- RPC handling is now registered through an exhaustive typed handler map grouped by feature area, so adding a new request type fails TypeScript until a handler is wired. Handlers resolve repo-bound git services from `GitServiceRegistry` at request time to avoid stale service references after repo and submodule navigation.
- Added focused unit coverage for the extracted webview modules, including persistence healing, auto-refresh deferral, initial/deferred data loading, stale branch-filter cleanup, commit fingerprint optimization, panel/editor command wiring, operation-in-progress checks, router dispatch, and selected handler behavior.

## [4.4.1] - 2026-06-04

### Performance
- Opening the graph in parent repos with many submodules is now substantially lighter. The initial graph render now waits only for commits and branches; uncommitted-change details, remotes, worktrees, stashes, operation state, submodule selector data, and avatars hydrate afterward in the background.
- The author list for the Filter panel is now loaded on demand when the Filter panel opens instead of during graph startup. This avoids an unbounded author-history scan on every open.
- Parent-repo uncommitted status now uses `git status --ignore-submodules=dirty`, so dirty submodule working trees do not force a parent status walk across every submodule.
- Submodule selector data is now read from `.gitmodules` plus local initialization checks instead of `git submodule status`, avoiding the expensive per-submodule status pass during graph open.

### Fixed
- Repo and submodule switches now clear stale deferred repo data while normal refreshes retain the previous hydrated data until background updates arrive, avoiding brief UI flicker during refresh.

## [4.4.0] - 2026-06-04

### Added
- The **Commit Details** panel now shows each commit's full signature state — Verified, Bad Signature, Signed (key not trusted / key missing / expired or revoked), Signed-not-verified-locally, or No signature — along with the signer, key id, fingerprint, and signature format (SSH or GPG). Verification uses your local git only; no host API is ever called.
- New optional **Signature** history-table column (hidden by default). When enabled it shows a compact glyph per commit — verified, problem, or "signed but cannot verify" — with a blank cell for unsigned commits. It resizes, reorders, hides, and persists like every other column.
- A **help affordance** next to the signature display and the Signature column header opens bundled, offline setup documentation covering SSH allowed-signers setup, importing and trusting GitHub's GPG key, the meaning of each state, and why a commit GitHub calls "Verified" may not verify locally until your trust stores are configured.

### Changed
- Signature verification states are now modeled as a single flat 7-state enum, replacing the previous good/bad/unknown/none model plus a separate "verification unavailable" flag.

### Fixed
- An SSH-signed commit on a machine with no `gpg.ssh.allowedSignersFile` is now reported as **Signed, not verified locally** instead of **unsigned**. Signature presence is detected from the commit object itself, independently of git's verification verdict, so a signed commit is never mislabeled as unsigned.
- Signature glyphs now populate on their own when the working tree has uncommitted changes. Previously the synthetic "uncommitted" (and stash) rows were sent for verification, which raised an "Invalid commit hash: UNCOMMITTED" error and left the visible signed commits blank until each row was clicked. Those non-commit rows are now skipped.
- A single unverifiable or unknown commit no longer blanks the glyphs for the rest of the visible rows; signature lookups are resilient and skip only the affected commit.

### Performance
- All signature work is excluded from the default history load — keeping the Signature column hidden incurs zero signature cost. When enabled, verification runs asynchronously and viewport-first (visible rows first), is cached per commit hash, and never re-runs during scrolling, so scrolling stays as responsive as with the column hidden.
- Cached signature results now survive a history refresh (e.g. an auto-refresh after saving a file). Glyphs no longer blank out and re-verify on every refresh; only brand-new commits are verified, while already-seen commits resolve instantly from cache.

## [4.3.4] - 2026-06-03

### Fixed
- The **Checkout Commit** confirmation dialog now shows the developer command preview (`git checkout <hash>`), matching the Checkout Branch dialog and every other operation dialog. Previously the dialog confirmed a detached-HEAD checkout without previewing the underlying git command.

## [4.3.3] - 2026-05-27

### Added
- New **Speedy Git: Status Bar Text** setting (`speedyGit.statusBarText`) for choosing the label of the status bar item. Two options: `Icon + text` (default — shows `$(zap) Speedy Git`) and `Icon only` (shows just `$(zap)`). The choice applies immediately on save with no reload.

### Fixed
- Default git graph no longer surfaces tool-owned refs (e.g., Jujutsu's `refs/jj/keep/*`, notes, replace refs, Gerrit refs) as side branches with blank commit messages. The default commit and author queries now list `HEAD`, branches, remotes, and tags explicitly instead of using `git log --all`, so only refs the extension actually models are traversed. `HEAD` is included explicitly so detached checkouts remain visible even when no branch or tag names the checked-out commit. Stashes continue to be fetched separately via `GitStashService` and injected into the graph.
- Ref-decoration parsing now classifies fully-qualified refs strictly by namespace — `refs/heads/*` → branch, `refs/remotes/*` → remote, `refs/tags/*` → tag, `refs/stash` → stash — and ignores anything else. Previously, unknown fully-qualified refs that slipped into a decoration line could be misclassified as local branches, exposing branch-only right-click actions on refs that are not branches.
- Commit Details panel author badge is now readable across light, dark, and high-contrast themes. The badge inside the Commit Details panel previously used `--vscode-badge-foreground` against the panel background, producing low contrast in some themes. It now inherits the surrounding text color and drops the badge-coloured border, while the same `AuthorBadge` component continues to render with full badge styling in the filter panel.

### Internal
- `AuthorBadge` accepts two new optional props — `inheritTextColor` (default `false`) and `showBorder` (default `true`) — so the same component can render either as a standalone badge (filter panel, default) or as inline text inside a metadata row (Commit Details panel).
- `ExtensionController` now treats the status bar text setting independently from webview settings: changes to `speedyGit.statusBarText` only refresh the status bar item, while changes to webview-visible settings (`graphColors`, `dateFormat`, `dateFormatCustom`, `showRemoteBranches`, `showTags`, `batchCommitSize`, `overScan`) re-send `userSettings` to the webview. Renamed the predicate to `didSpeedyGitWebviewSettingsChange` to reflect the narrower scope, and added `overScan` to the watched list so virtual-scroll overscan changes propagate without a graph refresh.
- Added `parseQualifiedRef(refName)` helper in `gitParsers.ts` plus regression tests covering each accepted namespace and the rejection of unrecognized ones. `GitLogService.test.ts` extended to assert the new explicit ref-set arguments on the default log and `getAuthors` queries.

### Credits
- Graph ref-namespace hardening contributed by [@singularitti](https://github.com/singularitti) in [#130](https://github.com/onlineeric/speedy-git-ext/pull/130), status bar text setting in [#131](https://github.com/onlineeric/speedy-git-ext/pull/131), and Commit Details author badge theme fix in [#132](https://github.com/onlineeric/speedy-git-ext/pull/132). Third, fourth, and fifth contributions in a row — thank you!

## [4.3.2] - 2026-05-25

### Fixed
- Table view: dragging the separator between **Message** and the column to its right (default: **Author**) no longer makes the Message column silently absorb the motion. Previously, each pointer move was applied on top of the latest layout — so the inverted delta meant for the right neighbour also shrank Message, leaving Message visibly smaller after a brief drag even though Message has no draggable preferred width. The pointer-down handler now snapshots the effective widths of every visible column into a fixed baseline (`materializeCommitTableEffectiveWidths`), and each pointer move computes the new widths from that snapshot using a single shared `resizeCommitTableColumnPair` helper. Message stays put; only the two columns adjacent to the dragged separator change.
- Table view: a column can no longer be dragged so wide that its neighbours collapse below their minimum widths, which previously produced an "unrecoverable" layout where the only way out was to reset the layout entirely. Both during drag and at load time, each `preferredWidth` is now clamped against a per-column ceiling defined as `containerWidth − Σ(other visible columns' min widths)`. At load time the backend applies the same ceiling against an assumed 4000 px container, healing any oversized values that may have been persisted by older builds.

### Added
- "Reset column widths to defaults" item in the table-view settings popover (shown only when the commit list is in table mode). Restores every column's `preferredWidth` to its factory default in one click, without touching column order or visibility. Renders as a full-width text button under the column list, separated by a divider so it cannot be confused with a column toggle.

### Internal
- Added `resizeCommitTableColumnPair({ layout, leftColumnId, rightColumnId, leftStartWidth, rightStartWidth, deltaX })` to `commitTableLayout.ts` — a pure helper that clamps `deltaX` against both neighbours' minimum widths and returns a new layout with the two columns adjusted symmetrically. Unit-tested across fixed-baseline non-accumulation, Message-doesn't-absorb-the-delta, growth via an oversized neighbour, and clamping at both the left and right column minimums.
- Added `computeColumnMaxWidth(columns, columnId, containerWidth)` — derives the per-column ceiling used while dragging so the resize session knows the upper bound at pointer-down time. Mirrored on the backend via a `HEALING_ASSUMED_CONTAINER_WIDTH = 4000` constant when validating persisted layouts.
- Added `materializeCommitTableEffectiveWidths(layout, resolvedColumns)` — produces a new layout where every column's `preferredWidth` equals its current `effectiveWidth` (clamped to its minimum, rounded to an integer). Used as the fixed baseline for paired resizing so accumulated pointer moves cannot drift the layout.
- Moved `COMMIT_TABLE_MIN_WIDTHS` from `webview-ui/src/utils/commitTableLayout.ts` into `shared/types.ts` so the backend `validateCommitTableLayout` healing logic and the frontend resize logic share one source of truth. The webview util re-exports the symbol so existing imports continue to work unchanged.
- Extracted `healPersistedColumnWidth(columnId, rawWidth)` helper in `WebviewProvider.ts` to flatten the nested `Math.min`/`Math.max` clamping previously inlined inside `validateCommitTableLayout`. `computeHealingMaxWidth` now reads from a precomputed `SUM_OF_ALL_MIN_WIDTHS` constant instead of re-walking the per-column map on every call.
- Added unit tests for `computeColumnMaxWidth` (correct ceiling, fallback to column min when the container is too small, consistency with `resolveCommitTableLayout` after growing a column to the ceiling) and `materializeCommitTableEffectiveWidths` (captures surplus message width, immutability of the input, fractional rounding, and the min-width clamp on pathological inputs).
- Added unit tests for the backend healing path in `WebviewProvider.test.ts` covering: oversized persisted widths clamped to the healing ceiling, sub-minimum values raised to the minimum, fractional widths rounded, reasonable widths preserved unchanged, and `NaN` values falling back to the default.
- Fixed unrelated minor spacing inconsistency on the **Reset** item inside the view-mode popover so it visually aligns with the other items in the same list.

### Credits
- Column resize safety fixes (paired-baseline resize and per-column max-width clamping) and the "Reset column widths to defaults" action contributed by [@singularitti](https://github.com/singularitti) in [#128](https://github.com/onlineeric/speedy-git-ext/pull/128). Thank you for the second contribution!

## [4.3.1] - 2026-05-24

### Fixed
- Table view: the separator between the **Message** column and the column to its right (default: **Author**) is now an active drag handle. Previously, dragging it produced no visible change because the handler targeted the Message column, which absorbs surplus container width and therefore cannot be resized by adjusting its own preferred width. The handler now targets the *next* column with an inverted delta, so the dragged boundary follows the cursor. The same logic cascades to every separator at or after Message (e.g., **Author │ Date**), so all interior boundaries are now independently draggable. Particularly noticeable on macOS, where the rightmost handle previously sat awkwardly against the VS Code window edge.
- Accessibility: the `aria-label` and `title` on each separator button now name the column actually being resized, not the column the button sits inside. After the resize-target change, the button inside the Message cell was announcing "Resize Message column" while the drag actually resized Author — confusing for screen-reader users and anyone relying on the tooltip.

### Changed
- Table view: the **Date** column is now left-aligned, matching the alignment of the Author and Message columns. Previously it was right-aligned.

### Internal
- Extracted `resolveResizeTarget(columns, index)` from `CommitTableHeader.tsx` into the shared `commitTableLayout.ts` utility module so the Message-column carve-out logic lives in exactly one place; the separator label, double-click handler, and pointer-down handler all derive from the same call and cannot drift apart.
- Added unit tests for `resolveResizeTarget` covering the carve-out across four layouts: default order (graph, hash, message, author, date), Message hidden, Message reordered to the last position, and Message reordered to second position. Each layout asserts the target column and `isReverse` value for every separator index.

### Credits
- Column resize behavior fix and date column left-alignment contributed by [@singularitti](https://github.com/singularitti) in [#126](https://github.com/onlineeric/speedy-git-ext/pull/126). First external contribution — thank you!

## [4.3.0] - 2026-05-22

### Added
- **Revert Commit** now opens a dialog with three revert modes — **Commit now**, **Stage only**, and **Edit message** — replacing the previous direct-action menu item. The mode selector uses radio buttons (Cherry-Pick dialog conventions) and each label shows the equivalent git flag (`--no-edit`, `--no-commit`, or "(no flag; opens editor natively)") in a muted monospaced style next to the description.
- **Commit now** mode preserves today's behavior: creates a new revert commit on the current branch with git's default revert message. Conflicts continue to set `REVERT_HEAD` and surface the existing **Continue Revert** / **Abort Revert** context menu items for recovery.
- **Stage only** mode applies the inverse of the selected commit to the working tree and index without creating a commit, so the changes can be reviewed, combined with other edits, or amended into another commit via the Source Control panel. Conflicts in this mode do **not** enter revert-in-progress state — users resolve them in the Source Control panel and commit manually.
- **Edit message** mode opens a multi-line text area pre-filled with git's standard default revert message (`Revert "<subject>"`, blank line, `This reverts commit <full-hash>.`) and creates the revert commit with exactly the text the user typed. Confirm is disabled while the message is empty or whitespace-only; if the inverse changes turn out to be empty, the typed message is offered back so it can be retried or copied rather than silently lost.
- Live single-line command preview at the bottom of the dialog updates as the mode (and, for merge commits, the mainline parent) changes — `git revert --no-edit [-m N] <hash>` for Commit now, `git revert --no-commit [-m N] <hash>` for Stage only, and the canonical `git revert [-m N] <hash>` for Edit message. The preview is selectable and has a Copy button.
- Merge-commit revert is now handled inside the same dialog: the mainline-parent picker appears inline (one merged dialog, not two sequential dialogs), and the confirm button stays disabled until a parent is chosen. The previous standalone `RevertParentDialog` is removed.
- The dialog remembers the mode the user last confirmed with for the lifetime of the session, so reopening the dialog pre-selects that mode.

### Changed
- The dirty-working-tree precondition is now applied uniformly across all three modes — Commit now, Stage only, and Edit message all refuse to run when the working tree has uncommitted changes, with the same explanatory error used previously. Users must commit, stash, or discard local changes before any revert mode runs (no relaxation for the non-committing modes).

## [4.2.1] - 2026-05-21

### Fixed
- HEAD bullseye indicator no longer appears on the wrong commit. The previous build surfaced `<remote>/HEAD` (e.g. `origin/HEAD`) as a normal remote-branch badge, and right-clicking it → **Fast-forward Local Branch from Remote** ran `git fetch origin HEAD:HEAD`, which silently created a stray local branch named `HEAD` (`refs/heads/HEAD`). Once present, every subsequent git command produced `warning: refname 'HEAD' is ambiguous` and Speedy Git painted the HEAD bullseye on whatever commit that stray ref happened to point at — visible even after refresh, fetch, checkout, or IDE restart.
- `<remote>/HEAD` is git's symbolic ref for the remote's default branch, not a real branch, so it is now filtered out of commit decorations and the branch list — no badge, no right-click menu, no Compare entry. Matches how Git Graph, GitLens, GitKraken, and Sourcetree handle it.
- Defensive guards added at the service layer: `fastForwardFromRemote`, `createBranch`, and `renameBranch` now reject `HEAD` as a local branch name, so even if a future UI path passes it through, the extension refuses the write instead of creating another stray `refs/heads/HEAD`.
- Users who already have the stray ref from a previous version can remove it with `git update-ref -d refs/heads/HEAD` (the bullseye disappears on next refresh). `git branch -d HEAD` does not work because git resolves `HEAD` to its symbolic ref instead of the literal branch.

## [4.2.0] - 2026-05-19

### Added
- Three new options for the **Speedy Git: Date Format** setting (`speedyGit.dateFormat`):
  - `absolute-date` — `YYYY-MM-DD` (e.g. `2026-05-19`)
  - `system` — follows the OS locale via `toLocaleString()`
  - `custom` — user-supplied [date-fns format tokens](https://date-fns.org/docs/format)
- New `speedyGit.dateFormatCustom` setting holding the token string used when `dateFormat` is `custom` (e.g. `yyyy-MM-dd HH:mm`, `MMM d, yyyy`). Invalid or empty token strings silently fall back to the `relative` format so the graph never breaks on a typo.
- VS Code settings dropdown now shows per-option descriptions via `enumDescriptions`, and the custom-token setting cross-links to `#speedyGit.dateFormat#` for one-click navigation.

### Fixed
- Date column in Table view now auto-resizes when the date format changes — switching from `absolute` (`YYYY-MM-DD HH:mm`) to a shorter format (`relative`, `absolute-date`) shrinks the column, and switching to a longer format expands it. Previously the persisted column width was sized for the original format and never recalculated.
- Double-click on the date column edge now produces a width that actually fits the current format. The hardcoded 140px minimum (sized for `YYYY-MM-DD HH:mm`) was clamping every shorter format; the date column minimum is now 64px so short formats like `relative` ("3h ago", "just now") can drag down to a sensible width.
- Auto-fit column measurement now reads the **actual rendered font** (VS Code's `--vscode-font-family` / `--vscode-editor-font-family`) instead of the generic `sans-serif` / `monospace` fallbacks, so widths are correct on macOS (SF Pro / `-apple-system`) where the system UI font renders meaningfully wider than Windows' Segoe UI. A small 4px safety pad absorbs `canvas.measureText` subpixel rounding so columns no longer truncate by 1–2px after auto-fit.

## [4.1.1] - 2026-05-18

### Fixed
- Date column no longer wraps to two lines (Classic view) or gets truncated (Table view) on macOS and other environments where the system UI font renders wider than Windows' Segoe UI. The Classic-view date span widened from 96px to 128px and gained `whitespace-nowrap`; the Table-view date column minimum and default widths increased from 120px to 140px, giving the absolute format `YYYY-MM-DD HH:mm` enough headroom across platforms.
- Table view now expands the Message column to fill any surplus container width, so all columns span to the right edge of the panel instead of leaving an empty strip when the panel is wider than the sum of preferred column widths.

## [4.1.0] - 2026-05-15

### Added
- "Create Branch Here..." dialog now includes a **Checkout this branch after creating** checkbox (off by default), so a new branch can be created and switched to in a single step.
- Live `git` command preview in the Create Branch dialog showing either `git branch <name> <hash>` or `git branch <name> <hash> && git checkout <name>` depending on the checkbox state, matching the preview pattern used by other dialogs.
- When the checkout step fails after a successful branch creation (e.g., uncommitted changes would be overwritten), the branch is still kept and the git error message is surfaced through the standard error notification, so the user can resolve the working-tree state and check it out manually.
- "Fast-forward Local Branch from Remote" right-click menu now also appears on **remote-only** branch badges — selecting it creates a local branch from the remote tip and sets the remote as its upstream, all without checkout (no working-tree or current-branch side effects).
- On the remote-only-badge path only, the fast-forward operation also sets upstream tracking (`git branch --set-upstream-to=<remote>/<branch> <branch>`) after the fetch, so the newly created local branch is immediately wired up to its remote counterpart. Established local branches keep any pre-existing upstream config untouched, and the dialog's command preview reflects whether the set-upstream step will run.
- Dialog copy adapts to context — when the local branch already exists the description says "Update local branch …", and when it will be newly created it says "Create local branch … from <remote>/<branch> and set it as the upstream".

### Changed
- Fast-forward menu visibility now uses commit-hash matching instead of name-only: the menu shows on local-only and remote-only badges and on visually separate local/remote pairs that point to different commits (where a fast-forward is meaningful), and is hidden on truly merged badges (local and remote at the same commit) where it would be a no-op.

## [4.0.2] - 2026-05-13

### Fixed
- Compare panel option changes no longer dismiss the currently displayed compare result in the Commit Details panel. Changing Base, Target, 2-dot / 3-dot mode, or swapping slots now updates only the compare-panel draft state; the details panel updates only when clicking **Compare** or **Reset**.
- Fetch from remote no longer stays disabled after closing and reopening the extension panel. The panel lifecycle now resets the initial-load state correctly, and incoming initial data always clears the webview loading flag so users do not need to restart the IDE to recover.

## [4.0.1] - 2026-05-12

### Added
Release v4.0.0 pre-release version to release version.

### Fixed
- "Rebase Current Branch onto This" (branch context menu) and "Rebase Current Branch onto This Commit" / "Start Interactive Rebase from Here" (commit context menu) no longer disappear intermittently. The visibility check previously hid the items whenever the global `loading` flag was true — and that flag flips on briefly during every `getCommits` refresh (any branch / author / date / text filter change), creating a short window where right-clicking would yield a menu missing the rebase entries.
- These items now stay visible whenever they are structurally applicable (not the current branch / HEAD commit, not detached HEAD, not the same target hash) and are *disabled* — not hidden — while an operation is in progress, matching the existing "Checkout this commit" pattern.
- Rebase items are now also correctly disabled during a cherry-pick or revert in progress (previously the click would fall through and fail at the git layer with "another git operation is already in progress").

## [4.0.0] - pre-release - 2026-05-10

### Added
- **Compare Refs (A vs B)** — new "Compare" toggle panel alongside Filter and Search for inspecting the diff between any two commit-ish references in the active repository.
- Two slot comboboxes (**Base** and **Target**) that accept commits (full or short hash), local branches, remote branches, tags, the `HEAD` sentinel, the `Working Tree` sentinel, and `git rev-parse`-compatible typed expressions (e.g., `HEAD~3`, `origin/main^2`).
- Lazy ref resolution — branches, tags, and typed expressions are stored by user intent and resolved to a hash at Compare-click time, so branch movement or fetched updates between slot fill and Compare are reflected in the result. Only raw pasted hashes are stored as resolved hashes.
- Recently-used items surfaced at the top of each slot's dropdown (per-session, cleared on repo switch).
- Two-dot / three-dot toggle with smart defaults — three-dot when both slots are branches or tags (PR-style "what Target adds since branching off Base"), two-dot when at least one slot is a commit hash or typed expression. Three-dot is automatically disabled when either slot is `Working Tree`.
- Automatic fallback to two-dot with an inline notice when a three-dot comparison resolves to two refs with no common ancestor.
- Swap (⇄) button to exchange Base and Target, per-slot clear (✕) affordances, and a **Reset** button next to Compare that clears both slots, the mode override, recents, and any showing result in one click.
- Right-click entry points on commit rows, branch labels, tag labels, and the uncommitted pseudo-row: **Set as Compare Base** and **Compare with Base** — selecting either also opens the Compare panel as the active toggle so users immediately see slot state.
- **Compare these commits** menu item on multi-selections of ≥2 commits — fills Base with the oldest selected commit, Target with the newest, and runs immediately. Non-contiguous selections collapse to their endpoints.
- Visual **B** and **T** badges on graph rows whose commits match Base or Target, appearing immediately on slot fill (no wait for a comparison to run). Markers coexist with existing branch/tag/HEAD chips.
- Compare result rendered in the existing Commit Details panel with a header naming both ends and the active mode (2-dot or 3-dot); selecting a single commit row dismisses the result and returns to single-commit details.
- Working-tree comparisons auto-refresh on the same signal as the graph — edit a file and the diff updates on the next tick. Ref-vs-ref comparisons stay frozen as a snapshot.
- "No changes" empty state when Base and Target are content-identical (not an error), and a **Cancel** affordance on the loading indicator that aborts the in-flight git diff and leaves slots intact for retry.
- Toolbar Compare button uses the existing three-state convention: default (idle), light blue (panel open), light yellow (panel closed but at least one slot filled) so pending state is never lost behind a closed panel.
- Within-session persistence of slots and mode across panel close/open and graph refreshes; slots clear automatically on active-repo switch and on VS Code window reload.

### Changed
- Default `speedyGit.overScan` lowered from `50` to `20`. Profiling on large repos showed the row count is the only knob that materially affects scroll smoothness — fewer rendered DOM rows means less browser style recalculation, which dominated the trace. Existing user overrides are unaffected.

### Internal
- Extracted pure data-transformation helpers out of `webview-ui/src/stores/graphStore.ts` into focused utility modules with unit tests: `computeHiddenCommitHashes` → `commitVisibility.ts`; `mergeStashesIntoCommits`, `mergeUncommittedIntoCommits`, `computeMergedTopology`, and `UncommittedContext` → `mergedCommits.ts`; `joinRepoPath` → `repoPath.ts`. `graphStore.ts` shrank from 1216 → 1051 lines with no behavior change.
- Added a reusable `createReachabilityChecker(commits)` factory that builds the commit map once and answers repeated reachability checks; `CommitTooltip` and `CommitContextMenu` now memoize one checker per `mergedCommits` change instead of rebuilding an O(n) map on every call.
- `GraphCell` now receives `graphColors` as a prop instead of subscribing to the Zustand store, aligning with the prop-drilled `userSettings` pattern used by `CommitRow` and `CommitTableRow`. Added a shared `resolvePalette(graphColors)` helper in `colorUtils.ts` so the empty-palette fallback lives in one place.
- Extracted a small `PromiseSettledResult<T>` unwrap helper in `WebviewProvider.sendInitialData` to consolidate the eight inline settled-result unwraps and standardize error logging without changing the public message protocol.
- Removed two debug-only `useEffect` blocks in `MultiSelectDropdown.tsx` that logged mount/unmount and open-state changes; clears the lingering lint warnings.

## [3.2.0] - 2026-05-08

### Added
- Right-click any non-current local branch badge to "Fast-forward Local Branch from Remote" — updates the local branch to its remote tip without checkout, leaving your current branch and working tree untouched and creating no stash.
- The fast-forward dialog auto-picks the remote (prefers `origin`, falls back to the first remote alphabetically) and shows a live `git fetch <remote> <branch>:<branch>` preview before you confirm.
- Diverged-branch and missing-remote-ref failures surface git's error message verbatim through the standard error toast; the local branch is left unchanged. No force-update option is offered.

## [3.1.3] - 2026-05-07

### Fixed
- Auto-refresh now updates the graph after IDE-initiated git operations that change refs without changing commits — e.g., creating, renaming, or deleting a branch from VS Code's Source Control panel, or HEAD moving via an external checkout. Previously the new branch label only appeared after a manual refresh because the commit-fingerprint optimization compared commit hashes only, missing ref-only changes and sending `commits=null` to the webview, which kept stale `refs` on each commit.
- Commit fingerprint now incorporates each commit's refs (type, remote, name) so any branch/tag/HEAD change on an unchanged commit list correctly invalidates the cache and triggers a full refresh.

### Internal
- Added regression tests in `WebviewProvider.test.ts` covering the fingerprint behavior for ref-only changes (branch add/remove, HEAD move, tag add, remote disambiguation), preventing future regressions to the auto-refresh path.

## [3.1.2] - 2026-04-30

### Fixed
- Repo selector no longer lists the same repository twice when VS Code's git API reports an identical path string more than once — paths reachable through different strings (symlinks, junctions, sync-mount mirrors) are still treated as separate entries to match VS Code's own workspace behavior

### Internal
- `GitRepoDiscoveryService` now logs the raw repository paths from VS Code's git API whenever duplicate path strings are detected, to aid diagnosing repo-selector duplicate reports

## [3.1.1] - 2026-04-29

### Fixed
- Repo selector trigger no longer renders blank when a submodule shares its basename with the parent repo and the parent is itself the workspace folder — the parent now falls back to its basename instead of an empty disambiguated path

## [3.1.0] - 2026-04-28

### Added
- Submodule selector control next to the repo selector for parent repos that have at least one initialized submodule — defaults to the parent option and lists direct submodules alphabetically by name (case-insensitive)
- Switch directly between two submodules of the same parent in a single selection via the submodule selector, without returning to the parent first
- Repo selector is now a filterable combo box with a text-filter input at the top of the dropdown — type a partial substring to narrow the list using case-insensitive matching, matching the existing branches filter style
- Submodule selector is also a filterable combo box with identical layout, filter behavior, and keyboard/focus contract as the repo selector and branches filter
- Left-to-right reset chain across the top menu — changing the repo selector resets the submodule selector to the parent option (or hides it) and clears the filter/search group's content; changing the submodule selector clears only the filter/search group's content
- Filter and search panels keep their open/closed toggle state across these resets — only the panel content is cleared, never the user's panel-layout choice

### Changed
- A submodule reached via a parent's submodule selector now produces a graph view identical to the same submodule reached as an auto-discovered sub-repo in the repo selector — same commits, same controls, same git operation behavior, with no special header or modal "submodule mode"
- Submodule selector always starts at the parent option on panel reload and VS Code restart; previously-selected submodules are not persisted across sessions or repo selector changes

### Removed
- Removed the submodule header row that previously appeared above the graph for parent repos with submodules
- Removed the "Back to parent" button — navigate via the submodule selector instead
- Removed the legacy `<repo> / Current` title formatting that accompanied the header row
- Removed specially-added submodule entries from the repo selector (e.g., `<parent>-submodules/<submodule>`); only auto-discovered sub-repo entries remain, eliminating duplicate listings for the same submodule

## [3.0.1] - 2026-04-16

### Fixed
- Interactive rebase no longer fails on Windows with "command not found" — temp script paths passed to Git's shell (GIT_SEQUENCE_EDITOR, GIT_EDITOR) are now normalized to forward slashes, preventing Git Bash from stripping backslashes

## [3.0.0] - 2026-04-14
- Included everything in v2.3.x - Uncommitted Node feature, which only published as pre-release
- Performance tuning to start the extension fast, removed unnecessary and redundant data fetching.

## [2.3.4] - pre-release - 2026-04-14

### Changed
Performance tracing version

## [2.3.3] - pre-release - 2026-04-13

### Changed
- Initial graph load now delivers all data (commits, branches, stashes, uncommitted changes, and metadata) in a single coordinated update — the graph appears fully settled in one visual step after the loading indicator, with no flicker or progressive element appearance
- Graph refresh keeps the current graph visible and interactive with a subtle toolbar spinner while fetching new data, then updates in-place in a single visual transition — no more blank screen or intermediate partial states during refresh
- Graph topology (lane assignments, connections, colors) now computed exactly once per load or refresh cycle instead of three times, reducing CPU usage especially on large repositories

### Fixed
- Partial data source failures during load no longer cause a blank screen — the graph renders with all successfully fetched data and shows a non-blocking notification listing which data source(s) failed

## [2.3.2] - pre-release - 2026-04-13

### Fixed
- Uncommitted node now appears nearly instantly after the git graph loads, instead of taking 8–10 seconds on large repos — uncommitted data is fetched in parallel with the commit log rather than sequentially after it
- Replaced 5 sequential git commands for uncommitted status with a single `git status --porcelain=v2` plus 2 numstat commands running in parallel, cutting process spawns and redundant working-tree scans
- Conflict detection now runs in parallel with file status commands instead of waiting for them to finish
- All post-commit metadata fetches (branches, authors, remotes, submodules, worktrees) now run in parallel instead of one-by-one, reducing total load time on initial load and every post-operation refresh (checkout, stash, tag, fetch, etc.)
- Commit details panel loads faster — file list and line-count stats now fetched in parallel instead of sequentially
- Revert state check now runs in parallel with metadata fetches instead of waiting for them to complete
- Removed redundant duplicate submodule data fetch in submodule init/update operations

## [2.3.1] - pre-release - 2026-04-12

### Added
- File picker dialog now renders file rows with the same layout, status badges, and per-file added/deleted line counts (+N −N) as the commit details panel, providing a consistent file browsing experience across the extension
- List and tree view toggle on each section title bar (staged / unstaged) in the file picker dialog — both toggles control a single shared view mode that stays in sync with the commit details panel
- View mode preference shared between the file picker dialog and the commit details panel; changing it in either place is immediately reflected in the other with no extra steps
- Tree view folder checkboxes with cascading select/deselect and tri-state indicators (unchecked / partially checked / fully checked) based on descendant selection state
- Click anywhere on a file row (file name, status badge, or line counts) to toggle its selection in both list and tree views, not just the checkbox
- View mode preference persists across dialog open/close cycles and editor reloads using the existing persistence mechanism
- File selection state preserved when toggling between list and tree views — switching view mode never clears checked files
- File action icons (open diff, open file) hidden in the dialog context since the dialog serves a selection purpose

## [2.3.0] - pre-release - 2026-04-11

### Added
- Uncommitted changes node at the top of the git graph showing current working tree state (staged, unstaged, and untracked files) as a visually distinct node connected to HEAD
- Dynamic node label with categorized file count summary — e.g., "Uncommitted Changes (3 staged, 2 modified, 1 untracked)" — zero-count categories omitted automatically
- Click the uncommitted node to inspect all changed files in the commit details panel with correct status badges, in both list and tree view modes
- Click any file in the uncommitted node's details panel to open a diff view showing changes against HEAD, or full content for untracked files
- Uncommitted node auto-refreshes when files are saved, staged, or modified — appears when changes exist, disappears when the working tree is clean
- Details panel stays open and auto-updates its content when the uncommitted node refreshes, preserving the user's selection
- Uncommitted node is exempt from author, date, and text filters (always visible when changes exist), but respects branch filters — hidden when the current branch is excluded
- Right-clicking the uncommitted node shows a minimal context menu instead of the standard commit actions, preventing irrelevant operations
- Works in all repository states including detached HEAD, during rebase, and during merge conflicts
- Staged and unstaged file changes displayed in separate "Staged Changes" and "Unstaged Changes" sections in the details panel, each with an accurate file count — see at a glance what will be committed vs. what won't
- Stage or unstage individual files via action buttons next to each file in the details panel, with instant section updates; on uncommitted-node file rows the stage/unstage arrow is always visible (no hover required) for one-click access, while Copy path, Open file, and Open current version icons remain hover-only
- "Stage All" and "Unstage All" bulk action buttons on section headers for batch operations across all files in a section
- Discard individual unstaged file changes with a confirmation dialog warning about permanent data loss; untracked files are deleted from disk upon confirmation
- Uncommitted node right-click context menu with operations: Stash Everything… (opens a confirmation dialog with optional message input before any stash is created), Stage All Changes, Unstage All Changes, Discard All Unstaged Changes, and Open Source Control Panel — the "Stash Everything…" label with trailing ellipsis prevents visual confusion with "Stage All Changes" and gives users a safe exit on misclick
- Context menu items conditionally shown or hidden based on current state (e.g., "Stage All" hidden when no unstaged changes exist)
- Multi-select file picker dialog ("Select files for...") from the context menu with a single action radio group (Stage, Unstage, Discard, Stash with message) so users pick a subset of files and choose one unambiguous action
- Live git command preview on every radio row in the file picker dialog (greyed out on disabled rows), with a copy-to-clipboard button shown only on the currently selected row
- Single contextual action button in the file picker dialog whose label and affected-file count update with the selected radio (e.g., `Stage (2)`, `Unstage (3)`, `Discard (2)`, `Stash (5)`); the button is hidden entirely when no files are selected, leaving only Close
- Smart default radio selection on each selection change: Stage when enabled, Unstage when only staged files are selected, none pre-selected when no files are picked
- Stash-with-message row in the file picker dialog includes an inline message input that auto-selects the Stash radio when clicked; empty messages are auto-replaced with `Stash of <N> files from <branch>` so every stash stays identifiable
- Selective stashes that include untracked files automatically run `git add && git stash push` so untracked files end up inside the stash entry instead of being silently dropped; the command preview shows both steps joined with `&&` to match exactly what executes
- Selective stashes always include every renamed-file pair (even when not explicitly selected) to prevent broken half-rename stash entries; the Stash row shows a persistent inline note when renamed files are present
- Per-file Discard confirmation dialog with a scoped title ("Discard Selected Changes"), file count in the description, count-aware action button (`Discard (N)`), and an extra warning when the discard includes untracked files that will be permanently deleted
- After a successful action in the file picker dialog, the dialog stays open, refreshes the file list, preserves the user's prior selection (silently pruning paths that no longer exist), and re-evaluates the radio group — the default radio flips intelligently (e.g., Stage → Unstage) so the next click can immediately undo or chain another action on the same set
- Busy state on the file picker action button while a git command is executing: the action button, file checkboxes, and radio group are all disabled, while Close stays enabled and dismisses the dialog without attempting to cancel the running command
- Inline error banner at the top of the file picker dialog when an action fails, showing the git error message while preserving the file selection and radio choice; failed add-then-stash flows explicitly identify which step failed (`git add` vs `git stash push`) and describe the resulting working-tree state
- "Open file at this commit" icon removed from uncommitted-node file rows (it was redundant — identical to "Open current version" for the working tree); the icon remains present and functional on every regular commit
- Clicking the disabled stash-message text input in the "Select files for…" dialog auto-selects the Stash radio and focuses the field, so the click is never a dead-end interaction
- Disabled action rows in the "Select files for…" dialog still render their command preview in a greyed-out style, so users can see what each action *would* do before changing their selection
- Command preview rows in the "Select files for…" dialog omit the redundant "Command preview:" lead-in label when the radio name already identifies the command, keeping each row visually compact
- Dual-state files (a single path with both staged content and additional working-tree edits) are correctly counted on both the staged and unstaged side of the file picker dialog, and a single such file selected alone qualifies as a "mixed" selection that enables all four action radios
- Merge conflict state display: a "Merge Conflicts" section appears above staged and unstaged sections during merge, rebase, or cherry-pick conflicts, listing conflicted files with an "open file" button for resolution via VS Code's native merge editor
- Staged file content viewing shows the git index version rather than the working tree version, so users can verify exactly what will be committed
- All destructive operation dialogs (discard, stash) include a git command preview, consistent with existing extension dialog patterns
- Partially staged files appear in both Staged and Unstaged sections simultaneously, reflecting git's per-hunk staging model
- Single list/tree view toggle in the top section header applies to all sections (staged, unstaged, conflicts) simultaneously

## [2.2.1] - 2026-04-08

#### Fixed
- Text and author filters now automatically prefetch more commits when all cached commits are hidden, instead of showing an empty graph with no way to load more
- "Load more commits" button replaces the "keep scrolling" message in the gap indicator, providing a clear action when few or no visible commits prevent scrolling
- Scroll-past-gap handler no longer auto-triggers when content is too short to scroll, preventing runaway fetching that loaded the entire repository
- Text filter now correctly shows "No commits match the current filters" instead of "No commits found" in the empty state
- Empty state displays "Loading…" during active prefetch instead of prematurely showing the no-results message

## [2.2.0] - 2026-04-07

#### Added
- Message text filter in the Filter panel — type to hide commits whose message doesn't match, narrowing the graph to only matching results with case-insensitive plain text matching
- Hash prefix matching in the Message filter — commits whose hash starts with the entered text (4+ characters) are also shown
- Clear button on the Message filter field to remove the filter text in a single click
- Text filter combines with existing Author, Date Range, and Branch filters using AND logic for precise multi-criteria filtering
- Debounced text input for responsive filtering without excessive recalculation during typing
- Text filter automatically applies to newly loaded commit batches as they arrive via scroll prefetch
- Stash entries remain visible regardless of Message filter value, consistent with existing filter behavior
- "Reset All" clears the Message filter text along with all other resettable filters
- Search navigation (Next/Prev buttons and F3/Shift+F3 hotkeys) now selects the matched commit, so closing the search panel leaves the last navigated match selected

#### Fixed
- Search panel focus: closing the panel via Esc, Ctrl+F, or Close button no longer loses keyboard focus — hotkeys continue to work immediately after closing

## [2.1.1] - 2026-04-06
No changes - justs a patch release to publish the pre-release 2.1.0 to the marketplace after testing.

## [2.1.0] - pre-release - 2026-04-06

#### Added
- Advanced filter panel accessible from the toolbar filter toggle, with author, date range, and branch filter sections
- Author filter with multi-select dropdown — filter commits by one or more authors, with search by name and email, avatar and email display per option, and "All Authors" to clear selections
- Selected author badges displayed in the filter panel with remove buttons for quick filter management
- Reusable author badge component (avatar icon + name) shared between the filter panel and commit details panel
- Date range filter using react-datepicker with calendar dropdown, optional 24-hour time input, and manual typing support (YYYY-MM-DD or YYYY-MM-DD HH:mm format)
- Date input validation rejects time-only and malformed entries with a red border indicator; clear button on each field removes the filter value with a single click
- Branch filter badges in the filter panel reusing RefLabel with graph-line colors and combined badges for local+remote pairs, each with a remove button
- "Reset All" button clears author and date range filters while preserving branch selections; disabled when no resettable filters are active
- Right-click context menu on author names, dates, and branch badges in the commit list for quick add/remove filter actions
- Filter icon color reflects combined state: yellow when any filter is active, blue when panel is open, gray when inactive
- All filter types combined with AND logic; empty result set displays a "No commits match the current filters" message
- Badge areas (branch and author) independently scroll when exceeding approximately 3–4 lines, keeping other filter panel sections visible
- All filter state resets to defaults on each session/panel open via a centralized reset mechanism to prevent partial resets
- Dotted lines in the git graph connect visible commits through filtered-out gaps, preserving visual branch continuity with matching lane colors
- Tooltip on dotted line segments shows the count of hidden commits in the gap
- Instant graph updates when toggling visibility filters — client-side author filtering with no backend data reload
- Stash entries remain visible regardless of active visibility filters
- Filter-aware scroll prefetch: automatically loads more batches when visible commits are sparse, stops after 3 consecutive empty batches, and shows a gap indicator with filtered-out count and scroll-to-continue action

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

# Architecture Reference — Full File Map

Complete annotated file map of the codebase. **This file is not loaded into agent sessions**
(`CLAUDE.md` is). It exists as an on-demand reference for humans and for agents that are
explicitly pointed at it.

> **Accuracy warning.** This map drifts whenever files are added, renamed, or deleted. It was
> last reconciled against the filesystem on **2026-09-20**. If an entry here disagrees with the
> filesystem, the filesystem wins — verify with `Glob`/`find` before relying on it.

For the architecture that *doesn't* change file-by-file — data flow, RPC conventions, telemetry
policy, performance invariants — see `CLAUDE.md`.

---

## Backend — `src/` (esbuild → `dist/extension.js`, CJS, node18)

```
src/
├── extension.ts                  # Entry point; telemetry service, the git-show content provider (registered once
│                                 #   for the window), speedyGit.showGraph / openNewGraphTab / openForRepo
├── ExtensionController.ts        # Window-level surfaces (repo discovery, status bar, settings, session telemetry)
│                                 #   plus the graph-tab collection: which tab an entry point reveals or creates,
│                                 #   watcher routing, peer-busy broadcast, repo-removal retargeting
├── ExtensionServices.ts          # Everything that must exist exactly ONCE per window: repo discovery, telemetry,
│                                 #   the avatar cache/auth/service/queue, WhatsNewStore + the first-graph flag,
│                                 #   repo identities, the watcher hub, the activity registry, the diff-service map
├── GraphTabRegistry.ts           # The open graph tabs and their most-recently-active order (monotonic counter)
├── RepoActivityRegistry.ts       # Which working trees have an operation running, and which tab started it.
│                                 #   A coarse mirror for the peer notice — never a lock
├── GitShowContentProvider.ts     # git-show:// URI protocol for diffs; resolves the repo from the URI fragment,
│                                 #   never from a global "current" service; `staged`/`worktree` authority sentinels
├── webview/                      # Backend webview subsystem (refactored from the old ~2400-line WebviewProvider)
│   ├── GraphTab.ts               # ONE graph = one editor tab: everything view-scoped, composed from the objects below
│   ├── createGitServices.ts      # Builds the whole repo-bound service set in one place
│   ├── WebviewPanelHost.ts       # One VS Code panel: lifecycle, HTML/CSP/nonce, postMessage, visible/active state
│   ├── WebviewRuntime.ts         # Mutable non-service state: displayed + top-level repo path, resolved identity,
│                                 #   submodule stack, filters, fetch generation, flags, the in-flight commit
│                                 #   controller (amend/fixup) and the cached git version read
│   ├── GitServiceRegistry.ts     # Holds repo-bound git services; atomic replacement on repo switch
│   ├── WebviewMessageRouter.ts   # Exhaustive typed RPC dispatch + allowlisted operation telemetry middleware
│   ├── WebviewRequestContext.ts  # Narrow per-request handler API: services, TelemetryService, getGitVersion(),
│                                 #   the tab's id/identity/top-level repo, and the cross-tab seams
│                                 #   (openNewGraphTab, beginRepoActivity) — never the tab or the registry
│   ├── PersistedUIStateStore.ts  # Load/save/validate UI state + per-repo table layout (column-width healing).
│                                 #   Seed-on-open, last-write-wins across tabs; reloadRepoLayout re-reads only
│                                 #   the table layout on a repo switch
│   ├── RepoDataLoader.ts         # Initial + deferred data, avatar cache hydration/enqueue, submodules, initial-load perf/error telemetry
│   ├── RefreshCoordinator.ts     # When to load: initial/manual/auto, hidden-panel deferral, loading lifecycle
│   ├── EditorCommandService.ts   # VS Code diff/file/compare editors, worktree folder/reveal, signature help.
│                                 #   findRemovableWorktree answers with the list it guarded against, so a removal
│                                 #   resolves its base dir off that one `git worktree list`
│   ├── OperationGuard.ts         # In-progress checks (rebase/cherry-pick/revert/merge) → GitError | null
│   └── handlers/                 # Domain RPC handlers; fetch services from the registry at call time
│       ├── graphDataHandlers.ts  # getCommits/loadMore/getBranches/getCommitDetails/getAuthors/refresh
│       ├── branchHandlers.ts     # create/rename/delete/fast-forward branch; commit checkout; merge + continue/abort merge
│       ├── branchCheckoutHandlers.ts # Shared branch checkout/stash/pull execution; operation guard, busy lock,
│                                     #   repository-bound recovery and request-correlated completion
│       ├── remoteHandlers.ts     # fetch/push/pull, add/edit/remove remote
│       ├── tagHandlers.ts        # create/delete/push tag (optional chained push, remote delete, force — 048)
│       ├── stashHandlers.ts      # get/apply/pop/drop/create stash
│       ├── historyHandlers.ts    # reset/cherry-pick/revert/rebase (+ autosquash, version-chosen) + continue/abort,
│                                 #   getRebaseRangeCommits, dropCommit; a pause with nothing to resolve is reported
│                                 #   as "stopped at a commit that became empty"
│       ├── commitHandlers.ts     # getCommitMessage (%B), amendCommit (HEAD-verified) + createFixupCommit through one
│                                 #   guarded, cancellable runner; cancelCommitWait; getGitVersion
│       ├── signatureHandlers.ts  # presence detection, verification, signature help
│       ├── submoduleHandlers.ts  # submodule ops + switchRepo/displayRepo navigation, per tab
│       ├── revalidateRef.ts      # Re-reads a ref immediately before a ref-position-dependent action and refuses
│                                 #   (REF_MOVED, ordinary error channel) when it moved — no re-run-anyway path
│       ├── worktreeHandlers.ts   # list/resolve/add/remove/prune/open/reveal worktree; resolves the base dir once
│                                 #   per request and threads it into the list payload, remove-prune and prune-sweep
│       ├── workingTreeHandlers.ts# uncommitted changes, stage/unstage/discard, diff editors
│       ├── compareHandlers.ts    # compareRefs/cancelCompare/openCompareDiff (latest-wins by request id)
│       ├── telemetryHandlers.ts  # Validates one-way webview telemetry against closed catalogs
│       ├── avatarHandlers.ts      # Avatar auth state, GitHub authorize/remove-token, refreshDays setting, clear cache
│       ├── updateSpeedyGitSetting.ts # Writes one speedyGit.* setting; ExtensionController broadcasts the change.
│                                 #   …InDefinedScope writes to Workspace when a workspace value already exists,
│                                 #   so a Global write cannot be silently shadowed
│       └── vscodeCommandHandlers.ts # settings, clipboard, openExternal, updatePersistedUIState, openNewGraphTab
├── services/                     # All repo-bound; every method returns Result<T, GitError>
│   ├── index.ts                  # Barrel export for all services
│   ├── GitExecutor.ts            # Spawns git processes, 30s timeout — the only place git is invoked
│   ├── GitLogService.ts          # Parses git log (null-byte format), branches, branches-containing-a-commit. Default 500 commits.
│   │                             #   Also walks stash base commits, so a stash survives its branch moving
│   ├── GitDiffService.ts         # Commit details, file changes, file content at revision; submodule (gitlink) pointers
│   ├── GitBranchService.ts       # Checkout, create, rename, delete, fast-forward branches; merge any commit-ish + merge state/continue/abort
│   ├── GitRemoteService.ts       # Fetch, pull, remote management
│   ├── GitHistoryService.ts      # Rebase, reset operations
│   ├── GitRebaseService.ts       # Rebase (autosquash via shared/rebaseCommand), interactive rebase (todo + editor
│                                 #   messages via shared/rebaseTodo), rebase range read, conflict/empty-commit pause info
│   ├── gitEditorScripts.ts       # "git opens an editor; supply this text": temp dir, #!/bin/sh scripts with paths via
│                                 #   SPEEDY_* env vars, toShellPath, and the amend!-title-keeping message editor
│   ├── GitCherryPickService.ts   # Cherry-pick with conflict handling
│   ├── GitRevertService.ts       # Revert commits
│   ├── GitTagService.ts          # Create/delete/push tags (incl. remote delete, force), tag metadata from refs/tags (048)
│   ├── GitStashService.ts        # Apply, pop, drop stash entries
│   ├── GitIndexService.ts        # Stage/unstage, discard, commit (uncommitted-node operations)
│   ├── GitCommitService.ts       # Read a commit's full message; amend HEAD (--only / -F, 60s hook ceiling,
│                                 #   expectedHead guard, cancel outcome observed from HEAD not assumed);
│                                 #   createFixupCommit (fixup/squash/amend!/reword! via shared/fixupCommit)
│   ├── GitWorktreeService.ts     # Worktree list/add/remove; resolves BOTH candidate folders (nested + flat) in
│                                 #   one round trip; resolveBaseDir takes an already-fetched list; prunes emptied
│                                 #   parents after remove and sweeps the base dir after prune
│   ├── GitSignatureService.ts    # GPG/SSH signature verification
│   ├── GitSubmoduleService.ts    # Submodule status, init, update
│   ├── GitWatcherHub.ts          # One watcher set per object store, ref-counted across tabs; watches the RESOLVED
│                                 #   git dirs (so linked worktrees and submodules work), per-key debounce
│   ├── GitRepoIdentityService.ts # Resolves+caches gitDir / commonGitDir / topLevel per repo, one spawn, coalesced
│   ├── GitRepoDiscoveryService.ts # Multi-root workspace scanning (the removal NOTICE lives in ExtensionController)
│   ├── GitHubAvatarService.ts    # Stateless one-shot GitHub avatar lookup + rate-limit tracking (reset on authorization)
│   ├── avatarCachePolicy.ts      # PURE: avatar expiry, lookup-outcome state machine, queue priority, LRU eviction (bounds/clamp live in shared/types.ts)
│   ├── AvatarCacheStore.ts       # Persistent email→avatar cache in globalState; debounced writes, LRU cap 1000 (512KB extension-state budget)
│   ├── AvatarRefreshQueue.ts     # Paced background drain (1/sec), interruptible rate-limit pause, batched result posting
│   ├── GitHubAuthService.ts      # Explicit opt-in gate for the GitHub session used by avatar lookups
│   ├── WhatsNewStore.ts          # Owns the one fact the webview can't know: is this the first run on this version.
│   │                             #   Dev mode always shows and records nothing — the debug host shares one globalState
│   │                             #   with the installed extension; release records the version once the user closes it
│   ├── GitConfigService.ts       # Git config reading; getGitVersion (read once per panel through the request context)
│   └── TelemetryService.ts       # Consent-aware backend telemetry funnel; real + no-op implementations
└── utils/
    ├── gitParsers.ts             # Parse git log lines, refs (%D), branch list, stash base (%P); classify git stderr
    │                             #   (conflict, nothing-to-apply); trimCommitMessage (%B trailing-newline rule)
    ├── gitQueries.ts             # Shared read-only git queries. isDirtyWorkingTree counts untracked
    │                             #   files — for `worktree remove` only; never gate rebase/pick/revert on it
    ├── gitValidation.ts          # Input validation (backend wrappers over shared/gitRefValidation)
    ├── repoIdentity.ts           # PURE: gitDir / commonGitDir / topLevel and the three questions built on them —
    │                             #   same working tree, same object store, submodule containment. One pathsEqual
    │                             #   rule (drive letter only on win32; POSIX paths stay case-sensitive)
    ├── graphTabRouting.ts        # PURE: every "which tab(s)?" answer — MRU return target, repository-aware SCM
    │                             #   target, refresh routing, same-working-tree peers, and the editor tab title
    ├── editorSplitFill.ts        # PURE: "Split Editor Right" on a graph. A webview cannot be duplicated, so the
    │                             #   split is recognised from its aftermath — a group that opened EMPTY while the
    │                             #   group the user was in had a graph as its active tab
    ├── gitShowUri.ts             # PURE: the git-show: URI contract. The FRAGMENT carries the repository (plus an
    │                             #   optional cache-busting nonce for the submodule working-tree side)
    ├── debounceByKey.ts          # PURE: debounce + minimum interval, kept per key, so a storm in one repo cannot
    │                             #   delay another repo's refresh
    ├── emptyDirCleanup.ts        # Delete folders a worktree removal emptied. `rmdir` IS the emptiness test (never
    │                             #   readdir-then-delete); symlinks never followed; baseDir never deleted; failures
    │                             #   logged and swallowed, so a caller's Result never changes. The sweep stops at any
    │                             #   dir holding a `.git` entry, so it never walks or empties a worktree's own tree.
    │                             #   `rmdir` is also the type/symlink test, so no path stats before removing
    ├── worktreePathSegments.ts   # PURE: ref → sanitized folder segments (per-segment allowlist, `.`/`..` dropped,
    │                             #   `/` and `\` both split); normalizePathForCompare (the one "same place?" rule,
    │                             #   case-insensitive on win32) and the isInsideBaseDir containment guard built on it
    └── worktreeErrors.ts         # Map raw git worktree failures → friendly messages
```

---

## Frontend — `webview-ui/src/` (Vite + React → `dist/webview/`)

`App.tsx` is the root: `ControlBar` + `TogglePanel` + `GraphContainer` + `CommitDetailsPanel`.

### Graph rendering

```
components/
├── GraphContainer.tsx            # Virtual scrolling (@tanstack/react-virtual, ROW_HEIGHT: 28px)
├── CommitTableRow.tsx            # Table-style commit row with resizable columns (memoized); threads search terms into
│                                 #   the message/author/hash/badge cells
├── CommitTableHeader.tsx         # Draggable/resizable column headers (@dnd-kit); Author gear shortcut to avatar setup
├── GraphCell.tsx                 # SVG graph rendering (LANE_WIDTH: 16px, 8 cycling colors)
├── CommitDetailsPanel.tsx        # Resizable bottom/right panel, commit metadata + file changes
├── CommitTooltip.tsx             # Radix popover tooltip for a row: refs, parents, external ref parsing
├── RefLabel.tsx                  # One ref badge (branch/tag/worktree), styled per ref kind; presentation only — content decisions live in `utils/refBadgeContent.ts`.
│                                 #   Optional `searchTerms` boxes matches in the label; `searchRing` outlines a badge that matched on text it doesn't show
├── OverflowRefsBadge.tsx         # "+N" popover holding refs that don't fit the row; same menus as inline badges.
│                                 #   Rings the +N trigger when a ref folded into it matched the search
├── HighlightedText.tsx           # Renders `searchHighlight` segments as text + match boxes; owns SEARCH_MATCH_STYLE
│                                 #   (inset box-shadow, so a box adds no width) and SEARCH_MATCH_RING_STYLE
├── DetachedWorktreeBadge.tsx     # Badge for a detached-HEAD worktree row (046)
├── SignatureColumnCell.tsx       # Grouped signature glyphs in the optional "Signature" column (047)
├── AuthorAvatar.tsx              # Gravatar/GitHub avatar with initials fallback + load-state cache
├── AuthorBadge.tsx               # Author chip/inline label wrapping AuthorAvatar
└── icons/index.tsx               # All SVG icon components
```

### Toolbar, panels, widgets

```
├── ControlBar.tsx                # Top toolbar with actions, incl. "Open New Graph Tab" beside Go to HEAD and the
│                                 #   peer-activity notice (informational; it disables nothing)
├── ResponsiveToolbar.tsx         # Measures visible action widths; collapses right then left into More dropdowns
├── ToolbarIconButton.tsx         # Shared toolbar button: icon + optional label (speedyGit.toolbar.showLabels);
│                                 #   right-click menu toggles labels / Remote button, extensible via extraMenuItems
├── TogglePanel.tsx               # Collapsible panel for Filter/Search/Compare widgets
├── FilterWidget.tsx              # Author/date filter panel (react-datepicker)
├── SearchWidget.tsx              # Text search across commits. Owns the one canonical parse per recompute; typing is
│                                 #   debounced 300ms, everything else recomputes at once in a layout effect
├── CompareWidget.tsx             # Branch comparison
├── WorktreeWidget.tsx            # Worktree list + create/remove (046-git-worktrees)
├── ViewSettingsDialog.tsx        # Centered View settings dialog: columns left, avatars right (Radix dialog + @dnd-kit sortable); open state lives in the store
├── AvatarSettingsSection.tsx     # Avatars pane of the View dialog: GitHub allow/remove-token, refresh-days, clear cache
├── RepoSelector.tsx              # Multi-root repo picker (FilterableSingleSelectDropdown)
├── SubmoduleSelector.tsx         # Parent/submodule navigation picker
├── ToastContainer.tsx            # Transient success/error toasts driven by the store
├── RebaseConflictBanner.tsx      # "Rebase paused due to conflict" bar + continue/abort; empty-commit wording when
│                                 #   git stopped with nothing to resolve
└── CherryPickConflictBanner.tsx  # Same, for a paused cherry-pick
```

### Context menus

```
├── CommitContextMenu.tsx         # Commit row menu
├── BranchContextMenu.tsx         # Branch/tag ref badge menu + lightweight double-click trigger
├── BranchCheckoutDialogs.tsx     # App-level checkout/pull, stash recovery, and worktree navigation dialogs;
│                                 #   survives row virtualization and works before any menu is opened
├── StashContextMenu.tsx          # Stash pseudo-commit menu
├── AuthorContextMenu.tsx         # Author cell menu
├── DateContextMenu.tsx           # Date cell menu
├── UncommittedContextMenu.tsx    # Uncommitted-changes node menu
└── LazyContextMenu.tsx           # Wraps a Radix menu so its heavy body (items/dialogs/store subscriptions)
                                  #   mounts only on first right-click — keeps virtualized rows cheap when scrolling
```

Menu building blocks — see `CLAUDE.md` for the reuse rules:

```
├── useCommitMenuItems.tsx        # All commit actions, grouped
├── MenuItem.tsx                  # A menu command; `disabled`/`danger` drive behaviour + styling together
├── MenuContent.tsx               # The menu panel shell: width floor + height cap + collision padding in one place
├── MenuSubTrigger.tsx            # Submenu opener: trailing chevron, stays highlighted while open
├── MenuGroupSeparator.tsx        # Divider, optionally captioned `label` + `name` (11px tall either way)
├── MenuCopySubmenu.tsx           # Shared "Copy" submenu
├── CompareMenuItems.tsx          # "Set as Compare Base" / "Compare with Base" pair (042)
├── WorktreeMenuItems.tsx         # Worktree entries shared across menus (046)
└── menuStyles.ts                 # Tailwind class strings composed from one geometry + hover base; item variants exported only to `MenuItem`
```

### Dialogs

All use `dialogStyles.ts` for sizing and `useDialogTelemetry` for outcome reporting.

```
├── dialogStyles.ts               # Shared dialog width/resize, the primary/secondary/danger button variants (one shared
│                                 #   base), the note/warning/error message boxes (one shared base) and the commit-message textarea
├── ConfirmDialog.tsx             # Generic confirm (danger/warning variants) + CommandPreview; optional focusConfirm
│                                 #   overrides Radix's default Cancel focus where proceeding is the expected answer
├── InputDialog.tsx               # Generic single-input dialog + FieldError
├── CommandPreview.tsx            # Live git command preview shown in dialogs
├── FieldError.tsx                # Validation message under inputs (pairs with aria-invalid/aria-describedby)
├── MergeDialog.tsx  RebaseConfirmDialog.tsx  CherryPickDialog.tsx  RevertDialog.tsx
│                                 #   MergeDialog takes any commit-ish (branch / remote branch / tag / commit) + a kind for wording
│                                 #   RebaseConfirmDialog: Ignore date + Autosquash (range read on open; ticked iff a commit applies)
├── DropCommitDialog.tsx  InteractiveRebaseDialog.tsx + InteractiveRebaseRow.tsx + InteractiveRebaseDragBlock.tsx (@dnd-kit sortable)
│                                 #   Autosquash checkbox (pre-checked when anything matches), squash-group bracket per row,
│                                 #   each squash group is one sortable block, so its rows only ever move together,
│                                 #   command preview on every step and the exact todo list on Confirm
├── AmendCommitDialog.tsx         # Amend Last Commit: full-message box, include-staged / force-push options,
│                                 #   published + signature notes, hook-wait state; stays open on every failure
├── FixupCommitDialog.tsx         # Create Fixup Commit: kind (fixup/squash/amend/reword, amend/reword gated on git 2.32),
│                                 #   include staged / -a, message per kind in a height-stable slot, not-an-ancestor and
│                                 #   untracked warnings, nothing-to-commit note, hook-wait; decisions in fixupCommitOptions
├── CommitHookWait.tsx            # Hook-wait notice + Cancel / "Cancel wait" button shared by the amend and fixup dialogs
├── AutosquashWarnings.tsx        # Unmatched / ambiguous autosquash warnings shared by both rebase dialogs
├── CreateBranchDialog.tsx  DeleteBranchDialog.tsx  CheckoutWithPullDialog.tsx
├── TagCreationDialog.tsx  DeleteTagDialog.tsx  PushTagDialog.tsx
├── PushDialog.tsx  RemoteManagementDialog.tsx  StashDialog.tsx
├── CreateWorktreeDialog.tsx      # Branch mode, env-file copy, and — for a branch name containing `/` — the
│                                 #   Nested/Flatten folder radio pair, discard confirmation and save-default link
├── RemoveWorktreeDialog.tsx
├── DiscardDialog.tsx  DiscardAllDialog.tsx  FilePickerDialog.tsx
├── RefBadgeLegend.tsx            # Standalone "Badge Legend" section; samples are real `RefLabel`s in lane-0 color
│                                 #   so it can't drift from the graph. Needs no props — reused by the What's New dialog
├── WhatsNewDialog.tsx            # First-run release notes, poster layout (gradient hero + headline + optional
│                                 #   illustration); close button counts down before enabling (Esc/outside held too)
├── whatsNewEntries.tsx           # Per-version release-note content, looked up by exact version. A version with no
│                                 #   entry shows no dialog — that is how a release opts out
├── whatsNewBlocks.tsx            # Poster pieces entries compose: ContributorThanks, FeatureCard/Grid, Step/StepFlow,
│                                 #   UiLabel, ToolbarButtonSample, WhatsNewSection, ExternalLink
├── AutosquashIllustration.tsx    # 5.16.0 hero: animated mini-graph of a fixup! commit folding into its target
├── MultiTabIllustration.tsx      # 5.17.0 hero: animated miniature of the New Tab button opening a second graph group
└── HelpDialog.tsx                # "Help & Feedback": Badge Legend + GitHub Issues + docs/changelog/marketplace + version
```

### Shared inputs & file views

```
├── MultiSelectDropdown.tsx           # Generic multi-select popover with pinned actions
├── MultiBranchDropdown.tsx           # Branch-specific wrapper, grouped local/remote
├── FilterableSingleSelectDropdown.tsx# Generic searchable single-select (repo/submodule pickers)
├── FileChangeShared.tsx              # Row/badge/action-icon primitives + shouldShowChangeCounts + SubmoduleBadge
├── FileChangesTreeView.tsx           # Tree rendering over fileTreeBuilder output
└── datepicker-overrides.css          # react-datepicker theming
```

### Stores, RPC, hooks, types

```
stores/
├── graphStore.ts                 # Zustand store: commits, branches, topology, filters, UI state (~1350 lines).
│                                 #   044-code-refactor replaced whole-store subscriptions with selectors
│                                 #   rather than splitting the file
└── graphSelectors.ts             # Derived reads shared by several components (useOperationInProgress,
                                  #   useCurrentLocalBranch) — one selector each, so callers can't disagree.
                                  #   isOwnOperationInProgress is the PURE half: THIS tab only, never a peer's

rpc/rpcClient.ts                  # Singleton RPC client, webview↔extension via acquireVsCodeApi()

hooks/
├── useTooltipHover.ts            # Tooltip positioning logic
├── useCopyFeedback.ts            # copyToClipboard + short "copied" flash, shared by every copy button
├── useSignatureColumnLoader.ts   # Async viewport-first signature verification loader (047)
├── useCountdown.ts               # Deadline-based countdown (survives background throttling); + PURE `remainingSeconds`
├── useCommitHookWait.ts          # idle → running → waitingOnHooks phase + timer for dialogs that write a commit
├── useGitVersion.ts              # Lazily requests the installed git version once per session (store: gitVersion)
├── useDialogTelemetry.ts         # One confirmed/cancelled outcome per dialog open cycle
└── useCapturedRefExpectation.ts  # Holds where a dialog's target ref stood WHEN IT OPENED — capturing at confirm
                                  #   would defeat the check, since the tab auto-refreshes while a dialog is open

types/displayRefs.ts              # Discriminated union for ref-label rendering (local-branch/remote-branch/tag/HEAD/…)
```

### Utils

```
utils/
├── graphTopology.ts              # Core graph algorithm (~720 lines): lanes, colors, connections
├── graphPaths.ts                 # SVG "rounded elbow" builders for lane-changing lines — lines cross row
│                                 #   boundaries perfectly vertically so per-row SVG cells join without kinks (5.4.0)
├── commitReachability.ts         # Branch reachability per commit; checkers cached by commit-list identity (WeakMap)
├── commitRefs.ts                 # Row predicates by ref decoration (isHeadRow/findHeadCommit/findHeadCommitHash,
│                                 #   isStashPseudoCommit) — used by topology, uncommitted parent, tooltip, Go to HEAD
├── commitMenuAvailability.ts     # Which commit actions apply (rebase/reset/revert/drop/cherry-pick/merge/amend/fixup)
│                                 #   + hasRemoteCounterpart: does the checked-out branch have a remote (gates force push)
├── headNavigation.ts             # "Go to HEAD" decision logic + toast messages
├── rowVisibility.ts              # Scroll-offset maths for revealing a row when the details panel resizes the viewport
├── commitVisibility.ts           # Visibility/filter predicates for the virtualized row list
├── compareSlot.ts                # Compare panel slot model (Base/Target, commit-ish parsing)
├── compareDefaults.ts            # Default slot seeding
├── compareDispatch.ts            # Resolve compare request → backend RPC
├── compareMarker.ts              # Per-row "B"ase / "T"arget badge derivation
├── externalRefParser.ts          # Parse typed commit-ish expressions (HEAD~3, origin/main^2, …)
├── resolveDefaultRemote.ts       # Default remote selection; resolvePublishedBranchRemote requires an existing, unambiguous branch destination
├── amendMessages.ts              # Post-amend force-push wording; translates git's `stale info` lease rejection
├── rebaseSquashMessages.ts       # Combined message per squash group — full messages, never subjects; a squashed
│                                 #   squash!/fixup!/amend! commit's title paragraph is dropped, as git does
├── autosquash.ts                 # PURE: git's autosquash matching ported from sequencer.c (subject, hash prefix,
│                                 #   subject prefix; nested prefixes) + apply/revert on the todo list. Both rebase dialogs
├── rebaseGroups.ts               # PURE: lead/member/last position of each interactive-rebase row, from shared groupRebaseEntries; drag blocks + block move
├── fixupCommitOptions.ts         # PURE: Create Fixup Commit availability, preselection and confirm rules
├── branchCheckout.ts             # Shared checkout decisions and interaction dispatch; menu vs double-click
│                                 #   pull policy, busy/worktree checks, telemetry; reads store only on interaction
├── branchSelection.ts            # getBranchKey (bare name vs remote/name) + additive select-all-local
├── mergedCommits.ts              # Detect merged-branch commit grouping for badges
├── refNameField.ts               # Live ref-name validation state (error suppressed while pristine)
├── gitCommandBuilder.ts          # Constructs git command strings for preview display (rebase and fixup previews wrap
│                                 #   the backend's shared arg builders)
├── helpLinks.ts                  # Help dialog links + build-time version (__EXTENSION_VERSION__)
├── commitTableLayout.ts          # Column layout persistence & manipulation
├── fileTreeBuilder.ts            # Flat file list → tree structure
├── radioAvailability.ts          # Enable/disable logic for mutually-exclusive options
├── mergeRefs.ts                  # Merges local/remote refs into DisplayRef[]. `filterDisplayRefsBySettings` is the single
│                                 #   source of truth for which badges a row shows — the renderer and the search matcher both call it
├── refMergeSource.ts             # Whether a ref badge can be merged and under what name — a remote branch
│                                 #   must be handed to `git merge` as `<remote>/<name>`, never the bare name
├── refWorktreeSource.ts          # The same question for "Create worktree…": which ref the badge hands to
│                                 #   `git worktree add`, likewise `<remote>/<name>` for a remote branch. Owns the
│                                 #   WorktreeSource types. Does NOT ask whether a local branch of that name exists
├── signatureGlyph.ts             # SignatureStatus → glyph/color (047); the single status→color map, reused by the details-panel labels
├── worktreeBadgeStyle.ts         # Worktree badge styling (046); hardcoded colors are deliberate — contrast vs. user lane colors
├── worktreeDisplay.ts            # Worktree list formatting/derivation (046). worktreeFolderName labels a worktree
│                                 #   by its path BELOW the configured base dir, since nesting makes the last
│                                 #   segment ambiguous; outside the base dir it stays the last segment
├── worktreePathChoice.ts         # PURE: the Create Worktree folder choice — dirty check vs. the computed path,
│                                 #   switch verdict (ignore/switch/confirm), save-default link visibility. Re-exports
│                                 #   WORKTREE_STYLE_LABELS / ResolvedWorktreePaths from shared/types (the backend's
│                                 #   toast must name the style the dialog does)
├── refExpectation.ts             # PURE: builds the RefExpectation a dialog sends for the stale-ref check —
│                                 #   HEAD from the graph's own HEAD row, a local branch, a remote branch always
│                                 #   qualified `<remote>/<name>`, and the rebase target. `undefined` when unknown
├── peerActivityNotice.ts         # PURE: whether to say "another Speedy Git view is running a Git operation",
│                                 #   and in what words. A notice only — it gates no control
├── telemetry.ts                  # Fire-and-forget webview telemetry helpers
├── searchQuery.ts                # PURE: query → AND-ed terms; a `"quoted run"` is one literal term, an unterminated
│                                 #   quote is literal from the quote on. Owns EMPTY_SEARCH_TERMS. `:` is reserved
├── searchFilter.ts               # Client-side search over subject, author name/email, hash prefix (4+ chars, per term)
│                                 #   and every ref badge the row actually renders. Never matches the uncommitted row
├── searchHighlight.ts            # PURE: substring/prefix highlight segments (overlapping and adjacent matches merge
│                                 #   into one box) + `refSearchMatchKind` — label match, hidden match, or none
├── filterUtils.ts                # Author/date filter logic
├── refStyle.ts                   # Per-ref-kind badge styling
├── refBadgeContent.ts            # What a ref badge shows: label, lead icons (fork = local, cloud = remote;
│                                 #   merged = both), remote count on the cloud, and the title tooltip
├── refBadgeLegend.ts             # Legend rows explaining the badge vocabulary; a test enforces that every
│                                 #   DisplayRef type appears, so a new ref kind can't ship unexplained
├── themeColors.ts                # Semantic VS Code theme tokens (added/deleted/warning/accent/signature…) + `tint()`; the one place a color meaning is named
├── colorUtils.ts                 # Graph color cycling + theme helpers
├── formatDate.ts                 # Commit-date formatting
├── gravatar.ts                   # Gravatar URL builder + load-state cache
├── stashMessage.ts               # Format stash entries for display
├── uncommittedUtils.ts           # Helpers for the uncommitted-node row
├── repoPath.ts                   # Repo path normalization
└── inlineCodeRenderer.tsx        # Renders inline-code spans in commit messages; boxes search matches within each segment
```

---

## Shared & build

```
shared/
├── types.ts                      # Domain types: Commit, Branch, RefInfo, GraphFilters, CommitDetails, …; cross-boundary setting
│                                 #   clamps (batch size, avatar refresh days), worktreeBasePathOf (the one settings fallback),
│                                 #   the worktree folder-style enum + its UI labels, and ResolvedWorktreePaths
├── messages.ts                   # RequestMessage/ResponseMessage union types for RPC
├── errors.ts                     # Result<T,E> monad, GitError class, GitErrorCode enum
├── gitRefValidation.ts           # git check-ref-format validator + tag/branch/remote wrappers — the same rules
│                                 #   drive live dialog validation (frontend) and creation guards (backend)
├── gitVersion.ts                 # PURE: parse `git --version` (vendor suffixes), feature minimums; UI gating fails
│                                 #   open (supportsGitFeature), command choice takes the universal form
│                                 #   (usesNonInteractiveAutosquash)
├── fixupCommit.ts                # PURE: `git commit --fixup/--squash` args — the backend runs and the dialog previews them
├── rebaseCommand.ts              # PURE: `git rebase` args incl. version-chosen autosquash form (+ no-op sequence editor)
├── rebaseTodo.ts                 # PURE: interactive rebase todo lines, git's squash-group rule (groupRebaseEntries) +
│                                 #   editor messages in the order git asks for them
├── refRevalidation.ts            # PURE: the stale-dialog check — RefExpectation, isRefMoved, and the one wording
│                                 #   for both "changed" and "no longer exists". Refuse-only; no re-run path
├── telemetry.ts                  # Closed telemetry catalogs, payload types, buckets (incl. the open-tab-count
│                                 #   bucket and the five panelOpened triggers), MUTATING_OPERATIONS, validator
└── whatsNew.ts                   # PURE: whether the release-notes dialog opens on this run + the countdown lengths
                                  #   (dev always shows, 2s; release shows once per version, 5s), and whether a
                                  #   dismissal may be recorded at all (never in dev — shared globalState)

telemetry.json                    # Machine-readable event manifest for VS Code telemetry inspection
esbuild.config.mjs                # Production-only telemetry destination injection; empty in dev/test builds
```

Tests live in `__tests__/` directories beside the code they cover (Vitest).
`webview-ui/src/components/__tests__/ResponsiveToolbar.test.ts` covers collapse thresholds,
label/button visibility in inline and dropdown rendering, the Remote context-menu toggle,
and compiled separator CSS. Static React rendering does not exercise DOM observers or layout.
Branch checkout coverage includes `src/__tests__/branchCheckoutHandlers.test.ts` (execution, guards,
recovery and navigation races), `webview-ui/src/utils/__tests__/branchCheckout.test.ts` (gesture policy
and RPC lifecycle), and `webview-ui/src/components/__tests__/BranchContextMenu.test.ts` (badge events).

`webview-ui/src/rpc/__tests__/amendSelection.test.ts` covers post-amend selection and open-details refresh.

Multi-tab coverage is split by decision: the pure rules in `src/__tests__/repoIdentity.test.ts`,
`graphTabRouting.test.ts`, `gitShowUri.test.ts`, `editorSplitFill.test.ts`, `refRevalidation.test.ts`
and `debounceByKey.test.ts`;
the wiring in `ExtensionController.tabs.test.ts` (reveal vs create, SCM routing, new-tab origin, split
editor fill, What's New, `panelOpened`, repo removal), `GraphTabRegistry.test.ts`, `ExtensionServices.test.ts`,
`GitWatcherHub.test.ts`, `RepoActivityRegistry.test.ts`, `GitShowContentProvider.test.ts` and
`refRevalidationHandlers.test.ts`. Note the repo's tests are Node-environment only — there is no
jsdom or React testing library, so component behaviour is covered through static rendering or pure utils
such as `peerActivityNotice`, `refExpectation` and `isOwnOperationInProgress`.

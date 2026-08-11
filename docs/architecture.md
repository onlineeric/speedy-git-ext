# Architecture Reference — Full File Map

Complete annotated file map of the codebase. **This file is not loaded into agent sessions**
(`CLAUDE.md` is). It exists as an on-demand reference for humans and for agents that are
explicitly pointed at it.

> **Accuracy warning.** This map drifts whenever files are added, renamed, or deleted. It was
> last reconciled against the filesystem on **2026-08-11**. If an entry here disagrees with the
> filesystem, the filesystem wins — verify with `Glob`/`find` before relying on it.

For the architecture that *doesn't* change file-by-file — data flow, RPC conventions, telemetry
policy, performance invariants — see `CLAUDE.md`.

---

## Backend — `src/` (esbuild → `dist/extension.js`, CJS, node18)

```
src/
├── extension.ts                  # Entry point; creates telemetry service, registers speedyGit.showGraph
├── ExtensionController.ts        # Orchestrates services, repo discovery, settings, session telemetry
├── WebviewProvider.ts            # Compatibility re-export of webview/WebviewProvider
├── GitShowContentProvider.ts     # git-show:// URI protocol for diffs
├── webview/                      # Backend webview subsystem (refactored from the old ~2400-line WebviewProvider)
│   ├── WebviewProvider.ts        # Thin public facade used by ExtensionController; composes the objects below
│   ├── WebviewPanelHost.ts       # VS Code panel lifecycle, HTML/CSP/nonce, postMessage, visibility
│   ├── WebviewRuntime.ts         # Mutable non-service state: repo path, filters, fetch generation, flags
│   ├── GitServiceRegistry.ts     # Holds repo-bound git services; atomic replacement on repo switch
│   ├── WebviewMessageRouter.ts   # Exhaustive typed RPC dispatch + allowlisted operation telemetry middleware
│   ├── WebviewRequestContext.ts  # Narrow per-request handler API, including TelemetryService
│   ├── PersistedUIStateStore.ts  # Load/save/validate UI state + per-repo table layout (column-width healing)
│   ├── RepoDataLoader.ts         # Initial + deferred data, avatar cache hydration/enqueue, submodules, initial-load perf/error telemetry
│   ├── RefreshCoordinator.ts     # When to load: initial/manual/auto, hidden-panel deferral, loading lifecycle
│   ├── EditorCommandService.ts   # VS Code diff/file/compare editors, worktree folder/reveal, signature help
│   ├── OperationGuard.ts         # In-progress checks (rebase/cherry-pick/revert/merge) → GitError | null
│   └── handlers/                 # Domain RPC handlers; fetch services from the registry at call time
│       ├── graphDataHandlers.ts  # getCommits/loadMore/getBranches/getCommitDetails/getAuthors/refresh
│       ├── branchHandlers.ts     # checkout/create/rename/delete/merge/fast-forward branch
│       ├── remoteHandlers.ts     # fetch/push/pull, add/edit/remove remote
│       ├── tagHandlers.ts        # create/delete/push tag (optional chained push, remote delete, force — 048)
│       ├── stashHandlers.ts      # get/apply/pop/drop/create stash
│       ├── historyHandlers.ts    # reset/cherry-pick/revert/rebase + continue/abort, dropCommit
│       ├── signatureHandlers.ts  # presence detection, verification, signature help
│       ├── submoduleHandlers.ts  # submodule ops + switchRepo/displayRepo navigation
│       ├── worktreeHandlers.ts   # list/resolve/add/remove/prune/open/reveal worktree
│       ├── workingTreeHandlers.ts# uncommitted changes, stage/unstage/discard, diff editors
│       ├── compareHandlers.ts    # compareRefs/cancelCompare/openCompareDiff (latest-wins by request id)
│       ├── telemetryHandlers.ts  # Validates one-way webview telemetry against closed catalogs
│       ├── avatarHandlers.ts      # Avatar auth state, GitHub authorize/remove-token, refreshDays setting, clear cache
│       └── vscodeCommandHandlers.ts # settings, clipboard, openExternal, updatePersistedUIState
├── services/                     # All repo-bound; every method returns Result<T, GitError>
│   ├── index.ts                  # Barrel export for all services
│   ├── GitExecutor.ts            # Spawns git processes, 30s timeout — the only place git is invoked
│   ├── GitLogService.ts          # Parses git log (null-byte format), branches, branches-containing-a-commit. Default 500 commits.
│   │                             #   Also walks stash base commits, so a stash survives its branch moving
│   ├── GitDiffService.ts         # Commit details, file changes, file content at revision
│   ├── GitBranchService.ts       # Checkout, create, rename, delete, fast-forward branches
│   ├── GitRemoteService.ts       # Fetch, pull, remote management
│   ├── GitHistoryService.ts      # Rebase, reset operations
│   ├── GitRebaseService.ts       # Interactive rebase with drag-drop reordering
│   ├── GitCherryPickService.ts   # Cherry-pick with conflict handling
│   ├── GitRevertService.ts       # Revert commits
│   ├── GitTagService.ts          # Create/delete/push tags (incl. remote delete, force), tag metadata from refs/tags (048)
│   ├── GitStashService.ts        # Apply, pop, drop stash entries
│   ├── GitIndexService.ts        # Stage/unstage, discard, commit (uncommitted-node operations)
│   ├── GitWorktreeService.ts     # Worktree list/add/remove
│   ├── GitSignatureService.ts    # GPG/SSH signature verification
│   ├── GitSubmoduleService.ts    # Submodule status, init, update
│   ├── GitWatcherService.ts      # File system watcher for auto-refresh
│   ├── GitRepoDiscoveryService.ts # Multi-root workspace scanning
│   ├── GitHubAvatarService.ts    # Stateless one-shot GitHub avatar lookup + rate-limit tracking
│   ├── avatarCachePolicy.ts      # PURE: avatar expiry, lookup-outcome state machine, queue priority, LRU eviction (bounds/clamp live in shared/types.ts)
│   ├── AvatarCacheStore.ts       # Persistent email→avatar cache in globalState; debounced writes, LRU cap 1000 (512KB extension-state budget)
│   ├── AvatarRefreshQueue.ts     # Paced background drain (1/sec), rate-limit pause, batched result posting
│   ├── GitHubAuthService.ts      # Explicit opt-in gate for the GitHub session used by avatar lookups
│   ├── GitConfigService.ts       # Git config reading
│   └── TelemetryService.ts       # Consent-aware backend telemetry funnel; real + no-op implementations
└── utils/
    ├── gitParsers.ts             # Parse git log lines, refs (%D), branch list, stash base (%P); classify git stderr (conflict, nothing-to-apply)
    ├── gitQueries.ts             # Shared read-only git queries. isDirtyWorkingTree counts untracked
    │                             #   files — for `worktree remove` only; never gate rebase/pick/revert on it
    ├── gitValidation.ts          # Input validation (backend wrappers over shared/gitRefValidation)
    └── worktreeErrors.ts         # Map raw git worktree failures → friendly messages
```

---

## Frontend — `webview-ui/src/` (Vite + React → `dist/webview/`)

`App.tsx` is the root: `ControlBar` + `TogglePanel` + `GraphContainer` + `CommitDetailsPanel`.

### Graph rendering

```
components/
├── GraphContainer.tsx            # Virtual scrolling (@tanstack/react-virtual, ROW_HEIGHT: 28px)
├── CommitTableRow.tsx            # Table-style commit row with resizable columns (memoized)
├── CommitTableHeader.tsx         # Draggable/resizable column headers (@dnd-kit); Author gear shortcut to avatar setup
├── GraphCell.tsx                 # SVG graph rendering (LANE_WIDTH: 16px, 8 cycling colors)
├── CommitDetailsPanel.tsx        # Resizable bottom/right panel, commit metadata + file changes
├── CommitTooltip.tsx             # Radix popover tooltip for a row: refs, parents, external ref parsing
├── RefLabel.tsx                  # One ref badge (branch/tag/worktree), styled per ref kind; merged local+remote branch shows a trailing cloud icon (remotes in the tooltip)
├── OverflowRefsBadge.tsx         # "+N" popover holding refs that don't fit the row; same menus as inline badges
├── DetachedWorktreeBadge.tsx     # Badge for a detached-HEAD worktree row (046)
├── SignatureColumnCell.tsx       # Grouped signature glyphs in the optional "Signature" column (047)
├── AuthorAvatar.tsx              # Gravatar/GitHub avatar with initials fallback + load-state cache
├── AuthorBadge.tsx               # Author chip/inline label wrapping AuthorAvatar
└── icons/index.tsx               # All SVG icon components
```

### Toolbar, panels, widgets

```
├── ControlBar.tsx                # Top toolbar with actions
├── ToolbarIconButton.tsx         # Shared toolbar button: icon + optional label (speedyGit.toolbar.showLabels);
│                                 #   right-click menu toggles labels / Remote button, extensible via extraMenuItems
├── TogglePanel.tsx               # Collapsible panel for Filter/Search/Compare widgets
├── FilterWidget.tsx              # Author/date filter panel (react-datepicker)
├── SearchWidget.tsx              # Text search across commits
├── CompareWidget.tsx             # Branch comparison
├── WorktreeWidget.tsx            # Worktree list + create/remove (046-git-worktrees)
├── ViewSettingsDialog.tsx        # Centered View settings dialog: columns left, avatars right (Radix dialog + @dnd-kit sortable); open state lives in the store
├── AvatarSettingsSection.tsx     # Avatars pane of the View dialog: GitHub allow/remove-token, refresh-days, clear cache
├── RepoSelector.tsx              # Multi-root repo picker (FilterableSingleSelectDropdown)
├── SubmoduleSelector.tsx         # Parent/submodule navigation picker
├── ToastContainer.tsx            # Transient success/error toasts driven by the store
├── RebaseConflictBanner.tsx      # "Rebase paused due to conflict" bar + continue/abort
└── CherryPickConflictBanner.tsx  # Same, for a paused cherry-pick
```

### Context menus

```
├── CommitContextMenu.tsx         # Commit row menu
├── BranchContextMenu.tsx         # Branch/tag ref badge menu
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
├── dialogStyles.ts               # Shared dialog width/resize + the primary/secondary/danger button variants (one shared base)
├── ConfirmDialog.tsx             # Generic confirm (danger/warning variants) + CommandPreview
├── InputDialog.tsx               # Generic single-input dialog + FieldError
├── CommandPreview.tsx            # Live git command preview shown in dialogs
├── FieldError.tsx                # Validation message under inputs (pairs with aria-invalid/aria-describedby)
├── MergeDialog.tsx  RebaseConfirmDialog.tsx  CherryPickDialog.tsx  RevertDialog.tsx
├── DropCommitDialog.tsx  InteractiveRebaseDialog.tsx + InteractiveRebaseRow.tsx (@dnd-kit sortable)
├── CreateBranchDialog.tsx  DeleteBranchDialog.tsx  CheckoutWithPullDialog.tsx
├── TagCreationDialog.tsx  DeleteTagDialog.tsx  PushTagDialog.tsx
├── PushDialog.tsx  RemoteManagementDialog.tsx  StashDialog.tsx
├── CreateWorktreeDialog.tsx  RemoveWorktreeDialog.tsx
├── DiscardDialog.tsx  DiscardAllDialog.tsx  FilePickerDialog.tsx
└── HelpDialog.tsx                # "Help & Feedback": GitHub Issues + docs/changelog/marketplace + version
```

### Shared inputs & file views

```
├── MultiSelectDropdown.tsx           # Generic multi-select popover with pinned actions
├── MultiBranchDropdown.tsx           # Branch-specific wrapper, grouped local/remote
├── FilterableSingleSelectDropdown.tsx# Generic searchable single-select (repo/submodule pickers)
├── FileChangeShared.tsx              # Row/badge/action-icon primitives + shouldShowChangeCounts
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
                                  #   useCurrentLocalBranch) — one selector each, so callers can't disagree

rpc/rpcClient.ts                  # Singleton RPC client, webview↔extension via acquireVsCodeApi()

hooks/
├── useTooltipHover.ts            # Tooltip positioning logic
├── useCopyFeedback.ts            # copyToClipboard + short "copied" flash, shared by every copy button
├── useSignatureColumnLoader.ts   # Async viewport-first signature verification loader (047)
└── useDialogTelemetry.ts         # One confirmed/cancelled outcome per dialog open cycle

types/displayRefs.ts              # Discriminated union for ref-label rendering (local-branch/remote-branch/tag/HEAD/…)
```

### Utils

```
utils/
├── graphTopology.ts              # Core graph algorithm (~720 lines): lanes, colors, connections
├── graphPaths.ts                 # SVG "rounded elbow" builders for lane-changing lines — lines cross row
│                                 #   boundaries perfectly vertically so per-row SVG cells join without kinks (5.4.0)
├── commitReachability.ts         # Branch reachability per commit; checkers cached by commit-list identity (WeakMap)
├── commitRefs.ts                 # Row predicates by ref decoration (findHeadCommit/findHeadCommitHash,
│                                 #   isStashPseudoCommit) — used by topology, uncommitted parent, tooltip, Go to HEAD
├── commitMenuAvailability.ts     # Which commit actions apply (rebase/reset/revert/drop/cherry-pick)
├── headNavigation.ts             # "Go to HEAD" decision logic + toast messages
├── rowVisibility.ts              # Scroll-offset maths for revealing a row when the details panel resizes the viewport
├── commitVisibility.ts           # Visibility/filter predicates for the virtualized row list
├── compareSlot.ts                # Compare panel slot model (Base/Target, commit-ish parsing)
├── compareDefaults.ts            # Default slot seeding
├── compareDispatch.ts            # Resolve compare request → backend RPC
├── compareMarker.ts              # Per-row "B"ase / "T"arget badge derivation
├── externalRefParser.ts          # Parse typed commit-ish expressions (HEAD~3, origin/main^2, …)
├── resolveDefaultRemote.ts       # Pick `origin` else first-alpha remote
├── branchSelection.ts            # getBranchKey (bare name vs remote/name) + additive select-all-local
├── mergedCommits.ts              # Detect merged-branch commit grouping for badges
├── refNameField.ts               # Live ref-name validation state (error suppressed while pristine)
├── gitCommandBuilder.ts          # Constructs git command strings for preview display
├── helpLinks.ts                  # Help dialog links + build-time version (__EXTENSION_VERSION__)
├── commitTableLayout.ts          # Column layout persistence & manipulation
├── fileTreeBuilder.ts            # Flat file list → tree structure
├── radioAvailability.ts          # Enable/disable logic for mutually-exclusive options
├── mergeRefs.ts                  # Merges local/remote refs into DisplayRef[]
├── signatureGlyph.ts             # SignatureStatus → glyph/color (047); the single status→color map, reused by the details-panel labels
├── worktreeBadgeStyle.ts         # Worktree badge styling (046); hardcoded colors are deliberate — contrast vs. user lane colors
├── worktreeDisplay.ts            # Worktree list formatting/derivation (046)
├── telemetry.ts                  # Fire-and-forget webview telemetry helpers
├── searchFilter.ts               # Client-side search by message, hash, author
├── filterUtils.ts                # Author/date filter logic
├── refStyle.ts                   # Per-ref-kind badge styling
├── themeColors.ts                # Semantic VS Code theme tokens (added/deleted/warning/accent/signature…) + `tint()`; the one place a color meaning is named
├── colorUtils.ts                 # Graph color cycling + theme helpers
├── formatDate.ts                 # Commit-date formatting
├── gravatar.ts                   # Gravatar URL builder + load-state cache
├── stashMessage.ts               # Format stash entries for display
├── uncommittedUtils.ts           # Helpers for the uncommitted-node row
├── repoPath.ts                   # Repo path normalization
└── inlineCodeRenderer.tsx        # Renders inline-code spans in commit messages
```

---

## Shared & build

```
shared/
├── types.ts                      # Domain types: Commit, Branch, RefInfo, GraphFilters, CommitDetails, …; cross-boundary setting clamps (batch size, avatar refresh days)
├── messages.ts                   # RequestMessage/ResponseMessage union types for RPC
├── errors.ts                     # Result<T,E> monad, GitError class, GitErrorCode enum
├── gitRefValidation.ts           # git check-ref-format validator + tag/branch/remote wrappers — the same rules
│                                 #   drive live dialog validation (frontend) and creation guards (backend)
└── telemetry.ts                  # Closed telemetry catalogs, payload types, buckets, runtime validator

telemetry.json                    # Machine-readable event manifest for VS Code telemetry inspection
esbuild.config.mjs                # Production-only telemetry destination injection; empty in dev/test builds
```

Tests live in `__tests__/` directories beside the code they cover (~115 files, Vitest).

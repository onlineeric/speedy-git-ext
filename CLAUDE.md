# CLAUDE.md / AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

(If you are Codex CLI or other AI coding agents, this is loaded via AGENTS.md.)

## Build & Development Commands

```bash
pnpm build              # Build extension + webview
pnpm build:prod         # Production build (minified, no sourcemaps)
pnpm build:ext          # Build extension only (esbuild)
pnpm build:webview      # Build webview only (Vite)
pnpm watch              # Watch mode for both (uses concurrently)
pnpm lint               # ESLint (flat config) over the whole repo
pnpm typecheck          # TypeScript type checking (tsc --noEmit)
pnpm test               # Run unit tests (Vitest, run mode)
pnpm generate-test-repo # Generate deterministic test repo at test-repo/
pnpm generate-submodule-repos # Generate test repos with submodules
pnpm ext:package        # Create .vsix package
pnpm ext:publish        # Publish to VS Code Marketplace (vsce) + Open VSX (ovsx)
```

Run a single test file or pattern with Vitest directly:

```bash
pnpm vitest run path/to/file.test.ts   # one file
pnpm vitest run -t "test name substring" # filter by test name
pnpm vitest                              # watch mode
```

To debug: use VS Code launch configs "Run Extension" or "Run Extension (Watch)" in `.vscode/launch.json`.

## Architecture

VS Code extension with **backend** (Node.js extension host) and **frontend** (React webview), communicating via VS Code's message passing API (`postMessage`/`onDidReceiveMessage`).

```
src/                              # Backend — esbuild → dist/extension.js (CJS, node18)
├── extension.ts                  # Entry point, registers speedyGit.showGraph command
├── ExtensionController.ts        # Orchestrates services, repo discovery, settings
├── WebviewProvider.ts            # Compatibility re-export of webview/WebviewProvider
├── GitShowContentProvider.ts     # git-show:// URI protocol for diffs
├── webview/                      # Backend webview subsystem (refactored from the old ~2400-line WebviewProvider)
│   ├── WebviewProvider.ts        # Thin public facade used by ExtensionController; composes the objects below
│   ├── WebviewPanelHost.ts       # VS Code panel lifecycle, HTML/CSP/nonce, postMessage, visibility
│   ├── WebviewRuntime.ts         # Mutable non-service state: repo path, filters, fetch generation, flags
│   ├── GitServiceRegistry.ts     # Holds repo-bound git services; atomic replacement on repo switch
│   ├── WebviewMessageRouter.ts   # Exhaustive typed RPC dispatch (satisfies RequestHandlerMap)
│   ├── WebviewRequestContext.ts  # Narrow per-request handler API (no provider instance leaks to handlers)
│   ├── PersistedUIStateStore.ts  # Load/save/validate UI state + per-repo table layout (column-width healing)
│   ├── RepoDataLoader.ts         # Initial + deferred data, avatars, submodules; what to fetch and post
│   ├── RefreshCoordinator.ts     # When to load: initial/manual/auto, hidden-panel deferral, loading lifecycle
│   ├── EditorCommandService.ts   # VS Code diff/file/compare editors, worktree folder/reveal, signature help
│   ├── OperationGuard.ts         # In-progress checks (rebase/cherry-pick/revert/merge) → GitError | null
│   └── handlers/                 # Domain RPC handlers, grouped by feature; fetch services from registry at call time
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
│       └── vscodeCommandHandlers.ts # settings, clipboard, openExternal, updatePersistedUIState
├── services/
│   ├── index.ts                  # Barrel export for all services
│   ├── GitExecutor.ts            # Spawns git processes, 30s timeout, returns Result<T, GitError>
│   ├── GitLogService.ts          # Parses git log (null-byte format), branches. Default 500 commits
│   ├── GitDiffService.ts         # Commit details, file changes, file content at revision
│   ├── GitBranchService.ts       # Checkout, create, rename, delete, fast-forward branches
│   ├── GitRemoteService.ts       # Fetch, pull, remote management
│   ├── GitHistoryService.ts      # Rebase, reset operations
│   ├── GitRebaseService.ts       # Interactive rebase with drag-drop reordering
│   ├── GitCherryPickService.ts   # Cherry-pick with conflict handling
│   ├── GitRevertService.ts       # Revert commits
│   ├── GitTagService.ts          # Create/delete/push tags (incl. remote delete, force push), tag metadata from refs/tags (048)
│   ├── GitStashService.ts        # Apply, pop, drop stash entries
│   ├── GitIndexService.ts        # Stage/unstage, discard, commit (uncommitted-node operations)
│   ├── GitWorktreeService.ts     # Worktree list/add/remove
│   ├── GitSignatureService.ts    # GPG/SSH signature verification
│   ├── GitSubmoduleService.ts    # Submodule status, init, update
│   ├── GitWatcherService.ts      # File system watcher for auto-refresh
│   ├── GitRepoDiscoveryService.ts # Multi-root workspace scanning
│   ├── GitHubAvatarService.ts    # Avatar URL fetching (GitHub/Gravatar)
│   └── GitConfigService.ts       # Git config reading
└── utils/
    ├── gitParsers.ts             # Parse git log lines, refs (%D), branch list
    ├── gitQueries.ts             # Shared read-only git queries (e.g., isDirtyWorkingTree)
    ├── gitValidation.ts          # Input validation for git operations (backend wrappers over shared/gitRefValidation)
    └── worktreeErrors.ts         # Map raw git worktree failures → friendly messages

webview-ui/src/                   # Frontend — Vite + React → dist/webview/
├── App.tsx                       # Root: ControlBar + TogglePanel + GraphContainer + CommitDetailsPanel
├── components/
│   ├── GraphContainer.tsx        # Virtual scrolling (@tanstack/react-virtual, ROW_HEIGHT: 28px)
│   ├── CommitRow.tsx             # Graph cell + commit metadata (memoized)
│   ├── CommitTableRow.tsx        # Table-style commit row with resizable columns
│   ├── CommitTableHeader.tsx     # Draggable/resizable column headers (@dnd-kit)
│   ├── GraphCell.tsx             # SVG graph rendering (LANE_WIDTH: 16px, 8 cycling colors); lane-changing lines drawn via utils/graphPaths.ts
│   ├── CommitDetailsPanel.tsx    # Resizable bottom/right panel, commit metadata + file changes
│   ├── ControlBar.tsx            # Top toolbar with actions
│   ├── ToolbarIconButton.tsx     # Shared toolbar button: icon + optional text label (speedyGit.toolbar.showLabels); right-click menu toggles labels / Remote button, extensible via extraMenuItems
│   ├── TogglePanel.tsx           # Collapsible panel for Filter/Search/Compare widgets
│   ├── FilterWidget.tsx          # Author/date filter panel (react-datepicker)
│   ├── SearchWidget.tsx          # Text search across commits
│   ├── CompareWidget.tsx         # Branch comparison
│   ├── WorktreeWidget.tsx        # Worktree list + create/remove (046-git-worktrees)
│   ├── *Worktree*.tsx            # CreateWorktreeDialog, RemoveWorktreeDialog, WorktreeMenuItems, DetachedWorktreeBadge
│   ├── SignatureColumnCell.tsx   # Renders grouped signature glyphs in the optional "Signature" column (047)
│   ├── *Dialog.tsx               # ~20 operation dialogs (Merge, Push, Rebase, CherryPick, Revert, Worktree, etc.)
│   ├── *ContextMenu.tsx          # Context menus (Commit, Branch, Stash, Author, Date, Uncommitted) via Radix UI
│   ├── LazyContextMenu.tsx       # Wraps a Radix context menu so its heavy body (items/dialogs/store subscriptions) mounts only on first right-click — keeps virtualized rows cheap during fast scrolling
│   ├── CompareMenuItems.tsx      # Shared "Set as Compare Base" / "Compare with Base" item pair (042), reused across Commit/Branch/Uncommitted menus
│   ├── menuStyles.ts             # Shared Tailwind class strings for context-menu items (enabled/disabled/separator)
│   ├── FieldError.tsx            # Validation message under form inputs (pairs with aria-invalid/aria-describedby)
│   └── CommandPreview.tsx        # Live git command preview shown in dialogs
├── stores/
│   └── graphStore.ts             # Zustand store: commits, branches, topology, filters, UI state (~1250 lines). 044-code-refactor replaced whole-store subscriptions with selectors rather than splitting the file
├── rpc/
│   └── rpcClient.ts              # Singleton RPC client, webview↔extension via acquireVsCodeApi()
├── hooks/
│   ├── useTooltipHover.ts        # Tooltip positioning logic
│   └── useSignatureColumnLoader.ts # Async viewport-first signature verification loader (047)
├── types/
│   └── displayRefs.ts            # Discriminated union for ref-label rendering (local-branch/remote-branch/tag/HEAD/…)
└── utils/
    ├── graphTopology.ts          # Core graph algorithm (~700 lines): lanes, colors, connections
    ├── graphPaths.ts             # SVG "rounded elbow" path builders for lane-changing connection lines — lines cross row boundaries perfectly vertically so per-row SVG cells join without kinks (5.4.0)
    ├── gitCommandBuilder.ts      # Constructs git command strings for preview display
    ├── commitReachability.ts     # Determines branch reachability for commits
    ├── commitVisibility.ts       # Visibility/filter predicates for the virtualized row list
    ├── compareSlot.ts            # Compare panel slot model (Base/Target, commit-ish parsing)
    ├── compareDefaults.ts        # Default slot seeding for the Compare panel
    ├── compareDispatch.ts        # Resolve compare request → backend RPC
    ├── compareMarker.ts          # Per-row "B"ase / "T"arget badge derivation
    ├── externalRefParser.ts      # Parse typed commit-ish expressions (HEAD~3, origin/main^2, …)
    ├── resolveDefaultRemote.ts   # Pick `origin` else first-alpha remote (fast-forward, push, etc.)
    ├── mergedCommits.ts          # Detect merged-branch commit grouping for badges
    ├── refNameField.ts           # Live-validation state for ref-name inputs (error suppressed while field is pristine), shared by Create Tag/Branch/Worktree/Remote dialogs
    ├── refStyle.ts               # Per-ref-kind badge styling
    ├── repoPath.ts               # Repo path normalization
    ├── stashMessage.ts           # Format stash entries for display
    ├── uncommittedUtils.ts       # Helpers for the uncommitted-node row
    ├── radioAvailability.ts      # Enable/disable logic for mutually-exclusive options
    ├── filterUtils.ts            # Author/date filter logic
    ├── searchFilter.ts           # Client-side search by message, hash, author
    ├── fileTreeBuilder.ts        # Flat file list → tree structure
    ├── commitTableLayout.ts      # Column layout persistence & manipulation
    ├── colorUtils.ts             # Graph color cycling + theme helpers
    ├── formatDate.ts             # Commit-date formatting
    ├── gravatar.ts               # Gravatar URL builder
    ├── inlineCodeRenderer.tsx    # Renders inline-code spans in commit messages
    ├── mergeRefs.ts              # Merges local/remote refs into DisplayRef[] for display
    ├── signatureGlyph.ts         # Maps SignatureStatus enum → glyph/color for the signature column (047)
    ├── worktreeBadgeStyle.ts     # Styling for worktree badges on graph rows (046)
    └── worktreeDisplay.ts        # Worktree list formatting/derivation helpers (046)

shared/                           # Shared types between backend & frontend
├── types.ts                      # Domain types: Commit, Branch, RefInfo, GraphFilters, CommitDetails, etc.
├── messages.ts                   # RequestMessage/ResponseMessage union types for RPC
├── errors.ts                     # Result<T,E> monad, GitError class, GitErrorCode enum
└── gitRefValidation.ts           # git check-ref-format validator with tag/branch/remote wrappers — same rules drive live dialog validation (frontend) and creation-path guards (backend, defense in depth)
```

### Path Alias

`@shared/*` → `shared/*` (configured in webview tsconfig, Vite, and vitest)

### Data Flow

1. Backend services fetch git data via `GitExecutor`, return `Result<T, GitError>`
2. `WebviewPanelHost` receives the message and `WebviewMessageRouter` dispatches it to a domain handler in `webview/handlers/`; the handler resolves current services from `GitServiceRegistry`, calls them, and posts a `ResponseMessage`
3. Frontend `rpcClient` sends `RequestMessage`, updates Zustand store on response
4. Graph topology computed entirely in the frontend (`graphTopology.ts`), not backend

### Webview Backend Conventions

- **Add a new RPC**: add the type to `shared/messages.ts`, then register a handler in `WebviewMessageRouter`'s map — the `satisfies RequestHandlerMap` makes a missing handler a compile error (exhaustive dispatch).
- **Handlers must stay stateless about repos**: resolve git services via `context.services` (the `GitServiceRegistry`) *at request time*. Never capture a service instance at construction — repo switching and submodule navigation atomically replace the registry, so captured references go stale.
- **Don't pass the provider to handlers**: give them only what they need through `WebviewRequestContext`.
- **State ownership**: generation guards / mutable runtime flags live in `WebviewRuntime`; refresh timing lives in `RefreshCoordinator`; per-repo table layout (with column-width healing) is persisted by `PersistedUIStateStore`. Table layout is per-repo; other UI state is global.

### Performance Design

- Virtual scrolling: 28px rows, configurable overscan (default 50, range 0-200)
- Batch prefetch: 500 commits default (configurable via `speedyGit.batchCommitSize`)
- Graph topology pre-computed once; passing lanes stored for O(1) render lookup
- `CommitRow`/`CommitTableRow` memoized to prevent unnecessary re-renders

## Key Design Decisions

- **Performance first** — fast, responsive UX is the top priority
- Extension backend uses **esbuild** (fast CJS for Node); webview uses **Vite** (ESM, React)
- Graph topology computed in webview, not backend
- TypeScript **strict mode** with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- Uses **`Result<T, E>`** pattern instead of throwing exceptions in git operations
- UI state persisted via VS Code `context.globalState`; application state is transient (Zustand)

## Tech Stack

- **TypeScript 5.x** (strict) — both backend and frontend
- **React 18** + **Zustand** + **Tailwind CSS** — webview UI
- **Radix UI** — context menus, dialogs, popovers, alert dialogs
- **@tanstack/react-virtual** — virtual scrolling
- **@dnd-kit** — drag-and-drop (column reorder, interactive rebase)
- **react-datepicker 9.x** + **date-fns 4.x** — date range filtering
- **Vitest** — unit testing

## Coding Preferences / Guidelines

### Code Quality

- Write clean, readable, self-documenting code with clear naming, human-readaable, easy to understand, easy to maintain.
- Follow single responsibility principle; keep classes, functions and files small and focused
- DRY: extract reusable logic into shared functions, components, or libraries
- Prefer explicit over implicit; avoid clever or cryptic solutions
- Use purpose-built libraries (e.g., `cheerio` for HTML, `date-fns` for dates) instead of manual implementations.
- Refactor when needed to improve structure and readability
- Use TypeScript types to document intent and catch errors early

### Package Selection

- Prefer popular, battle-tested packages over manual implementations
- Avoid regex for parsing structured data (HTML, JSON, XML), use purpose-built libraries instead.
- When choosing packages, prefer: active maintenance, TypeScript support, readable API

### Restrictions

- **Packages**: NEVER auto-install; provide install commands for me to run manually
- **Git**: NEVER commit or merge; only readonly operations (`git log`, `git status`, `git diff`) and create PR, create branch only if I ask you to do so, or if speckit workflow requires it.

## Active Technologies
- TypeScript 5.x (strict: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`) — both backend and frontend
- React 18 + Zustand + Radix UI + Tailwind CSS (webview); esbuild (extension host), Vite (frontend); VS Code Extension API 1.80+
- App state is transient (Zustand, session-only); persistent settings via VS Code config (e.g. `speedyGit.worktree.basePath`) and `context.globalState`

## Recent Changes
- 047-signing-verification: 7-state flat `SignatureStatus` enum (drops `verificationUnavailable`); presence detection via raw `gpgsig` header (`git cat-file --batch`, no crypto) so SSH-signed commits without `allowedSignersFile` read as `unavailable` not `unsigned` (FR-017); opt-in hidden-by-default "Signature" history column with 3 grouped glyphs, async viewport-first + cached-by-hash (zero cost when hidden); bundled offline help doc (`docs/signing-verification.md`) opened via `openSignatureHelp` RPC
- 048-tag-enhancements (v5.2.0–5.2.1): tag badges show annotated/lightweight metadata in tooltips (one deferred `refs/tags` read via `RepoDataLoader`, cached in webview); Create Tag can chain a push (opt-in force), Delete Tag can also delete from remote (missing remote tag = benign no-op), standalone Push Tag gained a force option — all with command previews (`DeleteTagDialog`, `PushTagDialog`). Introduced `shared/gitRefValidation.ts`: live `git check-ref-format` validation in every ref-creating dialog (tag/branch/rename/worktree branch/remote name via `refNameField.ts` + `FieldError`), with the same rules enforced on backend creation paths for defense in depth
- Toolbar & graph polish (v5.2.2–5.4.0, no spec): `ToolbarIconButton` adds text labels under toolbar icons (`speedyGit.toolbar.showLabels`) and a hideable Remote button (`speedyGit.toolbar.showRemoteButton`), both toggleable via right-click menu; fast-forwarding the checked-out branch now runs `git pull` instead of the refused `git fetch <b>:<b>`; the checked-out branch badge always sorts first, ahead of worktree-branch prioritization; graph lane-change lines are now rounded elbows built by `webview-ui/src/utils/graphPaths.ts`


<!-- SPECKIT START -->
No active feature plan (specs/048-tag-enhancements/ is the most recently completed feature; it is merged).
<!-- SPECKIT END -->

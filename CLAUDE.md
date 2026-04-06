# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

(If you are Codex CLI or other AI coding agents, this is loaded via AGENTS.md.)

## Build & Development Commands

```bash
pnpm build              # Build extension + webview
pnpm build:prod         # Production build (minified, no sourcemaps)
pnpm build:ext          # Build extension only (esbuild)
pnpm build:webview      # Build webview only (Vite)
pnpm watch              # Watch mode for both (uses concurrently)
pnpm lint               # ESLint on src/
pnpm typecheck          # TypeScript type checking
pnpm test               # Run unit tests (Vitest)
pnpm generate-test-repo # Generate deterministic test repo at test-repo/
pnpm ext:package        # Create .vsix package
pnpm ext:publish        # Publish to VS Code Marketplace & Open VSX
```

To debug: use VS Code launch configs "Run Extension" or "Run Extension (Watch)" in `.vscode/launch.json`.

## Architecture

VS Code extension with **backend** (Node.js extension host) and **frontend** (React webview), communicating via VS Code's message passing API (`postMessage`/`onDidReceiveMessage`).

```
src/                              # Backend — esbuild → dist/extension.js (CJS, node18)
├── extension.ts                  # Entry point, registers speedyGit.showGraph command
├── ExtensionController.ts        # Orchestrates services, repo discovery, settings
├── WebviewProvider.ts            # Webview panel lifecycle, RPC dispatch (~1900 lines)
├── GitShowContentProvider.ts     # git-show:// URI protocol for diffs
├── services/
│   ├── GitExecutor.ts            # Spawns git processes, 30s timeout, returns Result<T, GitError>
│   ├── GitLogService.ts          # Parses git log (null-byte format), branches. Default 500 commits
│   ├── GitDiffService.ts         # Commit details, file changes, file content at revision
│   ├── GitBranchService.ts       # Checkout, create, rename, delete branches
│   ├── GitRemoteService.ts       # Fetch, pull, remote management
│   ├── GitHistoryService.ts      # Rebase, reset operations
│   ├── GitRebaseService.ts       # Interactive rebase with drag-drop reordering
│   ├── GitCherryPickService.ts   # Cherry-pick with conflict handling
│   ├── GitRevertService.ts       # Revert commits
│   ├── GitTagService.ts          # Create, delete, push tags
│   ├── GitStashService.ts        # Apply, pop, drop stash entries
│   ├── GitSignatureService.ts    # GPG/SSH signature verification
│   ├── GitSubmoduleService.ts    # Submodule status, init, update
│   ├── GitWatcherService.ts      # File system watcher for auto-refresh
│   ├── GitRepoDiscoveryService.ts # Multi-root workspace scanning
│   ├── GitHubAvatarService.ts    # Avatar URL fetching (GitHub/Gravatar)
│   └── GitConfigService.ts       # Git config reading
└── utils/
    ├── gitParsers.ts             # Parse git log lines, refs (%D), branch list
    └── gitValidation.ts          # Input validation for git operations

webview-ui/src/                   # Frontend — Vite + React → dist/webview/
├── App.tsx                       # Root: ControlBar + TogglePanel + GraphContainer + CommitDetailsPanel
├── components/
│   ├── GraphContainer.tsx        # Virtual scrolling (@tanstack/react-virtual, ROW_HEIGHT: 28px)
│   ├── CommitRow.tsx             # Graph cell + commit metadata (memoized)
│   ├── CommitTableRow.tsx        # Table-style commit row with resizable columns
│   ├── CommitTableHeader.tsx     # Draggable/resizable column headers (@dnd-kit)
│   ├── GraphCell.tsx             # SVG graph rendering (LANE_WIDTH: 16px, 8 cycling colors)
│   ├── CommitDetailsPanel.tsx    # Resizable bottom/right panel, commit metadata + file changes
│   ├── ControlBar.tsx            # Top toolbar with actions
│   ├── TogglePanel.tsx           # Collapsible panel for Filter/Search/Compare widgets
│   ├── FilterWidget.tsx          # Author/date filter panel (react-datepicker)
│   ├── SearchWidget.tsx          # Text search across commits
│   ├── CompareWidget.tsx         # Branch comparison
│   ├── *Dialog.tsx               # ~12 operation dialogs (Merge, Push, Rebase, CherryPick, etc.)
│   ├── *ContextMenu.tsx          # Context menus (Commit, Branch, Stash, Author) via Radix UI
│   └── CommandPreview.tsx        # Live git command preview shown in dialogs
├── stores/
│   └── graphStore.ts             # Zustand store: commits, branches, topology, filters, UI state
├── rpc/
│   └── rpcClient.ts              # Singleton RPC client, webview↔extension via acquireVsCodeApi()
├── hooks/
│   └── useTooltipHover.ts        # Tooltip positioning logic
└── utils/
    ├── graphTopology.ts          # Core graph algorithm (~470 lines): lanes, colors, connections
    ├── gitCommandBuilder.ts      # Constructs git command strings for preview display
    ├── commitReachability.ts     # Determines branch reachability for commits
    ├── filterUtils.ts            # Author/date filter logic
    ├── searchFilter.ts           # Client-side search by message, hash, author
    ├── fileTreeBuilder.ts        # Flat file list → tree structure
    ├── commitTableLayout.ts      # Column layout persistence & manipulation
    └── mergeRefs.ts              # Merges local/remote refs for display

shared/                           # Shared types between backend & frontend
├── types.ts                      # Domain types: Commit, Branch, RefInfo, GraphFilters, CommitDetails, etc.
├── messages.ts                   # RequestMessage/ResponseMessage union types for RPC
└── errors.ts                     # Result<T,E> monad, GitError class, GitErrorCode enum
```

### Path Alias

`@shared/*` → `shared/*` (configured in webview tsconfig, Vite, and vitest)

### Data Flow

1. Backend services fetch git data via `GitExecutor`, return `Result<T, GitError>`
2. `WebviewProvider` receives RPC requests, calls services, sends `ResponseMessage`
3. Frontend `rpcClient` sends `RequestMessage`, updates Zustand store on response
4. Graph topology computed entirely in the frontend (`graphTopology.ts`), not backend

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

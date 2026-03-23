# Project Agent Instructions

This file provides guidance for AI coding agents (Claude Code, Codex CLI, etc.) when working in this repository.

(If you are Claude Code, this is your CLAUDE.md. If you are Codex CLI or other AI coding agents, this is loaded via AGENTS.md.)

## Build & Development Commands

```bash
pnpm build              # Build extension + webview
pnpm build:prod         # Production build (minified, no sourcemaps)
pnpm build:ext          # Build extension only (esbuild)
pnpm build:webview      # Build webview only (Vite)
pnpm watch              # Watch mode for both (uses concurrently)
pnpm lint               # ESLint on src/
pnpm typecheck          # TypeScript type checking
pnpm generate-test-repo # Generate deterministic test repo at test-repo/
```

To debug: use VS Code launch configs "Run Extension" or "Run Extension (Watch)" in `.vscode/launch.json`.

## Architecture

This is a VS Code extension with a **backend** (Node.js, extension host) and **frontend** (React webview), communicating via VS Code's message passing API.

### Backend (`src/`)

- **extension.ts** → Entry point, registers `speedyGit.showGraph` command
- **ExtensionController.ts** → Orchestrates WebviewProvider and all service lifecycles
- **WebviewProvider.ts** → Creates webview panel, handles bidirectional message passing, serves initial data, opens diff/file editors
- **services/GitExecutor.ts** → Spawns git processes with timeout (30s), returns `Result<T, GitError>`
- **services/GitLogService.ts** → Parses git log (null-byte separated format), branches, current branch. Default 500 commits max
- **services/GitDiffService.ts** → Commit details, file changes (diff-tree), file content at revision, uncommitted changes
- **services/GitBranchService.ts** → Checkout branches (local/remote), fetch remotes
- **utils/gitParsers.ts** → Parsers for git log output lines, refs (%D), branch list

Built with **esbuild** → `dist/extension.js` (CommonJS, node18, externalizes `vscode`)

### Frontend (`webview-ui/src/`)

- **App.tsx** → Root: ControlBar + GraphContainer + CommitDetailsPanel, layout switches between bottom/right panel position
- **GraphContainer.tsx** → Virtual scrolling via `@tanstack/react-virtual` (ROW_HEIGHT: 28px, OVERSCAN: 10)
- **CommitRow.tsx** → Renders graph cell + commit metadata (memoized), wraps rows in CommitContextMenu, refs in BranchContextMenu
- **GraphCell.tsx** → SVG git graph rendering (LANE_WIDTH: 16px, 8 cycling colors)
- **CommitDetailsPanel.tsx** → Resizable panel (bottom or right) showing commit metadata + file changes with diff links
- **CommitContextMenu.tsx** → Radix UI context menu: Copy Hash, Copy Short Hash, Copy Message
- **BranchContextMenu.tsx** → Radix UI context menu: Checkout branch, Copy branch/tag name
- **stores/graphStore.ts** → Zustand store: commits, branches, topology, filters, selectedCommit, commitDetails, detailsPanelPosition
- **rpc/rpcClient.ts** → Singleton for webview↔extension communication via `acquireVsCodeApi()`, handles all Phase 1+2 message types
- **utils/graphTopology.ts** → Core graph algorithm (~470 lines): assigns lanes/colors, computes connections, pre-computes passing lanes for O(1) render lookup

Built with **Vite** + React plugin → `dist/webview/`

### Shared Types (`shared/`)

- **types.ts** → Commit, Branch, RefInfo, GraphState, GraphFilters, CommitDetails, FileChange, DetailsPanelPosition
- **messages.ts** → RequestMessage/ResponseMessage types with type guards
- **errors.ts** → Result<T,E> monad, GitError class, GitErrorCode enum

### Path Alias

`@shared/*` → `shared/*` (configured in webview tsconfig and Vite)

## Key Design Decisions

- Our project is Performance First Principles. We aim to provide a fast, responsive, and efficient user experience.
- Extension backend uses esbuild (fast, CJS for Node); webview uses Vite (ESM, React)
- Graph topology computed in the webview (frontend), not the backend
- TypeScript strict mode with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- Uses `Result<T, E>` pattern instead of throwing exceptions in git operations

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
- **Git**: NEVER commit, branch, or merge; only readonly operations (`git log`, `git status`, `git diff`) and create PR only if I ask you to do so.

## Active Technologies
- TypeScript 5.x (strict with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`) + VS Code Extension API with esbuild backend, Vite + React 18 webview, Zustand state management, and Radix UI/Tailwind in the UI stack (012-015 milestones).
- Local git repository as the source of data, with state kept in-memory (Zustand + local component state) and existing caching patterns (e.g., `gravatar.ts`) reused.
- TypeScript 5.x (strict) + React 18, Zustand, @radix-ui/react-popover (already installed), VS Code Extension API, esbuild, Vite (015-misc-improvements)
- In-memory caching (existing pattern in gravatar.ts) (015-misc-improvements)
- TypeScript 5.x (strict) + VS Code Extension API (1.80+), `vscode.git` built-in extension API v1, esbuild (backend), Vite + React 18 (webview) (016-auto-refresh)
- N/A (in-memory state only) (016-auto-refresh)
- TypeScript 5.x (strict) + React 18, @radix-ui/react-context-menu, Zustand, VS Code Extension API (017-rebase-branch-on-branch)
- N/A (in-memory Zustand store) (017-rebase-branch-on-branch)
- TypeScript 5.x (strict with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`) + React 18, Zustand, @tanstack/react-virtual, @radix-ui/react-context-menu, Tailwind CSS (019-badge-lane-color)
- TypeScript 5.x (strict mode with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`) + React 18, Zustand, `@tanstack/react-virtual`, `@headless-tree/core` + `@headless-tree/react` (new), Tailwind CSS, Radix UI (018-commit-files-enhancements)
- N/A (in-memory Zustand store, session-scoped) (018-commit-files-enhancements)
- TypeScript 5.x (strict with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`) + React 18, Zustand, `@radix-ui/react-dialog`, Tailwind CSS, esbuild (backend), Vite (webview) (020-push-branch-dialog)

## Recent Changes

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
- **ExtensionController.ts** → Orchestrates WebviewProvider and GitLogService lifecycle
- **WebviewProvider.ts** → Creates webview panel, handles bidirectional message passing, serves initial data
- **services/GitExecutor.ts** → Spawns git processes with timeout (30s), returns `Result<T, GitError>`
- **services/GitLogService.ts** → Parses git log (null-byte separated format), branches, current branch. Default 500 commits max
- **utils/gitParsers.ts** → Parsers for git log output lines, refs (%D), branch list

Built with **esbuild** → `dist/extension.js` (CommonJS, node18, externalizes `vscode`)

### Frontend (`webview-ui/src/`)

- **App.tsx** → Root: ControlBar + GraphContainer, loading/error states
- **GraphContainer.tsx** → Virtual scrolling via `@tanstack/react-virtual` (ROW_HEIGHT: 28px, OVERSCAN: 10)
- **CommitRow.tsx** → Renders graph cell + commit metadata (memoized)
- **GraphCell.tsx** → SVG git graph rendering (LANE_WIDTH: 16px, 8 cycling colors)
- **stores/graphStore.ts** → Zustand store: commits, branches, topology, filters, selectedCommit
- **rpc/rpcClient.ts** → Singleton for webview↔extension communication via `acquireVsCodeApi()`
- **utils/graphTopology.ts** → Core graph algorithm (~470 lines): assigns lanes/colors, computes connections, pre-computes passing lanes for O(1) render lookup

Built with **Vite** + React plugin → `dist/webview/`

### Shared Types (`shared/`)

- **types.ts** → Commit, Branch, RefInfo, GraphState, GraphFilters
- **messages.ts** → RequestMessage/ResponseMessage types with type guards
- **errors.ts** → Result<T,E> monad, GitError class, GitErrorCode enum

### Path Alias

`@shared/*` → `shared/*` (configured in webview tsconfig and Vite)

## Key Design Decisions

- Extension backend uses esbuild (fast, CJS for Node); webview uses Vite (ESM, React)
- Graph topology computed in the webview (frontend), not the backend
- TypeScript strict mode with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- Uses `Result<T, E>` pattern instead of throwing exceptions in git operations

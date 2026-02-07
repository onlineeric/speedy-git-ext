# Speedy Git Extension

A performance-first, lightweight Git visualization extension for VS Code.

## Overview

Speedy Git Extension is a modern VSCode extension that provides an interactive Git repository visualization with a focus on performance and maintainability.

## Key Features

### Current Features
- Interactive Git UI visualization
- Read-only repository browsing
- Virtual scrolling for efficient rendering of large repositories
- Modular backend architecture
- React-based UI with modern state management

### Planned Features
- Complete Git operations (commit, branch, merge, rebase)
- Advanced filtering and search
- Customizable graph appearance
- Multi-repository support

## Architecture Highlights

### Performance-First Design
- **Virtual Scrolling**: Uses `@tanstack/react-virtual` to efficiently render large commit histories
- **Modular Backend**: Refactored from monolithic architecture into smaller, focused modules
- **Efficient Git Operations**: Optimized Git command execution and parsing

### Modern Tech Stack
- **Frontend**: React with TypeScript for maintainable UI code
- **Backend**: Modular TypeScript services for Git operations
- **Build**: esbuild for fast compilation, Vite for webview development
- **Package Manager**: pnpm for efficient dependency management

## Project Structure

```
speedy-git-ext/
├── src/                      # Extension backend
│   ├── extension.ts          # Extension entry point
│   ├── ExtensionController.ts # Main controller
│   ├── WebviewProvider.ts    # Webview management
│   ├── services/             # Git operation services
│   │   ├── GitExecutor.ts    # Git command execution
│   │   └── GitLogService.ts  # Git log operations
│   └── utils/                # Utility functions
│       └── gitParsers.ts     # Git output parsers
├── webview-ui/               # React frontend
│   └── src/
│       ├── App.tsx           # Main app component
│       ├── components/       # React components
│       ├── stores/           # State management
│       └── rpc/              # Extension-webview communication
├── scripts/                  # Development scripts
│   └── generate-test-repo.ts # Test repo generator
├── test-repo/                # Generated test repo (gitignored)
├── shared/                   # Shared types and utilities
│   ├── types.ts              # Type definitions
│   ├── messages.ts           # Message protocols
│   └── errors.ts             # Error types
└── dist/                     # Compiled output
```

## Development Setup

### Prerequisites
- Node.js 20+
- pnpm 10+
- VS Code

### Installation

```bash
# Install dependencies
pnpm install

# Build the extension
pnpm run build

# Watch mode for development
pnpm run watch
```

### Running the Extension

1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. Open a Git repository
4. Run command: "Speedy Git: Show Git Graph"

## Test Repo Generator

A script that generates a deterministic test Git repository for development and testing.

- **Script**: `scripts/generate-test-repo.ts`
- **Output**: `test-repo/` (gitignored)
- **Run**: `pnpm generate-test-repo`

Produces ~273 commits, 10 branches, 11 tags covering all graph topology cases:
- Linear history, dev + feature branches with multi-merge and backward merge
- Parallel branches, cross-merges, criss-cross pattern
- Octopus merges (3 and 4 parents), crossing topology
- Rebase-style, squash merges, release cycle with RC tags
- Long-running parallel lanes with periodic merge points
- Orphan branch (disconnected history), fast-forward

Uses `git fast-import` for fast generation and a seeded PRNG (seed=42) for deterministic, identical output every run.

## Building

```bash
# Development build
pnpm run build

# Production build (optimized)
pnpm run build:prod
```

## Scripts

- `pnpm run build` - Build extension and webview
- `pnpm run watch` - Watch mode for both extension and webview
- `pnpm run lint` - Run ESLint
- `pnpm run typecheck` - Type check TypeScript

## Design Principles

1. **Performance First**: Every feature is designed with performance in mind
2. **Modular Architecture**: Small, focused modules instead of monolithic files
3. **Type Safety**: Comprehensive TypeScript types throughout
4. **Clean Code**: Self-documenting, readable code with clear naming
5. **DRY**: Extract reusable logic into shared utilities
6. **Battle-tested Libraries**: Prefer popular, maintained packages over custom implementations

## Technology Stack

### Backend (Extension)
- TypeScript
- VS Code Extension API
- esbuild

### Frontend (Webview)
- React
- TypeScript
- Vite
- @tanstack/react-virtual
- Zustand (state management)

## Contributing

This project follows strict coding standards:
- All code must be written from scratch (no copying from reference projects)
- Follow the DRY principle
- Write self-documenting code with clear naming
- Use TypeScript types to document intent
- Keep functions and files small and focused

## License

MIT

## Roadmap

### Phase 1: Read-Only Features ✓
- [x] Basic Git visualization
- [x] Virtual scrolling for performance
- [x] Modular backend architecture
- [x] React-based UI

### Phase 2: Basic Git Operations (In Progress)
- [ ] Branch creation and deletion
- [ ] Checkout commits and branches
- [ ] Basic commit operations

### Phase 3: Advanced Features
- [ ] Merge operations
- [ ] Rebase operations
- [ ] Cherry-pick
- [ ] Advanced filtering and search
- [ ] Customization options

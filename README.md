# Speedy Git Extension

A performance-first, lightweight Git graph visualization extension for VS Code.

## Overview

Speedy Git Extension is a modern VSCode extension that provides an interactive Git repository visualization with a focus on performance and maintainability. Inspired by Git Graph, this project reimagines the architecture with a modular design and modern frontend technologies.

## Key Features

### Current Features
- Interactive Git graph visualization
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
- [x] Basic Git graph visualization
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

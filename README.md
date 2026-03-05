# Speedy Git Extension

A performance-first Git visualization extension for VS Code, built for large repositories.

## Overview

Speedy Git Extension provides an interactive Git history graph with a core goal: **extremely fast performance even for repositories with tens of thousands of commits**. It achieves this through virtual scrolling, a modular backend, and optimized Git command execution — so the UI stays responsive no matter how large your repo grows.

## Features

- Interactive Git history graph with branch visualization
- Virtual scrolling — renders only visible rows, handles massive commit histories without slowdown
- Commit details panel with file changes and diff viewer
- Branch and tag labels with checkout support
- Context menus for common Git operations
- Resizable details panel (bottom or side layout)

## Requirements

- VS Code 1.80+
- Git installed and available in PATH

## Getting Started

1. Open a Git repository in VS Code
2. Run the command: **Speedy Git: Show Git Graph** (via Command Palette `Ctrl+Shift+P`)

## Extension Settings

No configuration required to get started. The extension works out of the box with any Git repository.

## Technology

- **Frontend**: React + TypeScript, virtual scrolling via `@tanstack/react-virtual`
- **Backend**: Modular TypeScript services, optimized Git command execution
- **State**: Zustand
- **Build**: esbuild (backend), Vite (webview)

## License

MIT — see [LICENSE.md](LICENSE.md)

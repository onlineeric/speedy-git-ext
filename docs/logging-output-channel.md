# Feature Spec: Logging via VS Code LogOutputChannel

## Overview

Add a centralized logging system using VS Code's `LogOutputChannel` API so that extension activity is visible in the **Output** panel under a "Speedy Git" channel. This gives developers and users a way to diagnose issues without attaching a debugger.

## Current State

- The extension has **no logging infrastructure** — no `OutputChannel`, no `console.log`, no logger utility.
- Errors are handled via the `Result<T, GitError>` pattern but are never logged to any persistent output.
- The only user-visible feedback is `vscode.window.showErrorMessage()` in `ExtensionController.ts:18`.

## API Choice: `LogOutputChannel`

Use `vscode.window.createOutputChannel(name, { log: true })` which returns a `LogOutputChannel`.

**Why `LogOutputChannel` over basic `OutputChannel`:**

| Feature | OutputChannel | LogOutputChannel |
|---|---|---|
| Leveled methods (trace/debug/info/warn/error) | No | Yes |
| Automatic timestamps | No | Yes |
| Respects VS Code "Set Log Level" setting | No | Yes |
| User can filter noise without code changes | No | Yes |

Available since VS Code 1.74; our minimum is 1.85, so fully supported.

## Design

### Channel Creation

Create the `LogOutputChannel` once in `activate()` and pass it through the object graph via constructor injection.

```
activate()
  └─ creates LogOutputChannel("Speedy Git", { log: true })
  └─ passes to ExtensionController
       └─ passes to GitLogService, GitDiffService, GitBranchService
            └─ passes to GitExecutor (each service creates its own GitExecutor today)
       └─ passes to WebviewProvider
```

### Logger Type

Use `vscode.LogOutputChannel` directly as the type — no wrapper abstraction needed. Services accept it as a constructor parameter.

### What to Log

| Level | When | Examples |
|---|---|---|
| `info` | Extension lifecycle events | `Extension activated`, `Extension deactivated` |
| `info` | Major user actions | `Showing git graph`, `Checkout branch: main`, `Fetch remote: origin` |
| `debug` | Git command execution | `Executing: git log --format=...` (the command string) |
| `debug` | Git command completion | `Git command completed in 120ms` (elapsed time) |
| `debug` | Message routing | `Received message: getCommits`, `Received message: getCommitDetails` |
| `warn` | Recoverable issues | `Diff editor failed, falling back to file view` |
| `error` | Git command failures | `Git command failed: git checkout foo — stderr: ...` |
| `error` | Timeouts | `Git command timed out after 30000ms: git log ...` |

### What NOT to Log

- Full git stdout (can be very large, e.g. 500 commit log output)
- File content at revision
- Sensitive data (no credential or token logging)

## Changes Required

### `src/extension.ts`

- Create `LogOutputChannel` in `activate()`.
- Pass it to `ExtensionController` constructor.
- Log `info` on activate/deactivate.
- Add channel to `context.subscriptions` for auto-disposal.

### `src/ExtensionController.ts`

- Accept `LogOutputChannel` as constructor parameter.
- Pass it to each service (`GitLogService`, `GitDiffService`, `GitBranchService`) and `WebviewProvider`.
- Log `info` when `showGraph()` is called.

### `src/WebviewProvider.ts`

- Accept `LogOutputChannel` as constructor parameter.
- Log `debug` on each incoming message type in `handleMessage()`.
- Log `warn` when diff editor falls back to file view.

### `src/services/GitExecutor.ts`

- Accept `LogOutputChannel` as constructor parameter.
- Log `debug` before executing each git command (command string).
- Log `debug` after successful completion (with elapsed time).
- Log `error` on failures and timeouts.

### `src/services/GitLogService.ts`, `GitDiffService.ts`, `GitBranchService.ts`

- Accept `LogOutputChannel` as constructor parameter.
- Pass it through to their `GitExecutor` instance.
- Log `info` for high-level operations (e.g., `Fetching commits`, `Getting commit details for abc1234`).

## Disposal

`LogOutputChannel` is added to `context.subscriptions` in `activate()`, so VS Code handles disposal automatically. No manual cleanup needed.

## Testing

- Manual: run the extension, open Output panel, select "Speedy Git" from the dropdown, verify logs appear for activation, git commands, and errors.
- Verify log level filtering works via "Developer: Set Log Level" command.

## Out of Scope

- Logging from the webview/frontend (runs in a different context; would need separate approach).
- File-based logging or log rotation.
- Custom log formatting beyond what `LogOutputChannel` provides.
- Configuration settings to toggle logging (VS Code's built-in log level is sufficient).

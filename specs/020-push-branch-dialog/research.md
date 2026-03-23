# Research: Push Branch Dialog

**Feature Branch**: `020-push-branch-dialog`
**Date**: 2026-03-24

## R-001: Force Push Mode — Boolean vs Enum

**Decision**: Change `force?: boolean` parameter to `forceMode?: 'none' | 'force-with-lease' | 'force'` across the message type, rpcClient, GitRemoteService, and WebviewProvider.

**Rationale**: The current `force: boolean` parameter only supports `--force-with-lease`. The spec requires three distinct push modes: Normal (no flag), `--force-with-lease`, and `--force`. A string literal union type makes the intent explicit and prevents invalid combinations.

**Alternatives considered**:
- Two separate booleans (`forceWithLease: boolean`, `force: boolean`) — rejected because they allow invalid state (both true).
- Numeric enum — rejected because string literals are self-documenting and align with TypeScript best practices.

**Migration**: The existing `force: boolean` parameter is only used in one place (BranchContextMenu push). This is a breaking change to the message contract, but since it's internal (webview↔extension), there are no external consumers to worry about.

## R-002: Dialog Component Pattern

**Decision**: Create a new `PushDialog` component following the `MergeDialog` pattern — using `@radix-ui/react-dialog` (not alert-dialog, since this is not a simple confirmation), with internal `useState` for option management and `onConfirm`/`onCancel` callbacks.

**Rationale**: The MergeDialog pattern is the closest analog (multi-option dialog with checkboxes). Using `react-dialog` instead of `react-alert-dialog` gives us more control over the dialog content (radio buttons, command preview, copy button) without the semantic constraints of an alert dialog.

**Alternatives considered**:
- Store-based dialog state (pendingPush in graphStore) — rejected because the dialog is initiated by user action, not a backend response. Local state is simpler and follows the MergeDialog pattern.
- VS Code native input boxes — rejected because they don't support the multi-option, command-preview layout required.

## R-003: Clipboard API in VS Code Webview

**Decision**: Use the standard `navigator.clipboard.writeText()` API for the copy button.

**Rationale**: VS Code webviews run in a Chromium context that supports the Clipboard API. The `navigator.clipboard.writeText()` method is the standard way to copy text to clipboard in modern browsers, and VS Code webviews have the required permissions.

**Alternatives considered**:
- `document.execCommand('copy')` — deprecated and unreliable.
- Sending a message to the extension host to use `vscode.env.clipboard.writeText()` — unnecessarily complex when the webview API works directly.

## R-004: Remote Dropdown Data Source

**Decision**: Use the existing `remotes` array from the Zustand graphStore (`useGraphStore((s) => s.remotes)`), which is populated via `GitRemoteService.getRemotes()` during `sendInitialData()`.

**Rationale**: The remotes data is already fetched and available in the store. No additional backend calls needed. The `RemoteInfo` type provides `name`, `fetchUrl`, and `pushUrl` — we only need `name` for the dropdown.

**Alternatives considered**:
- Fetching remotes on-demand when dialog opens — rejected because data is already available and this would add unnecessary latency.

## R-005: Loading State During Push

**Decision**: Use local component state (`isPushing: boolean`) within PushDialog to manage the loading indicator and disabled controls, rather than the global `loading` state in graphStore.

**Rationale**: The loading state is scoped to the dialog's lifecycle. Using global `loading` would affect other UI elements unnecessarily. The dialog needs to: (1) disable all controls, (2) show a spinner/indicator, (3) auto-close on completion. This is purely dialog-internal behavior.

**Alternatives considered**:
- Global graphStore `loading` — rejected because it disables unrelated UI elements and doesn't provide dialog-specific feedback.
- New graphStore field `pushInProgress` — over-engineering for a dialog-scoped concern.

## R-006: Push Response Handling for Dialog Close

**Decision**: Convert `rpcClient.push()` from fire-and-forget to a promise-based call that resolves when the backend responds, allowing the dialog to await the result and close accordingly.

**Rationale**: The current push flow is fire-and-forget: `rpcClient.push()` sends the message and the response is handled globally by `handleMessage()`. For the dialog to stay open during push and close on completion, we need to know when the push finishes. The rpcClient already has a pattern for request-response (`sendAndWait` or similar pending request tracking for commit details lookups).

**Alternatives considered**:
- Store-based response tracking (set `pushResult` in store, dialog watches it) — more complex and requires cleanup.
- Backend sends a dedicated `pushComplete` response type — adds unnecessary message types when we can reuse the existing success/error pattern with promise resolution.

**Implementation approach**: Add a `pushAsync()` method to rpcClient that returns a `Promise<string>` resolving on success or rejecting on error, using a pending request pattern similar to the existing `getCommitDetails()` / `lookupCommitByRef()` methods. The dialog calls `await rpcClient.pushAsync(...)`, manages its loading state, then closes.

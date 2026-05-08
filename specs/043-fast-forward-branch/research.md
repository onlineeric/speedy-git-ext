# Phase 0 — Research & Design Decisions

**Feature**: Fast-forward Local Branch from Remote
**Branch**: `043-fast-forward-branch`
**Date**: 2026-05-08

All clarifications were resolved during `/speckit-clarify` (see `spec.md` § Clarifications). This file captures the implementation-level design decisions that follow from those clarifications.

## D1 — Backend method placement

**Decision**: Add a new method `fastForwardFromRemote(remote: string, branch: string): Promise<Result<string>>` to `src/services/GitBranchService.ts`.

**Rationale**:
- The operation updates a *local branch ref*, even though it uses `git fetch` under the hood. Conceptually it belongs to "branch operations", not generic "remote operations".
- `GitBranchService` already owns the existing generic `fetch(remote?, prune?)`. Co-locating keeps the service cohesive.
- A dedicated method (rather than overloading `fetch()` with a refspec parameter) keeps each method's contract narrow and self-documenting — consistent with Constitution Principle II (single responsibility).

**Alternatives considered**:
- Add to `GitRemoteService` — rejected: `GitRemoteService` is for remote *configuration* (push/pull/getRemotes/addRemote), not branch-ref mutations.
- Extend `GitBranchService.fetch()` with an optional `refspec` parameter — rejected: blurs contracts, makes the call sites harder to read at a glance.

## D2 — Git command form

**Decision**: Run `git fetch <remote> <branch>:<branch>` with the existing `GitExecutor` (60s timeout, matching `pull`).

**Rationale**:
- The refspec form `<branch>:<branch>` instructs git to update the local branch ref directly without a checkout. This is the canonical, well-documented approach.
- `GitExecutor` already provides the 30-second default timeout; we override to 60s to match `pull` (network operations need a longer ceiling).
- No `--force` flag — diverged-branch handling per spec Q3 surfaces git's rejection verbatim.

**Alternatives considered**:
- `git pull <remote> <branch>` while not on that branch — rejected: requires checkout-like behavior on the active branch's working tree (won't work on a branch the user isn't on).
- `git push . <remote>/<branch>:<branch>` (using local repo as push target) — works but obscure and harder for users to recognize in the command preview.

## D3 — Default-remote resolution (client side)

**Decision**: Pure helper in `webview-ui/src/utils/resolveDefaultRemote.ts`:

```text
resolveDefaultRemote(branches: Branch[]): string
  remoteNames = unique({ b.remote for b in branches if b.remote })
  if "origin" ∈ remoteNames: return "origin"
  if remoteNames is non-empty: return min(remoteNames) (alphabetical first)
  return "origin"   // literal fallback when no remotes are loaded
```

**Rationale**:
- Implements spec FR-008 deterministically. Pure function, trivially unit-testable.
- Lives in webview because the dialog must show the *resolved* remote in its command preview before the user confirms — and the webview already holds the authoritative `branches` list (Constitution Principle I: no extra round-trip).
- The literal `"origin"` fallback for empty-remotes keeps the command preview readable and lets git surface the actual error after confirm.

**Alternatives considered**:
- Resolve on backend at execution time — rejected: dialog preview would show a placeholder and update lazily, hurting UX clarity.
- Store resolved remote in Zustand — rejected: derivable from `branches[]`, no need for cached state.

## D4 — Dialog reuse vs. new component

**Decision**: Reuse the existing `ConfirmDialog` (`webview-ui/src/components/ConfirmDialog.tsx`) with `variant="warning"`. Do **not** create a new dialog component.

**Rationale**:
- The clarifications removed every option control (no force checkbox, no remote picker, no rebase toggle). The dialog reduces to: title + description + command preview + confirm/cancel — which is exactly `ConfirmDialog`'s contract.
- The existing remote-branch-deletion flow in `BranchContextMenu` already uses `ConfirmDialog` with a command preview — same shape, same wiring, same visual language.
- Constitution Principle II (no premature abstraction): adding `FastForwardLocalBranchDialog.tsx` would be a one-prop wrapper around `ConfirmDialog`.

**Alternatives considered**:
- New dedicated dialog — rejected: adds a file with no behavioral content. PushDialog / MergeDialog exist because they have additional state (force mode, ff-only, etc.); this feature has none.

## D5 — Visibility predicate (no new state)

**Decision**: In `BranchContextMenu`, gate the new menu item with the existing computed flags:

```text
showFastForward = isLocalBranch && !isCurrentBranch && !loading && !rebaseInProgress
```

`isLocalBranch` is already computed (`refInfo.type === 'branch'`). `isCurrentBranch`, `loading`, `rebaseInProgress` are already store-derived.

**Rationale**:
- Per spec Q1: no client-side filter on remote-counterpart existence; visibility is purely a function of local-context flags already on hand.
- `loading` and `rebaseInProgress` align with FR-009 (disable during long-running ops).
- Zero new selectors, zero new flags, zero added latency on menu open (Principle I).

**Alternatives considered**:
- Disable rather than hide when in `rebaseInProgress` — rejected: established codebase pattern hides incompatible operations rather than disabling.

## D6 — Graph refresh after success

**Decision**: On success, call `sendInitialData()` from `WebviewProvider` (the same path used by the existing generic `fetch` case). The auto-refresh `GitWatcherService` will additionally pick up the ref change, but the explicit refresh guarantees graph consistency without waiting for the watcher debounce.

**Rationale**:
- Mirrors the existing pattern at `WebviewProvider.ts:1059–1073` (case `'fetch'`), keeping the codebase uniform.
- Spec FR-006 requires the graph to reflect the new tip after success. Explicit refresh is the simplest correctness guarantee.

**Alternatives considered**:
- Rely solely on `GitWatcherService` — rejected: file-watcher debounce can introduce a perceptible lag and is more brittle on Windows / WSL.

## D7 — Error path

**Decision**: On failure, post `{ type: 'error', payload: { error } }` (existing extension-wide error toast) and do not refresh the graph. Git's stderr (e.g., `fatal: couldn't find remote ref ...` or `[rejected] non-fast-forward`) flows through unchanged.

**Rationale**:
- Spec FR-006 requires git's error verbatim (or wrapped); the existing `error` channel does this with no special-casing needed.
- Spec Q3 explicitly rejected pre-detection of divergence and any force-update path.

**Alternatives considered**:
- Custom error mapping for the "couldn't find remote ref" case — rejected: git's message is already actionable and consistent across platforms.

## Open items

None — all clarifications from `/speckit-clarify` are reflected above.

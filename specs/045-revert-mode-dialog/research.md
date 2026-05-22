# Phase 0 — Research & Design Decisions

**Feature**: Revert Commit dialog with mode selection
**Branch**: `045-revert-mode-dialog`
**Date**: 2026-05-22

All clarifications were resolved during `/speckit-clarify` (see `spec.md` § Clarifications). This file captures the implementation-level design decisions that follow from those clarifications and from reading the existing `GitRevertService`, `GitCherryPickService`, `CherryPickDialog`, and `RevertParentDialog` code.

## D1 — Edit-message mode is a two-step backend operation

**Decision**: `Edit message` mode executes a two-step sequence inside `GitRevertService.revert()`:

1. `git revert --no-commit [-m <N>] <hash>` — applies the inverse changes to the index and working tree.
2. `git commit -F <stdin>` (or `-m <message>`, see D2) — produces the commit with the user-supplied message.

Both steps run via the existing `GitExecutor`. The method returns a single `Result<string, GitError>` reflecting the outcome of whichever step failed (if any), with errors mapped to the existing or new `GitErrorCode` values.

**Rationale**:
- The native `git revert <hash>` (no flags) opens `$GIT_EDITOR` for the user to author the message. The extension host has no TTY, so this would hang or fail.
- Two steps inside one service method keeps the contract narrow: callers see a single `revert()` call with `mode: 'edit-message'`. The split is an implementation detail invisible to the RPC layer and to the dialog.
- Single-method ownership also makes failure handling deterministic: the dirty-tree precondition, `REVERT_HEAD` precondition, and operation-in-progress gate run once at the top, and the two-step body only runs if those checks pass.

**Alternatives considered**:
- Run `git revert <hash>` with `GIT_EDITOR=true` set in the environment so the editor "succeeds" without modifying the message. Rejected — the resulting commit message is git's default, defeating the entire point of `Edit message` mode.
- Run `git revert --no-edit <hash>` (creates a commit with default message), then `git commit --amend -m "<custom message>"`. Rejected — produces a redundant intermediate commit visible to git hooks, slightly more error-prone if anything between the two steps fails, and doesn't simplify code.
- Open a VS Code text document for the user to edit, save, then run revert with `-F <file>`. Rejected — changes the UX shape from "type in dialog and press Revert" to "open a tab, edit, save, return to dialog", inconsistent with how every other dialog in the extension works.

## D2 — How the custom commit message reaches `git commit`

**Decision**: Pass the message via `-F -` (read from stdin) when calling `git commit` from `GitExecutor`. If `GitExecutor` does not currently support stdin, pass the message via `-m "<message>"` argv element — `child_process.spawn` quotes individual args safely on all platforms.

**Rationale**:
- `-m` via argv avoids shell interpolation entirely. Newlines, quotes, backticks, and ampersands in the user's message remain literal because `spawn` does not invoke a shell.
- `-F -` stdin is a marginally cleaner pattern for multi-line messages, but only if `GitExecutor` already accepts a stdin parameter. If not, **don't** add a new `GitExecutor` capability for one caller — use `-m` and stop. (Constitution II — no premature abstraction.)

**Implementation note**: When implementing, first check whether `GitExecutor.execute()` supports a `stdin` option (e.g., look at how `git commit` is invoked elsewhere in `GitIndexService`). Pick the smaller change.

**Alternatives considered**:
- Write the message to a temp file and pass `-F <path>`. Rejected — adds filesystem state, requires cleanup, and offers no advantage over `-m` or stdin.
- Pass via `$GIT_*` env vars. Rejected — no relevant env var exists for `git commit` message body.

## D3 — Conflict detection across modes (REVERT_HEAD vs. stderr)

**Decision**: Use the existing two-track conflict detection:

| Mode | Conflict signal | Error code |
|------|-----------------|------------|
| Commit now | `REVERT_HEAD` exists post-failure (existing `isRevertInProgress` check) **or** stderr matches `isConflictStderr` | `REVERT_CONFLICT` (existing — enters in-progress state, enables Continue/Abort) |
| Stage only | stderr matches `isConflictStderr` only — `REVERT_HEAD` is **not** set by git for `--no-commit` runs | `REVERT_CONFLICT_NO_RECOVERY` (NEW — no in-progress state, no Continue/Abort) |
| Edit message — step 1 failure | Same as Stage only (`isConflictStderr`) | `REVERT_CONFLICT_NO_RECOVERY` |
| Edit message — step 2 failure (commit hook etc.) | The `git commit` step returns its own stderr | `COMMAND_FAILED` (existing) — staged inverse changes remain; user re-commits manually |

**Rationale**:
- Git's `revert --no-commit` deliberately does **not** create `REVERT_HEAD`. That marker only exists when the user can resume via `git revert --continue`. So `Stage only` and `Edit message` step-1 conflicts must rely on stderr matching alone.
- A distinct `GitErrorCode` for the no-recovery case lets the webview show an action-specific message ("resolve conflicts in the SCM panel and commit manually") without conditionally inspecting error text.
- The existing `Commit now` flow is untouched — `REVERT_CONFLICT` already enables the Continue Revert / Abort Revert items in `CommitContextMenu` via `revertInProgress` state.

**Alternatives considered**:
- Re-use `REVERT_CONFLICT` for all modes. Rejected — the webview cannot tell from one code whether to enter `revertInProgress` state. Two codes = two clear policies.
- Detect `Edit message` step-2 hook failure as a special code. Rejected — `COMMAND_FAILED` with git's stderr is enough; the user owns the resolution and the existing error toast is sufficient. (YAGNI.)

## D4 — Empty-revert detection across modes

**Decision**: Each mode independently surfaces the "nothing to revert" condition with the same friendly message ("This commit introduces no changes relative to the current branch. The revert is already present.") and the existing `COMMAND_FAILED` code.

| Mode | Detection point |
|------|-----------------|
| Commit now | stderr matches `nothing to commit` or `nothing to revert` (existing logic at `GitRevertService.ts:70`) |
| Stage only | Same stderr-match strategy — `git revert --no-commit` of an empty-relative-to-HEAD commit emits the same messages |
| Edit message — step 1 | Same stderr-match strategy as Stage only |
| Edit message — step 1 succeeded but `git diff --cached --quiet` returns 0 | NEW edge case: between steps, check the index. If empty, **skip step 2** and return the "nothing to revert" error. (Otherwise we'd commit an empty commit.) |

**Rationale**:
- `git revert --no-commit` can succeed silently even when the inverse is empty (git's behavior depends on version; older gits leave the index untouched without an error). We must defensively check the index between steps to avoid creating an empty commit.
- The `git diff --cached --quiet` exit code is the canonical "is anything staged" probe — fast, no parsing, zero new dependencies.

**Alternatives considered**:
- Always run step 2 and rely on `git commit` to refuse empty commits. Rejected — `git commit` will error with "nothing to commit, working tree clean", which is correct semantically but loses the staging side effect (does the user expect the index to be left clean, or with whatever was staged before? deterministically clean is the right answer, so we check first and abort cleanly without ever calling step 2).

## D5 — Dialog component: one merged dialog, not two

**Decision**: Create a single new `RevertDialog.tsx` cloned from `CherryPickDialog.tsx` skeleton. Delete `RevertParentDialog.tsx`. The merge-commit mainline-parent picker is inlined into `RevertDialog` (rendered only when the commit has >1 parent), matching how `CherryPickDialog` already inlines its parent picker.

**Rationale**:
- Spec FR-004 mandates one dialog, not two sequential dialogs (better UX, simpler state machine).
- Spec FR-018 mandates style and behavioral parity with `CherryPickDialog`. Cloning that file's structure (Radix Dialog, theme tokens, button placement) gets parity for free.
- `RevertParentDialog.tsx` becomes dead code the moment `RevertDialog.tsx` ships. Deleting it in the same commit avoids stale code, per constitution II.

**Alternatives considered**:
- Keep `RevertParentDialog.tsx` as a "merge-only" dialog and add a separate mode-selector dialog. Rejected — two dialogs, two state machines, two contexts to keep in sync, and worse UX for merge-commit reverts.
- Extract a generic "ParentPickerSection" component shared between `CherryPickDialog` and `RevertDialog`. Rejected — only two call sites today, and the data shapes differ subtly. (Re-evaluate if a third dialog needs it.)

## D6 — Persistence of last-used mode

**Decision**: Add `revertOptions: { mode: RevertMode }` slice to `graphStore.ts`, with default `{ mode: 'commit' }` and a setter `setRevertOptions`. The dialog reads this on open and updates it on confirm. Mirrors the existing `cherryPickOptions` slice at `graphStore.ts:72` / `:267` / `:528`.

**Rationale**:
- Mirrors the established pattern from cherry-pick — same expectation: persist within the session, reset on extension restart.
- Per spec Assumptions, persistence across VS Code restarts is out of scope. Zustand transient state is sufficient.
- The `message` from `Edit message` mode is **not** persisted — when the dialog reopens in `Edit message` mode, the textarea is freshly pre-filled with git's default for the new target commit.

**Alternatives considered**:
- Persist to `context.globalState`. Rejected — over-scope per spec Assumptions, and Speedy Git's existing pattern is "options are session-only" (see cherry-pick).
- Persist message draft too. Rejected — confusing UX (the previously-typed message is for a different commit); spec FR-007 says pre-fill with the current commit's default.

## D7 — Command preview construction

**Decision**: Extend `buildRevertCommand` in `gitCommandBuilder.ts` to accept `mode: RevertMode` and produce:

| `mode` | Output |
|--------|--------|
| `commit` | `git revert --no-edit [-m <N>] <abbrev-hash>` (existing behavior, plus `--no-edit` already shown) |
| `no-commit` | `git revert --no-commit [-m <N>] <abbrev-hash>` |
| `edit-message` | `git revert [-m <N>] <abbrev-hash>` (no flag — represents the native developer-typed form, per Q2 resolution) |

`<abbrev-hash>` is the 7-character form (already what `CherryPickDialog` passes in).

**Rationale**:
- Spec Command Preview Policy (post-clarify Q2) prescribes these exact previews.
- All three previews are single-line, consistent visual rhythm with `CherryPickDialog`'s preview.

**Alternatives considered**:
- Conditionally show `--no-edit` only when a `-m <N>` is also present (the native git command without `-m` and without `--no-edit` would open the editor). Rejected — `--no-edit` is already part of today's preview for non-merge reverts; removing it would be a confusing visual regression for the most common mode.

## D8 — Operation-in-progress gating remains shared

**Decision**: Keep the existing `getOperationInProgressError()` check at the top of `WebviewProvider.ts` case `'revert'`. No changes to its semantics — it already covers cherry-pick, rebase, and revert in-progress states. Only `Commit now` mode can ever produce a `revert` in-progress state (per D3); the other two modes still respect the gate but can't *cause* a future `revert` block.

**Rationale**:
- Preserves the single source of truth for cross-operation locking.
- No new state introduced. Webview store `revertInProgress` continues to derive from `payload.revertState === 'in-progress'` (graphStore.ts:904).

**Alternatives considered**: None — this is the established pattern.

## D9 — Dialog message-area validation

**Decision**: In `RevertDialog`, the confirm button is disabled when `mode === 'edit-message'` and `message.trim().length === 0`. The `Edit message` text area starts pre-filled with the standard git revert message format computed client-side:

```text
Revert "<subject>"

This reverts commit <full-40-char-hash>.
```

**Rationale**:
- Spec FR-008 (empty/whitespace disables confirm) and FR-007 (pre-fill format) explicitly specify this behavior.
- The 40-char hash is on `Commit` in the store (`commit.hash`), and `commit.subject` is available — no extra RPC needed.

**Alternatives considered**: Round-trip to backend for the default message (e.g., let `git revert --no-commit` compute it and then read `COMMIT_EDITMSG`). Rejected — extra RPC, extra latency, and the format is stable across git versions.

## D10 — Error message on stage-only / edit-message conflict

**Decision**: For `REVERT_CONFLICT_NO_RECOVERY`, the `GitRevertService` returns the message: *"Revert paused due to conflict. Resolve conflicts in the Source Control panel, then commit the result manually (this mode does not enter git's revert state machine, so there is no Continue/Abort step)."* The webview shows this via the existing error toast — no special UI is added.

**Rationale**:
- One sentence each: what happened, what to do, why it differs from `Commit now` mode. Honest about the underlying git behavior.
- Reuses the existing error-toast channel — no new component, no special-cased UI.

**Alternatives considered**:
- Show a modal dialog instead of a toast. Rejected — inconsistent with how `Commit now` conflicts are surfaced today (toast + Continue/Abort menu items).
- Add a one-click "Open Source Control" action to the toast. Rejected — VS Code's source-control panel is already the default response surface for any conflict; users know where it is.

## Open items

None — all clarifications from `/speckit-clarify` are reflected above.

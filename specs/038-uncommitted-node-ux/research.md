# Phase 0 Research: Uncommitted Node UX Polish

All **NEEDS CLARIFICATION** items resolved below. Each entry is of the form
**Decision → Rationale → Alternatives considered**.

## 1. Radio group primitive

**Decision**: Use native HTML `<input type="radio">` inputs sharing a common `name` attribute, wrapped in a styled `<div role="radiogroup">`.

**Rationale (revised during implementation)**: Native HTML radio inputs with a shared `name` get keyboard navigation (Arrow keys between options within the same name group) for free from the browser — no custom focus/keyboard handling required. This avoids introducing a new npm dependency (`@radix-ui/react-radio-group`), which would have required a manual `pnpm add` step under the constitution's no-auto-install rule and temporarily broken `pnpm typecheck` / `pnpm build`. The visual style is implemented in Tailwind with a custom-rendered radio dot on top of `appearance-none` native inputs, matching the look of the surrounding Radix dialogs without pulling in another primitive.

**Alternatives considered**:

- `@radix-ui/react-radio-group` — evaluated during planning; ultimately rejected because the zero-dependency native path is simpler and keeps the feature self-contained. The existing Radix primitives (`react-dialog`, `react-alert-dialog`) continue to wrap this dialog from the outside.
- Re-using the existing context-menu pattern — rejected: context menus and radio groups have different UX semantics.

## 2. Selective stash with untracked files — add-then-stash flow

**Decision**: Execute `git add -- <paths>` followed by `git stash push [-m <msg>] -- <paths>` as two sequential calls inside a new `GitStashService.stashSelected()` method. If the `add` step fails, return the `add`-step error immediately without attempting the `stash push`. If the `stash push` step fails, return a `GitError` whose message explicitly names both steps and states that the selected paths are now staged (so the user knows the working-tree state).

**Rationale**: Git's `stash push -u -- <pathspec>` does **not** reliably include untracked files that are named in the pathspec — untracked files are only captured by `-u` when NOT combined with a pathspec. The established workaround used by several GUIs (GitKraken, Fork) is add-then-stash. The spec's chosen design (FR-028a, FR-F03) encodes this and requires that the command preview show the `&&`-joined form verbatim.

**Alternatives considered**:

- Single `git stash push --include-untracked -- <paths>` — rejected: silently drops untracked files from the pathspec set in many git versions; exactly the regression SC-004 forbids.
- Building a temporary stash commit by hand (`git stash create` + custom plumbing) — rejected: high complexity, fragile, outside the stated spec scope.
- Running the two commands from the webview via two RPC calls — rejected: Constitution V forbids git work in the webview; also opens a partial-failure window the webview cannot describe accurately.

## 3. Selective stash with renamed files — always-include-pair

**Decision**: Before calling `stashSelected`, the webview enumerates any `renamed` entries in the uncommitted set and adds both sides of each renamed pair (`path` and `oldPath`) to the paths list handed to the backend, deduped. The Stash radio row shows an always-visible inline note when any renamed file exists in the uncommitted set.

**Rationale**: `git stash push -- <pathspec>` produces a broken half-rename stash entry when only one side of the rename is in the pathspec. The safer default — always stashing both sides — avoids a class of stash-apply failures users would otherwise hit on restore. The user-visible inline note makes the auto-inclusion transparent.

**Alternatives considered**:

- Auto-select the rename counterpart in the file list when the user ticks one side — rejected: mutates the user's selection surprisingly, and the count semantics in the action button label become muddled.
- Disable partial selection of renamed pairs — rejected: worse UX; users lose the ability to see the pair in the list at all.

## 4. Command preview format for the stash row

**Decision**: When the Stash selection includes at least one untracked file, render `git add -- <paths> && git stash push -m "<msg>" -- <paths>` on a single line. When no untracked files are selected, render only `git stash push [-m "<msg>"] -- <paths>`. Paths are surface-truncated (first 3, then `…(+N more)`) for visual compactness, but the **copied** string is the full, exact string that will be executed (per FR-028c).

**Rationale**: The spec explicitly requires both the joined form and a faithful copy-to-clipboard. Visual truncation only applies to the on-screen text; the copy path must be exact for a user who pastes into a terminal to reproduce what the dialog ran.

**Alternatives considered**:

- Always show the joined form even without untracked files — rejected: visually noisy and inaccurate relative to what the dialog actually executes.
- Hide paths entirely and show only the verb — rejected: kills the "exact command" value the CommandPreview is supposed to provide.

## 5. Dual-state file accounting (staged + unstaged on the same path)

**Decision**: Treat a path with both staged and unstaged changes as contributing 1 to the staged side AND 1 to the unstaged side. A single such file, selected alone, qualifies as "mixed" and enables all four radios. Counts follow:

- `Stage (N)` counts files with an unstaged side.
- `Unstage (N)` counts files with a staged side.
- `Discard (N)` counts files with an unstaged side (discard is an unstaged-side operation per git semantics).
- `Stash (N)` counts **distinct paths** (dual-state contributes 1, since stash captures both sides into one stash entry).

**Rationale**: Matches how git itself structures the index/working-tree boundary and what the user actually sees. Confirmed in clarifications session 2026-04-11.

**Alternatives considered**:

- Count dual-state paths twice in Stash — rejected: misleading, since stash produces one entry per path.
- Exclude dual-state from "mixed" — rejected: the user cannot then access Stash or Discard for a single-file selection that needs it.

## 6. Failure handling: no automatic rollback

**Decision**: On any action failure, keep the dialog open with selection preserved and show an inline error banner at the top containing the raw git error message. For the add-then-stash flow, the banner explicitly names which step failed and the resulting working-tree state (e.g., *"`git add` succeeded; `git stash push` failed with <error>. Selected untracked files are now staged."*). Do NOT attempt to `git reset` or otherwise roll back.

**Rationale**: FR-F04: reporting actual state beats speculative recovery that can itself fail and leave the tree in yet another partial state. The user can re-open the dialog, observe the refreshed list, and retry.

**Alternatives considered**:

- Auto-rollback via `git reset HEAD -- <paths>` on add-then-stash failure — rejected: can itself fail; can undo a legitimate prior stage the user didn't intend this dialog to touch; creates a surprising hidden side effect.

## 7. Busy state: disable inputs, keep Close enabled

**Decision**: While a git command is running, disable the action button (replace label with spinner + "Working…"), disable the file-list checkboxes, and disable the radio group. Keep the `Close` button enabled; closing the dialog while a command is in flight closes the dialog UI but does NOT cancel the running git command.

**Rationale**: Matches the clarified behavior from session 2026-04-11. Git operations are fast but not instantaneous; during that window, preventing input changes avoids state drift under a running command. Letting the user close the dialog preserves escape-hatch UX; the backend command still completes and the subsequent refresh picks up the real state.

**Alternatives considered**:

- Cancel the running command on Close — rejected: `GitExecutor` has a 30 s hard timeout but no mid-command cancellation API, and fabricating one for this dialog is outside scope.
- Disable Close too — rejected: creates a "trapped in dialog" experience if a command hangs.

## 8. Existing component reuse — additive props only

**Decision**: Extend `CommandPreview` with `showCopyButton?: boolean` (default `true`) and `showLabel?: boolean` (default `true`). Extend `DiscardAllDialog` with optional `title`, `description`, `confirmLabel`, and `commandPreview` overrides (all defaulting to current hardcoded values). Extend `StashDialog` with optional `title` and `description` overrides (default to current "Stash All Changes" wording for existing call sites). No existing call sites change behavior — defaults preserve current UX exactly.

**Rationale**: Keeps the component set small, avoids near-duplicate files, and keeps constitution II (DRY / simplicity) satisfied. The alternative of spinning up a new component per call site is what the spec explicitly warns against.

**Alternatives considered**:

- New `SelectiveDiscardDialog` — rejected: 95% duplicate of `DiscardAllDialog`.
- New `StashEverythingDialog` — rejected: `StashDialog` is already the exact layout; only the title differs.

## 9. Where to gate the per-row behavior changes

**Decision**: The existing file-row component `FileChangeShared.tsx` already receives `commitHash`, and `UNCOMMITTED_HASH` is already imported and used for some branches (`handleOpenAtCommit`). The two new rules — always-visible stage/unstage arrow, and hidden "Open file at this commit" icon — are gated on `commitHash === UNCOMMITTED_HASH` inside the existing `FileActionIcons` component. No new prop is introduced, no new "mode" concept.

**Rationale**: Zero API surface area added; the existing sentinel already identifies the uncommitted node. Matches the assumption recorded in spec.md ("can be gated on an existing uncommitted-node sentinel already known to the file-row renderer").

**Alternatives considered**:

- Adding a new `mode?: 'uncommitted'` prop — rejected: duplicates information already encoded in `commitHash`.

## 10. Auto-generated default stash message

**Decision**: Add a new pure helper `buildDefaultStashMessage(fileCount: number, branchName: string): string` in `webview-ui/src/utils/stashMessage.ts` returning the exact string `Stash of ${fileCount} files from ${branchName}`. Used only when the user leaves the stash message blank in the new radio flow.

**Rationale**: Pure, unit-testable, single responsibility. Matches FR-032 verbatim. No localization infrastructure exists in the project today (confirmed by assumption in spec.md), so a fixed English format is acceptable.

**Alternatives considered**:

- Inline string-build in `FilePickerDialog` — rejected: harder to unit test, violates DRY if ever reused.
- Using commit subject or timestamp — rejected: spec explicitly fixes the format.

---

**Research phase complete — no remaining NEEDS CLARIFICATION markers.**

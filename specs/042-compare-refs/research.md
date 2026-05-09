# Phase 0 Research: Compare Refs (A vs B)

**Feature**: `042-compare-refs`
**Spec**: [spec.md](./spec.md)

The spec was clarified in Session 2026-05-07 (six Q/A items: index sentinel, stash, slot labels,
loading indicator, lazy resolve, large-result handling). All FRs/SCs are concrete; there are no
remaining `NEEDS CLARIFICATION` markers in the spec.

This document records the implementation-level decisions that come out of the spec — every choice
between two viable approaches is captured here so Phase 1 (data-model, contracts) does not need
to re-litigate them.

---

## Decision 1 — Two-ref diff plumbing

**Decision**: Add a single new method `GitDiffService.compareRefs(refA, refB, mode, abortSignal?)` that
returns `Result<CompareResult>` where `CompareResult = { files: FileChange[]; stats: { additions, deletions } }`.
Internally it shells out to:

- `git diff --name-status -z [refA..refB | refA...refB]` for the file list.
- `git diff --numstat -z [refA..refB | refA...refB]` for additions/deletions.
- `git diff --raw` is not needed; name-status + numstat covers every status code we render.

Three-dot mode passes the `refA...refB` form; two-dot passes `refA refB`. Working-tree comparisons
omit the `refB` argument when `refB === WORKING_TREE` (so `git diff refA` compares refA to the
working tree) and pass `--cached`-equivalent semantics only if Index becomes a sentinel later (out
of v1).

Per-file content for the diff editor reuses the existing `git-show://<hash>/<path>?<path>` URI
scheme (no scheme change). The webview opens VS Code's native diff editor with two URIs — one per
endpoint — so the existing `GitShowContentProvider` handles each side independently. Working tree
side opens the file's on-disk URI directly (`vscode.Uri.file`). For the empty-tree side (root-commit
edge case) the URI is `git-show://4b825dc642cb6eb9a060e54bf8d69288fbee4904/<path>?<path>` (Git's
well-known empty tree hash), which `getCommitFile` handles natively.

**Rationale**: Two-dot vs three-dot is a single argument change at the git-CLI level; matching the
existing single-commit path (which uses `diff-tree --name-status -z`) keeps the parser shared.
Reusing `git-show://` avoids a new VS Code content provider and preserves the existing diff UX.

**Alternatives considered**:

- *Add a `git-compare://` scheme that produces a synthetic two-side diff.* Rejected: VS Code's
  diff editor already takes two URIs; introducing a third scheme adds surface area for no UX gain.
- *Port the merge-commit `diff-tree HASH^1 HASH` form.* Rejected: `diff` (the porcelain) handles
  arbitrary commit-ish ranges, including branch names and typed expressions; `diff-tree` requires
  resolved hashes and a fixed range form, which forces eager resolution and contradicts FR-007a.
- *Use `git diff --raw -z` for status + use `cat-file --batch` for binary detection.* Rejected:
  `--numstat` returns `-\t-` for binary files — same signal we already parse for single commits.

---

## Decision 2 — Cancellation (FR-025b)

**Decision**: Extend `GitExecOptions` with an optional `abortSignal?: AbortSignal`. Inside
`GitExecutor.execute`, register `abortSignal.addEventListener('abort', () => gitProcess.kill())`
and resolve with `err(new GitError('Cancelled', 'CANCELLED', cmdString))`. Add a new
`GitErrorCode` value `'CANCELLED'`.

The webview cancels by sending `{ type: 'cancelCompare' }`. The backend keeps a single
`AbortController` per active compare request (latest-wins semantics: a new compare aborts the
previous in-flight one automatically — this is also a free implementation of "user clicks Compare
again before the first finishes").

**Rationale**: AbortSignal is the standard Node.js cancellation primitive (supported by
`child_process.spawn` since 16.x, but we already have a manual kill path so the explicit listener
is simpler than passing `signal` into `spawn`). One AbortController per active compare is enough —
spec only requires cancelling the in-flight compare, not arbitrary git commands.

**Alternatives considered**:

- *Pass `signal` into `spawn({ signal })`.* Equivalent at runtime but the executor would have to
  detect the resulting `'AbortError'` on the `error` event and translate it; the manual kill path
  is more explicit.
- *Per-call AbortController stored on the request.* Rejected: latest-wins single-controller is
  simpler and matches user expectation (a second Compare click implicitly cancels the first).

---

## Decision 3 — Lazy ref resolution (FR-007a)

**Decision**: Slot values are stored as a tagged union (`SlotValue`) discriminated by `kind`:

```ts
type SlotValue =
  | { kind: 'workingTree' }
  | { kind: 'head' }
  | { kind: 'branch'; name: string; remote?: string }
  | { kind: 'tag'; name: string }
  | { kind: 'commit'; hash: string }       // resolved at fill time (raw hash paste)
  | { kind: 'expression'; text: string };  // typed `git rev-parse`-compatible string
```

Resolution to a hash happens at **Compare-click time** for `branch | tag | head | expression`, by
calling a new backend RPC `resolveRefs` (or implicitly inside `compareRefs`). For `commit` the
hash is already resolved.

**Rationale**: The spec is explicit (FR-007a) — branch slots must reflect ref movement between
fill-time and compare-time. A discriminated union avoids ambiguity ("is `main` a branch or a typed
expression?") which the FR-006 chip needs to display.

**Alternatives considered**:

- *Resolve eagerly at fill-time and re-resolve on graph refresh.* Rejected: spec FR-007a
  explicitly requires lazy resolution.
- *Store everything as `{ text: string }` and let git resolve at compare-time.* Rejected: would
  lose the "is this a branch or a typed expression?" distinction needed for the chip in FR-006.

---

## Decision 4 — Two-dot vs three-dot default

**Decision**: Compute the default mode from the slot kinds, not from a stored preference, on every
panel render:

```ts
function defaultMode(a: SlotValue, b: SlotValue): TwoOrThreeDot {
  if (a.kind === 'workingTree' || b.kind === 'workingTree') return 'two-dot'; // FR-011
  const aIsRef = a.kind === 'branch' || a.kind === 'tag';
  const bIsRef = b.kind === 'branch' || b.kind === 'tag';
  if (aIsRef && bIsRef) return 'three-dot';                                    // FR-009
  return 'two-dot';                                                             // FR-010
}
```

When the user explicitly flips the toggle, the explicit choice wins until either slot's kind
changes, at which point the default re-applies. (This matches the spec's FR-020 "any showing
result is dismissed when an input changes," so we never need to persist a stale toggle override
across slot edits.)

**Rationale**: Defaults are deterministic from the slot pair. No persistence needed.

**Alternatives considered**:

- *Always default to three-dot for branches.* Rejected: spec FR-010 mandates two-dot when either
  side is a hash or typed expression.
- *Persist the last user override across slot edits.* Rejected: contradicts the FR-020 rule that
  any input change dismisses the result and resets the comparison conceptually.

---

## Decision 5 — Persistence scope

**Decision**: Compare slot state lives in `graphStore` (Zustand) only — not in `PersistedUIState`,
not in VS Code globalState. A `clearCompareState()` reducer is invoked on:

- `switchRepo` / `displayRepo` (FR-030).
- Initial store hydration on extension activation (the store is reconstructed on reload, so this
  is automatic — FR-031).

**Rationale**: Spec FR-031 mandates cross-session clearing because refs may not resolve in a
future session. Keeping compare state out of `PersistedUIState` makes that the default rather
than something to actively scrub.

**Alternatives considered**:

- *Persist slot intent (branch name, expression text) but re-validate on hydrate.* Rejected: the
  spec is explicit that cross-session state is cleared. Adding hidden persistence with validation
  would surprise users when slots survive a window reload.

---

## Decision 6 — Slot combobox primitive

**Decision**: Reuse `FilterableSingleSelectDropdown` (already in the codebase, used by
`SubmoduleSelector` / `RepoSelector`) for each slot. The slot wrapper supplies:

- A `getKey` that hashes the `SlotValue` union (`workingTree` / `head` / `branch:<name>` / etc.).
- A `getSearchText` that returns the human-readable label.
- A `renderItem` that renders each item with a leading kind icon (sentinel / branch / tag / commit).
- An "items" array assembled from: `WORKING_TREE`, `HEAD`, branches (local + remote), tags,
  recently-used items pinned at top, and a synthetic "type a hash or expression" affordance for
  free-text input.
- For free-text typed expressions, the dropdown is augmented to expose the current typed text
  as a synthetic `{ kind: 'expression' }` candidate when nothing else matches — the user can
  press Enter to accept it.

**Rationale**: This is the same primitive used elsewhere in the toolbar; it already supports
keyboard nav, filtering, and accessibility. No new combobox is needed.

**Alternatives considered**:

- *Build a dedicated `RefPicker` component.* Rejected: would duplicate keyboard/filter logic that
  `FilterableSingleSelectDropdown` already encodes.
- *Use a `Command` palette pattern.* Rejected: heavier UI than the spec's "single combobox per
  slot" requirement.

---

## Decision 7 — Result rendering reuse

**Decision**: A compare result reuses the existing `CommitDetailsPanel` by introducing a new
optional `compareResult` field on the store next to `commitDetails`. The panel renders one or the
other based on which is set. A new shared type `CompareResult` is added with the file list, stats,
and a header descriptor (`headerLeft`, `headerRight`, `mode`).

**Rationale**: FR-022 mandates reuse of the existing panel. The simplest mapping is "compare
result has the same shape as `CommitDetails.files`" — which it does.

**Alternatives considered**:

- *Synthesize a fake `CommitDetails` for compare results.* Rejected: hash/abbreviated-hash fields
  do not map cleanly to a two-ref comparison; the panel header needs to know it's rendering a
  compare so it can show "A → B" instead of a single-commit identity.
- *Build a `CompareDetailsPanel` sibling component.* Rejected: 80% code overlap with
  `CommitDetailsPanel` would violate DRY (Constitution Principle II).

---

## Decision 8 — Working-tree auto-refresh wiring (FR-032/033)

**Decision**: The existing `GitWatcherService` already fires a refresh signal on file system
changes. The webview's existing handler for that signal will additionally re-dispatch the active
compare request when **either slot is `WORKING_TREE`**. For ref-vs-ref comparisons the handler
ignores the signal for compare purposes (the graph still refreshes; the compare result panel
does not).

**Rationale**: One additional condition in the existing refresh handler — minimal new code, and
the ref-vs-ref skip exactly matches FR-033.

**Alternatives considered**:

- *A second watcher just for compare.* Rejected: the existing watcher already debounces and
  handles the same events.

---

## Decision 9 — Right-click "B"/"T" graph markers (FR-026/028)

**Decision**: The graph row component reads `compareSelection.aResolvedHash` and
`compareSelection.bResolvedHash` from the store on each render and shows a small "B"/"T" badge
when the row's hash matches. Resolved hashes are cached on the store after each successful
Compare; until then (e.g., before the first Compare run with a freshly-set slot), the badges are
not shown for branch/tag/expression slots — only for slots that already carry a resolved hash
(commit slots, plus post-compare branch/tag slots). Working Tree never gets a graph marker
(FR-028) and the "Uncommitted" pseudo-row carries the marker from the slot chip.

**Rationale**: Lazy resolve (Decision 3) means a branch slot doesn't have a hash until Compare
runs. Showing the marker only when a hash is known avoids racing the resolution.

**Alternatives considered**:

- *Eagerly resolve refs on slot fill just to drive the marker.* Rejected: contradicts FR-007a.
- *Fire `git rev-parse` on every slot change purely for the marker.* Rejected: extra round-trip
  for a cosmetic affordance; users tolerate the marker appearing at Compare time.

---

## Decision 10 — Recently-used dropdown items (FR-005)

**Decision**: Recently-used is a simple in-memory ring buffer (size 8) on `graphStore`,
appended-to whenever a slot is filled. Cleared on repo switch, cleared on session end (matches
slot persistence rules per the assumption in spec).

**Rationale**: A small, in-memory list keeps the implementation trivial and matches the
session-only persistence model.

**Alternatives considered**:

- *Per-repo persistent recents in globalState.* Rejected: would survive sessions, but the spec
  treats compare state as session-only; having recents persist while slots clear would be
  inconsistent.

---

## Open implementation notes (not decisions, just reminders for Phase 2)

- The new `compareRefs` service method must validate inputs to avoid CLI injection. Reuse
  `validateHash` for `commit` slots; for `branch | tag | expression` we can rely on git's own
  parsing because the values come from a controlled set (resolved branches/tags) or from text
  the user typed (expressions) — but we MUST pass them as separate `args[]` entries (no shell
  string concatenation). `GitExecutor.execute` already does this correctly.
- The `'CANCELLED'` error code must be added to `shared/errors.ts` and propagate through the
  `Result<T, GitError>` chain unchanged so the webview can distinguish "user cancelled" from
  "git failed".
- Sentinel constants belong in `shared/types.ts` (`WORKING_TREE_SENTINEL`,
  `EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'`).
- Out-of-scope reminders from spec: no Index sentinel, no stash compare, no range-diff, no
  cross-repo compare, no save-named-comparison, no compare-specific keyboard shortcuts.

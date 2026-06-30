# Phase 0 Research: Tag Enhancements

All Technical Context items were resolved from the existing codebase — no
external unknowns. This document records the design decisions, their rationale,
and the alternatives considered.

## 1. Reading tag metadata (local, single call)

**Decision**: Add `GitTagService.getTagMetadata()` that runs one
`git for-each-ref refs/tags` with a null-byte-delimited custom format and parses
the output with a dedicated `parseTagMetadata` helper in `src/utils/gitParsers.ts`.

Format fields (fields separated by `%00`; each record ends with a trailing `%00`
plus git's normal newline):

- `%(refname:short)` — tag name
- `%(objecttype)` — `tag` for annotated, `commit` for lightweight
- `%(contents)` — the full annotation message shown in the tooltip (annotated only).
  This can contain line breaks, so parsing uses fixed-width NUL field groups
  instead of splitting records by newline.
- `%(taggername)` — tagger name (annotated only)
- `%(taggerdate:unix)` — tag date as unix seconds (annotated only)

**Rationale**:
- One process for all tags (Performance First); runs off the render path as
  deferred data, matching how remotes/worktrees/stashes are already loaded in
  `RepoDataLoader.sendDeferredRepoData`.
- `for-each-ref` with `%(...)` atoms is git's purpose-built typed query — no
  regex scraping of porcelain (Constitution IV). Null-byte separation matches the
  existing parsing convention in `GitLogService`/`gitParsers.ts` and preserves
  multi-line annotation messages.
- `%(objecttype)` cleanly distinguishes annotated (`tag`) from lightweight
  (`commit`), satisfying FR-001/FR-003 at no extra cost.

**Lightweight handling**: when `objecttype === 'commit'`, the tagger/contents
atoms are empty; the parser marks the entry `annotated: false` and omits message/
tagger/date so the tooltip never shows misleading empty annotation fields (FR-003).

**Alternatives considered**:
- `git tag -n --format=...` — overlaps with `for-each-ref` but is less flexible
  for object type and date formatting. Rejected.
- Reading per-tag on hover (`git cat-file`) — violates "instant hover, no
  per-hover work"; would add a process per hover. Rejected.
- Reusing the `%D` decoration from `git log` — only yields names, no annotation
  metadata. That stays the source of the badge itself; metadata is layered on top.

## 2. Surfacing metadata in the tag badge tooltip

**Decision**: Enrich the **native multi-line `title`** on the tag badge in
`RefLabel.tsx`, looking the tag up by name in a cached store map. `getRefTitle`
already composes multi-line titles (it appends `\nWorktree: …`), so the tag arm
becomes:

```
<tagName>
<annotation message>          (annotated only, line breaks preserved)
Tagger: <name>                (annotated only)
Date: <formatted date>        (annotated only)
Lightweight tag               (lightweight only)
```

**Rationale**:
- Instant on hover, zero extra DOM/popover, consistent with the existing
  worktree-in-title pattern (Performance First + Clean Code).
- The spec names the **tag badge tooltip** as the primary, required target; a
  richer Radix popover is explicitly a stretch and not required.

**Threading the data**: `RefLabel` is generic over `DisplayRef`. Rather than
widen `DisplayRef`, callers that render tag badges pass the resolved title (or the
metadata) down — or `RefLabel` reads the store map. Final threading is an
implementation detail for tasks; the store holds `tagMetadata` keyed by tag name
so any tag-badge renderer can resolve it in O(1).

**Alternatives considered**:
- A dedicated Radix `Popover` tag tooltip (like `CommitTooltip`) — richer, but
  heavier and unnecessary for message/tagger/date. Deferred as a stretch.
- Surfacing in the Commit Details panel — explicitly a stretch goal in the spec;
  not in this round.

## 3. Caching and invalidation

**Decision**: Store `tagMetadata: Record<string, TagMetadata>` in the Zustand
graph store, populated by a new `tagMetadata` response message from deferred
data, replaced wholesale on each load (refresh invalidates).

**Rationale**: Mirrors existing cached maps (`gitHubAvatarUrls`,
`worktreeByHead`, `containingBranchesCache`). Whole-map replacement on load
satisfies FR-004's "invalidate on refresh" simply and correctly — no stale-entry
bookkeeping. Read is O(1) by tag name on hover.

**Alternatives considered**: Per-entry merge with hash keys (like the signature
cache) — unnecessary; tag metadata is cheap to re-read in full each load and a
full replace avoids stale entries after a tag is deleted/moved externally.

## 4. Create + push chaining (#2) and Force (#4)

**Decision**: Keep `GitTagService.createTag` and `pushTag` as separate atomic
ops. The `createTag` **handler** in `tagHandlers.ts` performs the chain: create,
then (if requested) push, honoring a `force` flag that appends `--force` to the
push args. `pushTag(name, remote?, force?)` gains the optional `force` parameter.

Reporting (FR-010): on create-success + push-failure, post a message that the
tag was created locally but the push failed, including the push error — not a
blanket failure and not silent success. The handler refreshes after the create
(so the local tag shows) regardless of push outcome.

**Rationale**: No new move/force-create semantics (Out of scope); reuses the two
existing ops; chaining lives in the handler where the existing pattern already
calls services and posts success/error. `resolveDefaultRemote(branches)` (webview)
picks the remote; the dialog shows both commands via `CommandPreview`.

**Force scope (FR-015/FR-017)**: `--force` is added only on push paths
(create-and-push, standalone Push Tag). Not offered on create-only or delete —
local `git tag -d` and `git push --delete` have no force flag, and `git tag -f`
is the excluded "move tag" operation.

## 5. Delete + delete-from-remote with benign no-op (#3)

**Decision**: Add `GitTagService.deleteRemoteTag(remote, name)` running
`git push <remote> --delete <name>` (60 s network timeout, like
`deleteRemoteBranch`). The `deleteTag` **handler** chains local `deleteTag` then,
if requested, `deleteRemoteTag`. A new `DeleteTagDialog` (modeled on
`DeleteBranchDialog`) carries an "Also delete from remote" checkbox, default on
when a remote exists.

**Benign no-op (FR-013)**: detect git's specific "remote ref does not exist"
outcome and treat the remote portion as success while the local delete stands.
Git emits, for a missing remote tag:

```
error: unable to delete '<tag>': remote ref does not exist
```

The detection is a narrow `stderr.includes('remote ref does not exist')` check
(analogous to `isBranchNotFullyMerged` in `GitBranchService`). **Only** that
string is swallowed; auth/network/permission failures fall through and surface
(FR-013).

**Rationale**: Mirrors the established branch local/remote delete model
(Constitution II — consistency). The narrow string match keeps a real failure
from masquerading as success.

**Alternatives considered**:
- Pre-checking remote existence with `git ls-remote` — violates local-only
  (Out of scope) and adds a network round-trip. Rejected in favor of try-delete.
- Swallowing any remote-delete failure — would hide real auth/network errors
  (explicitly disallowed by FR-013). Rejected.

## 6. No-remote degradation (FR-009/FR-014)

**Decision**: The webview already loads `remotes` into the store. When
`remotes.length === 0`, the create dialog hides the "Also push" + "Force" row and
the delete dialog hides "Also delete from remote"; local create/delete still work.

**Rationale**: Pure presentational guard using data already in the store; no
backend involvement. `resolveDefaultRemote` falls back to literal `origin` only
for preview readability, but the checkboxes are hidden when there is genuinely no
remote so the fallback is never actually pushed to.

## Open questions

None. All decisions are grounded in existing code patterns; remaining choices
(exact title threading, whether Push Tag uses a dedicated dialog vs. an inline
force toggle) are low-risk implementation details deferred to `/speckit-tasks`.

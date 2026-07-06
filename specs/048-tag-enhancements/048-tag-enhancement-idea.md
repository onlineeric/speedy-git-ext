# Tag enhancement idea spec

> Idea input for the SpecKit full workflow. Captures the feature request, the
> current gaps, and the confirmed design decisions. Intentionally light on
> implementation detail — not a final spec.

## Origin / motivation

The extension can already create tags (lightweight, or annotated when a message
is given), delete them locally, and push a single tag to a remote. But the
workflow dead-ends in a few places and the feature feels half-finished:

- **Create and push are two separate steps** — there's no "create and push" in
  one action.
- **The annotation message is write-only** — we collect it in the create dialog,
  write it to git, and then never show it again anywhere.
- **Delete is local-only** — once a tag is pushed, there's no way to remove it
  from the remote.

This feature closes those gaps while keeping the app **speedy, developer-friendly,
and convenient** — and crucially **local-only** (see Design principles).

## What we have today (baseline)

- **Backend** (`GitTagService`): `createTag` (lightweight / annotated via `-a -m`),
  `deleteTag` (`git tag -d`, local only), `pushTag` (`git push <remote> refs/tags/<name>`).
- **Data model**: tags reach the UI only through the `%D` decoration in `git log`.
  `RefInfo` is just `{ name, type: 'tag' }` — no message, tagger, date, or
  annotated/lightweight flag.
- **UI**: `TagCreationDialog` (name + optional message + command preview); tag
  badge context menu in `BranchContextMenu` (Push / Create worktree / Delete /
  Copy name). Tags also work as Compare slots and worktree sources.

## Enhancements (confirmed decisions)

### 1. Tag visibility — show annotation metadata (cheap, local)

Read tag metadata once via a single local `git for-each-ref refs/tags` call
(no network), cache it by tag name, and surface it. Minimum: show the
**annotation message + tagger + date** in the **tag badge tooltip**.

While we're reading the tag object we also get, at no extra cost:

- **annotated vs lightweight** (`%(objecttype)` is `tag` vs `commit`) — can be
  reflected in the tooltip (and optionally a subtle badge distinction).
- tag **signature** presence/verification — could reuse the existing 047
  signature infrastructure (stretch, optional).

Load it with the deferred data and cache it (invalidate on refresh) so tooltip
hover stays instant. Surfacing it in the Commit Details panel is an optional
stretch; the tooltip is the primary target.

### 2. Create + push in one action

Add an **"Also push to remote"** checkbox to `TagCreationDialog`, **checked by
default**. On submit the handler creates the tag, then pushes it (chaining the
existing `createTag` + `pushTag` ops — no new move/force semantics). The command
preview shows both commands so the user sees exactly what runs.

- Default remote = existing `resolveDefaultRemote` (origin, else first
  alphabetical).
- When the repo has **no remote configured**, hide/disable the checkbox.

### 3. Delete + delete-from-remote

Replace the simple delete confirm for tags with a dialog that adds an **"Also
delete from remote"** checkbox, **checked by default** (mirrors the
local/remote pattern already used by `DeleteBranchDialog`). It runs the local
`git tag -d` plus a remote delete (`git push <remote> --delete <tag>`).

- **"Try delete" semantics**: if the remote tag doesn't exist, do **not** treat
  it as an error — the local delete still succeeds. **Only** git's specific
  "remote ref does not exist" outcome is swallowed as a benign no-op; genuine
  failures (auth, no network, permission denied) must still surface, otherwise a
  real failure would masquerade as success.
- When the repo has **no remote configured**, hide/disable the checkbox.

### 4. Force option (push paths only)

Wherever a tag is **pushed** (the create+push of #2, and the standalone "Push
Tag" menu action), add a **"Force"** checkbox, **unchecked by default**, which
adds `--force` to the push. This covers the case where the tag already exists on
the remote pointing at a different commit.

Force is intentionally **not** offered on delete or create:

- Local delete (`git tag -d`) and remote delete (`git push --delete`) have no
  force flag — a checkbox there would be a no-op.
- Force on create (`git tag -f`) is exactly "move the tag to another commit",
  which is excluded (see Out of scope).

## Design principles

- **Speedy & local-only.** All new reads (#1) use local git commands; no network
  round-trips on render or hover. We do **not** call `git ls-remote` or any host
  API — the app has no place that fetches remote tag state, and we are not adding
  one.
- **No remote-tracking tag status.** Git has no remote-tracking namespace for
  tags (unlike `refs/remotes/` for branches), so we deliberately do **not** try
  to show a "local / remote / both" status. The remote actions (#2, #3) are
  "fire and report", and #3's try-delete keeps them friction-free without
  needing to know remote state in advance.
- **Consistent with existing UX.** Reuse the established patterns: command
  preview in dialogs, the `DeleteBranchDialog` local/remote checkbox model, and
  `resolveDefaultRemote` for default remote selection.

## Out of scope

- **Moving / retagging** (`git tag -f` to point an existing tag at a new commit).
  Hard to give a good UI for; users can delete and re-create instead.
- **Querying remote tag state** (`git ls-remote`, host APIs) — conflicts with the
  speedy/local-only principle.
- Push-all-tags, fetch-tags, checkout-tag, and a dedicated tags list panel — not
  in this round (can be revisited later).

## Relevant existing code

- `src/services/GitTagService.ts` — `createTag` / `deleteTag` / `pushTag`.
- `src/webview/handlers/tagHandlers.ts` — RPC handlers (where create+push and
  delete+delete-remote chaining would live).
- `shared/messages.ts` — `createTag` / `deleteTag` / `pushTag` message payloads
  (force / delete-remote flags get added here).
- `webview-ui/src/components/TagCreationDialog.tsx` — create dialog (#2, #4).
- `webview-ui/src/components/BranchContextMenu.tsx` — tag badge menu, current
  delete confirm (#3, #4).
- `webview-ui/src/components/RefLabel.tsx` / `CommitTooltip.tsx` — where the tag
  badge and its tooltip render (#1).
- `src/utils/gitParsers.ts` / `src/services/GitLogService.ts` — where tag refs
  are currently parsed from `%D` (the for-each-ref metadata read in #1 would
  complement this).
- `webview-ui/src/utils/resolveDefaultRemote.ts` — default remote selection.
- `webview-ui/src/components/DeleteBranchDialog.tsx` — local/remote delete
  pattern to mirror for #3.

# Quickstart: Tag Enhancements — Manual Verification

Prereqs: `pnpm build`, then launch via VS Code "Run Extension" on a repo that has
a remote (e.g. a GitHub clone) and at least one annotated and one lightweight tag.
Generate fixtures if needed:

```bash
git tag -a v9.9.0 -m "Release 9.9.0 — quickstart fixture" HEAD
git tag lw-9.9.0 HEAD        # lightweight
```

Open Speedy Git (`speedyGit.showGraph`).

## Build & validation gates (must pass)

```bash
pnpm typecheck   # zero errors
pnpm lint        # zero errors
pnpm test        # Vitest green (incl. GitTagService + parseTagMetadata)
pnpm build       # clean extension + webview build
```

## Story 1 — Tag metadata in the tooltip (P1)

1. Hover the `v9.9.0` tag badge. **Expect**: native tooltip shows the tag name,
   the annotation message ("Release 9.9.0 …"), the tagger name, and the date.
2. Hover the `lw-9.9.0` badge. **Expect**: tooltip indicates a **lightweight**
   tag, with **no** annotation message/tagger/date fields.
3. Hover several tags repeatedly. **Expect**: instant tooltip, no flicker, and no
   network activity (confirm via the Output channel / no spinner).
4. Change a tag's annotation externally (`git tag -af v9.9.0 -m "new msg" HEAD`),
   then refresh the graph and hover. **Expect**: tooltip shows the new message.

## Story 2 — Create + push in one action (P2)

1. Right-click a commit → Create Tag. **Expect**: dialog shows an "Also push to
   remote" checkbox, **checked by default**, plus a "Force" checkbox **unchecked**.
2. Enter `v9.9.1`, leave "Also push" checked. **Expect**: command preview shows
   both `git tag …` and `git push <remote> refs/tags/v9.9.1`.
3. Submit. **Expect**: success; `git tag` and `git ls-remote --tags <remote>`
   (run manually) both show `v9.9.1`.
4. Create `v9.9.2` with "Also push" **unchecked**. **Expect**: tag exists locally
   only; not on the remote.
5. Simulate push failure (disconnect network) and create+push `v9.9.3`.
   **Expect**: message says the tag was **created locally** but the **push
   failed**, with the reason; `v9.9.3` exists locally.

## Story 3 — Delete + delete-from-remote (P2)

1. Right-click the `v9.9.1` tag badge → Delete Tag. **Expect**: a dialog (not a
   plain confirm) with "Also delete from remote", **checked by default**, and a
   command preview including `git push <remote> --delete v9.9.1`.
2. Confirm. **Expect**: `v9.9.1` gone locally and on the remote.
3. Delete `v9.9.2` (local-only tag) with "Also delete from remote" **checked**.
   **Expect**: local delete succeeds; the missing remote tag is a **benign no-op**
   (no error surfaced).
4. With a tag that exists on the remote, simulate a real failure (revoke
   push access / disconnect) and delete with remote checked. **Expect**: the
   failure **surfaces** (not swallowed); local delete still done.

## Story 4 — Force on push paths (P3)

1. Create a divergence: locally retag `v9.9.0` to a different commit
   (`git tag -f v9.9.0 HEAD~1`) while the remote still has the old `v9.9.0`.
2. Right-click `v9.9.0` → Push Tag (force off). **Expect**: push rejected; the
   rejection is surfaced.
3. Push Tag again with **Force** enabled. **Expect**: command preview shows
   `--force`; push succeeds; remote `v9.9.0` now matches local.
4. Confirm **no** Force option appears on the create-only (push unchecked) path or
   on any delete dialog.

## No-remote degradation

1. In a repo with **no remote** configured, open Create Tag. **Expect**: no "Also
   push"/"Force" row; local create still works.
2. Delete a tag there. **Expect**: no "Also delete from remote" option; local
   delete works.

## Scope guard checks

- Watch the git Output channel during all of the above. **Expect**: no
  `git ls-remote`, no host API calls triggered by render/hover (only the explicit
  push/delete you invoke). Confirms the local-only principle (FR-018).
- Confirm there is no "move tag"/retag affordance anywhere in the UI (FR-019).

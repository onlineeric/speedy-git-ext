# Signing verification idea spec

> Idea input for the SpecKit full workflow. This captures the feature request,
> the relevant background, the design decision (local-only verification), and
> the supporting help documentation we want to ship. Not a final spec.

## Origin

A user opened a GitHub issue requesting:

> I'd like to suggest GPG key signing info, in the commit details, and/or in a
> dedicated column of the main git repo commit history view.

In short: surface each commit's signature / verification status in the UI, both
in the commit details panel and as a scannable column in the main history view.

## Background: what commit signing is

Git records an author/committer name and email, but those are just text and can
be set to anything — they are not proof of identity. **Signing** attaches a
tamper-proof cryptographic signature (GPG, SSH, or X.509) to a commit. Anyone
with the matching public key can then verify:

1. **Identity** — the commit came from the holder of that key.
2. **Integrity** — the commit has not been altered since it was signed.

This is the same thing GitHub surfaces as the green **"Verified"** badge.

## How verification works in this extension today

There is already a backend service: `src/services/GitSignatureService.ts`.

It verifies **locally** by reading git's own signature placeholders via:

```
git log -1 --format=%G?%x00%GS%x00%GK%x00%GP%x00%GG <hash>
```

| Placeholder | Meaning |
|-------------|---------|
| `%G?` | Status code (see table below) |
| `%GS` | Signer name |
| `%GK` | Key ID |
| `%GP` | Key fingerprint |
| `%GG` | Raw verification message |

`%G?` is the important one: when git expands it, **git itself performs the
cryptographic verification on the local machine** — identical to
`git show --show-signature`. The service maps the status code
(`GitSignatureService.ts:75`):

| `%G?` code | Meaning | Mapped status |
|------------|---------|---------------|
| `G` | good (valid, trusted) | `good` ✅ |
| `B` | bad signature | `bad` ⚠️ |
| `U` | good signature, unknown validity (key not trusted) | `unknown` |
| `X` | good signature, expired | `unknown` |
| `Y` | good signature, made by expired key | `unknown` |
| `R` | good signature, made by revoked key | `unknown` |
| `E` | signature cannot be checked (key missing) | `unknown` |
| `N` / other | no signature | `none` (returns `null`) |

The service also tracks a `verificationUnavailable` flag
(`GitSignatureService.ts:99`) for cases like a missing allowed-signers file.

## Design decision: LOCAL-ONLY verification

**We will verify locally only. We will NOT call the GitHub API.**

Rationale — driven by the project's **performance-first** principle:

- Local `%G?` is instant and offline; no network round-trips.
- Works for **every** remote (GitHub, GitLab, Bitbucket, Azure, self-hosted) and
  local-only repos.
- No auth flow, no rate limits, no per-commit/per-page API batching.
- Works for commits that have not been pushed yet.

The GitHub API *could* return verification (`GET /repos/{owner}/{repo}/commits/{sha}`
exposes a `verification` object), but it is GitHub-only, network-bound, rate
limited (60/hr unauthenticated, 5,000/hr authenticated), needs auth for private
repos, and only covers pushed commits. This conflicts with performance-first and
universality, so it is **explicitly out of scope**.

### Consequence we must handle: local trust setup

Because verification is delegated to local git, the extension only shows
"verified" when the user's **local trust store** is configured. This is the main
UX gotcha and the reason the help documentation (below) is part of this feature.

Two separate trust stores are involved, depending on signature type:

1. **The user's own SSH-signed commits** → verified via an SSH
   `allowedSignersFile`. Without it, git errors:
   ```
   error: gpg.ssh.allowedSignersFile needs to be configured and exist for ssh signature verification
   ```
   and the commit shows as `No signature` even though it is signed (and shows
   "Verified" on GitHub).

2. **GitHub-created merge/web commits** → signed with GitHub's **GPG** key
   (`B5690EEEBB952194`, `web-flow@github.com`) → verified via the user's **GPG
   keyring**. These are a *different* mechanism from the user's SSH key:
   - key not imported → `E` (can't check) → `unknown`
   - imported but not trusted → `U` (unknown validity) → `unknown`
   - imported **and trusted** → `G` → `good` ✅

So to match GitHub's badges locally, a user must configure **both** trust stores.
Most users will not have done this, so the extension must (a) make the states
understandable and (b) point users at clear setup instructions.

## Feature scope

**Decision: show in BOTH places** (confirmed). The original issue said "and/or";
we will do both the commit details panel and a dedicated history-table column.

1. **Commit details panel** — show signature/verification info for the selected
   commit: status (verified / bad / unknown / unsigned), signer, key id,
   fingerprint, and signature format (SSH vs GPG).
2. **History view column** — an optional, dedicated column showing a compact
   per-commit badge so the whole history can be scanned at a glance. Should fit
   the existing resizable/draggable column system (`CommitTableHeader.tsx`,
   `commitTableLayout.ts`).
   - **Default hidden** (confirmed): the column ships with `visible: false` in
     `DEFAULT_COMMIT_TABLE_LAYOUT`, i.e. unpinned / not shown by default in the
     View Mode panel. Users opt in via the column visibility toggle
     (`setCommitTableColumnVisibility`, `commitTableLayout.ts:163`).
   - **Unsigned → empty** (confirmed): unsigned commits render a **blank** cell
     (no icon, no badge). Only meaningful signature states draw a glyph
     (e.g. ✅ verified, ⚠️ bad, and a chosen treatment for "signed but cannot
     verify"). This keeps the column visually quiet since most commits in a
     typical repo are unsigned.
3. **Help documentation** (see below) reachable from the UI — e.g. a help/info
   affordance near the signature display or column header that links to setup
   instructions.

### UX nuance to resolve in the spec

The current service collapses `U` (signed but key not trusted) and `E` (signed
but key missing) into a single `unknown`. These mean different things to the
user ("I don't trust this key" vs "I don't have this key"). Consider
distinguishing them, and distinguishing "not signed" from "signed but cannot
verify", so the help text can guide the user to the right fix.

## Help documentation to ship

A help document (location TBD — e.g. a markdown doc opened in a webview/editor,
or a docs page linked from the UI) explaining how to set up local verification
so the extension's badges match GitHub's.

### Section 1 — Verify your own SSH-signed commits

```bash
# Create an allowed signers file mapping your email to your public key
echo "your-email@example.com $(cat ~/.ssh/id_ed25519.pub)" > ~/.ssh/allowed_signers

# Point git at it
git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
```

Then `git show --show-signature HEAD` should report a good SSH signature, and the
extension will show the commit as verified.

### Section 2 — Verify GitHub's GPG-signed merge/web commits

```bash
# Download and import GitHub's public signing key
curl https://github.com/web-flow.gpg | gpg --import

# Trust it (otherwise the status is 'U' / unknown, not 'G' / good)
gpg --edit-key B5690EEEBB952194
# at the prompt: trust -> 5 (ultimate) -> y -> quit
```

After this, GitHub-created commits show as verified locally too.

### Section 3 — Explain the status meanings

Briefly explain verified vs bad vs unsigned vs "signed but cannot verify",
and that GitHub may show "Verified" for commits the local machine cannot verify
until the above trust stores are configured.

## Out of scope

- Any GitHub (or other host) API verification path.
- Creating/managing/generating signing keys for the user.
- Changing the user's git signing configuration on their behalf (we document the
  commands; we do not run them).

## Relevant existing code

- `src/services/GitSignatureService.ts` — local verification via `%G?`, status
  mapping, `verificationUnavailable` flag.
- `shared/types.ts` — `CommitSignatureInfo`, `SignatureStatus`, `SignatureFormat`.
- `webview-ui/src/components/CommitDetailsPanel.tsx` — where per-commit details
  render.
- `webview-ui/src/components/CommitTableHeader.tsx` +
  `webview-ui/src/utils/commitTableLayout.ts` — resizable/draggable column system
  for the new history column.

# Quickstart: Signing Verification

How to build, exercise, and validate this feature locally.

## Prerequisites

```bash
pnpm install
pnpm generate-test-repo   # deterministic test-repo/ (add signed commits manually to exercise states)
```

To exercise real signature states, you need a repo with a mix of signed/unsigned
commits. Useful setup on a scratch repo:

```bash
# SSH-signed commits (your own key)
git config gpg.format ssh
git config user.signingkey ~/.ssh/id_ed25519.pub
git commit -S -m "ssh signed"

# Verify locally (configure allowed signers — the FR-017 case when omitted)
echo "you@example.com $(cat ~/.ssh/id_ed25519.pub)" > ~/.ssh/allowed_signers
git config gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
git log --show-signature -1
```

## Build & validate (Constitution gates)

```bash
pnpm typecheck   # zero TS errors (strict)
pnpm lint        # zero ESLint errors
pnpm test        # Vitest — GitSignatureService + signatureGlyph units
pnpm build       # clean build of extension + webview
```

Then **F5 → "Run Extension"** (or "Run Extension (Watch)") and open Speedy Git.

## Manual smoke test (acceptance scenarios)

### US1 — details panel (P1)
1. Select a commit with a good, trusted signature → panel shows **Verified** + signer,
   key id, fingerprint, format (SSH/GPG). *(AS1)*
2. Select a signed-but-untrusted-key commit → **signed but not trusted** (distinct from
   verified and unsigned). *(AS2)*
3. Select a signed-but-key-missing commit → **cannot verify (key missing)**. *(AS3)*
4. Select a bad/tampered commit → **bad signature** warning. *(AS4)*
5. Select an unsigned commit → **no signature**. *(AS5)*
6. SSH-signed commit with **no** `allowedSignersFile` → **signed, not verified locally**
   (`unavailable`), never "unsigned". *(AS6 / FR-017 — the key regression guard)*

### US2 — history column (P2)
1. Open column-visibility controls → a **Signature** column is offered, **hidden by
   default**. *(AS1, FR-006)*
2. Enable it → verified commits show the good glyph, bad commits the warning glyph, and
   all four "cannot verify" states show the **same single** glyph. *(AS2)*
3. Unsigned commits render a **blank** cell. *(AS3, FR-007)*
4. Resize / reorder / hide the column → behaves like other columns and **persists across
   sessions** (reload the window to confirm). *(AS4, FR-008)*

### US3 — help (P3)
1. Activate the help affordance near the signature display or column header → setup docs
   open in **one action**. *(AS1, SC-005)*
2. Docs cover SSH allowed-signers, GitHub `web-flow` GPG import+trust, and the meaning of
   each state, incl. the local-vs-GitHub caveat. *(AS2/AS3, FR-009/FR-010)*

## Performance validation (Constitution I / SC-004) — DO THIS

1. **Column hidden**: reload on a 500+ commit repo. History load time must be identical
   to before this feature — **no** `%G?`, **no** presence lookup in the default load
   (FR-013). Confirm via the git log output channel: the default `git log` carries no
   signature placeholders.
2. **Column enabled**: graph appears immediately; glyphs populate **progressively**,
   **visible rows first** (FR-014/FR-016). Scroll fast — scrolling stays as smooth as
   with the column disabled; **no** verification fires on scroll (cache hit, FR-015).
3. Scroll back over already-seen rows → instant glyphs from cache, no new git spawns.

## Files touched (orientation)

- `shared/types.ts` — `SignatureStatus` (7 states), `CommitSignatureInfo` (no
  `verificationUnavailable`), `SignaturePresence`, `'signature'` column.
- `shared/messages.ts` — `detectSignaturePresence`/`verifySignatures` + responses.
- `src/services/GitSignatureService.ts` — presence detection + batch verify + 7-state map.
- `src/WebviewProvider.ts` — new RPC dispatch cases.
- `webview-ui/src/rpc/rpcClient.ts`, `stores/graphStore.ts` — batch senders + cache.
- `webview-ui/src/components/CommitDetailsPanel.tsx` — 7-state labels/colors.
- `webview-ui/src/components/{CommitTableHeader,CommitTableRow,SignatureColumnCell}.tsx`
  + `utils/signatureGlyph.ts` — column glyph rendering.
- `docs/signing-verification.md` — setup help doc.

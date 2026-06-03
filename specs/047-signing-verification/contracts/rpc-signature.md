# RPC Contract: Signature Verification

Cross-boundary message contracts (webview ↔ extension host) added to the discriminated
unions in `shared/messages.ts`. All messages flow over VS Code's `postMessage` /
`onDidReceiveMessage` (Constitution V). Type guards narrow on `type`.

The existing single-commit request/response is **kept** for the details panel; new
**batch** + **presence** variants serve the history column.

---

## Existing (unchanged) — details panel, single commit

```ts
// RequestMessage
| { type: 'getSignatureInfo'; payload: { hash: string } }

// ResponseMessage
| { type: 'signatureInfo'; payload: { hash: string; signature: CommitSignatureInfo | null } }
```

- Used by `CommitSignatureSection` for the selected commit only (~11 ms, always on,
  even when the column is hidden).
- `signature: null` ⇒ commit is `unsigned` (no info). Otherwise `status` is one of the
  7 `SignatureStatus` values (now including `unavailable`; the old
  `verificationUnavailable` boolean is gone).

---

## NEW — column: cheap presence detection (batch)

```ts
// RequestMessage
| { type: 'detectSignaturePresence'; payload: { hashes: string[] } }

// ResponseMessage
| { type: 'signaturePresence'; payload: { presence: Record<string, SignaturePresence> } }
```

**Semantics**:
- Backend resolves presence from the raw commit object `gpgsig` header (research R1),
  **no cryptographic work**, configuration-independent.
- `presence[hash]` is `'signed'` or `'not-signed'` for every requested hash.
- Webview caches results; `not-signed` ⇒ render blank cell, never request verification.
- Only sent when the `signature` column is **visible** (FR-013).

---

## NEW — column: verification verdict (batch, signed only)

```ts
// RequestMessage
| { type: 'verifySignatures'; payload: { hashes: string[] } }

// ResponseMessage
| { type: 'signaturesVerified'; payload: { results: Record<string, CommitSignatureInfo | null> } }
```

**Semantics**:
- `hashes` contains **only** commits already known to be `signed` (presence pass) and
  not yet cached.
- Backend runs git's `%G?` verification per hash and returns a hash→info map.
  `results[hash] === null` only if a previously-presumed-signed commit yields no info
  (defensive; normally every entry is a populated `CommitSignatureInfo`).
- Webview merges into `signatureCache`, clears `signatureLoading[hash]`, updates glyphs.
- Caller orders `hashes` **viewport-first** (visible virtualizer range before the
  background remainder, FR-016); the backend preserves input order, processes
  sequentially under the 30 s `GitExecutor` timeout, and may return progressively.

---

## Backend service surface (`GitSignatureService`)

```ts
// existing — single commit verdict (details panel)
getSignatureInfo(hash: string): Promise<Result<CommitSignatureInfo | null>>;

// NEW — cheap presence for many hashes (no crypto)
detectPresence(hashes: string[]): Promise<Result<Record<string, SignaturePresence>>>;

// NEW — verdict for many signed hashes
verifySignatures(hashes: string[]): Promise<Result<Record<string, CommitSignatureInfo | null>>>;
```

- All return `Result<T, GitError>` (Constitution III). Errors surface as the standard
  `error` response; the column degrades gracefully (affected cells stay un-glyphed
  rather than throwing).
- `detectPresence` uses `git cat-file --batch` over the hashes, scanning each object's
  header block for `gpgsig`/`gpgsig-sha256` (stops at the first blank line).
- `verifySignatures` reuses the proven `%G?%x00%GS%x00%GK%x00%GP%x00%GG` parse per
  hash, applying the 7-state mapping and presence-aware `unavailable` resolution.

---

## Dispatch & client wiring

| Layer | Change |
|-------|--------|
| `shared/messages.ts` | Add the two NEW request types + two NEW response types to the unions; register their `type` keys in the request/response allow-lists (the `getSignatureInfo: true … signatureInfo: true` maps). |
| `src/WebviewProvider.ts` | Add `case 'detectSignaturePresence'` and `case 'verifySignatures'` calling the new service methods, posting the corresponding responses. |
| `webview-ui/src/rpc/rpcClient.ts` | Add `detectSignaturePresence(hashes)` / `verifySignatures(hashes)` senders; handle `signaturePresence` / `signaturesVerified` responses → store. |
| `webview-ui/src/stores/graphStore.ts` | Add `signaturePresence` map + setters; merge batch verdicts into `signatureCache`. |

**Contract test intent** (Phase 2 / Vitest):
- `detectPresence` returns `signed` for a commit carrying `gpgsig` even when
  `%G?`→`N` (SSH, no allowed-signers) — the FR-017 regression guard.
- `verifySignatures` maps each `%G?` code to the correct one of the 7 states and sets
  `unavailable` (not `unsigned`) for a present-but-unverifiable signature.
- Unsigned commit ⇒ presence `not-signed`, never enters `verifySignatures`.

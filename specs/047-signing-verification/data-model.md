# Phase 1 Data Model: Signing Verification

All types live in `shared/types.ts` (single source of truth, Constitution III) and
are consumed by both backend (`src/`) and webview (`webview-ui/src/`).

---

## Entity: `SignatureStatus` (enum)

A single **flat** enum classifying a commit's verification outcome. Replaces the
legacy `'good' | 'bad' | 'unknown' | 'none'` enum **and** the separate
`verificationUnavailable` boolean.

```ts
export type SignatureStatus =
  | 'verified'           // %G? = G : good, trusted
  | 'bad'                // %G? = B : bad/tampered signature
  | 'signed-not-trusted' // %G? = U : good sig, key present but untrusted
  | 'signed-key-missing' // %G? = E : cannot check, key missing
  | 'signed-not-good'    // %G? = X/Y/R : expired sig / expired key / revoked key
  | 'unavailable'        // signature present (R1) but no verdict (e.g. SSH no allowed-signers)
  | 'unsigned';          // no signature in the commit object (blank column cell)
```

**Validation / invariants**:
- `unavailable` is assigned **only** when presence is `signed` (R1) AND the `%G?`
  verdict is `N`/error. It is never derived from `%G?` alone.
- `unsigned` is assigned **only** when presence is `not-signed`. A present signature
  can never map to `unsigned` (FR-017).

**Grouping for the column glyph** (derived, not stored — see `signatureGlyph.ts`):

| Category | States | Glyph |
|----------|--------|-------|
| `verified` | `verified` | ✅ good |
| `problem` | `bad` | ⚠️ bad |
| `cannot-verify` | `signed-not-trusted`, `signed-key-missing`, `signed-not-good`, `unavailable` | single "?" glyph |
| (none) | `unsigned` | blank cell |

---

## Entity: `SignatureFormat` (enum)

Unchanged. The cryptographic mechanism, which also selects the governing trust store.

```ts
export type SignatureFormat = 'gpg' | 'ssh';
```

---

## Entity: `SignaturePresence` (enum) — NEW

Whether the commit object carries a signature, determined **independently** of
verification/config (R1). The source of truth for signed-vs-unsigned.

```ts
export type SignaturePresence = 'signed' | 'not-signed';
```

State machine (per commit hash, in the webview cache):

```
            presence pass (cheap)            verification pass (expensive, signed only)
unknown ───────────────────────────► not-signed ──► SignatureStatus = 'unsigned' (blank, terminal)
        └──────────────────────────► signed ──────► %G? verdict ─► verified | bad |
                                                                    signed-not-trusted |
                                                                    signed-key-missing |
                                                                    signed-not-good |
                                                                    unavailable
```

---

## Entity: `CommitSignatureInfo` (interface) — MODIFIED

The verification result for a single commit. `verificationUnavailable` removed;
its meaning is now the `status === 'unavailable'` value.

```ts
export interface CommitSignatureInfo {
  status: SignatureStatus;     // 7-state enum above
  signer: string;              // %GS — empty when not resolvable
  keyId: string;               // %GK — empty when not resolvable
  fingerprint: string;         // %GP — empty when not resolvable
  format: SignatureFormat;     // SSH vs GPG (from raw verification message / header)
  // verificationUnavailable REMOVED — folded into status: 'unavailable'
}
```

**Notes**:
- For `unsigned` commits no `CommitSignatureInfo` is produced; the cache stores a
  sentinel (`null`) so the cell renders blank and no re-request occurs (FR-015).
- `signer`/`keyId`/`fingerprint` may be empty for `unavailable`/`signed-key-missing`
  (git cannot resolve them without the key/config); the UI tolerates empties.

---

## Entity: `CommitTableColumnId` — MODIFIED

Add `'signature'` to the column id tuple and all derived structures.

```ts
export const COMMIT_TABLE_COLUMN_IDS = [
  'graph', 'hash', 'message', 'author', 'date', 'signature',
] as const;
```

Derived additions (all in `shared/types.ts`):
- `DEFAULT_COMMIT_TABLE_COLUMN_ORDER`: append `'signature'`.
- `DEFAULT_COMMIT_TABLE_COLUMN_PREFERENCES.signature = { visible: false, preferredWidth: 40 }` (hidden by default — FR-006).
- `COMMIT_TABLE_MIN_WIDTHS.signature = 32` (glyph-sized).
- `createDefaultCommitTableLayout` / `cloneCommitTableLayout`: add the explicit
  `signature` key in their per-key object literals.

**Persistence**: handled by the existing per-repo `CommitTableLayout` in VS Code
`globalState`; `sanitizeOrder` heals older persisted layouts by appending the new
optional column (FR-008, research R7).

---

## Webview store state (transient — `graphStore.ts`)

Extends the existing signature cache slice. Keyed by **commit hash** (immutable →
cache-safe, FR-015).

```ts
// existing, retyped to the new CommitSignatureInfo
signatureCache: Record<string, CommitSignatureInfo | null>;  // null = unsigned/no-info
signatureLoading: Record<string, boolean>;                   // per-hash in-flight verify

// NEW
signaturePresence: Record<string, SignaturePresence>;        // cheap presence results
```

**Lifecycle**:
- Cleared on repo switch / hard refresh (alongside the existing
  `signatureCache`/`signatureLoading` resets at store reset points).
- Presence cached first; only `signed` + uncached-verdict hashes enter the
  verification queue; viewport-first ordering applied at request time (R4).

---

## No backend persistence

No database, file, or new `globalState` key is introduced. Verification is computed
on demand from git and cached only in the webview session (Assumptions; SC-004).

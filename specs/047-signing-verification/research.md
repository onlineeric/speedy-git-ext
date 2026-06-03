# Phase 0 Research: Signing Verification

All NEEDS CLARIFICATION items resolved. Decisions below are driven by the
**performance-first** constitution principle and the spec's clarifications.

---

## R1. Signature presence detection independent of `%G?`

**Decision**: Detect presence from the **raw commit object header** `gpgsig`
(and `gpgsig-sha256` for SHA-256 repos), via `git cat-file --batch` (or
`--batch-check` with a custom format) over the candidate hashes. Presence is a
pure header lookup — **no cryptographic verification** — and is configuration-
independent.

**Rationale**:
- `%G?` returns `N` ("no signature") for SSH-signed commits when
  `gpg.ssh.allowedSignersFile` is unset (spec Edge Cases, FR-017). Trusting `%G?`
  alone would mislabel signed commits as `unsigned`.
- Commit objects carry the signature in a `gpgsig` header regardless of local
  trust config. Reading the header answers "is it signed?" cheaply and correctly.
- `git cat-file --batch` streams many objects in one process — far cheaper than
  one `git log` per commit and avoids the crypto cost entirely.

**Implementation note**: A `--batch-check='%(objectname) %(objecttype)'` does not
expose headers; we need object **contents** to see `gpgsig`. Use
`git cat-file --batch` and scan each object's header block (everything before the
first blank line) for a line starting with `gpgsig`. Stop scanning at the blank
line (body never contains headers), keeping it O(header bytes), not O(commit size).

**Alternatives considered**:
- *`git log --format=%G?` for presence* — rejected: triggers crypto (the exact
  cost FR-013 forbids) and under-reports SSH signatures (the bug we must avoid).
- *`git verify-commit`* — rejected: also runs verification; same cost + config
  dependence.
- *`%GK`/`%GS` non-empty as presence proxy* — rejected: these are populated by the
  same `%G?` verification path, so they inherit its config-dependent blindness.

---

## R2. Expanded verification verdict → 7-state `SignatureStatus`

**Decision**: Map git's `%G?` codes to a single flat enum (spec clarification):

| `%G?` | git meaning | `SignatureStatus` |
|-------|-------------|-------------------|
| `G` | good, trusted | `verified` |
| `B` | bad signature | `bad` |
| `U` | good sig, unknown validity (key untrusted) | `signed-not-trusted` |
| `E` | cannot check (key missing) | `signed-key-missing` |
| `X` | good sig, **expired signature** | `signed-not-good` |
| `Y` | good sig, **made by expired key** | `signed-not-good` |
| `R` | good sig, **made by revoked key** | `signed-not-good` |
| `N`/other **but signature present** (R1) | verdict unavailable | `unavailable` |
| `N`/other **and no signature** (R1) | truly unsigned | `unsigned` |

**Rationale**: Directly satisfies FR-003/FR-004. Folding `verificationUnavailable`
into the enum (clarification) removes a redundant boolean and the "two sources of
truth" bug class (Constitution III). `unavailable` is decided by combining the
`%G?` verdict with R1 presence, never by `%G?` alone.

**Alternatives considered**:
- *Keep `verificationUnavailable` boolean* — rejected by spec clarification; dual
  state is error-prone and complicates the glyph grouping.
- *Collapse `U`/`E`/expired into one `unknown`* (today's behavior) — rejected:
  the spec requires distinguishing "I don't trust this key" from "I don't have it"
  from "expired/revoked" so help text can target the fix (FR-003, FR-012, SC-003).

---

## R3. Column glyph grouping (3 categories from 7 states)

**Decision** (spec clarification): the narrow column renders **three** glyphs:
- **verified** — `verified`
- **problem/bad** — `bad`
- **signed-but-cannot-verify** (single glyph) — `signed-not-trusted`,
  `signed-key-missing`, `signed-not-good`, `unavailable`
- **blank** — `unsigned` (no glyph, FR-007)

A `webview-ui/src/utils/signatureGlyph.ts` pure function maps
`SignatureStatus → { category, glyph, ariaLabel } | null`. Full 7-state precision
lives only in the details panel (FR-005/FR-012).

**Rationale**: Keeps the column scannable and quiet; centralizes mapping for reuse
and unit testing; O(1) per cell.

**Glyph choice**: Use VS Code Codicons already available in the webview (e.g.
`verified`/`pass-filled` for good, `warning`/`error` for bad, `unverified`/`question`
for cannot-verify) with theme-aware colors (green / red / yellow) mirroring the
details-panel palette. Exact codicon names finalized during implementation; no new
icon dependency.

---

## R4. Async, viewport-first, cached verification scheduling

**Decision**: When the `signature` column is **visible**:
1. **Presence pass** (cheap, R1): batch-detect presence for loaded commits lacking
   a cached presence value. Unsigned → cache `unsigned` immediately (blank cell,
   no further work).
2. **Verification pass** (expensive, R2): only for commits whose presence is
   "signed" and whose verdict isn't cached. Schedule **viewport-first** using the
   virtualizer's current `getVirtualItems()` range, then a background pass for the
   remaining loaded-but-offscreen signed commits.
3. **Cache by hash** in the Zustand store. Signatures are immutable, so cached
   results survive scroll and refresh; only new/unseen hashes are (re)processed.
4. All requests flow through the existing message-passing RPC; the webview never
   blocks on results — glyphs populate progressively as responses arrive.

When the column is **hidden**: do nothing (FR-013). The default `git log` query is
untouched — no `%G?`, no presence lookup.

**Batching**: Add a **batch** verify RPC (`verifySignatures` with `hashes: string[]`)
so a viewport of ~50 rows is one round-trip, not 50. Backend processes sequentially
with the standard `GitExecutor` timeout and streams/returns results keyed by hash.
The single-commit details path keeps using the existing `getSignatureInfo` (selected
commit only, ~11 ms, always on).

**Rationale**: Satisfies FR-014 (non-blocking), FR-015 (cache-by-hash), FR-016
(viewport-first) and SC-004 (no scroll degradation). Reuses the virtualizer range
already computed in `GraphContainer` — no new viewport tracking machinery.

**Alternatives considered**:
- *Per-commit RPC for the whole loaded batch* — rejected: 500 messages + 500 git
  spawns; violates performance-first.
- *Verify during the default log load* — rejected by FR-013 (must be zero-cost when
  hidden).
- *Web Worker for verification* — rejected: verification is git I/O on the backend,
  not CPU work in the webview; a worker adds complexity with no benefit
  (Constitution II YAGNI).

---

## R5. Batch verification mechanism on the backend

**Decision**: For a list of signed hashes, run verification per hash via the
existing `%G?%x00%GS%x00%GK%x00%GP%x00%GG` format (`git log -1`), but **driven by a
single backend method** that iterates and returns a `hash → CommitSignatureInfo`
map, with the format (SSH/GPG) and `unavailable` resolution applied. Presence
(R1) gates which hashes reach this expensive path.

**Rationale**: `%G?` is the only portable way to get git's *verdict* + signer/key
metadata in one shot, and it already works in `GitSignatureService`. The win comes
from (a) never running it for unsigned commits, (b) running it lazily/viewport-first,
and (c) caching — not from changing the per-commit command. Keeping the proven
single-commit command avoids re-implementing git's multi-signature parsing.

**Note on cost**: This preserves the measured ~per-signed-commit cost but applies it
only to *signed, on-screen, uncached* commits — which in a typical
mostly-unsigned repo is a tiny fraction. A future optimization (concatenated
`git log` over many signed hashes) is possible but deferred (YAGNI) until profiling
shows the per-spawn overhead dominates.

---

## R6. Help documentation surface (P3)

**Decision**: Ship a markdown doc (`docs/signing-verification.md`) covering: SSH
`allowedSignersFile` setup, importing+trusting GitHub's `web-flow` GPG key, and the
meaning of each state. Surface it from a **help affordance** (info icon) near the
signature display in the details panel and near the `signature` column header,
opening the doc via VS Code's markdown preview (`markdown.showPreview` /
`vscode.open` on the bundled file) — in-editor, offline, no webview build cost.

**Rationale**: In-editor markdown is offline, themable, requires no extra webview UI,
and satisfies FR-009/FR-010/SC-005 ("single action" to reach setup docs). The doc is
bundled with the extension. External-link fallback is trivial if a hosted docs page
is preferred later.

**Alternatives considered**:
- *Dedicated React webview panel* — rejected: more UI surface + build weight for
  static content (Constitution II).
- *External URL only* — rejected: fails offline and adds a network dependency for
  what is local setup guidance; kept as an optional fallback.

---

## R7. Column integration (resize/reorder/visibility/persistence)

**Decision**: Add `'signature'` to `COMMIT_TABLE_COLUMN_IDS`, with
`visible: false` in the default layout (FR-006), a sensible `preferredWidth`
(narrow, glyph-sized ~40px) and `COMMIT_TABLE_MIN_WIDTHS` entry. Update
`createDefaultCommitTableLayout`/`cloneCommitTableLayout` (explicit per-key clones)
and `computeAutoFitWidth` (fixed glyph width, no text measurement). No other column
logic changes — the existing order/resize/visibility/persistence machinery
(`commitTableLayout.ts`, per-repo `globalState`) handles it generically (FR-008).

**Rationale**: Reuses the established, tested column system; the only bespoke bit is
the cell renderer + auto-fit width (glyph, not text).

**Migration note**: Persisted layouts from prior versions won't contain `signature`.
The existing `sanitizeOrder` appends missing optional columns, and clone/default
seeding adds the preference — so old persisted layouts heal to include a hidden
`signature` column without manual migration. Verify this during implementation.

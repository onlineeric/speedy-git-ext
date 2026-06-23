# Feature Specification: Signing Verification

**Feature Branch**: `047-signing-verification`  
**Created**: 2026-06-03  
**Status**: Draft  
**Input**: User description: "read @specs/047-signing-verification/047-signing-verification-idea.md, create folder and branch also using 047-signing-verification"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See verification status for the selected commit (Priority: P1)

A user selects a commit in the history graph and opens the commit details panel.
The panel shows whether the commit is cryptographically signed and, if so,
whether the signature was verified on their machine — along with who signed it
and with what key. This lets the user confirm a commit's authenticity without
leaving the editor or visiting the hosting provider's website.

**Why this priority**: This is the core value of the feature and the part of the
original request most users will rely on. It is independently useful even
without the scannable history column, and it gives a place to surface the
"how to set up verification" help.

**Independent Test**: Select a signed commit and confirm the details panel shows
its verification status, signer, key id, fingerprint, and signature format;
select an unsigned commit and confirm the panel clearly indicates "no signature."

**Acceptance Scenarios**:

1. **Given** a commit with a good, trusted signature, **When** the user selects
   it, **Then** the details panel shows a "verified" state with the signer name,
   key id, fingerprint, and signature format (SSH or GPG).
2. **Given** a commit that is signed but the signing key is not trusted locally,
   **When** the user selects it, **Then** the panel shows a distinct "signed but
   not trusted" state (not the same as "verified" and not the same as
   "unsigned").
3. **Given** a commit that is signed but the signing key is missing locally,
   **When** the user selects it, **Then** the panel shows a distinct "signed but
   cannot verify (key missing)" state.
4. **Given** a commit with a bad/tampered signature, **When** the user selects
   it, **Then** the panel shows a clear "bad signature" warning state.
5. **Given** an unsigned commit, **When** the user selects it, **Then** the panel
   indicates the commit has no signature.
6. **Given** an SSH-signed commit on a machine where `gpg.ssh.allowedSignersFile`
   is not configured, **When** the user selects it, **Then** the panel shows
   "signed, not verified locally" (the `unavailable` state) and never "unsigned,"
   even though git's `%G?` reports the commit as if it had no signature.

---

### User Story 2 - Scan signature status across the whole history (Priority: P2)

A user wants to audit a repository at a glance. They enable an optional
"Signature" column in the history table. Each signed commit shows a compact
badge/glyph indicating its verification state, so the user can scan many commits
quickly. Unsigned commits show nothing, keeping the column quiet in typical
repos where most commits are unsigned.

**Why this priority**: Adds scannability requested in the original issue, but
depends on the per-commit verification logic from P1. It is opt-in, so it is not
required for the feature to deliver value.

**Independent Test**: Enable the Signature column via the column-visibility
toggle, confirm signed commits render the correct glyph for their state and
unsigned commits render a blank cell, and confirm the column can be
resized/reordered/hidden like other columns.

**Acceptance Scenarios**:

1. **Given** the history table, **When** the user opens the column visibility
   controls, **Then** a "Signature" column is offered and is hidden by default.
2. **Given** the Signature column is enabled, **When** the table renders, **Then**
   verified commits show a "verified" glyph, bad-signature commits show a warning
   glyph, and every "signed but cannot verify" state (signed-not-trusted,
   signed-key-missing, signed-not-good, unavailable) shows the same single
   distinct glyph (with the precise state shown in the details panel).
3. **Given** the Signature column is enabled, **When** an unsigned commit renders,
   **Then** its cell is blank (no icon, no badge).
4. **Given** the Signature column is enabled, **When** the user resizes, reorders,
   or hides it, **Then** it behaves like every other commit-table column and the
   choice persists across sessions.

---

### User Story 3 - Learn how to set up local verification (Priority: P3)

A user notices a commit shows "Verified" on GitHub but not in the extension. From
a help affordance near the signature display or column header, they open setup
documentation that explains how to configure their local SSH allowed-signers
file and import/trust GitHub's GPG key, so the extension's badges match what
GitHub shows.

**Why this priority**: Because verification is local-only, most users will not
have their trust stores configured and will see "unknown"/"unsigned" where they
expected "verified." Documentation turns a confusing state into an actionable
one, but the feature still functions without it.

**Independent Test**: Trigger the help affordance and confirm it opens
documentation covering SSH allowed-signers setup, GitHub GPG key import/trust,
and an explanation of each status meaning.

**Acceptance Scenarios**:

1. **Given** the signature display or column header, **When** the user activates
   the help affordance, **Then** documentation opens explaining how to verify
   their own SSH-signed commits.
2. **Given** the help documentation, **When** the user reads it, **Then** it
   explains how to import and trust GitHub's GPG signing key for web/merge
   commits.
3. **Given** the help documentation, **When** the user reads it, **Then** it
   explains the difference between verified, bad, unsigned, and "signed but
   cannot verify," and notes that GitHub may show "Verified" for commits the
   local machine cannot verify until trust stores are configured.

### Edge Cases

- A commit is signed but the SSH `allowedSignersFile` is not configured: git's
  `%G?` placeholder returns `N` ("no signature") and emits a configuration error
  — i.e. git itself reports the signed commit as if it were unsigned. The system
  MUST NOT trust `%G?` alone to decide presence: it MUST detect the signature
  carried in the commit object so the UI shows "signed, not verified locally"
  (the `unavailable` state) and points to the setup help — never plain
  "unsigned."
- A signature is present but made with an expired, expired-key, or revoked key:
  these should be conveyed as "signed but cannot verify / not good," not as
  "verified."
- Verification tooling is entirely unavailable (e.g., missing allowed-signers
  configuration): the UI surfaces an "unavailable" state rather than silently
  showing "unsigned."
- Performance: enabling the Signature column on a large history must not degrade
  scroll performance below the project's responsiveness expectations.
- The same commit may show different states locally vs on GitHub; the UI/help
  must make clear this is expected and depends on local trust configuration.

## Clarifications

### Session 2026-06-03

- Q: How many distinct glyphs should the narrow history Signature column render for the 6 non-unsigned states? → A: Grouped glyphs (~3): verified (good), problem/bad, and a single "signed but cannot verify / not-good / unavailable" glyph; full per-state precision is shown in the commit details panel on hover/select.
- Q: How should the expanded signature state set (including "unavailable") be modeled? → A: A single flat `SignatureStatus` enum (`verified`, `bad`, `signed-not-trusted`, `signed-key-missing`, `signed-not-good`, `unavailable`, `unsigned`); drop the legacy `verificationUnavailable` boolean flag and fold it into the enum.
- Q: When `gpg.ssh.allowedSignersFile` is not configured, git's `%G?` returns `N` ("no signature") for SSH-signed commits — how do we avoid mislabeling them as "unsigned"? → A: Determine signature *presence* from the raw commit object (the `gpgsig` header), independent of the `%G?` verification verdict. Presence answers "is it signed?" (cheap, no crypto, configuration-independent); `%G?` answers "is it valid/trusted?" and only runs when verification can actually proceed. A commit that carries a signature but yields an `N`/error verdict is `unavailable` ("signed, not verified locally"), never `unsigned`. Only a commit with no signature in its object is `unsigned` (blank cell).
- Q: How should signature verification be computed for the column without degrading performance? (Investigation: `%G?` forces git to run real crypto verification per *signed* commit — measured ~14 ms → ~428 ms for 500 commits on a fast machine, i.e. ~10–20× more on a typical laptop; the data load is cheap, the per-commit verification is the cost.) → A: Keep the column, but verification MUST be: (1) excluded from the default history load (zero cost while the column is hidden), (2) computed asynchronously without blocking the graph render or UI thread, (3) cached per commit hash (signatures are immutable, so refresh only verifies new/unseen commits), and (4) viewport-first — currently-visible rows verified first, the remainder filled by a background pass. The details panel verifies only the single selected commit (~11 ms, always on).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The commit details panel MUST display the selected commit's
  signature/verification status, including the signer name, key id, key
  fingerprint, and signature format (SSH vs GPG) when a signature is present.
- **FR-002**: The system MUST verify signatures locally only, using git's own
  signature verification, and MUST NOT call the GitHub (or any other host) API
  for verification.
- **FR-003**: The system MUST distinguish, at minimum, the following commit
  signature states from one another: verified (good and trusted), bad signature,
  signed-but-not-trusted (key present but untrusted), signed-but-key-missing
  (cannot verify), signed-but-not-good (expired/expired-key/revoked), and
  unsigned.
- **FR-004**: The system MUST surface a state indicating verification is
  unavailable (e.g., the SSH allowed-signers file is not configured) separately
  from "unsigned," so a signed commit is never silently presented as unsigned.
  This `unavailable` state MUST be represented as a distinct value of the single
  flat `SignatureStatus` enum (not a separate boolean flag). Detecting this case
  requires determining signature presence independently of the `%G?` verdict
  (see FR-017), because git reports SSH-signed commits as `N` ("no signature")
  when no allowed-signers file is configured.
- **FR-005**: The history table MUST offer an optional, dedicated "Signature"
  column that shows a compact per-commit badge/glyph reflecting the commit's
  verification state. To stay scannable in a narrow column, the glyph set is
  grouped into three meanings: (a) verified, (b) problem/bad, and (c) a single
  "signed but cannot verify" glyph covering signed-not-trusted,
  signed-key-missing, signed-not-good, and unavailable. The full per-state
  precision (FR-003) is conveyed in the commit details panel, not the column.
- **FR-006**: The Signature column MUST be hidden by default and opt-in via the
  existing column visibility controls.
- **FR-007**: In the Signature column, unsigned commits MUST render a blank cell
  (no icon, no badge); only meaningful signature states render a glyph.
- **FR-008**: The Signature column MUST integrate with the existing
  resizable/draggable column system and persist its visibility, width, and order
  across sessions like other columns.
- **FR-009**: The system MUST provide help documentation, reachable from a help
  affordance near the signature display or column header, covering: (a) setting
  up the SSH allowed-signers file, (b) importing and trusting GitHub's GPG
  signing key, and (c) the meaning of each verification state.
- **FR-010**: The help documentation MUST explain that the extension verifies
  locally and that GitHub may show "Verified" for commits the local machine
  cannot verify until the user's local trust stores are configured.
- **FR-011**: The system MUST NOT create, manage, or generate signing keys for
  the user, and MUST NOT modify the user's git signing configuration on their
  behalf (documentation describes the commands; the extension does not run them).
- **FR-012**: All distinct signature states (FR-003) MUST be visually
  distinguishable in the details panel so the help text can guide the user to the
  correct fix. In the history column, the three grouped glyph categories (FR-005)
  MUST be distinguishable from one another and from a blank (unsigned) cell.
- **FR-013**: The default history load MUST NOT trigger any signature work —
  neither verification nor presence detection (i.e. neither the signature
  placeholders nor any per-commit signature lookup may be part of the default
  `git log` query). A user who keeps the Signature column hidden MUST incur zero
  signature cost. Rationale: `%G?` forces git to run cryptographic
  verification per signed commit, measured at ~14 ms → ~428 ms for 500 commits on
  a fast machine and proportionally worse (~10–20×) on a typical laptop.
- **FR-014**: When the Signature column is enabled, signature verification MUST
  run asynchronously and MUST NOT block the graph render or the UI thread; the
  commit graph appears immediately and signature glyphs populate progressively.
  While a commit known to be `signed` (by presence) is awaiting its async verdict,
  its cell MAY show a transient "verifying" spinner so it is not mistaken for an
  unsigned (blank) commit; the spinner resolves to a glyph once the verdict caches.
- **FR-015**: Signature verification results MUST be cached per commit hash for
  at least the session (signatures are immutable). On refresh, only new/unseen
  commits are verified; scrolling MUST resolve from cache (no per-scroll
  verification).
- **FR-016**: When the column is enabled, the currently-visible viewport MUST be
  verified first, with the remaining loaded commits filled by a background pass,
  so glyphs for on-screen rows appear before off-screen ones.
- **FR-017**: Signature *presence* ("is this commit signed?") MUST be determined
  independently of the `%G?` verification verdict, using the signature carried in
  the commit object as the source of truth. A commit whose object carries a
  signature MUST never be classified as `unsigned`, even when verification cannot
  produce a verdict (e.g. SSH allowed-signers not configured, key missing) — such
  a commit is `unavailable` ("signed, not verified locally"). Only a commit with
  no signature in its object renders as `unsigned` (blank cell, per FR-007).
  Presence detection MUST be cheap (no cryptographic work) and, like
  verification, MUST be excluded from the default history load (FR-013); the
  expensive cryptographic verdict MUST run only when verification can actually
  proceed.

### Key Entities *(include if feature involves data)*

- **Commit Signature Info**: The verification result for a single commit —
  overall `SignatureStatus`, signer name, key id, key fingerprint, and signature
  format (SSH or GPG). Verification-unavailable is expressed via the
  `SignatureStatus` value `unavailable`, not a separate flag.
- **Signature Status**: A single flat enum classifying a commit's verification
  outcome, with exactly these values: `verified`, `bad`, `signed-not-trusted`,
  `signed-key-missing`, `signed-not-good`, `unavailable`, `unsigned`.
- **Signature Format**: The cryptographic mechanism used (SSH or GPG), which also
  determines which local trust store governs verification.
- **Signature Presence**: Whether the commit object carries a signature at all,
  determined independently of verification and configuration. This is the source
  of truth for "signed vs unsigned"; the `SignatureStatus` verdict is layered on
  top and only refines a present signature into verified/bad/unavailable/etc.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any selected commit, a user can determine within 5 seconds
  whether it is verified, has a problem, or is unsigned, without leaving the
  editor.
- **SC-002**: 100% of commits that GitHub reports as "Verified" are shown as
  verified by the extension once the user has completed the documented local
  trust setup.
- **SC-003**: A user can distinguish "unsigned" from "signed but cannot verify"
  for any commit, with no state collapsing those two cases together.
- **SC-004**: With the Signature column enabled on a repository of at least 500
  commits, scrolling remains as responsive as with the column disabled (no
  perceptible degradation), because verification runs once per commit
  (asynchronously, cached by hash) and never during scroll. With the column
  hidden, history load time is identical to today (no verification performed).
- **SC-005**: From the signature display or column header, a user can reach setup
  documentation in a single action, and the documentation enables an
  unconfigured user to make GitHub-signed and their own SSH-signed commits verify
  locally.

## Assumptions

- Verification is delegated to the user's local git installation and its
  configured trust stores; the extension reflects, but does not alter, those
  results.
- Most commits in a typical repository are unsigned, so the history column is
  optimized to stay visually quiet (blank cells for unsigned commits) and ships
  hidden by default.
- An existing backend signature service already performs local verification via
  git's signature placeholders and can be extended to expose the additional
  distinct states this spec requires, including detecting signature presence
  independently of `%G?` (which under-reports SSH signatures when no
  allowed-signers file is configured).
- The help documentation is shipped with the extension and surfaced through the
  UI; its exact presentation (in-editor markdown, webview, or external link) is
  an implementation detail to be settled during planning.
- Supported signature mechanisms are those git itself verifies (SSH and GPG;
  X.509 where git supports it); no host-specific verification path is provided.
- GitHub's web/merge commits are signed with GitHub's published GPG key and are
  verified via the user's GPG keyring, separate from the user's own SSH signing
  key.

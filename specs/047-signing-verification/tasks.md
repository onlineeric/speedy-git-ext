---
description: "Task list for Signing Verification (047)"
---

# Tasks: Signing Verification

**Input**: Design documents from `/specs/047-signing-verification/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rpc-signature.md, quickstart.md

**Tests**: Vitest unit/contract tests ARE requested for this feature (plan.md Testing,
quickstart.md `pnpm test`, contracts "Contract test intent"). They are included below
for the backend service and the glyph-mapping util only.

**Organization**: Tasks are grouped by user story (P1 → P2 → P3) for independent
implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)
- Exact file paths are included in each description

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare a local environment that can exercise every signature state.

- [X] T001 [P] Run `pnpm install` and `pnpm generate-test-repo`, then create a scratch repo with a mix of commits per `specs/047-signing-verification/quickstart.md`: unsigned, GPG-signed, SSH-signed-with-`allowedSignersFile`, and SSH-signed-without-`allowedSignersFile` (the FR-017 case) — needed for manual validation in T028. (Validated against the live `speedy-git-ext` repo via an installed `.vsix`, which carries GPG GitHub-signed, SSH-signed, GPG `signed-key-missing`, and uncommitted/working-tree rows — a richer mix than the scratch plan.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Single source-of-truth type changes that both the backend service and the webview depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. This change intentionally breaks compilation in `GitSignatureService.ts` and `CommitDetailsPanel.tsx` until US1 updates them.

- [X] T002 In `shared/types.ts` replace the `SignatureStatus` type with the 7-state flat enum (`'verified' | 'bad' | 'signed-not-trusted' | 'signed-key-missing' | 'signed-not-good' | 'unavailable' | 'unsigned'`), add the `SignaturePresence` enum (`'signed' | 'not-signed'`), and update `CommitSignatureInfo` to drop the `verificationUnavailable?` boolean (its meaning is now `status === 'unavailable'`).

**Checkpoint**: Shared contracts updated — US1 and US2 can now proceed.

---

## Phase 3: User Story 1 - See verification status for the selected commit (Priority: P1) 🎯 MVP

**Goal**: The commit details panel shows the selected commit's full signature state (one of the 7 statuses) plus signer, key id, fingerprint, and format — and never mislabels a signed-but-unverifiable SSH commit as "unsigned" (FR-017).

**Independent Test**: Select signed/unsigned/bad/untrusted/key-missing commits and confirm each shows its distinct state in the details panel; select an SSH-signed commit with no `allowedSignersFile` and confirm it shows "signed, not verified locally" (`unavailable`), never "unsigned".

### Tests for User Story 1

- [X] T003 [P] [US1] Extend `src/__tests__/GitSignatureService.test.ts`: assert the 7-state `%G?` mapping (G→verified, B→bad, U→signed-not-trusted, E→signed-key-missing, X/Y/R→signed-not-good) and the FR-017 regression — a commit carrying a `gpgsig` header whose `%G?` is `N`/error maps to `unavailable`, while a commit with no signature header maps to `unsigned`.

### Implementation for User Story 1

- [X] T004 [US1] In `src/services/GitSignatureService.ts` rewrite `mapSignatureStatus` to the 7-state enum, add a private presence-detection helper that reads the raw commit object header (`git cat-file --batch`, scanning the header block before the first blank line for `gpgsig`/`gpgsig-sha256`, no crypto), and update `getSignatureInfo`/`parseSignatureOutput` so an `N`/error verdict resolves to `unavailable` when presence is `signed` and `unsigned` otherwise; remove the `verificationUnavailable` flag and the old `RAW_SIGNATURE_UNAVAILABLE_PATTERNS` path (depends on T002).
- [X] T005 [P] [US1] In `webview-ui/src/components/CommitDetailsPanel.tsx` update `getSignatureStatusConfig` and `CommitSignatureSection` to map all 7 `SignatureStatus` values to distinct labels/colors, remove the `verificationUnavailable` branch, render the `unavailable` state as "signed, not verified locally", and tolerate empty signer/keyId/fingerprint (depends on T002).

**Checkpoint**: Details panel fully reflects the 7-state model — MVP is functional and independently testable.

---

## Phase 4: User Story 2 - Scan signature status across the whole history (Priority: P2)

**Goal**: An opt-in, hidden-by-default "Signature" history column renders 3 grouped glyphs (verified / problem / cannot-verify) with blank cells for unsigned commits, populated asynchronously viewport-first and cached by hash, with zero signature cost while hidden (FR-013/014/015/016).

**Independent Test**: Enable the Signature column via the column-visibility controls; confirm signed commits render the correct grouped glyph, unsigned render blank, the column resizes/reorders/hides/persists like others, and (with it hidden) the default `git log` carries no signature placeholders.

### Tests for User Story 2

- [X] T006 [P] [US2] Create `webview-ui/src/utils/__tests__/signatureGlyph.test.ts` asserting the 7→3 grouping (verified→verified; bad→problem; signed-not-trusted/signed-key-missing/signed-not-good/unavailable→cannot-verify) and `unsigned`→`null` (blank cell). Authored test-first against the T010 API contract — write it before/alongside T010 and ensure it fails until T010 lands.
- [X] T007 [P] [US2] Extend `src/__tests__/GitSignatureService.test.ts` for the batch methods: `detectPresence` returns `signed` for a `gpgsig`-carrying commit even when `%G?`→`N`, `verifySignatures` returns the correct 7-state info per hash preserving input order, and an unsigned commit yields `not-signed` (never reaching `verifySignatures`) (depends on T002).

### Implementation for User Story 2

- [X] T008 [US2] In `shared/types.ts` add `'signature'` to `COMMIT_TABLE_COLUMN_IDS`, append it to `DEFAULT_COMMIT_TABLE_COLUMN_ORDER`, add `DEFAULT_COMMIT_TABLE_COLUMN_PREFERENCES.signature = { visible: false, preferredWidth: 40 }`, `COMMIT_TABLE_MIN_WIDTHS.signature = 32`, and the explicit `signature` key in `createDefaultCommitTableLayout`/`cloneCommitTableLayout` (depends on T002).
- [X] T009 [US2] In `shared/messages.ts` add `detectSignaturePresence`/`verifySignatures` request variants and `signaturePresence`/`signaturesVerified` response variants per `contracts/rpc-signature.md`, and register their `type` keys in the request/response allow-list maps (depends on T002).
- [X] T010 [P] [US2] Create `webview-ui/src/utils/signatureGlyph.ts`: a pure `SignatureStatus → { category, glyph, ariaLabel } | null` mapper — `verified`→`{ category: 'verified', glyph: 'verified' }` (green), `bad`→`{ category: 'problem', glyph: 'error' }` (red), the four cannot-verify states→`{ category: 'cannot-verify', glyph: 'unverified' }` (yellow), and `unsigned`→`null` (blank cell); use theme-aware colors mirroring the details panel (depends on T002).
- [X] T011 [US2] Add batch `detectPresence(hashes)` and `verifySignatures(hashes)` methods to `src/services/GitSignatureService.ts`, reusing the presence helper from T004 and the per-hash `%G?` parse, returning `Result<Record<string, …>>` with input order preserved (depends on T004, T009).
- [X] T012 [US2] Add `case 'detectSignaturePresence'` and `case 'verifySignatures'` dispatch to `src/WebviewProvider.ts`, calling the new service methods and posting `signaturePresence`/`signaturesVerified` (depends on T009, T011).
- [X] T013 [US2] Extend `webview-ui/src/stores/graphStore.ts`: add the `signaturePresence` map + setters, merge batch verdicts into `signatureCache` (and clear `signatureLoading`), and reset all three at every store/repo-switch reset point (depends on T002).
- [X] T014 [US2] Extend `webview-ui/src/rpc/rpcClient.ts` with `detectSignaturePresence(hashes)`/`verifySignatures(hashes)` senders and `signaturePresence`/`signaturesVerified` response handlers writing to the store (depends on T009, T013).
- [X] T015 [P] [US2] Create `webview-ui/src/components/SignatureColumnCell.tsx`: a memoized cell reading both `signaturePresence[hash]` and `signatureCache[hash]` by hash (O(1)). Render decision: presence `not-signed` → blank cell (terminal, FR-007); a cached `CommitSignatureInfo` → its grouped glyph via `signatureGlyph.ts`; presence `signed` but verdict not yet cached (`undefined`) → a transient "verifying" spinner so a signed commit awaiting async verification isn't mistaken for an unsigned one (FR-014); a resolved `null` verdict or still-unknown presence → render nothing while the async passes resolve (depends on T010, T013).
- [X] T016 [US2] Render the `'signature'` column in the `renderColumn` switch of `webview-ui/src/components/CommitTableRow.tsx` via `SignatureColumnCell` (depends on T008, T015).
- [X] T017 [US2] Add the `'signature'` entry to `COLUMN_LABELS` in `webview-ui/src/components/CommitTableHeader.tsx` (depends on T008).
- [X] T018 [US2] Update `webview-ui/src/utils/commitTableLayout.ts`: add the `signature` width default, give `computeAutoFitWidth` a fixed glyph width for `'signature'` (no text measurement), and confirm `sanitizeOrder` heals older persisted layouts by appending the new hidden column (depends on T008).
- [X] T019 [US2] Ensure the `'signature'` column appears (hidden by default) in the column-visibility toggles in `webview-ui/src/components/CommitListSettingsPopover.tsx` (depends on T008).
- [X] T020 [US2] Add a viewport-first signature loader (`webview-ui/src/hooks/useSignatureColumnLoader.ts`) wired into `webview-ui/src/components/GraphContainer.tsx`: when the `signature` column is visible, run a presence pass for hashes lacking a cached `signaturePresence` (results cached immediately — `not-signed` is terminal → blank cell, no verification), then `verifySignatures` for hashes whose presence is `signed` and whose verdict isn't yet in `signatureCache`, ordered visible-virtualizer-range-first then a background pass over the loaded-but-offscreen remainder; no-op (no RPC) when the column is hidden (FR-013/016) (depends on T014, T015).

**Checkpoint**: US1 and US2 both work; history column scannable, async, cached, zero-cost when hidden.

---

## Phase 5: User Story 3 - Learn how to set up local verification (Priority: P3)

**Goal**: A help affordance near the signature display and the column header opens bundled, offline setup documentation explaining SSH allowed-signers, GitHub GPG trust, each state's meaning, and the local-vs-GitHub caveat.

**Independent Test**: Activate the help affordance from the details panel and from the column header; confirm `docs/signing-verification.md` opens in one action and covers all required topics.

### Implementation for User Story 3

- [X] T021 [P] [US3] Create `docs/signing-verification.md` covering: SSH `gpg.ssh.allowedSignersFile` setup, importing+trusting GitHub's `web-flow` GPG key, the meaning of all 7 states + 3 column glyphs, and the note that GitHub may show "Verified" for commits the local machine cannot verify until trust stores are configured (FR-009/FR-010).
- [X] T022 [US3] Add an `openSignatureHelp` request type to `shared/messages.ts` (and register its `type` key in the request allow-list map alongside the other requests) plus a dispatch case in `src/WebviewProvider.ts` that opens the bundled `docs/signing-verification.md` via `vscode.commands.executeCommand('markdown.showPreview', uri)` (depends on T021).
- [X] T023 [P] [US3] Add a help affordance (info icon) near the signature display in `webview-ui/src/components/CommitDetailsPanel.tsx` that sends `openSignatureHelp` via `rpcClient` (depends on T022).
- [X] T024 [P] [US3] Add a help affordance near the `'signature'` column header in `webview-ui/src/components/CommitTableHeader.tsx` that sends `openSignatureHelp` (depends on T017, T022).
- [X] T025 [US3] Ensure `docs/signing-verification.md` ships in the packaged extension (verify `.vscodeignore`/`package.json` `files`) so the help opens offline (depends on T021).

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T026 [P] Update `CLAUDE.md` (Active Technologies / Recent Changes) and run `/update-changelog` for the 047 feature.
- [X] T027 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` — all green.
- [X] T028 Execute the `quickstart.md` performance validation: with the column hidden confirm the default `git log` output channel carries no signature placeholders (FR-013); with it enabled confirm glyphs populate progressively visible-first, scrolling stays smooth, and re-scrolling hits cache with no new git spawns (SC-004); and confirm via the output channel that verification uses only local git commands — no GitHub/host network call (FR-002). (Validated on the live repo: column hidden → loader is a no-op (`enabled:false`, no presence/verify RPCs), FR-013; enabled → presence then viewport-first verification, `needVerifyVisible` ahead of the offscreen pass (SC-004/FR-016); re-runs after caching issue zero new verify calls (FR-015); all work via local `git cat-file`/`git log` only, no host call (FR-002). Fixed during validation: synthetic uncommitted/stash rows are no longer sent for verification, and cached results now survive a refresh.)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2 / T002)**: Depends on Setup; BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on T002. Delivers the MVP.
- **US2 (Phase 4)**: Depends on T002; backend T011 reuses the presence helper from T004 (US1). Otherwise independently testable.
- **US3 (Phase 5)**: Depends on T002; column-header affordance (T024) depends on T017 (US2). Details-panel affordance (T023) needs only US1's panel.
- **Polish (Phase 6)**: After all desired stories complete.

### Within User Story 2

- Types/messages (T008, T009) → backend (T011, T012) and util (T010) → store/rpc (T013, T014) → cell/column wiring (T015–T019) → scheduling (T020).

### Parallel Opportunities

- US1: T003 (test) and T005 (panel) run in parallel after T002; T004 is the service core the test targets.
- US2: T006, T007 (tests) and T010 (glyph util) are parallel; T015 (cell) parallel once T010/T013 done.
- US3: T021 (doc), then T023 + T024 affordances in parallel after T022.
- Across stories: once T002 lands, a developer can take US1 while another starts US2 types/util.

---

## Parallel Example: User Story 1

```bash
# After T002 (foundational) and T004 (service core):
Task: "T003 Extend GitSignatureService.test.ts for 7-state + FR-017 mapping"
Task: "T005 Map 7 states in CommitDetailsPanel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational (T002).
2. Phase 3 US1 (T003–T005): details panel shows all 7 states, FR-017 guarded.
3. **STOP and VALIDATE** the details panel independently, then demo.

### Incremental Delivery

1. Setup + Foundational → ready.
2. US1 → details-panel verification (MVP).
3. US2 → opt-in scannable history column (async, cached, zero-cost when hidden).
4. US3 → help documentation + affordances.

---

## Notes

- [P] = different files, no dependency on an incomplete task.
- Backend git I/O stays in `GitSignatureService` via `GitExecutor`, returning `Result<T, GitError>` (Constitution III/V).
- Presence (cheap, config-independent) is the source of truth for signed-vs-unsigned; `%G?` only refines a present signature (FR-017).
- Per project rules: do not auto-install packages, do not commit/merge — only the speckit workflow may create branches/PRs when asked.

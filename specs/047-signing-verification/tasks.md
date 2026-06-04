---
description: "Task list for Signing Verification implementation"
---

# Tasks: Signing Verification

**Input**: Design documents from `/specs/047-signing-verification/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rpc-signature.md, quickstart.md

**Tests**: Included for backend service logic and pure webview utils only (the
codebase already unit-tests `GitSignatureService` and pure utils via Vitest).
UI/manual acceptance is covered by quickstart.md, not automated tests.

**Organization**: Tasks grouped by user story (P1 → P3) for independent, incremental delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (details panel), US2 (history column), US3 (help docs)
- File paths are exact and relative to repo root.

## Path Conventions

Dual-process VS Code extension: backend `src/`, webview `webview-ui/src/`, shared
contracts `shared/`. Tests in `src/__tests__/` and `webview-ui/src/**/__tests__` (Vitest).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm baseline and prepare manual-verification fixtures. Most infra
(`GitSignatureService`, column layout system, signature cache, RPC plumbing) already exists.

- [ ] T001 Confirm baseline green: run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Record current default `git log` args (no signature placeholders) from the git output channel as the FR-013 baseline.
- [ ] T002 [P] Prepare a scratch repo with mixed commits per quickstart.md (SSH-signed verified, SSH-signed with NO `allowedSignersFile`, GPG good/untrusted/key-missing, bad/tampered, unsigned) for manual acceptance of US1/US2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type/enum migration + presence-aware verification in the backend service.
Both user stories that read signatures (US1, US2) depend on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. Note: T003
removes `verificationUnavailable`, which intentionally breaks `CommitDetailsPanel` until
US1 (T007) updates it — the shared + backend layers typecheck after this phase; the full
webview build goes green after US1.

- [ ] T003 Replace `SignatureStatus` with the 7-state flat enum (`verified`, `bad`, `signed-not-trusted`, `signed-key-missing`, `signed-not-good`, `unavailable`, `unsigned`), update `CommitSignatureInfo` (remove `verificationUnavailable`), and add `export type SignaturePresence = 'signed' | 'not-signed'` in `shared/types.ts` (per data-model.md).
- [ ] T004 In `src/services/GitSignatureService.ts`, add a private presence helper that detects a `gpgsig`/`gpgsig-sha256` header via `git cat-file --batch` (scan header block only, stop at first blank line; no crypto) for one or many hashes, returning `SignaturePresence` (research R1).
- [ ] T005 In `src/services/GitSignatureService.ts`, refactor `mapSignatureStatus` to the 7-state enum (G→verified, B→bad, U→signed-not-trusted, E→signed-key-missing, X/Y/R→signed-not-good) and make `getSignatureInfo` presence-aware: when `%G?` yields N/error, return `status: 'unavailable'` if the object carries a signature (T004) else `null` (unsigned). Remove the `verificationUnavailable` flag and `isVerificationUnavailable` (per research R2, FR-017).
- [ ] T006 [P] Update `src/__tests__/GitSignatureService.test.ts`: assert each `%G?` code maps to its 7-state value, and assert a signature-present-but-`N`-verdict commit yields `unavailable` (not `null`/unsigned) — the SSH-no-allowed-signers regression guard (FR-017).

**Checkpoint**: `shared/` + backend typecheck and `pnpm test` pass; service emits the 7-state, presence-aware result.

---

## Phase 3: User Story 1 - See verification status for the selected commit (Priority: P1) 🎯 MVP

**Goal**: The commit details panel shows the selected commit's signature state (all 7
distinguished), signer, key id, fingerprint, and SSH/GPG format — and never shows a
locally-unverifiable signed commit as "unsigned".

**Independent Test**: Select signed (verified / not-trusted / key-missing / not-good),
bad, unsigned, and SSH-no-allowed-signers commits; confirm the panel renders the correct
distinct state for each (quickstart US1 AS1–AS6). Uses the existing
`getSignatureInfo`/`signatureInfo` RPC and per-hash cache (no batch needed).

### Implementation for User Story 1

- [ ] T007 [US1] In `webview-ui/src/components/CommitDetailsPanel.tsx`, rewrite `getSignatureStatusConfig` to map all 7 `SignatureStatus` values to distinct labels + theme colors (verified=green, bad=red, the four "cannot verify" states each with their own label, unsigned), and remove the `verificationUnavailable` branch (restores webview compile).
- [ ] T008 [US1] In `CommitSignatureSection` (`CommitDetailsPanel.tsx`), render signer, key id, fingerprint, and format for present signatures; show the `unsigned` case as a clear "no signature" line; tolerate empty signer/keyId/fingerprint for `unavailable`/`signed-key-missing` (FR-001, FR-012, SC-003).

**Checkpoint**: Full `pnpm build` green; details panel independently delivers MVP — every signature state is visible and distinguishable for the selected commit.

---

## Phase 4: User Story 2 - Scan signature status across the whole history (Priority: P2)

**Goal**: An opt-in, hidden-by-default "Signature" column shows a grouped glyph (verified
/ problem / cannot-verify) per commit, blank for unsigned, populated asynchronously
viewport-first and cached by hash — with zero cost when hidden.

**Independent Test**: Enable the column; confirm grouped glyphs render correctly, unsigned
cells are blank, the column resizes/reorders/hides and persists, the graph appears
immediately with glyphs filling in visible-rows-first, and scrolling stays smooth with no
re-verification (quickstart US2 + performance section, FR-005–008/013–017, SC-004).

### Contracts & shared types

- [ ] T009 [US2] In `shared/types.ts`, add `'signature'` to `COMMIT_TABLE_COLUMN_IDS`, `DEFAULT_COMMIT_TABLE_COLUMN_ORDER`, `DEFAULT_COMMIT_TABLE_COLUMN_PREFERENCES` (`{ visible: false, preferredWidth: 40 }`), `COMMIT_TABLE_MIN_WIDTHS` (`32`), and the explicit `signature` key in `createDefaultCommitTableLayout`/`cloneCommitTableLayout` (data-model.md, research R7).
- [ ] T010 [US2] In `shared/messages.ts`, add request types `detectSignaturePresence`/`verifySignatures` and response types `signaturePresence`/`signaturesVerified` to the unions, and register their `type` keys in the request/response allow-list maps (contracts/rpc-signature.md).

### Backend

- [ ] T011 [US2] In `src/services/GitSignatureService.ts`, add `detectPresence(hashes: string[]): Promise<Result<Record<string, SignaturePresence>>>` (batched `git cat-file --batch`, reusing the T004 helper) and `verifySignatures(hashes: string[]): Promise<Result<Record<string, CommitSignatureInfo | null>>>` (per-hash `%G?` verdict, input order preserved).
- [ ] T012 [US2] In `src/WebviewProvider.ts`, add `case 'detectSignaturePresence'` and `case 'verifySignatures'` dispatch that call the service methods and post `signaturePresence` / `signaturesVerified` responses (mirror the existing `getSignatureInfo` case at ~line 1604).

### Webview state & RPC

- [ ] T013 [US2] In `webview-ui/src/stores/graphStore.ts`, add `signaturePresence: Record<string, SignaturePresence>` with setters, merge `signaturesVerified` results into `signatureCache` (clearing `signatureLoading`), and reset the presence map at the existing signature-cache reset points (repo switch / hard refresh).
- [ ] T014 [US2] In `webview-ui/src/rpc/rpcClient.ts`, add `detectSignaturePresence(hashes)` / `verifySignatures(hashes)` senders and handle `signaturePresence` / `signaturesVerified` responses → store.

### Glyph rendering

- [ ] T015 [P] [US2] Create `webview-ui/src/utils/signatureGlyph.ts`: pure `SignatureStatus → { category: 'verified'|'problem'|'cannot-verify'; glyph; ariaLabel } | null` (null for `unsigned`), grouping the four cannot-verify states into one (research R3, data-model grouping table).
- [ ] T016 [P] [US2] Create `webview-ui/src/utils/__tests__/signatureGlyph.test.ts`: assert the 3-way grouping and `null` for `unsigned`.
- [ ] T017 [US2] Create `webview-ui/src/components/SignatureColumnCell.tsx`: memoized cell that reads `signatureCache[hash]` (O(1)) and renders the grouped glyph via `signatureGlyph.ts`, blank when unsigned/unknown (FR-007).
- [ ] T018 [US2] In `webview-ui/src/components/CommitTableRow.tsx`, add the `case 'signature'` branch in `renderCell` (~line 232) rendering `SignatureColumnCell`.
- [ ] T019 [P] [US2] In `webview-ui/src/components/CommitTableHeader.tsx`, add the `'signature'` column header label so it appears in the column-visibility/reorder controls.
- [ ] T020 [P] [US2] In `webview-ui/src/utils/commitTableLayout.ts`, add a `case 'signature'` in `computeAutoFitWidth` returning a fixed glyph width (no text measurement).

### Async viewport-first scheduling

- [ ] T021 [US2] Add viewport-first scheduling (a hook/effect in `GraphContainer.tsx` or a dedicated `useSignatureColumn` hook) that, ONLY when the `signature` column is visible: (1) batches `detectSignaturePresence` for loaded commits lacking cached presence; (2) caches `not-signed` as blank; (3) batches `verifySignatures` for `signed`+uncached hashes ordered visible-rows-first (from the virtualizer `getVirtualItems()` range) then the background remainder; (4) never fires on scroll for already-cached hashes (FR-014–016, SC-004). When hidden, do nothing (FR-013).

**Checkpoint**: Column enabled shows correct grouped glyphs, blank for unsigned, persists across sessions, populates async viewport-first; column hidden = identical load to today. US1 still works.

---

## Phase 5: User Story 3 - Learn how to set up local verification (Priority: P3)

**Goal**: A help affordance near the signature display and column header opens setup
documentation covering SSH allowed-signers, GitHub GPG trust, and state meanings.

**Independent Test**: Activate the help affordance from the details panel and the column
header; confirm the doc opens in one action and covers all three sections + the
local-vs-GitHub caveat (quickstart US3 AS1–AS3, FR-009/FR-010, SC-005).

### Implementation for User Story 3

- [ ] T022 [P] [US3] Author `docs/signing-verification.md`: Section 1 SSH `allowedSignersFile` setup, Section 2 importing+trusting GitHub `web-flow` GPG key, Section 3 meaning of each of the 7 states + the "GitHub may show Verified before local trust is configured" caveat (idea doc Help section, FR-009/FR-010).
- [ ] T023 [US3] Add a host action to open the bundled doc (e.g. a `'openSignatureHelp'` RPC in `shared/messages.ts` + `WebviewProvider` case using VS Code markdown preview / `vscode.open` on the bundled file, or reuse `openExternal` with a docs URL fallback).
- [ ] T024 [US3] Add a help/info affordance (icon button) in `CommitDetailsPanel.tsx` (near the signature section) and in `CommitTableHeader.tsx` (near the `signature` header) that triggers T023's open action (FR-009, SC-005).

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T025 Verify persisted-layout migration: an older persisted `CommitTableLayout` (without `signature`) heals to include the hidden `signature` column via `sanitizeOrder`/clone seeding (research R7) — manual reload test + confirm no crash.
- [ ] T026 Run the quickstart.md **performance validation**: column hidden = identical history-load (no `%G?`/presence in default `git log`); column enabled = immediate graph, viewport-first glyphs, no verification on scroll (FR-013, SC-004).
- [ ] T027 [P] Update `CHANGELOG.md` for this feature (via `/update-changelog`).
- [ ] T028 Final gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green; manual smoke test via "Run Extension" across US1–US3 acceptance scenarios.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories (shared enum + presence-aware service).
- **US1 (Phase 3)**: Depends on Foundational. Restores webview compile; MVP.
- **US2 (Phase 4)**: Depends on Foundational. Independent of US1 (different files); can run in parallel with US1 after Phase 2.
- **US3 (Phase 5)**: Depends on Foundational. Help affordance in the column header (T024) is cleanest after US2's header (T019) exists, but the details-panel affordance and the doc are independent.
- **Polish (Phase 6)**: After the desired stories are complete.

### User Story Dependencies

- **US1 (P1)**: Foundational only. No dependency on US2/US3.
- **US2 (P2)**: Foundational only. Shares the service + cache with US1 but touches different files; independently testable.
- **US3 (P3)**: Foundational. Soft ordering after US2 for the column-header affordance; otherwise independent.

### Within Each Story

- Shared types/messages before backend before webview state before UI.
- US2: glyph util (T015) before the cell (T017); cell/header/layout before scheduling (T021).

### Parallel Opportunities

- T002 ∥ T001 (setup).
- T006 (backend test) ∥ remaining foundational once T003–T005 land.
- After Phase 2: **US1 and US2 can proceed in parallel** (different files).
- Within US2: T015/T016 (glyph util + test), T019 (header), T020 (auto-fit) are [P].
- T022 (doc authoring) is [P] and can start any time after planning.

---

## Parallel Example: User Story 2

```bash
# After T009–T014 land, these touch independent files:
Task: "Create signatureGlyph.ts util (T015)"
Task: "Create signatureGlyph.test.ts (T016)"
Task: "Add 'signature' header label in CommitTableHeader.tsx (T019)"
Task: "Add 'signature' auto-fit case in commitTableLayout.ts (T020)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → 4. **STOP & VALIDATE**:
   every signature state visible/distinguishable in the details panel, including the
   SSH-no-allowed-signers `unavailable` case (FR-017). Demo-ready MVP.

### Incremental Delivery

1. Foundational → service emits 7-state, presence-aware results.
2. US1 → details panel (MVP) → validate → demo.
3. US2 → opt-in history column, async/cached/viewport-first → validate perf → demo.
4. US3 → help docs + affordances → validate → demo.

### Performance guardrails (Constitution I — verify continuously)

- Column hidden ⇒ zero signature work in the default load (T026, FR-013).
- Verification async, viewport-first, cached-by-hash; never on scroll (T021, FR-014–016, SC-004).
- Presence detection is crypto-free header reads (T004/T011, research R1).

---

## Notes

- [P] = different files, no incomplete dependencies.
- T003 deliberately breaks the webview build until T007; the shared+backend layers stay green at the Phase 2 checkpoint.
- Per project rules: no auto-commit, no package installs (none required here).
- Commit after each logical group; stop at any checkpoint to validate a story independently.

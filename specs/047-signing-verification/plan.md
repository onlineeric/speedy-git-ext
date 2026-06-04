# Implementation Plan: Signing Verification

**Branch**: `047-signing-verification` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/047-signing-verification/spec.md`

## Summary

Surface each commit's cryptographic signature/verification status in two places:
(1) the commit details panel — full per-state precision (signer, key id, fingerprint,
SSH vs GPG format), and (2) an optional, hidden-by-default "Signature" history-table
column rendering three grouped glyphs (verified / problem / "signed but cannot verify"),
blank for unsigned. Verification is **local-only** via git's own `%G?` machinery; no
host API is ever called. Help documentation explains local trust setup.

The dominant engineering constraint is **performance-first** (Constitution I): `%G?`
forces real per-commit crypto (~14 ms → ~428 ms for 500 commits on a fast machine,
~10–20× worse on a typical laptop). The design therefore: keeps **all** signature work
(verification *and* presence detection) out of the default history load (zero cost while
the column is hidden), runs verification **asynchronously** off the UI thread,
**viewport-first**, and **caches per immutable commit hash**. Critically, signature
**presence** ("is it signed?") is derived from the raw commit object (`gpgsig` header),
*independently* of the `%G?` verdict — so an SSH-signed commit on a machine with no
`allowedSignersFile` reads as `unavailable` ("signed, not verified locally"), never
`unsigned`.

A secondary refactor folds the legacy `verificationUnavailable` boolean into a single
flat `SignatureStatus` enum with seven values.

## Technical Context

**Language/Version**: TypeScript 5.x (strict; `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**: VS Code Extension API 1.80+ (host); React 18 + Zustand + Radix UI + Tailwind + `@tanstack/react-virtual` (webview)
**Storage**: Per-commit-hash signature cache in the Zustand store (transient, session-only). Column visibility/width/order persists via existing per-repo `CommitTableLayout` (VS Code `globalState`). No new persisted store.
**Testing**: Vitest — backend service parsing/presence-detection unit tests; frontend status-grouping/glyph-mapping unit tests
**Target Platform**: VS Code extension (extension host Node 18 + sandboxed webview), cross-OS (Windows/macOS/Linux)
**Project Type**: Dual-process VS Code extension (backend `src/` + webview `webview-ui/src/`, shared contracts `shared/`)
**Performance Goals**: History load with column hidden identical to today (zero signature work). Scrolling with column enabled stays as responsive as disabled (SC-004): verification runs once per hash, async, cached, never during scroll. Details panel verifies only the single selected commit (~11 ms).
**Constraints**: Local-only verification (no host API, FR-002). Default `git log` MUST NOT carry signature placeholders or any per-commit signature lookup (FR-013). UI thread never blocked (FR-014). Graph topology stays in webview (Constitution I/V). All git ops return `Result<T, GitError>` with the 30 s `GitExecutor` timeout.
**Scale/Scope**: Repos of 500+ commits (default batch). Glyph column must scan thousands of rows without scroll degradation.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Performance First (NON-NEGOTIABLE)** | ✅ Core driver. Signature work excluded from default load (FR-013); async, viewport-first, cached-by-hash verification (FR-014–016); presence detection cheap and also lazy (FR-017). Glyph state pre-grouped to 3 categories for O(1) cell render. No new git work on scroll. |
| **II. Clean Code & Simplicity** | ✅ Folds `verificationUnavailable` boolean into one flat enum (removes a dual source of truth). New backend logic isolated in the existing `GitSignatureService`; new frontend state in a focused store slice + small util for status→glyph grouping. YAGNI: no X.509-specific UI beyond what git already reports. |
| **III. Type Safety & Explicit Error Handling** | ✅ Expanded `SignatureStatus` enum + `CommitSignatureInfo` updated in `shared/types.ts` (single source of truth) before use. New batch RPC added to the `RequestMessage`/`ResponseMessage` unions in `shared/messages.ts`. Service returns `Result<T, GitError>`. |
| **IV. Library-First & Purpose-Built Tools** | ✅ No new package. Signature data comes from git itself (placeholders + raw object headers); no regex parsing of structured external formats. Null-byte-delimited git output parsed by index, consistent with existing services. |
| **V. Dual-Process Architecture Integrity** | ✅ All git I/O stays in `GitSignatureService` (backend) via `GitExecutor`; webview only renders + schedules async requests via message passing. Viewport-first scheduling uses the existing virtualizer range in the webview; no git spawning in webview. |

**Result**: PASS — no violations. Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/047-signing-verification/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Feature spec (already present)
├── 047-signing-verification-idea.md  # Origin idea input
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/           # Phase 1 output (this command)
│   └── rpc-signature.md  # RPC message contracts for signature verification
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
shared/
├── types.ts                       # SignatureStatus enum (7 values), CommitSignatureInfo
│                                   #   (+ presence/format), SignaturePresence; add
│                                   #   'signature' to COMMIT_TABLE_COLUMN_IDS + defaults/min-widths
└── messages.ts                    # Add batch verify request + presence/verify response variants

src/                               # Backend (extension host)
├── services/
│   └── GitSignatureService.ts     # Expand %G? → 7-state enum; add cheap presence detection
│                                   #   (raw gpgsig header, no crypto); add batch verify method
├── WebviewProvider.ts             # Dispatch new batch-verify + presence RPC cases
└── __tests__/
    └── GitSignatureService.test.ts # Extend: 7-state mapping, presence vs verdict, SSH-no-signers case

webview-ui/src/
├── stores/
│   └── graphStore.ts              # signatureCache keyed by hash (already present, retype);
│                                   #   add presence map + viewport-first request scheduling state
├── rpc/rpcClient.ts               # Batch verify + presence request senders; response handlers
├── components/
│   ├── CommitDetailsPanel.tsx     # Map 7 states → labels/colors; remove verificationUnavailable branch
│   ├── CommitTableHeader.tsx      # 'signature' column header + help affordance (FR-009)
│   ├── CommitTableRow.tsx         # 'signature' cell → grouped glyph (blank for unsigned)
│   └── SignatureColumnCell.tsx    # NEW: memoized glyph cell, reads cache by hash (O(1))
├── utils/
│   ├── commitTableLayout.ts       # Auto-fit + min-width handling for 'signature' column
│   └── signatureGlyph.ts          # NEW: SignatureStatus → grouped glyph/category + a11y label
└── hooks/useSignatureColumnLoader.ts # NEW (P2): viewport-first presence+verify scheduling
                                   #   (research R6 superseded the earlier SignatureHelp.* React
                                   #    component idea: help is an in-editor markdown doc opened via
                                   #    an 'openSignatureHelp' RPC, not a webview component)

docs/ (or media/)
└── signing-verification.md        # NEW: SSH allowed-signers + GitHub GPG trust setup + state meanings
```

**Structure Decision**: Dual-process VS Code extension (Constitution V). This feature
**extends existing infrastructure** rather than adding new architecture: the backend
`GitSignatureService` already exists and is wired through `ExtensionController` →
`WebviewProvider` → `rpcClient` → `graphStore` → `CommitDetailsPanel`. The column reuses
the established resizable/draggable `CommitTableLayout` system. New files are limited to a
glyph-mapping util, a memoized signature cell, and help-doc assets. Help-doc presentation
(in-editor markdown vs webview vs external link) is resolved in research.md.

## Complexity Tracking

> No constitutional violations — section intentionally empty.

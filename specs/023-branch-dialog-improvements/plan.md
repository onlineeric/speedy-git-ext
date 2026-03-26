# Implementation Plan: Branch Checkout & Delete Dialog Improvements

**Branch**: `023-branch-dialog-improvements` | **Date**: 2026-03-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/023-branch-dialog-improvements/spec.md`

## Summary

Improve branch checkout and delete dialog behaviors: (1) verify that the checkout-with-pull dialog correctly appears for local branches with diverged remote counterparts and for remote branches with existing local counterparts, (2) add an "Also delete remote branch" checkbox to the delete branch confirmation dialog with dynamic command preview updates.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: React 18, Zustand, Radix UI (`@radix-ui/react-dialog`, `@radix-ui/react-alert-dialog`), Tailwind CSS
**Storage**: N/A (in-memory state only)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code Extension (1.80+)
**Project Type**: VS Code extension with React webview
**Performance Goals**: Dialogs must open instantly; no additional git calls for dialog rendering
**Constraints**: All dialog state computed from existing in-memory branch data; no new backend calls for state detection
**Scale/Scope**: 3 dialog improvements, ~8 files touched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | No new git calls; dialog state derived from existing in-memory branch data. Checkbox toggle is pure UI state. |
| II. Clean Code & Simplicity | PASS | New `DeleteBranchDialog` follows existing pattern (CheckoutWithPullDialog, MergeDialog). No over-abstraction. |
| III. Type Safety & Explicit Error Handling | PASS | Message types updated in `shared/messages.ts`. Result monad used for all git operations. Type guards maintained. |
| IV. Library-First & Purpose-Built Tools | PASS | Uses existing Radix UI dialog primitives. No new packages needed. |
| V. Dual-Process Architecture Integrity | PASS | Frontend handles dialog UI and state. Backend handles git commands. Communication via message passing. Shared types in `shared/`. |

**Agent Restrictions**: No packages to install. No git mutations by agent.

## Project Structure

### Documentation (this feature)

```text
specs/023-branch-dialog-improvements/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
shared/
├── messages.ts          # Extend deleteBranch payload with deleteRemote option
└── types.ts             # No changes needed (Branch type sufficient)

src/
└── WebviewProvider.ts   # Handle deleteRemote in deleteBranch handler

webview-ui/src/
├── components/
│   ├── BranchContextMenu.tsx    # Wire up new DeleteBranchDialog, verify checkout logic
│   ├── DeleteBranchDialog.tsx   # NEW: Delete dialog with remote-delete checkbox
│   └── CheckoutWithPullDialog.tsx  # No changes expected
├── rpc/
│   └── rpcClient.ts             # Update deleteBranch method signature
├── stores/
│   └── graphStore.ts            # Extend pendingForceDeleteBranch to include deleteRemote state
└── utils/
    └── gitCommandBuilder.ts     # Add combined delete command builder
```

**Structure Decision**: Follows existing dual-process architecture. New `DeleteBranchDialog` component mirrors the pattern of `CheckoutWithPullDialog` and `MergeDialog` — each complex operation gets its own dialog component.

## Design Decisions

### D1: Checkout Issues Verification (Stories 1 & 2)

**Finding**: The existing `getBranchCheckoutState()` function in `BranchContextMenu.tsx` already correctly handles both scenarios:
- For local branches: checks `branches.some((b) => b.remote && b.name === refInfo.name)` → returns 'dual' if remote counterpart exists
- For remote branches: checks `branches.some((b) => !b.remote && b.name === localName)` → returns 'dual' if local counterpart exists

The `Branch` type stores `{ name, remote?, current, hash }` where remote branches like `origin/feature-x` are stored as `{ name: 'feature-x', remote: 'origin' }`. The name-matching logic in `getBranchCheckoutState` correctly identifies dual branches regardless of commit positions.

**Decision**: Verify during implementation with a smoke test. If the logic works as analyzed, no code changes are needed for Stories 1 & 2. The spec's FR-001 through FR-004 are already satisfied by existing code.

### D2: New DeleteBranchDialog Component (Story 3)

**Decision**: Create a new `DeleteBranchDialog` component rather than extending `ConfirmDialog`.

**Rationale**:
- `ConfirmDialog` is a simple confirm/cancel dialog with no custom form elements
- Adding checkbox support to `ConfirmDialog` would violate single responsibility
- Existing pattern: each complex operation has its own dialog (`CheckoutWithPullDialog`, `MergeDialog`, `PushDialog`, `RebaseConfirmDialog`)
- `DeleteBranchDialog` needs internal state for the checkbox and dynamic command preview

### D3: Message Extension for Remote Delete

**Decision**: Extend the existing `deleteBranch` message payload to include `deleteRemote?: { remote: string; name: string }` rather than sending two separate messages.

**Rationale**:
- The RPC client is fire-and-forget (no promise-based orchestration)
- Backend can atomically handle both operations and report partial failures
- Avoids complex frontend orchestration for sequential message responses
- Single message = single response flow, easier error handling

### D4: Force Delete with Remote State Propagation

**Decision**: Extend `pendingForceDeleteBranch` in the Zustand store from `string | null` to `{ name: string; deleteRemote?: { remote: string; name: string } } | null`. Extend the `deleteBranchNeedsForce` response message to include `deleteRemote` info.

**Rationale**: When local delete fails with "not fully merged", the force-delete dialog needs to preserve the user's remote-delete checkbox state. The backend must echo back the `deleteRemote` option so the frontend can pre-populate the checkbox in the force-delete dialog.

### D5: Remote Identification for Delete Checkbox

**Decision**: When showing the "Also delete remote branch" checkbox, identify the remote counterpart by finding the first matching remote branch in the branches array: `branches.find(b => b.remote && b.name === refInfo.name)`.

**Rationale**: Most repos have a single remote (`origin`). For multi-remote repos, this picks the first match, which is deterministic based on git's branch ordering. The checkbox label will show the specific remote name (e.g., "Also delete origin/feature-z").

## Complexity Tracking

> No constitution violations. No complexity justifications needed.

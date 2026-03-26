# Research: Branch Checkout & Delete Dialog Improvements

## R1: Checkout Pull Dialog for Diverged Branches (Stories 1 & 2)

**Decision**: Existing `getBranchCheckoutState()` logic already handles both scenarios correctly.

**Rationale**: The function in `BranchContextMenu.tsx` (lines 34-47) matches branches by name:
- Local branch checkout: `branches.some((b) => b.remote && b.name === refInfo.name)` → returns 'dual' if remote counterpart exists
- Remote branch checkout: `branches.some((b) => !b.remote && b.name === localName)` → returns 'dual' if local counterpart exists

The `Branch` type uses `{ name: 'feature-x', remote: 'origin' }` for remote branches, so name-matching correctly pairs local/remote counterparts regardless of which commit they point to. When 'dual' is detected, `handleCheckout()` opens `CheckoutWithPullDialog`.

**Alternatives considered**:
- Adding commit hash comparison to only show dialog when commits diverge → Rejected because showing the dialog even when on the same commit is harmless and consistent (user may want to pull new changes that arrived since last fetch)
- Adding a new "diverged" state to `BranchCheckoutState` → Rejected as unnecessary complexity; 'dual' is sufficient

**Action**: Verify with smoke test during implementation. If confirmed working, no code changes needed.

## R2: ConfirmDialog Extension vs New Component for Delete Dialog

**Decision**: Create a new `DeleteBranchDialog` component.

**Rationale**: The existing codebase follows a consistent pattern where each complex git operation gets its own dialog component:
- `CheckoutWithPullDialog` — checkout with pull option
- `MergeDialog` — merge with strategy options
- `PushDialog` — push with remote/force options
- `RebaseConfirmDialog` — rebase with date handling option

The simple `ConfirmDialog` is used for straightforward yes/no confirmations. Adding checkbox support would break its simplicity.

**Alternatives considered**:
- Extending `ConfirmDialog` with a `children` prop → Rejected because it mixes concerns and makes the simple dialog component harder to reason about
- Using a render prop pattern → Over-engineered for a single use case
- Inline checkbox in `BranchContextMenu` → Violates component separation pattern

## R3: Backend Orchestration vs Frontend Orchestration for Delete + Remote Delete

**Decision**: Backend orchestrates both deletions via a single extended `deleteBranch` message.

**Rationale**: The RPC client uses fire-and-forget messaging without promise chains. Frontend orchestration would require:
1. Sending `deleteBranch`, waiting for success response
2. Then sending `deleteRemoteBranch`
3. Handling interleaved responses from the message handler

This is complex and error-prone. Instead, extending the `deleteBranch` message payload to include `deleteRemote` info lets the backend handle both operations sequentially and report results clearly.

**Alternatives considered**:
- Frontend orchestration with two sequential messages → Rejected due to RPC client's fire-and-forget pattern making sequential coordination complex
- New combined message type `deleteBranchWithRemote` → Rejected as unnecessary; extending existing payload is simpler and backward-compatible

## R4: Force Delete State Propagation

**Decision**: Extend `pendingForceDeleteBranch` in the store and `deleteBranchNeedsForce` response to carry `deleteRemote` info.

**Rationale**: When local delete fails with "not fully merged", the user's remote-delete checkbox selection must survive the round-trip to the force-delete dialog. The backend echoes back the `deleteRemote` option in the `deleteBranchNeedsForce` response so the frontend can restore checkbox state.

**Alternatives considered**:
- Store checkbox state only in frontend component state → Doesn't survive the dialog transition since the initial delete dialog closes before force-delete dialog opens
- Always uncheck in force-delete dialog → Poor UX, user must re-check the option

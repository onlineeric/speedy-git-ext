# Phase 1 — Data Model

**Feature**: Revert Commit dialog with mode selection
**Branch**: `045-revert-mode-dialog`
**Date**: 2026-05-22

This feature introduces one new union type, one new options interface, one new error code, and a re-shaped RPC payload. No new entities are persisted to disk. One Zustand store slice is added (session-transient).

## 1. New shared types — `shared/types.ts`

```ts
/** Mode for the Revert Commit dialog. */
export type RevertMode = 'commit' | 'no-commit' | 'edit-message';

/** Options collected from the RevertDialog and forwarded to the backend. */
export interface RevertOptions {
  mode: RevertMode;
  /** Required when the target commit has >1 parent (i.e. is a merge commit). 1-indexed. */
  mainlineParent?: number;
  /** Required ONLY when mode === 'edit-message'. Non-empty after trim. */
  message?: string;
}
```

**Field validation** (enforced webview-side at dialog confirm; backend revalidates):

| Field            | Type             | Required                                       | Rule                                                            |
|------------------|------------------|------------------------------------------------|-----------------------------------------------------------------|
| `mode`           | `RevertMode`     | yes                                            | One of the three literal values.                                |
| `mainlineParent` | `number`         | yes IFF target commit's parents count > 1      | Integer ≥ 1 and ≤ parents count.                                |
| `message`        | `string`         | yes IFF `mode === 'edit-message'`              | Non-empty after `.trim()`; otherwise the dialog disables Confirm.|

## 2. New shared error code — `shared/errors.ts`

```ts
// existing GitErrorCode union — add:
| 'REVERT_CONFLICT_NO_RECOVERY'
```

**Semantics**: A revert mode that does NOT engage git's revert state machine (`Stage only`, `Edit message`) encountered conflicts. The webview must NOT enter `revertInProgress` state; the user resolves via the SCM panel and commits manually. Distinct from the existing `REVERT_CONFLICT`, which IS recoverable via Continue/Abort.

## 3. RPC message — request (re-shape, not new)

The `revert` variant in the `RequestMessage` discriminated union in `shared/messages.ts` is re-shaped from:

```ts
| { type: 'revert'; payload: { hash: string; mainlineParent?: number } }
```

to:

```ts
| { type: 'revert'; payload: { hash: string; options: RevertOptions } }
```

**Field validation** (enforced server-side in `GitRevertService.revert`):

| Field             | Type           | Required | Validation                                                                            |
|-------------------|----------------|----------|---------------------------------------------------------------------------------------|
| `hash`            | string         | yes      | Passes existing `validateHash` (alphanumeric, plausible git hash length).             |
| `options.mode`    | `RevertMode`   | yes      | One of `'commit' | 'no-commit' | 'edit-message'`.                                     |
| `options.mainlineParent` | number? | conditional | Present when the commit is a merge commit; integer ≥ 1.                            |
| `options.message` | string?        | conditional | Present and non-empty after trim when `mode === 'edit-message'`.                    |

**Allowlist**: The existing `revert: true` entry in `requestAllowlist` (`shared/messages.ts:194`) remains unchanged — the variant name didn't change, only its payload shape.

## 4. RPC message — response (unchanged)

No new response variant. Existing envelopes reused:

- Success → `{ type: 'success'; payload: { message: '<service-message>' } }` followed by `sendInitialData(currentFilters)` and `{ type: 'revertState'; payload: { state: 'idle' } }`.
- Conflict (Commit now mode) → `{ type: 'error'; ... }` + `{ type: 'revertState'; payload: { state: 'in-progress' } }` (existing).
- Conflict (Stage only / Edit message mode) → `{ type: 'error'; payload: { error: { code: 'REVERT_CONFLICT_NO_RECOVERY', message: '...' } } }` + `{ type: 'revertState'; payload: { state: 'idle' } }` (NEW behavior, existing envelope).
- Empty revert / dirty tree / op-in-progress → `{ type: 'error'; ... }` + `{ type: 'revertState'; payload: { state: 'idle' } }` (existing).

## 5. Zustand store — `revertOptions` slice (NEW)

Added to `webview-ui/src/stores/graphStore.ts` mirroring `cherryPickOptions`:

```ts
// State
revertOptions: RevertOptions;   // default: { mode: 'commit' }

// Setter
setRevertOptions: (options: RevertOptions) => void;
```

**Lifecycle**:
- Default: `{ mode: 'commit' }` — matches today's behavior so the first-time dialog open is one click + confirm.
- Updated on every successful dialog confirm with the chosen mode (the `message` field is NOT persisted, since it's commit-specific).
- Read on every dialog open to pre-select the radio.
- Reset only on extension reload (Zustand transient state).

## 6. Pure helper — default revert message (new, frontend-only)

**Location**: Inlined in `RevertDialog.tsx` or a tiny local helper — does not need its own file.

**Signature** (conceptual):

```ts
function defaultRevertMessage(commit: { hash: string; subject: string }): string;
```

**Output**:
```
Revert "<commit.subject>"

This reverts commit <commit.hash>.
```

(Two newlines between subject and `This reverts` per git's standard format.)

**Determinism**: Pure function of `commit.hash` and `commit.subject`. Used to pre-fill the `Edit message` text area.

## 7. Existing entities — referenced, not changed

| Entity                | Source location                                          | Use in this feature                                               |
|-----------------------|----------------------------------------------------------|-------------------------------------------------------------------|
| `Commit`              | `shared/types.ts` (existing)                             | Provides `hash`, `abbreviatedHash`, `subject`, `parents`.        |
| `CommitParentInfo`    | `shared/types.ts` (existing)                             | Powers merge-commit mainline-parent picker (same as today).       |
| `RevertState`         | `shared/types.ts:319` (existing)                         | `'idle' | 'in-progress'` — unchanged. Only `Commit now` ever transitions to `in-progress`. |
| `GitError`, `Result`  | `shared/errors.ts` (existing)                            | Service return shapes — unchanged contract, one new `GitErrorCode`. |
| `CherryPickOptions`   | `shared/types.ts` (existing)                             | Reference pattern only — `RevertOptions` mirrors its style.       |

## 8. State transitions

Single-shot operations with no multi-stage UI state. All three modes traverse:

```
idle → executing (no UI state; spinner only) → idle (success)
                                            ↘ in-progress (Commit now only, on conflict)
                                            ↘ idle + error toast (other failures)
```

The `in-progress` lane exists only for `Commit now` and recovers via existing Continue/Abort flow. The other two modes never enter `in-progress`.

## 9. Out of scope (explicit non-data)

- No `globalState` persistence (per spec Assumptions).
- No new RPC variants (no `revertStageOnly` / `revertWithMessage` — single `revert` variant carries all modes via `options`).
- No multi-commit revert payload (single hash per request, matching today).
- No GPG / signing override field on `RevertOptions` — signing follows global git config.
- No `--no-verify` field on `RevertOptions` — hooks always run.

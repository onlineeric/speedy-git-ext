# Phase 1 — Data Model

**Feature**: Fast-forward Local Branch from Remote
**Branch**: `043-fast-forward-branch`
**Date**: 2026-05-08

This feature is stateless — it does not introduce new persistent entities, settings, or store slices. The only new "data" is one RPC message variant and the inputs to one pure helper function.

## 1. RPC message — request

Added to the `RequestMessage` discriminated union in `shared/messages.ts`:

```ts
| { type: 'fastForwardLocalBranch'; payload: { remote: string; branch: string } }
```

**Field validation** (enforced server-side via existing `validateRefName` in `src/utils/gitValidation.ts`):

| Field    | Type   | Required | Validation                                                |
|----------|--------|----------|-----------------------------------------------------------|
| `remote` | string | yes      | Non-empty; passes `validateRefName` (no shell metachars). |
| `branch` | string | yes      | Non-empty; passes `validateRefName`.                      |

**Allowlist update**: Add `fastForwardLocalBranch: true` to whichever request-allowlist constant in `shared/messages.ts` gates incoming messages (alongside `push`, `pull`, `fetch`, etc., per the existing pattern at line ~180).

## 2. RPC message — response

**No new response variant.** The handler reuses the existing extension-wide envelope:

- Success → `{ type: 'success'; payload: { message: 'Fast-forward completed' } }` followed by the standard `sendInitialData(currentFilters)` graph refresh.
- Failure → `{ type: 'error'; payload: { error: GitError } }` — git stderr surfaces verbatim.

## 3. Pure helper — `resolveDefaultRemote`

**Location**: `webview-ui/src/utils/resolveDefaultRemote.ts` (new file).

**Signature**:

```ts
export function resolveDefaultRemote(branches: Branch[]): string;
```

**Inputs**:
- `branches`: the loaded `Branch[]` from the Zustand store. Each `Branch` has `{ name, remote?, current, hash }`.

**Output**:
- The chosen remote name (string). Always returns a string — never throws, never returns undefined.

**Resolution rule** (matches spec FR-008):
1. Collect distinct, non-empty `b.remote` values from `branches`.
2. If `"origin"` is in that set → return `"origin"`.
3. Else if the set is non-empty → return its alphabetically-first element.
4. Else (no remotes anywhere in the loaded list) → return literal `"origin"` so the command preview is still readable; git will surface the resulting error after confirm.

**Determinism**: For any given `branches` input the function returns the same string. No I/O, no time-dependence, no random ordering.

## 4. Existing entities — referenced, not changed

| Entity            | Source location                            | Use in this feature                                                 |
|-------------------|--------------------------------------------|---------------------------------------------------------------------|
| `RefInfo`         | `shared/types.ts:94`                       | Discriminator for menu visibility (`type === 'branch'`).            |
| `Branch`          | `shared/types.ts:118`                      | Read by `resolveDefaultRemote` to enumerate remotes.                |
| `GitError`        | `shared/errors.ts`                         | Carrier of git stderr to the existing error-toast channel.          |
| `Result<T,E>`     | `shared/errors.ts`                         | Return shape of `GitBranchService.fastForwardFromRemote`.           |
| `useGraphStore`   | `webview-ui/src/stores/graphStore.ts`      | `loading`, `rebaseInProgress`, `branches` selectors (already exist).|

## 5. State transitions

Single-shot, no lifecycle. The local branch ref transitions from `oldHash` → `remoteTip` on success, or stays at `oldHash` on any failure. No intermediate states are persisted in the webview store; the graph reload reflects the result.

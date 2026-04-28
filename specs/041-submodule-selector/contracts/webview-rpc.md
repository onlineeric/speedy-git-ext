# Contract: Webview ↔ Extension RPC for Submodule Selector

**Feature**: `041-submodule-selector` | **Date**: 2026-04-28

This contract documents how the webview and the extension host communicate for submodule
selector navigation and the `submodulesData` lifecycle. It also captures shared-type
extensions and deprecation markers.

## Scope

- VS Code message-passing RPC defined in `shared/messages.ts` (`RequestMessage` /
  `ResponseMessage` discriminated unions).
- Shared types in `shared/types.ts`.

The contract format is "narrative + code excerpts" because the RPC layer is internal: there
is no external API surface, OpenAPI spec, or grammar to publish. Cross-process types are the
contract.

## 1. Message changes

### 1.1 `switchRepo` (REUSED, no shape change)

Existing message — used unchanged for both repo selector navigation and the new submodule
selector navigation.

```ts
// RequestMessage (existing, in shared/messages.ts)
| { type: 'switchRepo'; payload: { repoPath: string } }
```

**New usage**: when the user picks a submodule from the submodule selector, the webview
sends `switchRepo` with `repoPath` set to the **resolved absolute path** of the submodule
(`path.resolve(parentRepoPath, submodule.path)`). The webview pre-resolves this path before
sending, so the backend does not need to know the parent context.

**Backend behavior**: `WebviewProvider`'s `switchRepo` handler calls
`ExtensionController.switchActiveRepo(repoPath)` (existing path), which calls
`reinitServices(repoPath)` and reloads. **No `submoduleStack` push/pop** is performed for
selector-driven submodule navigation. The legacy `openSubmodule` push path remains in code
but is no longer reachable through UI.

### 1.2 `openSubmodule` (DEPRECATED — keep type, drop UI callers)

```ts
| { type: 'openSubmodule'; payload: { submodulePath: string } }    // <-- deprecated, no UI caller
```

The webview no longer sends this message. The backend handler in `WebviewProvider` remains
wired (lines 1619–1624), but unreachable. Marked DEPRECATED in `shared/messages.ts` with a
comment. Removal is a follow-up.

### 1.3 `backToParentRepo` (DEPRECATED — keep type, drop UI callers)

```ts
| { type: 'backToParentRepo'; payload: Record<string, never> }     // <-- deprecated, no UI caller
```

Same status as `openSubmodule`. The "Back to parent" button is removed entirely (FR-002).

### 1.4 `submodulesData` (REUSED, payload extended)

```ts
// ResponseMessage (existing, in shared/messages.ts)
| {
    type: 'submodulesData';
    payload: {
      submodules: Submodule[];                  // each Submodule now includes `initialized: boolean`
      stack: SubmoduleNavEntry[];               // always [] under the new design (deprecated)
    };
  }
```

**Behavioral change**: the backend continues to send `submodulesData` after every
`switchRepo` (existing path in `WebviewProvider.sendInitialData()`'s background fan-out at
lines 732–733). The `submodules` array now has `initialized` populated.

**Frontend handling**: the `rpcClient.handleMessage('submodulesData')` case calls
`store.setSubmodules(submodules, stack)` unchanged — the store consumes the extended type
field transparently.

### 1.5 `repoList` (UNCHANGED)

Existing message used for sending the workspace repo list. Unchanged for this feature. The
spec FR-011 ("remove specially-added submodule entries") is a no-op confirmation
(see research R8) — no code change.

## 2. Shared type changes

### 2.1 `Submodule` extension

```ts
// shared/types.ts
export interface Submodule {
  path: string;
  hash: string;
  status: SubmoduleStatus;
  describe: string;
  url?: string;
  /**
   * NEW: true iff status !== 'uninitialized' AND <parent>/<path>/.git exists
   * on disk. Frontend uses this to decide selector inclusion (FR-006).
   */
  initialized: boolean;
}
```

**Compatibility**: adding a required field is a hard break for any persisted state that
contains `Submodule` instances. None of `globalState`, `workspaceState`, or the persisted
UI state stores `Submodule[]`, so the change is safe.

### 2.2 `SubmoduleNavEntry` (UNCHANGED, deprecated)

```ts
export interface SubmoduleNavEntry { repoPath: string; repoName: string; }
```

Kept in shape; no longer populated. Marked deprecated in source.

## 3. Operational contract — git operation scope (FR-014, SC-007)

When the webview's displayed repo is a submodule (whether reached via the submodule
selector or directly via the repo selector's auto-discovered entry):

- All git request messages (`getCommits`, `fetch`, `pull`, `push`, `checkoutBranch`,
  `cherryPick`, `rebase`, `resetBranch`, `createTag`, `applyStash`, etc.) are dispatched
  to `WebviewProvider`'s service singletons (`gitLogService`, `gitDiffService`, ...).
- These singletons were rebound by the most recent `reinitServices(displayedRepoPath)`,
  so they target the displayed repo's working tree.
- **No request payload changes**. The contract is implicit in the rebind — the webview
  never sends a "target repo path" parameter; the backend's current bound repo IS the target.

**Verification**: every operation listed in FR-014 must be spot-checked against the
displayed submodule. The quickstart smoke checklist enumerates the operations.

## 4. Reset/refresh contract (frontend only)

The reset chain (FR-022 / FR-023 / FR-024 / FR-025) is purely a frontend concern — no
RPC is involved. The contract is internal to the webview store:

```ts
interface GraphStore {
  /** Entry point invoked on repo selector change AND on submodule selector change. */
  resetTopMenuGroup: () => void;
  // Effects:
  //   - filters: cleared (preserves maxCount)
  //   - searchState: cleared (query, matchIndices, currentMatchIndex set to defaults;
  //                          isOpen left UNTOUCHED — FR-024)
  //   - activeToggleWidget: NOT TOUCHED — FR-024
}
```

External (backend) controls have **no** reset entry point and need no RPC additions for
this feature.

## 5. Removed UI affordances

| Affordance | RPC message | Reason removed |
|---|---|---|
| Submodule header row above graph | none | FR-001 — replaced by submodule selector |
| Submodule rows (`SubmoduleSection`) | none | FR-001 |
| "Back to parent" button | `backToParentRepo` (no caller) | FR-002 |
| `<repo> / Current` title | none | FR-003 — implicitly resolved by header removal |
| Specially-added submodule entries in repo selector | none | FR-011 — confirmed no-op (R8) |

## 6. Validation checklist

This contract is satisfied iff:

- [ ] `Submodule` in `shared/types.ts` includes the `initialized: boolean` field.
- [ ] `GitSubmoduleService.parseSubmoduleLine` populates `initialized` per the rule in §2.1.
- [ ] The webview's `setSubmoduleSelection` action sends `switchRepo` (not `openSubmodule`)
      with the resolved absolute submodule path.
- [ ] No webview code path calls `rpcClient.openSubmodule` or `rpcClient.backToParentRepo`.
- [ ] `submodulesData` arrives after every `switchRepo` and the webview hides the submodule
      selector when no `initialized: true` submodules exist.
- [ ] `resetTopMenuGroup()` does not modify `activeToggleWidget`.
- [ ] No new RPC message types are added.

# Phase 1 Data Model: Uncommitted Node UX Polish

The feature is predominantly UI-state. Only **one** new cross-boundary type is
introduced (the `stashSelected` request payload). Everything else is dialog-local
React state that does not cross the webview ↔ extension boundary and therefore
does not belong in `shared/types.ts`.

## 1. Entities

### 1.1 `UncommittedFileEntry` (existing — `FileChange` from `shared/types.ts`)

Already defined. Relevant attributes used by this feature:

| Field | Type | Notes |
|---|---|---|
| `path` | `string` | Primary key used for selection. |
| `oldPath` | `string \| undefined` | Present for `renamed`/`copied`; both sides auto-included in Stash. |
| `status` | `FileChangeStatus` | Drives "untracked" and "renamed" classification. |
| `stageState` | `'staged' \| 'unstaged' \| 'conflicted' \| undefined` | Drives radio enable/disable rules. |

**Derived flags** (computed, not stored):

- `isUntracked` ≡ `status === 'untracked'`
- `isRenamed` ≡ `status === 'renamed'`
- A path appearing in **both** the `uncommittedStagedFiles` and `uncommittedUnstagedFiles` arrays of `graphStore` is a **dual-state** entry. The dual-state detection is done inside the dialog against the two arrays already present in the store — no new store field.

**No new `shared/types.ts` additions for this entity.**

### 1.2 `ActionRadioOption` (dialog-local)

Represents one of the four radio rows. Lives only inside `FilePickerDialog` React state.

```ts
type ActionKind = 'stage' | 'unstage' | 'discard' | 'stash';

interface ActionRadioOption {
  kind: ActionKind;
  enabled: boolean;            // from computeRadioAvailability(selection)
  count: number;               // affected file count for this kind
  commandPreview: string;      // built by gitCommandBuilder for this kind
}
```

No persistence, no serialization, no cross-boundary traffic — therefore kept as a
local type in `FilePickerDialog.tsx` rather than `shared/types.ts`.

### 1.3 `FilePickerDialogState` (dialog-local React state)

Only the fields that are *new* in this feature are listed:

| Field | Type | Purpose |
|---|---|---|
| `selectedPaths` | `Set<string>` | (existing) multi-select set from the upper list. |
| `selectedRadio` | `ActionKind \| null` | Currently selected radio. `null` when no files are selected. |
| `stashMessage` | `string` | User-typed stash message. Trimmed at submit time. |
| `isRunning` | `boolean` | True while an action's git command is executing. |
| `errorBanner` | `string \| null` | Inline error banner text; `null` when no error. |

**State transitions**:

```text
Initial (dialog opens):
  selectedPaths = ∅
  selectedRadio = null
  stashMessage  = ''
  isRunning     = false
  errorBanner   = null

On selectedPaths change (user ticks/unticks):
  selectedRadio ← applyDefaultRule(selection, prevSelectedRadio)
  errorBanner   ← null  (selection changes clear prior error)

On radio click:
  selectedRadio ← clicked (only if enabled)

On disabled stash-message input click:
  selectedRadio ← 'stash'
  focus stash-message input

On action button click → begin execution:
  isRunning ← true
  errorBanner ← null
  (send RPC)

On action success:
  isRunning ← false
  selectedPaths PRESERVED    (refresh effect prunes any path no longer in
                              stagedFiles ∪ unstagedFiles; see FR-P02)
  selectedRadio ← applyDefaultRule(availability', prevSelectedRadio)
                              (sticky rule flips e.g. 'stage' → 'unstage'
                              when the action moved files to the other side)
  stashMessage ← ''
  errorBanner ← null

On action failure:
  isRunning ← false
  errorBanner ← <raw git error message, augmented for add-then-stash per FR-F03>
  selectedPaths, selectedRadio, stashMessage preserved
```

### 1.4 Stash confirmation intent (extending existing `StashDialog`)

No new entity. The existing `StashDialog` already owns `message: string` and
calls `onConfirm(message?: string)`. The only change is that the title and
description are now overridable via optional props.

## 2. Derived rules (pure functions)

These live in `webview-ui/src/utils/` as exported functions and are covered by
unit tests.

### 2.1 `computeRadioAvailability(selection)`

Input: array of selected `FileChange` entries PLUS the full uncommitted set
(to detect dual-state via cross-referencing staged vs unstaged arrays).

Output:

```ts
interface RadioAvailability {
  stageEnabled: boolean;
  unstageEnabled: boolean;
  discardEnabled: boolean;
  stashEnabled: boolean;
  stageCount: number;
  unstageCount: number;
  discardCount: number;
  stashCount: number;
}
```

Rules (derived from FR-011 – FR-023):

| Selection content | stage | unstage | discard | stash |
|---|---|---|---|---|
| No files | ❌ | ❌ | ❌ | ❌ |
| Only unstaged | ✅ | ❌ | ✅ | ✅ |
| Only staged | ❌ | ✅ | ❌ | ✅ |
| Mixed (or any dual-state path) | ✅ | ✅ | ✅ | ✅ |

Counts:

- `stageCount` = # selected files whose path has an unstaged side.
- `unstageCount` = # selected files whose path has a staged side.
- `discardCount` = `stageCount` (discard operates on the unstaged side).
- `stashCount` = # distinct selected paths.

### 2.2 `applyDefaultRadioRule(availability, previous)`

Given the new availability and the previous `selectedRadio`, returns the new
`selectedRadio`:

1. If no file is selected → `null`.
2. Else if `previous` is still enabled → keep it (sticky behavior across minor
   selection changes is more pleasant).
3. Else if `stageEnabled` → `'stage'`.
4. Else if `unstageEnabled` → `'unstage'`.
5. Else → `'stash'` (can't realistically reach this, but total).

### 2.3 `buildDefaultStashMessage(fileCount, branchName)`

Returns `Stash of ${fileCount} files from ${branchName}` verbatim. Used only
when the user leaves the stash message empty.

### 2.4 `buildSelectiveStashCommandPreview(args)`

Input:

```ts
interface SelectiveStashPreviewArgs {
  paths: string[];                 // deduped, exact paths for the command
  message?: string;                // trimmed; empty → default message applied by caller
  hasUntracked: boolean;           // drives the &&-joined form
}
```

Output: exact string that will be executed on the backend (including the `&&` for
the add-then-stash case, exactly per FR-028a/b/c).

## 3. Cross-boundary contract

**New request message** added to `shared/messages.ts`:

```ts
| {
    type: 'stashSelected';
    payload: {
      message?: string;        // undefined → backend does NOT auto-generate; the webview always passes a non-empty string
      paths: string[];         // deduped; includes both sides of any renamed pair; includes untracked when addUntrackedFirst is true
      addUntrackedFirst: boolean; // webview sets true when any selected file is untracked
    };
  }
```

No new response message — backend uses the existing `success` / `error`
response types and triggers the existing post-mutation refresh pathway.

## 4. Out-of-scope for shared types

Items deliberately NOT added to `shared/types.ts`:

- `ActionKind` — dialog-local.
- `RadioAvailability` — dialog-local.
- `FilePickerDialogState` — dialog-local React state.
- Error banner text / formatting — dialog-local.

This keeps the cross-boundary surface area minimal and respects Constitution III
(the "single source of truth" rule for `shared/types.ts` exists to keep that
surface small, not to absorb every UI-local type).

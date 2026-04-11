# Contract: Component Props

All prop additions in this feature are **strictly additive** — existing
defaults preserve current behavior so existing call sites need no change.

## 1. `CommandPreview`

```ts
interface CommandPreviewProps {
  command: string;
  /**
   * When false, the copy-to-clipboard button is hidden.
   * Used by disabled/unselected radio rows in FilePickerDialog (FR-027).
   * Default: true (preserves existing call sites).
   */
  showCopyButton?: boolean;
  /**
   * When false, the "Command preview:" lead-in label is hidden.
   * Used inside radio rows where the radio's label already names the command
   * (FR-028). Default: true (preserves existing call sites).
   */
  showLabel?: boolean;
}
```

Affected existing file: `webview-ui/src/components/CommandPreview.tsx`.

## 2. `DiscardAllDialog`

```ts
interface DiscardAllDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;

  /**
   * Override the dialog title. Default: "Discard All Unstaged Changes".
   */
  title?: string;

  /**
   * Override the descriptive body text. Default: the existing
   * whole-working-tree warning.
   */
  description?: string;

  /**
   * Override the primary action button label. Default: "Discard All".
   */
  confirmLabel?: string;

  /**
   * Override the command preview shown in the dialog. Default: the string
   * returned by buildDiscardAllUnstagedCommand().
   */
  commandPreview?: string;
}
```

Usage from `FilePickerDialog` for the per-file discard confirmation:

```ts
<DiscardAllDialog
  open={discardConfirmOpen}
  onOpenChange={setDiscardConfirmOpen}
  onConfirm={handleDiscardConfirm}
  title="Discard Selected Changes"
  description={`This will permanently discard ${n} file(s).${
    untrackedCount > 0
      ? ` ${untrackedCount} untracked file(s) will be permanently deleted.`
      : ''
  } This cannot be undone.`}
  confirmLabel={`Discard (${n})`}
  commandPreview={buildSelectiveDiscardCommand(paths)}
/>
```

Affected existing file: `webview-ui/src/components/DiscardAllDialog.tsx`.

## 3. `StashDialog`

```ts
interface StashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (message?: string) => void;

  /**
   * Override the dialog title. Default: "Stash All Changes".
   * Set to "Stash Everything" from UncommittedContextMenu after the rename.
   */
  title?: string;

  /**
   * Override the descriptive body text. Default: "Stash all changes
   * including untracked files."
   */
  description?: string;
}
```

Affected existing file: `webview-ui/src/components/StashDialog.tsx`.

## 4. `FilePickerDialog` — internal shape only

No new exported props. `FilePickerDialog` continues to accept only
`open`, `onOpenChange`, `stagedFiles`, `unstagedFiles` (as today). All new
behavior (radio group, inline error banner, busy state, auto-rename-inclusion)
is internal to the component.

Affected existing file: `webview-ui/src/components/FilePickerDialog.tsx`.

## 5. `UncommittedContextMenu` — no prop changes

The menu rename ("Stash All Changes" → "Stash Everything…") and the dialog
title override are internal to `UncommittedContextMenu`. No prop changes.

Affected existing file: `webview-ui/src/components/UncommittedContextMenu.tsx`.

## 6. `FileChangeShared.FileActionIcons` — no prop changes

The new behavior is gated entirely on `commitHash === UNCOMMITTED_HASH`, which
is already received. Two changes inside the component:

- Always render stage/unstage arrow button when `isUncommitted && !isConflicted`
  (remove the `opacity-0 group-hover:opacity-100` gating on that specific
  button, keep it on all other buttons). Implement by splitting the render
  into two sibling spans: one always-visible (stage/unstage) and one
  hover-only (copy/open/open-current).
- Omit the "Open file at this commit" button entirely when
  `commitHash === UNCOMMITTED_HASH`.

Affected existing file: `webview-ui/src/components/FileChangeShared.tsx`.

## 7. New utility modules — exported contracts

### `webview-ui/src/utils/stashMessage.ts` (new file)

```ts
/**
 * Builds the default stash message for the selective-stash flow when the user
 * leaves the message input blank. Format is fixed per FR-032.
 */
export function buildDefaultStashMessage(
  fileCount: number,
  branchName: string,
): string;
```

### `webview-ui/src/utils/gitCommandBuilder.ts` (additions)

```ts
/** Preview string: git add -- <paths>  (only used inside the &&-joined form) */
export function buildGitAddCommand(paths: string[]): string;

/** Preview string: git reset HEAD -- <paths>  (for the Unstage row) */
export function buildSelectiveUnstageCommand(paths: string[]): string;

/** Preview string: git add -- <paths>  (for the Stage row) */
export function buildSelectiveStageCommand(paths: string[]): string;

/** Preview string: git checkout -- <paths>  (for the Discard row) */
export function buildSelectiveDiscardCommand(paths: string[]): string;

/**
 * Preview string for the Stash row. When `hasUntracked`, joins
 * `git add -- <paths>` and `git stash push -m "<msg>" -- <paths>` with `&&`
 * on a single line (FR-028a). Otherwise returns only the single
 * `git stash push` form (FR-028b). The exact string is what the backend
 * will run AND what the copy button copies.
 */
export function buildSelectiveStashCommand(args: {
  paths: string[];
  message: string;
  hasUntracked: boolean;
}): string;
```

### `webview-ui/src/utils/radioAvailability.ts` (new file)

```ts
export interface RadioAvailability {
  stageEnabled: boolean;
  unstageEnabled: boolean;
  discardEnabled: boolean;
  stashEnabled: boolean;
  stageCount: number;
  unstageCount: number;
  discardCount: number;
  stashCount: number;
}

/**
 * Pure function: given the set of selected paths and the full uncommitted
 * staged/unstaged lists, compute the enable flags and counts per the rules
 * in FR-011 through FR-023 (including dual-state handling per FR-015a).
 */
export function computeRadioAvailability(args: {
  selectedPaths: Set<string>;
  stagedFiles: FileChange[];
  unstagedFiles: FileChange[];
}): RadioAvailability;

export type ActionKind = 'stage' | 'unstage' | 'discard' | 'stash';

/**
 * Returns the default-selected radio per FR-016/FR-017/FR-018.
 * Sticky: if `previous` is still enabled, returns it unchanged.
 */
export function applyDefaultRadioRule(
  availability: RadioAvailability,
  previous: ActionKind | null,
): ActionKind | null;
```

These utilities are all unit-tested (see `contracts/` test list referenced in
`plan.md`'s Project Structure section).

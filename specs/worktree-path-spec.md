# Technical Spec — Worktree Folder Path: Nested vs Flattened

**Implements:** [`specs/worktree-path-idea.md`](./worktree-path-idea.md) — read that first for the product requirements and the reasoning behind each decision. This document is the implementation plan only; where the two disagree, the idea spec wins.

**Origin:** [issue #189](https://github.com/onlineeric/speedy-git-ext/issues/189) by @nelson870708.

**Guiding rule:** follow the app's existing conventions everywhere. New RPCs go through `WebviewMessageRouter`'s exhaustive map; new git behaviour returns `Result<T, GitError>`; new decision logic goes into a pure module with Vitest coverage rather than inline in a component; every colour comes from `utils/themeColors.ts` or `dialogStyles.ts`.

---

## 1. Change map

| Layer | File | Change |
| --- | --- | --- |
| Shared | `shared/types.ts` | `WorktreeFolderNameStyle` type; `worktreeFolderNameStyle` on `UserSettings`; default `'nested'`; `normalizeWorktreeFolderNameStyle` |
| Shared | `shared/messages.ts` | `worktreePathResolved` payload carries both paths; new `setWorktreeFolderNameStyle` request; `worktreeList` payload carries `baseDir` |
| Backend | `src/services/worktreeLeafName.ts` **(new)** | Pure: ref → folder segments, per-style leaf, containment guard |
| Backend | `src/utils/emptyDirCleanup.ts` **(new)** | Pure-ish: prune empty parents; sweep a base dir bottom-up |
| Backend | `src/services/GitWorktreeService.ts` | Resolve both candidate paths; expose resolved base dir; prune after remove; sweep after prune |
| Backend | `src/webview/handlers/worktreeHandlers.ts` | New response shape; pass style + base path; wire prune/sweep |
| Backend | `src/webview/handlers/vscodeCommandHandlers.ts` | `setWorktreeFolderNameStyle` handler + success toast |
| Backend | `src/webview/handlers/updateSpeedyGitSetting.ts` | Scope-aware write (User unless already defined in workspace) |
| Backend | `src/webview/RepoDataLoader.ts` | Include `baseDir` in its `worktreeList` post |
| Backend | `src/ExtensionController.ts` | Read + normalize the new setting; add it to the change-watch list |
| Backend | `package.json` | Contribute `speedyGit.worktree.folderNameStyle`; amend `worktree.basePath` description |
| Webview | `webview-ui/src/utils/worktreePathChoice.ts` **(new)** | Pure: dirty check, switch decision, link visibility |
| Webview | `webview-ui/src/utils/worktreeDisplay.ts` | `worktreeFolderName` takes an optional base dir and labels relative to it |
| Webview | `webview-ui/src/rpc/rpcClient.ts` | New resolve response shape; `setWorktreeFolderNameStyle` sender |
| Webview | `webview-ui/src/stores/graphStore.ts` | Store `worktreeBaseDir` from `worktreeList` |
| Webview | `webview-ui/src/components/CreateWorktreeDialog.tsx` | Radio pair, two boxes, discard confirmation, save-default link |
| Webview | `webview-ui/src/components/ConfirmDialog.tsx` | Optional `focusConfirm` to override Radix's default Cancel focus |
| Webview | `webview-ui/src/components/WorktreeMenuItems.tsx` | Pass the base dir to `worktreeFolderName` |

---

## 2. Shared contract

### 2.1 `shared/types.ts`

```ts
/** How a branch name with `/` becomes a worktree folder: `feat/x` → `feat/x` or `feat-x`. */
export type WorktreeFolderNameStyle = 'nested' | 'flat';

export const WORKTREE_FOLDER_NAME_STYLES = ['nested', 'flat'] as const;
```

- Add `worktreeFolderNameStyle: WorktreeFolderNameStyle` to `UserSettings`, documented in place.
- `DEFAULT_USER_SETTINGS.worktreeFolderNameStyle = 'nested'`.
- Add `normalizeWorktreeFolderNameStyle(value: unknown): WorktreeFolderNameStyle` beside the existing clamps (`clampBatchCommitSize`, `clampAvatarRefreshDays`) — one place both sides agree on what an unrecognised configured value means. Anything not in the tuple resolves to the default.

### 2.2 `shared/messages.ts`

```ts
// request (unchanged shape, style is NOT sent — the backend answers both)
| { type: 'resolveWorktreePath'; payload: { ref; branchMode; newBranchName?; requestId } }

// request (new)
| { type: 'setWorktreeFolderNameStyle'; payload: { style: WorktreeFolderNameStyle } }

// response (changed)
| { type: 'worktreePathResolved'; payload: {
      nestedPath: string;
      flatPath: string;
      /** True when the derived folder name contains a separator, i.e. the choice applies. */
      hierarchical: boolean;
      requestId: number;
    } }

// response (changed)
| { type: 'worktreeList'; payload: { worktrees: WorktreeInfo[]; baseDir: string | null } }
```

**One round trip returns both paths.** Two separate resolves would supersede each other in `rpcClient`'s single pending slot, would spawn `git worktree list` twice, and would collision-check against two different filesystem snapshots. One call also means both boxes always describe the same instant.

`hierarchical` is sent explicitly rather than derived from `nestedPath !== flatPath`. The two are equivalent today, but the webview cannot see the derived leaf (in detached mode it is a short hash the webview never learns), and an explicit flag keeps the dialog from inferring intent from a string comparison.

Register `setWorktreeFolderNameStyle: true` in the request allowlist and keep the `satisfies RequestHandlerMap` dispatch exhaustive.

---

## 3. Backend

### 3.1 `src/services/worktreeLeafName.ts` (new, pure)

Replaces the private `sanitizeLeafName` in `GitWorktreeService`. Extracted because admitting `/` into a folder name turns a one-line regex into a containment-safety rule that must be tested independently.

```ts
/** Sanitize one path segment with the historical allowlist. Never returns a separator. */
export function sanitizeWorktreeSegment(segment: string): string;

/**
 * Split a ref into sanitized, filesystem-safe segments.
 * Drops empty segments and any `.` / `..` component; returns ['worktree'] if nothing survives.
 */
export function buildWorktreeSegments(ref: string): string[];

/** Segments joined per style: 'nested' keeps them separate, 'flat' joins with '-'. */
export function buildWorktreeLeafSegments(ref: string, style: WorktreeFolderNameStyle): string[];

/** True when `candidate` resolves to a path strictly inside `baseDir`. */
export function isInsideBaseDir(baseDir: string, candidate: string): boolean;
```

Rules:

- Per-segment sanitizing keeps the existing allowlist exactly: `[^A-Za-z0-9._-]+ → '-'`, collapse repeats, trim leading/trailing `-`/`.`. Because it runs per segment, a separator can never survive *inside* a segment, and the flat style is byte-for-byte what ships today.
- The ref is split on both `/` and `\` before sanitizing, so a Windows-style separator cannot slip through as a literal.
- `.` and `..` segments are dropped, not sanitized into `-`. Git ref names already forbid `..`, a leading/trailing `/`, and `//`, so this is defence in depth against a hand-typed new-branch name reaching the resolver before validation gates the Create button.
- Empty result → `['worktree']`, matching today's fallback.
- `isInsideBaseDir` resolves both sides, compares with a trailing separator appended, and lower-cases on `win32` — the same convention as the existing `normalizePath` helper in `GitWorktreeService`.

### 3.2 `GitWorktreeService.resolveWorktreePath`

Signature becomes:

```ts
async resolveWorktreePath(
  opts: ResolveWorktreePathOptions,
  basePath: string,
): Promise<Result<{ nestedPath: string; flatPath: string; hierarchical: boolean }>>
```

The `leafName` field is dropped (no caller uses it). Algorithm, keeping every existing step:

1. `listWorktrees()` once. On failure, propagate the `Result` unchanged.
2. Resolve `baseDir` exactly as today (main worktree path → `repoName` → `${repoName}` expansion → `path.resolve(mainPath, expandedBase)`), via the extracted helper in §3.3.
3. Derive `desiredLeaf` from the branch mode exactly as today, including the `rev-parse --short=10` call for detached mode.
4. `segments = buildWorktreeSegments(desiredLeaf)`; `hierarchical = segments.length > 1`.
5. Build both candidates: `path.join(baseDir, ...segments)` and `path.join(baseDir, segments.join('-'))`.
6. **Containment guard** — if a candidate fails `isInsideBaseDir(baseDir, candidate)`, fall back to the flat candidate for that slot and log a warning. Silent to the user: it cannot be reached from a valid git ref, and the user has a free-text box if they disagree with the result.
7. Apply the existing collision suffix to **each candidate independently** against the same `existingPaths` snapshot plus `existsSync`, so each box shows a genuinely free path (idea spec §5.5). Suffixing appends to the last segment: `<base>/feat/branch1-2`, never `<base>/feat-2/branch1`.
8. Return both plus `hierarchical`.

When `hierarchical` is false both paths are identical strings; the dialog hides the choice and uses either.

### 3.3 Base-dir resolution, extracted

The `${repoName}` expansion and `path.resolve` against the **main** worktree currently live inline inside `resolveWorktreePath`, but three more call sites need the same answer (remove-prune, prune-sweep, and the `worktreeList` payload). Extract:

```ts
// GitWorktreeService
/** The absolute base directory for this repo's worktrees, or null if it cannot be resolved. */
resolveBaseDir(worktrees: WorktreeInfo[], basePath: string): string | null;
```

Pure with respect to git (it takes an already-fetched worktree list) so callers that already hold a list do not spawn a second `git worktree list`. Returns `null` when there is no main worktree and no workspace path to anchor to; every consumer treats `null` as "no base dir, do nothing".

### 3.4 `src/utils/emptyDirCleanup.ts` (new)

```ts
export interface EmptyDirCleanupLog { warn(message: string): void; }

/** Delete each now-empty parent of `startDir`, walking up, stopping before `baseDir`. */
export async function pruneEmptyParents(startDir: string, baseDir: string, log): Promise<void>;

/** Delete every empty directory under `baseDir`, bottom-up. Never deletes `baseDir`. */
export async function sweepEmptyDirs(baseDir: string, log): Promise<void>;
```

Shared rules for both:

- **`rmdir` is the emptiness test.** Call `fs.promises.rmdir(dir)` and let `ENOTEMPTY`/`EEXIST` be the answer — never `readdir`-then-delete, which races and would happily delete a directory that gained a file in between. A stray `.DS_Store` therefore stops the walk, which is the intended "strictly empty" behaviour.
- **Symlinks are never followed or deleted.** `lstat` each candidate; skip anything that is not a real directory. `rmdir` on a symlink fails anyway, but the explicit check keeps the sweep from descending through one.
- **Never touch `baseDir` itself**, and never anything above it. `pruneEmptyParents` stops as soon as the next parent equals or escapes `baseDir` (compared with the same normalization as `isInsideBaseDir`); `sweepEmptyDirs` recurses into `baseDir`'s children and never calls `rmdir(baseDir)`.
- **Fail silently, log once per failure.** Any error stops that branch of the walk, is written to the extension log channel, and is otherwise swallowed. No `Result` is returned — these functions cannot fail from a caller's point of view.
- **`pruneEmptyParents` does nothing if `startDir` is not inside `baseDir`.** A worktree the user placed somewhere custom is left entirely alone.
- `sweepEmptyDirs` is a no-op when `baseDir` does not exist.

### 3.5 `GitWorktreeService` — removal and prune

```ts
async removeWorktree(worktreePath, opts?: { force?: boolean; baseDir?: string | null })
async pruneWorktrees(opts?: { baseDir?: string | null })
```

- `removeWorktree`: after the git command **succeeds**, and only if `baseDir` is given, `await pruneEmptyParents(worktreePath, baseDir, log)`. A cleanup failure never changes the returned `Result` — the same rule the `.env` copy already follows in `addWorktree` ("a copy failure must not turn a successful worktree creation into an error").
- `pruneWorktrees`: after `git worktree prune` **succeeds**, and only if `baseDir` is given, `await sweepEmptyDirs(baseDir, log)`.
- Passing `baseDir` as an option rather than reading the setting inside the service keeps the service free of VS Code configuration, matching how `resolveWorktreePath` already receives `basePath` from its handler.

### 3.6 `worktreeHandlers.ts`

- `resolveWorktreePath` — post the new three-field payload. Error path unchanged (`{ type: 'error' }`).
- `postWorktreeList` — call `resolveBaseDir` with the list it already has plus the configured base path, and include `baseDir` in the payload.
- `removeWorktree` / `pruneWorktree` — resolve `baseDir` (one `listWorktrees` already happens in `findRemovableWorktree` for remove; reuse rather than adding a spawn where possible) and pass it into the service. Success toasts stay exactly as they are: `'Worktree removed'`, `'Worktrees pruned'`.

### 3.7 Setting write with scope detection

`updateSpeedyGitSetting` currently hard-codes `ConfigurationTarget.Global`. Extend it rather than adding a second helper, so the "one place that states the section name and the fire-and-forget contract" comment stays true:

```ts
export function updateSpeedyGitSetting(key: string, value: unknown): Thenable<void>;      // Global, as today
export function updateSpeedyGitSettingInDefinedScope(key: string, value: unknown): Promise<void>;
```

`…InDefinedScope` uses `config.inspect(key)`: if `workspaceValue !== undefined` write `ConfigurationTarget.Workspace`, else `ConfigurationTarget.Global`. Folder scope is not considered — `speedyGit.worktree.*` is window-scoped in `package.json`, so a folder-level value cannot apply.

Rationale (idea spec §6): a Global write shadowed by an existing workspace value would produce no settings change, so the link would never disappear and the click would look broken.

`setToolbarSetting` keeps calling the plain Global version; no behaviour change there.

### 3.8 `vscodeCommandHandlers.setWorktreeFolderNameStyle`

```ts
setWorktreeFolderNameStyle: async (message, context) => {
  const style = normalizeWorktreeFolderNameStyle(message.payload.style);
  try {
    await updateSpeedyGitSettingInDefinedScope('worktree.folderNameStyle', style);
    context.postMessage({ type: 'success', payload: { message: `${label} saved as the default worktree folder style` } });
  } catch (e) {
    context.postMessage({ type: 'error', payload: { error: new GitError(…, 'UNKNOWN_ERROR') } });
  }
},
```

- The payload is re-normalized backend-side; a webview message is never trusted to carry a valid enum.
- Confirmation is the in-webview `success` toast (`ToastContainer`), the app's existing mechanism for every user-initiated write.
- A rejected `config.update` (no workspace open for a Workspace target, read-only settings file) surfaces as the standard error toast. The link stays visible because no `settingsData` change arrives — which is correct.

### 3.9 `ExtensionController`

- `readUserSettings`: `worktreeFolderNameStyle: normalizeWorktreeFolderNameStyle(config.get('worktree.folderNameStyle', DEFAULT_USER_SETTINGS.worktreeFolderNameStyle))`.
- `didSpeedyGitWebviewSettingsChange`: add `'speedyGit.worktree.folderNameStyle'` to the watched list, so a manual edit in Settings UI reaches the open dialog.

### 3.10 `package.json`

```jsonc
"speedyGit.worktree.folderNameStyle": {
  "type": "string",
  "enum": ["nested", "flat"],
  "default": "nested",
  "enumDescriptions": [
    "Keep the branch hierarchy as folders: branch `feat/x` → `feat/x`.",
    "Flatten the branch hierarchy into one folder name: branch `feat/x` → `feat-x`."
  ],
  "markdownDescription": "Which worktree folder is preselected in the Create Worktree dialog for a branch name containing `/`. Both options are always offered in the dialog; this only chooses the default."
}
```

Also amend `speedyGit.worktree.basePath`'s description — it currently claims "The sanitized ref name is always appended as the leaf folder (e.g. `../myrepo.worktrees/feature-foo`)", which stops being true under the nested style.

---

## 4. Webview

### 4.1 `webview-ui/src/utils/worktreePathChoice.ts` (new, pure)

All of the dialog's decision logic, so the component only renders. Tested directly; the component is not.

```ts
export interface ResolvedWorktreePaths { nestedPath: string; flatPath: string; hierarchical: boolean; }

/** The computed default for one style. */
export function computedPathFor(resolved: ResolvedWorktreePaths | null, style: WorktreeFolderNameStyle): string;

/** True when the box's text differs from what the backend computed for that style. */
export function isPathEdited(current: string, computed: string): boolean;

/** What a click on the other radio should do. */
export function decideStyleSwitch(args: {
  current: WorktreeFolderNameStyle;
  next: WorktreeFolderNameStyle;
  currentText: string;
  computed: string;
}): 'ignore' | 'switch' | 'confirm';

/** Whether the "Use … by default" link is shown, and its text. */
export function saveDefaultLink(args: {
  hierarchical: boolean;
  selected: WorktreeFolderNameStyle;
  configured: WorktreeFolderNameStyle;
}): { visible: boolean; label: string };

export const WORKTREE_STYLE_LABELS: Record<WorktreeFolderNameStyle, string>; // 'Nested path' | 'Flatten path'
```

`isPathEdited` compares against the computed string, so typing and undoing leaves nothing to discard (idea spec §5.2). `decideStyleSwitch` returns `'ignore'` when `next === current`, so a re-click on the selected radio never prompts.

### 4.2 `CreateWorktreeDialog.tsx`

State:

```ts
const [resolved, setResolved] = useState<ResolvedWorktreePaths | null>(null);
const [style, setStyle] = useState<WorktreeFolderNameStyle>(() => configuredStyle);   // seeded once, per open
const [paths, setPaths] = useState<{ nested: string; flat: string }>({ nested: '', flat: '' });
const [pendingStyle, setPendingStyle] = useState<WorktreeFolderNameStyle | null>(null); // drives the confirm
```

- `configuredStyle` comes from `useGraphStore(s => s.userSettings?.worktreeFolderNameStyle)`, read through a `graphSelectors` selector so no other call site can derive it differently. The dialog is mounted only while open, so `useState`'s initializer is the "reset on every open" behaviour required by idea spec §4.3 — no reset effect, and later `settingsData` updates do not disturb the live selection.
- The existing resolve effect keeps its dependencies (`open`, `source.ref`, `branchMode`, `newBranchName`) and its cancellation. On response it sets `resolved` **and overwrites both boxes** — this is what silently discards a manual edit when the branch name or mode changes (idea spec §5.4), including when the response lands after the user has started typing in a box.
- The active path is `paths[style]`; it feeds `canConfirm`, `commandPreview` and `rpcClient.addWorktree`. `handleConfirm` is otherwise untouched.
- Rendering: when `resolved?.hierarchical` is false, render today's single labelled box bound to the active path. When true, render the two radio rows, each with its own `<input>`; the unselected row's input is `disabled`. Radio group `name="worktree-folder-style"`, styled like the existing branch-mode radios (`accent-[var(--vscode-button-background)]`), boxes keeping the current `font-mono` input classes.
- Radio `onChange` calls `decideStyleSwitch`. On `'switch'` it applies the change and resets the box being left to its computed default. On `'confirm'` it sets `pendingStyle` and renders nothing else — **the radio's `checked` stays bound to `style`, so the dot does not move until the user confirms** (idea spec §5.3).
- The confirmation is the shared `ConfirmDialog` — title `Discard changed path?`, description `Your edited worktree folder will be reset to the default for the option you are switching to.`, confirm label `Discard`, default `variant` (`'warning'`, which renders `buttonPrimaryClassName` — this is a preference switch, not a destructive git action, so the danger variant would overstate it), and no `telemetryId`. `onCancel` clears `pendingStyle` and changes nothing else. It nests inside the open `AlertDialog` via its own `Portal`, so it paints above with its own overlay — the same nesting `RemoveWorktreeDialog`'s force-delete flow already relies on.
- **Radix focuses `AlertDialog.Cancel` on open by design**, so "Discard focused as primary" (idea spec §5.3) needs an explicit override: `ConfirmDialog` gains an optional `focusConfirm?: boolean` that, when set, focuses the `AlertDialog.Action` from the content's `onOpenAutoFocus` (preventing the default and focusing the action node). Default stays Radix's safer behaviour so no existing confirmation changes. Esc still cancels.
- The link renders below both rows from `saveDefaultLink(...)`: `text-xs`, `text-[var(--vscode-textLink-foreground)]`, `<button type="button">` styled as a link (matching the existing "Open the worktree in new window" affordance in this same dialog). Click sends `rpcClient.setWorktreeFolderNameStyle(style)` and nothing else — it hides only when the refreshed `settingsData` makes `configured === selected`.

### 4.3 `rpcClient.ts`

- `pendingWorktreePath`'s resolve type becomes `ResolvedWorktreePaths`; the `worktreePathResolved` case forwards all three fields. The supersede-and-reject behaviour is unchanged.
- `setWorktreeFolderNameStyle(style)` — fire-and-forget `send`, mirroring `setToolbarSetting`.
- `worktreeList` case stores `baseDir` alongside the worktrees.

### 4.4 `graphStore.ts`

Add `worktreeBaseDir: string | null` (default `null`), set from the `worktreeList` message. Session state, not persisted — it is derived from a setting plus the repo, and both are re-sent on repo switch. Reset with the other repo-scoped state when the repo changes.

### 4.5 `worktreeDisplay.ts`

```ts
export function worktreeFolderName(worktreePath: string, baseDir?: string | null): string;
```

When `baseDir` is given and `worktreePath` is inside it, return the remainder with `/` separators (`exp/branch1`); otherwise return the last segment exactly as today. Windows paths are normalized to `/` for display, as the function already does. Update `detachedWorktreeBadgeText` to thread the base dir through, and `WorktreeMenuItems.tsx` to pass `useGraphStore(s => s.worktreeBaseDir)`.

---

## 5. Failure and edge-case handling

| Situation | Handling |
| --- | --- |
| `git worktree list` fails during resolve | Existing behaviour: `Result` propagates, handler posts `error`, dialog keeps its empty path and `canConfirm` stays false |
| `rev-parse` fails for a detached ref | Existing behaviour: propagated as an error; no path is offered |
| Resolve response arrives after the dialog closed / superseded | Existing behaviour: promise rejects with `superseded`, caught and ignored |
| Derived path escapes the base dir | Fall back to the flat candidate, log a warning, no user-facing message (§3.2 step 6) |
| Both candidates collide with existing folders | Each is suffixed independently; boxes may show different suffixes, by design |
| User types an invalid branch name | Unchanged: `deriveRefNameField` shows the error and `canConfirm` is false; paths are still resolved and displayed |
| User edits the path, then edits the branch name | Both boxes silently reset to the new computed defaults |
| User edits the path, then switches radio | Discard confirmation; Cancel keeps both the selection and the text |
| Re-click on the already-selected radio | `decideStyleSwitch` returns `'ignore'` — no prompt, no state change |
| `rmdir` fails during prune (EPERM, ENOTEMPTY, locked on Windows) | That walk stops, one warning to the log, toast unchanged |
| Worktree removed from outside the base path | No parent prune at all |
| Removing a flat worktree | Its parent is the base dir, which is never deleted — prune is a no-op |
| Base dir cannot be resolved (`null`) | Prune and sweep are skipped; `worktreeList` sends `baseDir: null` and labels fall back to last-segment |
| Base dir does not exist on disk | Sweep is a no-op |
| Symlinked directory under the base dir | Never followed, never deleted |
| Configured style is an unrecognised string | `normalizeWorktreeFolderNameStyle` resolves it to `'nested'` |
| Setting write rejected | Error toast; link stays visible, which is accurate |
| Setting already defined in workspace settings | Write targets Workspace so the change actually takes effect |

---

## 6. Telemetry

**No new telemetry events.** Reviewed against the project's policy and deliberately declined (idea spec §10): no folder style, no link click, no discard outcome, no manual-edit flag. The existing `createWorktree` dialog-outcome tracking is unchanged, and the nested confirmation is constructed **without** a `telemetryId` so `ConfirmDialog` records nothing. `telemetry.json` needs no edit.

---

## 7. Tests

New:

- `src/__tests__/worktreeLeafName.test.ts` — per-segment sanitizing; flat output byte-identical to today's for a set of refs; `..`/`.`/empty segments dropped; backslash split; unicode and all-punctuation refs; `worktree` fallback; `isInsideBaseDir` accepting a child and rejecting a sibling, a prefix-sharing sibling (`base-other`), an escape, and the base dir itself; case-insensitive comparison on `win32`.
- `src/__tests__/emptyDirCleanup.test.ts` — `vi.mock('node:fs/promises')` as `GitWorktreeService.test.ts` already does. Parent walk stops at the base dir; never calls `rmdir` on the base dir; stops on `ENOTEMPTY` and on `EPERM`; skips a `startDir` outside the base dir; sweep deletes a two-level empty chain bottom-up; sweep leaves a directory containing a worktree alone; sweep skips symlinks; both no-op on a missing base dir.
- `webview-ui/src/utils/__tests__/worktreePathChoice.test.ts` — `isPathEdited` false for an untouched box and for type-then-undo; `decideStyleSwitch` returning each of the three verdicts; `saveDefaultLink` hidden when non-hierarchical, hidden when selected matches configured, visible with the right label otherwise.

Changed shared component:

- `ConfirmDialog` gains `focusConfirm?: boolean` (§4.2). Existing call sites are unaffected; no existing test should change.

Extended:

- `src/__tests__/GitWorktreeService.test.ts` — both paths returned for `feat/x`; `hierarchical` false for a single-segment ref and for detached mode; independent collision suffixes; suffix lands on the last segment; containment guard falls back to flat; `removeWorktree` prunes only on success and only with a base dir; `pruneWorktrees` sweeps only on success.
- `src/__tests__/worktreeHandlers.test.ts` — new resolve payload shape; `baseDir` present in `worktreeList`; remove and prune pass the resolved base dir; error paths unchanged.
- `src/__tests__/userSettings.test.ts` — default `'nested'`; unrecognised value normalized; the new key watched by the change listener.
- `webview-ui/src/utils/__tests__/worktreeDisplay.test.ts` — relative label inside the base dir, last-segment fallback outside it and when `baseDir` is null, Windows separators.

`pnpm lint`, `pnpm typecheck` and `pnpm test` must pass. The `themeColors` scan already fails the build on any hardcoded colour introduced by the new UI.

---

## 8. Documentation

- `docs/architecture.md` — entries for `src/services/worktreeLeafName.ts`, `src/utils/emptyDirCleanup.ts` and `webview-ui/src/utils/worktreePathChoice.ts`; amend the `GitWorktreeService`, `worktreeHandlers`, `worktreeDisplay` and `CreateWorktreeDialog` entries; refresh the "last reconciled" date.
- `CLAUDE.md` — add `utils/worktreePathChoice.ts` to *Shared Logic — Reuse, Don't Reimplement* (it is the only place the discard rule and the link's visibility rule are stated), and note that `worktreeFolderName` is base-dir-relative.
- `CHANGELOG.md` — feature entry.
- **What's New**: this release gets an entry crediting @nelson870708 for [#189](https://github.com/onlineeric/speedy-git-ext/issues/189) (idea spec §11). Per `CLAUDE.md`, the entry is written during the maintainer's What's New pass, not added unilaterally.

---

## 9. Implementation order

1. Shared types + `normalizeWorktreeFolderNameStyle`; `package.json` contribution; `ExtensionController` read and watch. *(Setting exists and round-trips; nothing uses it yet.)*
2. `worktreeLeafName.ts` + tests; swap `sanitizeLeafName` for it with `'flat'` hard-coded. *(No behaviour change — proves the extraction is faithful.)*
3. `resolveBaseDir` extraction; `resolveWorktreePath` returns both paths; message + handler + `rpcClient` shape change; dialog consumes `nestedPath`/`flatPath` but still shows one box. *(Contract in place, UI unchanged.)*
4. `worktreePathChoice.ts` + tests; dialog radios, two boxes, discard confirmation.
5. `setWorktreeFolderNameStyle` RPC, scope-aware write, the link.
6. `emptyDirCleanup.ts` + tests; wire into `removeWorktree` and `pruneWorktrees`.
7. `baseDir` in `worktreeList`; store field; `worktreeFolderName` relative labels.
8. Docs, changelog, manual pass on a light theme and on Windows separators.

Each step leaves the extension building and the test suite green.

---

## 10. Out of scope

- Moving or renaming existing worktrees.
- Migrating a repo's worktrees from one style to the other.
- Any change to `speedyGit.worktree.basePath` behaviour beyond its description text.
- A settings-dialog control for the new setting — `ViewSettingsDialog` covers columns and avatars only, and the dialog link plus the Settings UI are sufficient.

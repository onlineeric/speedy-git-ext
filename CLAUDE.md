# CLAUDE.md / AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

(If you are Codex CLI or other AI coding agents, this is loaded via AGENTS.md.)

## Build & Development Commands

```bash
pnpm build              # Build extension + webview
pnpm build:prod         # Production build (minified, no sourcemaps)
pnpm build:ext          # Build extension only (esbuild)
pnpm build:webview      # Build webview only (Vite)
pnpm watch              # Watch mode for both (uses concurrently)
pnpm lint               # ESLint (flat config) over the whole repo
pnpm typecheck          # TypeScript type checking (tsc --noEmit)
pnpm test               # Run unit tests (Vitest, run mode)
pnpm generate-test-repo # Generate deterministic test repo (see "Test Repository Location" below)
pnpm generate-submodule-repos # Generate test repos with submodules
pnpm ext:package        # Create .vsix package
pnpm ext:publish        # Publish to VS Code Marketplace (vsce) + Open VSX (ovsx)
```

### Test Repository Location

The test repos live **outside** this source tree, as siblings of it under `~/repos/`, deliberately
kept separate from the source folder:

| Path | Contents |
| --- | --- |
| `~/repos/test-repo` | Main deterministic test repo (`main`, `dev`, `feature-*`, `repro/*`) |
| `~/repos/test-repo-submodules` | Standalone source repos wired in as submodules (`repo-a`, `repo-b`, `test-repo`) |
| `~/repos/test-repo.worktrees` | Worktrees of the main test repo |

`.vscode/launch.json` already points at the correct location (`${workspaceFolder}/../test-repo`), so
"Run Extension" opens the right repo.

The generators resolve their output via `resolve(__dirname, '../..')` — `__dirname` is `scripts/`,
so this lands in `~/repos/`, not the project root. Do not assume `test-repo/` exists inside this
project — it does not.

> **Destructive:** `pnpm generate-test-repo` deletes and recreates the target repo. The current
> `~/repos/test-repo` contains hand-made state the generator does not reproduce (`repro-*.txt`,
> `stash-test-file.txt`, the `repro/feature` branch, worktrees). Back it up before regenerating.

Run a single test file or pattern with Vitest directly:

```bash
pnpm vitest run path/to/file.test.ts   # one file
pnpm vitest run -t "test name substring" # filter by test name
pnpm vitest                              # watch mode
```

To debug: use VS Code launch configs "Run Extension" or "Run Extension (Watch)" in `.vscode/launch.json`.

## Architecture

VS Code extension with **backend** (Node.js extension host) and **frontend** (React webview), communicating via VS Code's message passing API (`postMessage`/`onDidReceiveMessage`).

| Path | Role |
| --- | --- |
| `src/` | Backend — esbuild → `dist/extension.js` (CJS, node18) |
| `src/services/` | One `Git<Domain>Service` per git area; all repo-bound, all returning `Result<T, GitError>`. `GitExecutor` is the only place git is actually spawned (30s timeout) |
| `src/webview/` | Backend webview subsystem (see below) |
| `webview-ui/src/` | Frontend — Vite + React → `dist/webview/` |
| `shared/` | Types shared across the boundary: `types.ts`, `messages.ts` (RPC unions), `errors.ts` (`Result`/`GitError`), `gitRefValidation.ts`, `telemetry.ts` |

**`@shared/*` → `shared/*`** (configured in webview tsconfig, Vite, and vitest).

> **Full annotated file map: `docs/architecture.md`.** Not loaded into sessions — read it when you
> need to locate something by responsibility rather than by name. Prefer `Glob`/`Grep` for
> existence checks; the map can lag the filesystem.

**Keeping the map current (required).** `docs/architecture.md` only stays useful if it is updated in
the same change that moves the code. Whenever you **add, rename, delete, or repurpose** a file, update
its entry in `docs/architecture.md` before finishing the task — treat it like updating a test, not like
optional docs work. Also refresh the "last reconciled" date at the top of that file.

Additionally update **this** file when the change affects something an agent needs *before* reading any
code: a new `src/webview/` subsystem object, a new RPC convention, a new shared util or menu/dialog
primitive worth reusing (add it to *Shared Logic — Reuse, Don't Reimplement*), or a change to telemetry
policy, performance invariants, or the tech stack. Routine feature files belong only in
`docs/architecture.md` — keep this file about rules and orientation, not inventory.

### Data Flow

1. Backend services fetch git data via `GitExecutor`, return `Result<T, GitError>`
2. `WebviewPanelHost` receives the message and `WebviewMessageRouter` dispatches it to a domain handler in `webview/handlers/`; allowlisted user operations are wrapped once to record outcome and duration
3. UI-only telemetry uses the one-way `trackUiEvent` RPC; `telemetryHandlers` re-validates it and forwards it to the backend-only `TelemetryService`
4. Frontend `rpcClient` sends `RequestMessage`, updates Zustand store on response
5. Graph topology is computed entirely in the frontend (`graphTopology.ts`), not backend; its initial computation reports one bucketed performance event

### Webview Backend Conventions

The `src/webview/` subsystem was split out of a former ~2400-line `WebviewProvider`. Ownership is deliberate — put new state in the object that owns that concern:

- `WebviewProvider` — thin facade used by `ExtensionController`; composes everything below
- `WebviewPanelHost` — panel lifecycle, HTML/CSP/nonce, postMessage, visibility
- `WebviewRuntime` — mutable non-service state: repo path, filters, fetch generation, flags
- `GitServiceRegistry` — repo-bound git services, atomically replaced on repo switch
- `WebviewMessageRouter` — typed RPC dispatch + operation telemetry middleware
- `RefreshCoordinator` — *when* to load: initial/manual/auto, hidden-panel deferral
- `RepoDataLoader` — initial + deferred data, avatars, submodules
- `PersistedUIStateStore` — UI state + per-repo table layout (column-width healing)
- `OperationGuard` — in-progress checks (rebase/cherry-pick/revert/merge) → `GitError | null`
- `WhatsNewStore` — is this the first run on this version (`globalState`, dev mode always shows)
- `EditorCommandService` — VS Code diff/file/compare editors, worktree folder/reveal

Rules:

- **Add a new RPC**: add the type to `shared/messages.ts`, then register a handler in `WebviewMessageRouter`'s map — the `satisfies RequestHandlerMap` makes a missing handler a compile error (exhaustive dispatch).
- **Handlers must stay stateless about repos**: resolve git services via `context.services` (the `GitServiceRegistry`) *at request time*. Never capture a service instance at construction — repo switching and submodule navigation atomically replace the registry, so captured references go stale.
- **Don't pass the provider to handlers**: give them only what they need through `WebviewRequestContext`.
- **State ownership**: table layout is per-repo; other UI state is global.

### Shared Logic — Reuse, Don't Reimplement

These exist because the rule they encode is subtle or shared across several call sites. Their names don't reveal that, so check here before writing similar logic:

- `utils/refNameField.ts` — live ref-name validation state, error suppressed while the field is pristine. Used by Create Tag/Branch/Worktree/Remote dialogs
- `utils/commitMenuAvailability.ts` — which commit actions apply (rebase/reset/revert/drop/cherry-pick); shared by the commit row menu and the badge "Commit actions" submenu
- `utils/refBadgeContent.ts` — a ref badge's label, icons and tooltip. **The two branch glyphs are a system**: the fork means "exists locally", the cloud means "exists on a remote", so a branch that is both leads with the union (`⑂☁ main`) and the scheme is legible without hovering. Both glyphs *lead*, which keeps the cloud on the same side of the name in every badge and leaves the trailing slot to the worktree icon alone. Remote *names* live only in the tooltip; 2+ remotes add a count to the cloud (`⑂☁2 main`), because a badge should spend row width only on what can't be inferred. Adding a cloud that means anything else breaks the encoding
- `utils/commitRefs.ts` — identify a row by its ref decorations (`findHeadCommit`, `isStashPseudoCommit`); used by topology, the uncommitted node's parent, the tooltip and Go to HEAD
- `utils/headNavigation.ts` — pure "Go to HEAD" decision logic + its toast messages, covering **both halves**: `decideHeadNavigation` for the `locateHead` answer and `decideHeadContinuation` for each follow-up batch (including the attempt cap). Both return the same decision kinds, so `rpcClient` executes them through one function — a rule added to only one half puts the two back out of step
- `utils/commitReachability.ts` — branch reachability; checkers cached by commit-list identity (WeakMap)
- `utils/graphPaths.ts` — SVG elbow paths that cross row boundaries perfectly vertically, so per-row SVG cells join without kinks
- `utils/compareSlot.ts` / `compareDefaults.ts` / `compareDispatch.ts` / `compareMarker.ts` — the Compare panel's slot model, seeding, dispatch and per-row B/T badges
- `utils/branchSelection.ts` — `getBranchKey` (bare name vs `remote/name`) + additive select-all-local
- `utils/resolveDefaultRemote.ts` — pick `origin` else first-alpha remote
- `stores/graphSelectors.ts` — derived store reads (`useOperationInProgress`, `useCurrentLocalBranch`), one selector each so callers can't disagree on the derivation
- `utils/themeColors.ts` — **the one place a color *meaning* is named.** Semantic constants (`ADDED_COLOR`, `WARNING_COLOR`, `ACCENT_COLOR`, `UNCOMMITTED_COLOR`, `SIGNATURE_*`…) over `var(--vscode-*)` tokens, plus `tint()` for the faint chip/badge fill. They are plain CSS values for inline `style`, never class strings — Tailwind's JIT only emits classes it can see spelled out, so `text-[${SOME_COLOR}]` compiles to a class that never exists. A call site needing a pseudo-state pairs the inline color with a class carrying only the state (`opacity-70 hover:opacity-100`)
- `shared/types.ts` — cross-boundary setting clamps: `clampBatchCommitSize`, and `clampAvatarRefreshDays` (takes the input's raw string or a number; empty box means "keep current", not zero). A setting clamped on both sides belongs here, never once per side. `growBatchForTarget` sits beside them: how large a targeted "Go to HEAD" load may grow, so both rules bounding one batch stay together

### Avatars — Cache and Background Refresh

GitHub's avatar API is rate limited to 60 requests/hour **per IP** unauthenticated (shared across
everyone behind one corporate network) and 5000/hour per user once authorized. The subsystem exists
to spend that budget as rarely as possible:

- **Never look up an avatar on the commit-load path.** `RepoDataLoader` only reads the cache and
  posts what it has; misses go to `AvatarRefreshQueue`, which trickles at one lookup per
  `AVATAR_REFRESH_INTERVAL_MS`. Loading commits must never wait on the network for an avatar.
- **The cache is keyed by email and is account-scoped, not repo-scoped.** It deliberately survives
  repo switches and reloads (`resetRepoScopedState` clears only the owner/repo pair). Do not move it
  back under anything repo-bound.
- **All expiry/state decisions live in the pure `services/avatarCachePolicy.ts`** — expiry is derived
  from `lastRefreshAt + refreshDays` at read time and never stored, so the setting applies
  retroactively. No record is ever permanently written off; a failed or unresolvable email simply
  retries next cycle. `buildAvatarLookupCandidates` lives there too: which commits a batch offers per
  author, **oldest sighting first** — GitHub only knows *pushed* commits, and the newest rows are the
  ones most likely to be local-only, so reversing that order spends the rate limit on 422s.
- **The tracked rate limit belongs to an identity, not to the extension.** Authorizing swaps the
  60/hr budget shared by everyone behind one IP for the user's own 5000/hr one, so a spent budget and
  its reset time stop describing anything real — removing the token or a revoked session invalidates
  it just the same. `GitHubAuthService` is the only writer of the opt-in and so is what reports the
  flip, as the `granted`/`revoked` cases of `AvatarAuthChange`; `AvatarRefreshQueue.onIdentityChanged`
  then retires the budget and wakes the parked queue as one step. Any future path that changes who we
  authenticate as must report the flip the same way, or the queue sleeps — and the webview keeps
  showing "limit reached" — until a reset time that no longer governs anything.
- **A GitHub session is used only after explicit opt-in** (`GitHubAuthService`), never from a
  silently-available session — otherwise "Remove token" would be undone by the next lookup.
- **Results reach the webview in batches**, never one message per avatar, so a background refresh
  cannot cause a re-render storm during scrolling.
- **`AVATAR_CACHE_MAX_ENTRIES` is a storage budget, not a preference.** VS Code holds an extension's
  whole `globalState` as one JSON blob and warns past 512 KB; our records cost ~140 bytes each
  serialized (email key + avatar URL + two day numbers), so the 1000-entry cap lands near 140 KB, and
  the same blob also holds UI state and per-repo table layouts. Re-do the arithmetic before raising
  the cap or widening the record.
- The View settings dialog's open state lives in `graphStore` (`viewSettingsOpen`) because the Author
  column header's gear opens the same dialog.

### Submodules — A Gitlink Has No Content Here

A submodule is a tree entry with mode `160000` whose hash names a commit in the **submodule's**
object database, not this repo's. Git reports a changed submodule as an ordinary changed path, so
nothing distinguishes it from a file until you try to read it — and then every content read fails
("bad object"). Swallowing that failure as empty is what made issue #184's diff blank on both sides.

- **Never assume a changed path is a file.** `FileChange.isSubmodule` (set only when true) comes
  from `--raw`'s mode fields and porcelain v2's `S` field. It is why `getDiffFileChanges` and
  `compareRefs` use `git diff --raw` rather than `--name-status`: the mode is the only signal, and
  `--raw` carries it in the call we already make. `--raw`'s two shas are *not* usable — `git diff`
  abbreviates them, `diff-tree` does not, and the working-tree side is all zeroes.
- **Content reads answer with the pointer line.** `getCommitFile` / `getStagedFileContent` fall back
  to `Subproject commit <hash>` — what `git diff` itself prints — on the failure path only, so an
  ordinary diff pays no extra spawn. The diff editor derives the `-`/`+` from the two sides. Any new
  diff entry point routed through `GitShowContentProvider` inherits this for free; one that reads
  content its own way must handle gitlinks itself.
- **The working tree is a directory, so it needs the `worktree` URI sentinel** — `vscode.diff`
  cannot open a folder, and a `file://` URI there is the second half of the same bug. Resolve its
  pointer via `git submodule status`, **never** `git -C <path> rev-parse HEAD`: an uninitialized
  submodule is an empty directory, so rev-parse walks up and silently answers with the *parent*
  repo's HEAD. That side also carries git's `-dirty` suffix, taken from the parent status entry's
  `S<c><m><u>` field: a submodule is listed as changed whenever its checkout is dirty, pointer moved
  or not, so without the suffix both sides read the same hash and the diff looks blank again.

### Colors — Always Use VS Code Theme Tokens

**Every color in the webview must come from a `var(--vscode-*)` theme token.** The webview is
rendered inside the user's editor, and VS Code re-defines these tokens for whatever theme the user
picked. A hardcoded color (`text-sky-400`, `bg-gray-900/40`, `#E8A317`) stays fixed while everything
around it changes, so it looks correct in whichever theme it was written against and wrong in the
others — unreadable on light themes, off-brand on high-contrast ones.

- **Semantic colors**: take them from `utils/themeColors.ts` rather than writing a token inline —
  it names the *meaning* (added, deleted, warning, accent) so call sites don't each pick a different
  token for the same idea. Add a constant there when you need a meaning it doesn't cover yet.
- **Buttons**: use `buttonPrimaryClassName` / `buttonSecondaryClassName` / `buttonDangerClassName`
  from `components/dialogStyles.ts`. VS Code defines only the first two variants
  (`--vscode-button-*` and `--vscode-button-secondary*`); danger is built from `errorForeground` for
  destructive confirming actions. One primary or danger per dialog; secondary for everything else.
  **Never style a clickable control with no background** — it reads as a label until hovered.
- **Legitimate exceptions** must be marked in place with a `theme-color-exception:` comment naming
  the reason — on the line, or in the comment block above it. The bar is a color that has to contrast
  against a *user-configured* value rather than the theme: the graph lane palette
  (`speedyGit.graphColors`), `colorUtils.ts`'s luminance-picked label color, `worktreeBadgeStyle.ts`'s
  border, `gravatar.ts`'s generated `hsl()` and the white initials on it. Shadows and the `bg-black/50`
  dialog scrim are theme-independent by nature and need no marker.

`utils/__tests__/themeColors.test.ts` scans every `.ts`/`.tsx`/`.css` file under `webview-ui/src` and
fails on a Tailwind palette class (numbered, plus `white`/`black`), a raw hex, or an `rgb()`/`hsl()`/
`oklch()` — a hex is allowed only inside a `var(--token, #fallback)`. Exceptions are per-line, not
per-file, so a *new* hardcoded color in a file that already has a marked one still fails. It cannot
catch "a token, but the wrong one" — check that on a light theme.

Menu/dialog composition:

- `components/MenuItem.tsx` — a menu command; one `disabled`/`danger` prop drives both Radix behaviour and styling. The item class strings are **not** exported from `menuStyles.ts`, so this is the only way to render one
- `components/MenuContent.tsx` — `MenuContent`/`MenuSubContent`, the menu panel shell. Carries the height cap and collision padding that keep a long menu usable in a short window, so a new menu gets them by default. Only the width floor is a prop
- `components/useCommitMenuItems.tsx` — every commit action as `{ commitItems, compareItems, createItems, worktreeItem, copyItems, dialogs }`. Feeds the commit row menu (`variant: 'row'`) and the Commit/Create groups of ref badge menus (`variant: 'badge'`). Groups are returned separately so callers can interleave their own
- `components/LazyContextMenu.tsx` — mounts a menu's heavy body only on first right-click; keeps virtualized rows cheap during fast scrolling. Wrap new row menus in it
- `components/dialogStyles.ts` — shared dialog sizing, **the three button variants** (`buttonPrimaryClassName`/`buttonSecondaryClassName`/`buttonDangerClassName`, all composed from one base so shape and disabled behaviour cannot drift) `dialogSectionLabelClassName` for settings-group captions and `dialogOverlayClassName` for the scrim; every `Dialog.Content` uses `dialogContentClassName` + `dialogContentStyle`, and every `Dialog.Overlay` the overlay constant. Never hand-write a button's classes — the variants carry `disabled:` handling that inline copies kept getting wrong
- `components/ToolbarIconButton.tsx` — `TOGGLE_BUTTON_TONES` (`inactive`/`active`/`attention`), spread onto a toolbar button or a toolbar popover's trigger. Spread, not `className=`: the color is an inline style and only the hover state is a class
- `components/CompareMenuItems.tsx`, `MenuCopySubmenu.tsx`, `MenuGroupSeparator.tsx`, `MenuSubTrigger.tsx` — shared menu fragments
- `components/RefBadgeLegend.tsx` + `utils/refBadgeLegend.ts` — the "Badge Legend" section. Needs no props and no dialog context, so any dialog drops it in as `<RefBadgeLegend />`. Samples render through the real `RefLabel` in the graph's own lane-0 color, so the legend explains the badges the graph draws rather than a picture of them; a test asserts every `DisplayRef` type has a row
- `components/whatsNewEntries.tsx` — **release notes are added here and nowhere else.** One entry per version, matched by *exact* `package.json` version; a version with no entry shows no dialog, which is how a release opts out. Content is a `ReactNode`, so an entry can embed live UI (5.10.0 embeds `RefBadgeLegend`) rather than describing it. Opting out is the norm for a release with no new features — a fix-only patch should add no entry, so no dialog interrupts anyone. A test therefore cannot require an entry for the shipping version; it instead asserts every entry's version is an exact `N.N.N` string, which is what catches the typo that would otherwise mean no dialog ever
- `hooks/useDialogTelemetry.ts` — one confirmed/cancelled outcome per dialog open cycle
- `hooks/useCopyFeedback.ts` — `copyToClipboard` + short "copied" flash, used by every copy button

### Telemetry Requirements

- **Every new or enhanced feature must include a telemetry review and applicable instrumentation.** Track user-initiated Git operations and the approved UI surfaces: context-menu items, toolbar buttons, dialog outcomes, panel toggles, and column visibility changes. Do not track chatty/background interactions such as loading, scrolling, hovering, typing, or auto-refresh.
- **Allowed data**: fixed feature/action identifiers, success/error outcomes, standardized error codes, durations, dialog outcomes, reviewed boolean/enum settings, editor/OS/extension versions, simple counts, and coarse buckets for content-derived magnitudes such as commit counts.
- **Never collect**: repository/workspace names or paths, remote URLs, branch/tag/stash/worktree names, commit hashes/messages/diffs, author details, Git configuration, file names/paths, raw Git output, exception messages/stacks, search/filter values, or anything entered by the user. Hashing or encoding this data is still forbidden.
- Use only the closed catalogs and existing telemetry helpers in `shared/telemetry.ts`; never send free-form values. Keep telemetry fire-and-forget, consent-gated, and failure-isolated. Update `telemetry.json` and focused tests when telemetry coverage changes.

### Performance Design

- Virtual scrolling: 28px rows, configurable overscan (default 50, range 0-200)
- Batch prefetch: 500 commits default (configurable via `speedyGit.batchCommitSize`)
- Graph topology pre-computed once; passing lanes stored for O(1) render lookup
- `CommitTableRow` memoized to prevent unnecessary re-renders

## Key Design Decisions

- **Performance first** — fast, responsive UX is the top priority
- Extension backend uses **esbuild** (fast CJS for Node); webview uses **Vite** (ESM, React)
- Graph topology computed in webview, not backend
- TypeScript **strict mode** with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- Uses **`Result<T, E>`** pattern instead of throwing exceptions in git operations
- UI state persisted via VS Code `context.globalState`; application state is transient (Zustand, session-only). Persistent settings via VS Code config (e.g. `speedyGit.worktree.basePath`)
- Telemetry is privacy-first and allowlist-only: fixed catalogs, backend-only transmission, dual consent, fire-and-forget, and no repository/user content

## Tech Stack

- **TypeScript 5.x** (strict) — both backend and frontend
- **React 18** + **Zustand** + **Tailwind CSS** — webview UI; VS Code Extension API 1.80+
- **Radix UI** — context menus, dialogs, popovers, alert dialogs
- **@tanstack/react-virtual** — virtual scrolling
- **@dnd-kit** — drag-and-drop (column reorder, interactive rebase)
- **react-datepicker 9.x** + **date-fns 4.x** — date range filtering
- **@vscode/extension-telemetry** — consent-aware transport to Azure Application Insights
- **Vitest** — unit testing; tests live in `__tests__/` beside the code they cover

## Restrictions

- **Packages**: NEVER auto-install; provide install commands for me to run manually
- **Git**: NEVER commit or merge; only readonly operations (`git log`, `git status`, `git diff`) and create PR, create branch only if I ask you to do so, or if speckit workflow requires it.

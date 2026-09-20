# Implementation Spec — Multiple Speedy Git Graph Tabs (issue #195)

**Target version:** 5.17.0 (bump `package.json` as part of Task 15).
**Design source:** `specs/gh-issue195-idea.md`. Every product decision is settled there; read it for the
*why*. This doc is the *how*.
**Delivery:** one release, all tasks together. Multi-tab is not shippable in halves — a tab registry
sitting on top of a global watcher and a global diff service is worse than today's single panel. Tasks
are ordered so the shared foundations (repo identity, extension-wide singletons, per-tab ownership)
land before anything user-visible.

**Decisions taken for this spec** (asked and confirmed 2026-09-20, extending the idea spec's decision log):

| Question | Decision |
| --- | --- |
| Cross-tab busy state | Coarse mirror: extension-wide activity registry keyed by working tree; peers get a `peerActivity` broadcast that disables mutating UI. No new lock — git still decides conflicts. |
| Stale-dialog revalidation | Backend-enforced. The webview sends the ref position it displayed; the handler re-resolves immediately before acting and answers `refMoved` instead of acting. |
| A tab's repository leaves the workspace | Retarget that tab to the first remaining repo (today's single-panel behaviour), with one notification per removal, not one per tab. |
| Refresh routing | Shared `--git-common-dir` + submodule parents. One extension-wide watcher hub, ref-counted per common git dir. |
| Repo selector / saved default | Per-tab selection; `GitRepoDiscoveryService.activeRepoPath` is retained but demoted to *saved default* (seeds the next first-opened graph only). |
| What's New entry | Not written now. A pre-release What's New pass with the maintainer is a required release step (Task 15). |
| Keybinding for the new command | None. Toolbar button + Command Palette only; `Ctrl/Cmd+Shift+G` keeps meaning "open/return to Speedy Git". |

### Simplifications taken (2026-09-20)

Deliberate low-effort choices, so a later reader does not mistake them for oversights:

- **Window reload needs no code.** No `WebviewPanelSerializer`; VS Code silently drops webview tabs it
  cannot restore, which *is* the session-only behaviour the idea spec wants.
- **No watcher fallback set.** Absolute `RelativePattern` with recursive globs is supported at our
  `^1.85.0` floor. If an event is ever missed, the `vscode.git` subscription and manual refresh cover
  it — a missed event means "refresh is a click away", never wrong data.
- **Stale-ref revalidation is one app-level dialog**, not five modified dialogs: the backend echoes the
  refused request back and `RefMovedDialog` re-sends it. The five dialogs each add one payload field
  and nothing else.
- **Avatar dedupe already exists** (`AvatarRefreshQueue`'s `queued` Set); the task adds a regression
  test, not a mechanism.

> **Note on the repo-removal decision.** Retargeting contradicts the idea spec's "merely returning to a
> graph must not retarget its repository" spirit, and it discards that tab's investigation. It is
> specified as chosen; Task 7 keeps it to the narrowest form (only tabs displaying the removed repo, one
> notification, nothing else touched) so it can be reversed later without re-architecting.

## Conventions every task follows

- **Pure logic in a util with Vitest tests**, components and services stay thin. Every routing,
  identity and revalidation *decision* in this spec is a pure function, because there is no way to
  integration-test webview panels in this repo.
- **RPCs:** add the type to `shared/messages.ts`, register the handler in the `WebviewMessageRouter`
  map (`satisfies RequestHandlerMap` makes a missing one a compile error), and resolve services via
  `context.services` **at request time**. This rule becomes load-bearing here: repo switching,
  submodule navigation *and now tab identity* all depend on it.
- **Handlers stay tab-agnostic.** A handler never learns "which tab am I" beyond what
  `WebviewRequestContext` gives it. Anything cross-tab goes through a context method
  (`context.openNewGraphTab()`, `context.beginRepoActivity()`), never through a registry import.
- **Theme tokens only**; buttons via the shared variants; notices via `dialogWarningClassName`.
- **Telemetry review per task** where the task adds a user-initiated surface (Tasks 13, 14).
- **Docs in the same change:** `docs/architecture.md` for every file added, renamed or repurposed (plus
  its "last reconciled" date), and `CLAUDE.md` for the new orientation rules and shared utils.
- Run `pnpm typecheck`, `pnpm lint` and `pnpm test` at the end of each task.

---

## Task 1 — Repository identity (`gitDir` / `commonGitDir` / `topLevel`)

**Goal:** one answer to "are these two paths the same working tree, the same object store, or a
submodule of one another". Everything in Tasks 8 and 10 routes on it.

### New `shared/repoIdentity.ts` (pure)

```ts
export interface RepoIdentity {
  /** The path the tab was opened on — the key callers hold. */
  repoPath: string;
  /** `git rev-parse --absolute-git-dir` — per working tree. Identifies THE WORKING TREE. */
  gitDir: string;
  /** `git rev-parse --git-common-dir`, absolutised. Shared by a repo and its linked worktrees. */
  commonGitDir: string;
  /** `git rev-parse --show-toplevel`. */
  topLevel: string;
}
```

Pure predicates, all operating on already-normalised strings:

- `normalizeRepoPath(p: string): string` — `path.resolve`, strip a trailing separator, and on
  `win32` lowercase the drive letter **only** (never the whole path: Linux paths are case-sensitive and
  lowercasing them would merge distinct repos).
- `isSameWorkingTree(a, b)` → `a.gitDir === b.gitDir`.
- `sharesObjectStore(a, b)` → `a.commonGitDir === b.commonGitDir`. True for a repo and each of its
  linked worktrees. This is the refresh-routing key.
- `isPathInside(parent: string, child: string): boolean` — normalised containment, `false` when equal,
  `false` for a sibling whose name merely starts with the parent's (`/a/repo2` is not inside `/a/repo`).
- `isSubmoduleOf(parent: RepoIdentity, child: RepoIdentity)` → `isPathInside(parent.topLevel, child.topLevel)`.
  Deliberately a *path* test, not a `.gitmodules` read: a nested repo that is not a registered submodule
  still changes the parent's `git status`, which is exactly what the parent tab renders.

**Case handling.** Comparisons use `process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b`
via a single exported `pathsEqual(a, b)`; every predicate above routes through it, so the rule exists once.

### New `src/services/GitRepoIdentityService.ts`

- One method, `resolve(repoPath: string): Promise<Result<RepoIdentity>>`, running a single spawn:
  `git rev-parse --absolute-git-dir --git-common-dir --show-toplevel`.
  `--absolute-git-dir` (git 2.13) and `--git-common-dir` both exist well below our floor;
  `--git-common-dir` may answer a **relative** path (`.` for a plain repo), so resolve it against
  `gitDir` — not against `cwd`.
- Extension-wide **cache** `Map<normalizedRepoPath, RepoIdentity>`, populated on first use and kept for
  the session. A repo's git dir does not move under a running window; the only case that would
  invalidate it (a `.git` file rewritten by `git worktree repair`) is rare enough to accept until the
  window reloads. `invalidate(repoPath)` exists for tests and for the repo-removed path.
- In-flight coalescing: concurrent `resolve` calls for one path share one promise (two tabs opening the
  same repo at once must not spawn twice).

### Error handling

| Situation | Behaviour |
| --- | --- |
| Path is not a git repo | `Result` error `COMMAND_FAILED`. Callers treat an unresolvable identity as "routes to nothing": the tab still loads (every service is path-bound and will surface its own error), it simply gets no watcher subscription and no peer-busy mirroring. Never throw out of the watcher hub. |
| Bare repository | `--show-toplevel` is empty. Store `topLevel: ''`; `isSubmoduleOf` with an empty `topLevel` is `false` by the `isPathInside` empty-parent guard. |
| Unborn branch (no commits) | `rev-parse` still answers all three; nothing special. |
| Symlinked repo path | Not resolved with `fs.realpath`. Git itself answers with the path it was given, and `GitRepoDiscoveryService` already documents that it does not merge symlink aliases; diverging here would make two tabs on the two spellings route differently from how VS Code lists them. Accepted, documented in the file header. |

### Tests — `src/__tests__/repoIdentity.test.ts`

`isPathInside` (nested, equal, sibling-prefix, trailing separators, `..` segments), `pathsEqual` on both
platforms (mock `process.platform`), `sharesObjectStore` for a worktree pair, `isSubmoduleOf` for a
submodule inside a worktree, empty-`topLevel` bare repo, and Windows drive-letter casing.
`src/__tests__/GitRepoIdentityService.test.ts`: relative `--git-common-dir` resolution, coalescing, cache
hit, failure passthrough.

---

## Task 2 — Extension-wide singletons

**Goal:** the things that must exist exactly once stop being owned by the panel. Constraint 1 of the
idea spec.

### New `src/ExtensionServices.ts`

A plain container constructed once in `ExtensionController`, holding and disposing:

| Member | Why it is here |
| --- | --- |
| `log`, `telemetry`, `context` | Already single. |
| `repoDiscovery: GitRepoDiscoveryService` | Already single; `activeRepoPath` demoted to *saved default* (Task 6). |
| `avatarCache: AvatarCacheStore` | Account-scoped storage budget; N tabs must not mean N caches. |
| `avatarAuth: GitHubAuthService` | N tabs must not register N session listeners or run N `initialize()` calls. |
| `avatarService: GitHubAvatarService` | Holds the tracked rate limit, which belongs to an identity, not a panel. |
| `avatarQueue: AvatarRefreshQueue` | One trickle at `AVATAR_REFRESH_INTERVAL_MS`, for the whole window. |
| `whatsNew: WhatsNewStore` + `whatsNewOfferedThisSession: boolean` | The "first graph of this session only" rule (idea spec §8). |
| `identities: GitRepoIdentityService` | Task 1. |
| `watcherHub: GitWatcherHub` | Task 8. |
| `activity: RepoActivityRegistry` | Task 10. |
| `diffServices: Map<string, GitDiffService>` | Task 9's content-provider resolver. |

`ExtensionServices` takes a `broadcast: (message: ResponseMessage) => void` and
`reloadAll: () => void`, both wired to the tab registry by `ExtensionController` after construction
(the registry needs the services, so the edge is closed by setters, not by the constructor).

### Avatar wiring changes

- `AvatarRefreshQueue`'s `postAvatarUrls` becomes `broadcast({ type: 'avatarUrls', … })` — every open
  tab receives the same batch. Batching semantics are unchanged, so a background refresh still cannot
  cause a re-render storm; it now just reaches N webviews instead of one.
- `onDidRateLimitChanged` → `broadcastAvatarAuthState()`, which posts `avatarAuthState` to every tab.
- `onAvatarAuthChanged(change)`: the existing logic moves verbatim into `ExtensionServices`
  (`'refreshed'` still does **not** retire the budget or reopen cached answers), except that
  `reopenUnresolved()` producing entries now calls `reloadAll()` instead of one coordinator's `reload()`.
- `avatarAuth.initialize()` runs exactly once, at `ExtensionServices` construction — not on tab open.
- Hydration stays per tab: `RepoDataLoader` continues to read the cache and enqueue misses for its own
  commit batch. Two tabs on one repo enqueue the same emails, and `AvatarRefreshQueue.enqueue` already
  drops duplicates through its `queued: Set<string>` — so the singleton queue spends the rate limit once.
  No change needed; add one regression test asserting it, since it is now load-bearing.

### Lifetime

`ExtensionServices` is disposed only on extension deactivate. Closing the last graph tab does **not**
dispose the avatar cache (it flushes on dispose, and the account-scoped cache must survive reopening),
and does not dispose the auth service. Watcher subscriptions *are* released by refcount as tabs close
(Task 8), so no filesystem watchers survive the last tab.

### Tests

`src/__tests__/ExtensionServices.test.ts`: one `initialize()` per session; an `avatarUrls` batch reaches
every registered tab; `granted` reopens and reloads all, `refreshed` does neither; rate-limit change
broadcasts to all.

---

## Task 3 — `GraphTab`: everything view-scoped in one object

**Goal:** the current `WebviewProvider` becomes a per-tab object; nothing view-scoped is left on
`ExtensionController`. Constraint 2, first half.

### Renames and moves

- `src/webview/WebviewProvider.ts` → **`src/webview/GraphTab.ts`**, class `GraphTab`. Delete the
  compatibility re-export `src/WebviewProvider.ts` (nothing outside this refactor uses it; verify with
  a grep in the task).
- **New `src/webview/createGitServices.ts`**: `createGitServices(repoPath: string, log): GitServiceSet`.
  This replaces the 15-line `reinitServices` block in `ExtensionController` *and* the 15-argument
  `WebviewProvider` constructor *and* the 15-argument `updateServices`. Adding a service becomes a
  one-line change in one file.
- `GraphTab` constructor signature:

  ```ts
  constructor(opts: {
    readonly id: string;              // stable per tab, for the activity registry and logs
    readonly shared: ExtensionServices;
    readonly initialRepoPath: string;
    readonly viewColumn: vscode.ViewColumn;
    readonly getSettings: () => UserSettings;
    readonly onDisposed: (id: string) => void;
    readonly onActivated: (id: string) => void;
    readonly openNewGraphTab: (origin: GraphTab) => void;
  })
  ```

- Moved **onto** `WebviewRuntime` from `ExtensionController`:
  - `submoduleStack: SubmoduleNavEntry[]` and `submoduleNavigating: boolean`;
  - `topLevelRepoPath: string` — the tab's selected repository *before* any submodule navigation. This
    is what the repo selector shows, what `Open New Graph Tab` seeds a new tab with, and what
    `openForRepo` matches against. `currentRepoPath` remains "what is displayed".
  - `identity: RepoIdentity | null` — resolved for `currentRepoPath` after each repo change; drives
    watcher subscription and busy mirroring.
- `GraphTab.setDisplayedRepo(repoPath, { isSubmodule })`:
  1. `runtime.beginNavigation()`;
  2. `services.update(createGitServices(repoPath, log))`;
  3. `runtime.resetRepoScopedState(repoPath)`; `uiStateStore.reloadRepoLayout()` (Task 12);
  4. `dataLoader.resetRepoScopedState()`;
  5. re-resolve `runtime.identity`, re-subscribe the watcher (Task 8), update `panel.title` (Task 5);
  6. reload.
  `setTopLevelRepo(repoPath)` does the same and additionally clears `submoduleStack`, sets
  `topLevelRepoPath`, and (for an explicit user switch only) writes the saved default.

### Ownership table — what lives where after this task

| Per `GraphTab` | Extension-wide (`ExtensionServices`) |
| --- | --- |
| `WebviewPanelHost`, `WebviewRuntime`, `GitServiceRegistry`, `PersistedUIStateStore`, `RepoDataLoader`, `RefreshCoordinator`, `EditorCommandService`, `OperationGuard`, `WebviewMessageRouter` | `GitRepoDiscoveryService`, `TelemetryService`, avatar cache/auth/service/queue, `WhatsNewStore`, `GitRepoIdentityService`, `GitWatcherHub`, `RepoActivityRegistry`, diff-service map |

### `WebviewRequestContext` additions

`tabId: string`, `getTopLevelRepoPath(): string`, `getIdentity(): RepoIdentity | null`,
`openNewGraphTab(): void`, `beginRepoActivity(op: TrackedOperation): vscode.Disposable`,
`setSavedDefaultRepo(repoPath: string): void`. Handlers get these and nothing else — no registry, no
`GraphTab`.

### Disposal

`GraphTab.dispose()` disposes the panel host, the watcher subscription, any held activity token, and
the router; it does **not** dispose anything in `ExtensionServices`. It aborts nothing: per the idea
spec, an in-flight operation started from this tab runs to completion, and its result simply has no
webview to post to (`WebviewPanelHost.postMessage` already no-ops once `panel` is `undefined`).

### Edge cases

- **Leak fixed in passing:** `WebviewPanelHost` currently pushes `onDidReceiveMessage` into
  `context.subscriptions`, which with N tabs never releases. The host keeps its own disposables array
  and disposes it on panel dispose (Task 5).
- **`handlePanelDisposed`'s submodule unwind** (reset the *global* services back to the parent repo)
  disappears — there is no global service set left to unwind. Delete it.
- **`activeCompareController` / `activeCommitController`** stay per-runtime, so two tabs can each have
  one in flight; the "only one commit at a time" comment on `activeCommitController` is now "only one
  *per tab*", and cross-tab serialisation is Task 10's job plus git's index lock. Update the comment.

### Tests

`src/__tests__/createGitServices.test.ts` (every member present, all bound to the given path);
`src/__tests__/WebviewRuntime.test.ts` extended for `topLevelRepoPath`, the submodule stack and
`identity` reset. Existing `WebviewProvider.test.ts` is renamed `GraphTab.test.ts` and must stay green.

---

## Task 4 — `GraphTabRegistry` and its pure routing rules

**Goal:** the set of open tabs, their MRU order, and every "which tab(s)?" answer. Constraint 2, second
half.

### New `shared/graphTabRouting.ts` (pure — all the decisions, none of the VS Code objects)

```ts
export interface TabSnapshot {
  id: string;
  topLevelRepoPath: string;
  displayedRepoPath: string;
  identity: RepoIdentity | null;
  /** Monotonic counter, bumped whenever the tab becomes the active editor. */
  lastActiveSeq: number;
}

/** Ordinary Open: the most recently active tab, or null when none is open. */
export function pickReturnTarget(tabs: TabSnapshot[]): TabSnapshot | null;

/** SCM "Open in Speedy Git": most recently active tab whose TOP-LEVEL repo is this one. */
export function pickRepoTarget(tabs: TabSnapshot[], repoPath: string): TabSnapshot | null;

/** Which tabs a change in `changed` must wake. */
export function tabsAffectedByChange(tabs: TabSnapshot[], changed: RepoIdentity): TabSnapshot[];

/** Which tabs must show "another view is busy" while `origin` runs an operation. */
export function peersSharingWorkingTree(tabs: TabSnapshot[], origin: TabSnapshot): TabSnapshot[];
```

`tabsAffectedByChange` returns a tab when **either**:
1. `tab.identity && sharesObjectStore(tab.identity, changed)` — same repo, or a sibling linked worktree
   (shared refs/objects); **or**
2. `tab.identity && isSubmoduleOf(tab.identity, changed)` — the tab shows a parent whose submodule moved,
   so its gitlink status changed.

Deliberately **not** the reverse: a parent's own commit does not change the submodule's history, so a
submodule tab is not woken by parent activity. A tab with a null identity is never woken by routing; it
still refreshes on manual refresh and on the `vscode.git` API event for its own path.

`pickRepoTarget` matches on `topLevelRepoPath`, not `displayedRepoPath`: a tab currently displaying a
submodule of X is still "a graph for X", and revealing it must not retarget it (idea spec §4).

### New `src/GraphTabRegistry.ts`

- `Map<string, GraphTab>` plus a monotonic `activationSeq`.
- `onActivated(id)` (fed from `WebviewPanelHost`'s `onDidChangeViewState` when `panel.active`) bumps
  `lastActiveSeq`. Creation also bumps it, so a brand-new tab is the MRU target immediately.
- `create(opts): GraphTab`, `get(id)`, `snapshots(): TabSnapshot[]`, `count()`,
  `broadcast(message)`, `reloadAll()`, `dispose()`.
- `onDisposed(id)` removes the entry; the MRU order needs no repair because it is derived from
  `lastActiveSeq` at read time.

### Edge cases

- **Tie on `lastActiveSeq`** cannot happen (monotonic counter), so "if the ordering is unavailable,
  reveal any remaining graph" (idea spec §4) is satisfied structurally rather than by a fallback branch.
- **A tab that has never been active** (created with `preserveFocus`, or created while the window was
  in the background) still has its creation-time seq, so it is ordered behind anything focused since.
- **`panel.active` vs `panel.visible`**: MRU uses `active` (focused), refresh deferral uses `visible`.
  Both come from the same `onDidChangeViewState` and must not be conflated — a tab visible in a
  split group is not the return target.

### Tests — `shared/__tests__/graphTabRouting.test.ts`

Empty list; MRU after a sequence of activations; `pickRepoTarget` preferring MRU among several matches
and matching a tab that is currently *displaying a submodule* of the named repo; `tabsAffectedByChange`
for (a) same repo, (b) sibling worktree via shared `commonGitDir`, (c) parent-of-changed-submodule,
(d) *not* the submodule when the parent changes, (e) unrelated repo, (f) null identity;
`peersSharingWorkingTree` excluding the origin tab and excluding a sibling worktree (different `gitDir`,
so a different working tree — a checkout there is not this tab's checkout).

---

## Task 5 — `WebviewPanelHost` for many panels

**Goal:** remove every single-panel assumption.

- Drop the `if (this.panel) { reveal(); return; }` short-circuit and the fixed `ViewColumn.One`.
  `create(opts: { viewColumn: vscode.ViewColumn; title: string; callbacks })` always creates.
  `reveal(preserveFocus = false)` reveals in the column the panel currently occupies —
  `this.panel.reveal(undefined, preserveFocus)`, passing `undefined` so VS Code keeps the panel where
  the user dragged it (idea spec §4: "revealing a graph keeps it in whichever editor group it currently
  occupies").
- `setTitle(title: string)` → `panel.title`. Called on creation and on every repo/submodule change.
- Callbacks change: `onVisibilityChanged(visible)` → `onViewStateChanged({ visible, active })`.
- All panel subscriptions (`onDidReceiveMessage`, `onDidChangeViewState`, `onDidDispose`) go into a
  private `disposables: vscode.Disposable[]` disposed in `onDidDispose` and in `dispose()` — never into
  `context.subscriptions`.
- `iconPath`, CSP, nonce, `localResourceRoots`, `retainContextWhenHidden: true` are unchanged and now
  apply per panel.

### Title rule (idea spec §8)

`panelTitleFor(displayedRepoPath: string): string` — a pure helper in `shared/graphTabRouting.ts` —
returns `path.basename(displayedRepoPath)`. Deliberately the **basename**, not `RepoInfo.displayName`:
`displayName` becomes a relative path for same-named repos, and the product decision is short titles
with identical names accepted. A submodule displayed as `dev › sub-mod1` therefore titles as `sub-mod1`
for free, since the displayed path ends in the submodule directory. Empty path → `'Speedy Git'`.

### Edge cases

| Situation | Behaviour |
| --- | --- |
| Origin tab is hidden, so `panel.viewColumn` is `undefined` | Fall back to `vscode.ViewColumn.Active`. Cannot happen for the toolbar button (the origin is focused) but can for the Command Palette command firing while the MRU graph sits in a background group. |
| Window reload | No `WebviewPanelSerializer` is registered, and none is added. VS Code silently drops webview tabs it cannot restore, which is exactly the session-only behaviour the idea spec asks for. Nothing to build. |
| `postMessage` to a disposed panel | Already safe (`this.panel?.`). Keep, and add a test. |

### Tests — `src/__tests__/WebviewPanelHost.test.ts` (extend)

Two hosts create two panels; `create` no longer reveals an existing one; `reveal` passes `undefined`
for the column; `setTitle` writes `panel.title`; every subscription is disposed on panel dispose and
none is pushed into `context.subscriptions`; `postMessage` after dispose is a no-op.

---

## Task 6 — Open, return, new tab: `ExtensionController` rewritten

**Goal:** the three entry points behave exactly as idea spec §4 describes.

`ExtensionController` keeps: repo discovery, the status bar, the settings listener and reader, session
telemetry. It loses: every `git*Service` field, `currentRepoPath`, `submoduleStack`,
`submoduleNavigating`, `contentProviderRegistration` (moves to `activate()`, Task 9), and
`gitWatcherService` (becomes the hub in `ExtensionServices`).

### `showGraph(trigger: 'command' | 'scmButton' | 'statusBar' = 'command')`

```
target = pickReturnTarget(registry.snapshots())
if (target) { target.reveal(); return; }      // no reload, no retarget, no panelOpened telemetry
createTab({ repoPath: savedDefaultRepo(), viewColumn: ViewColumn.Active, trigger })
```

`savedDefaultRepo()` = `repoDiscovery.getActiveRepoPath()`, else `workspaceFolders[0].fsPath`, else the
existing "No workspace folder open" error message. Unchanged discovery rules; only the *name* of what
`activeRepoPath` means changes.

### `openForRepo(sourceControl)` — repository-aware

```
repoPath = sourceControl.rootUri?.fsPath; if (!repoPath) return
repoDiscovery.setActiveRepo(repoPath)                  // this IS an explicit switch → saved default
target = pickRepoTarget(registry.snapshots(), repoPath)
if (target) { target.reveal(); return; }               // never retarget, never reload
createTab({ repoPath, viewColumn: ViewColumn.Active, trigger: 'scmButton' })
```

The whole `panelWasOpen && repoChanged → sendRepoList + reload` block in today's `openForRepo` is
deleted: a revealed tab is never reloaded, and a created tab loads as part of creation.

### `openNewGraphTab(trigger: 'toolbarButton' | 'commandPalette')`

```
origin = pickReturnTarget(registry.snapshots())
repoPath  = origin ? origin.topLevelRepoPath : savedDefaultRepo()
viewColumn = origin?.viewColumn ?? ViewColumn.Active
createTab({ repoPath, viewColumn, trigger })
```

No picker, no confirmation, duplicates of the same repo permitted. The new tab seeds from normal
defaults: it does **not** copy the origin's filters, search, selection or scroll.

### `createTab(...)` — the one creation path

1. `new GraphTab({...})` with a fresh `id` (`randomUUID()`);
2. register it (which makes it MRU);
3. **What's New:** offer only when `!shared.whatsNewOfferedThisSession`; set the flag to `true`
   whenever a tab is created, whether or not the dialog qualified — "the first graph opened" is the
   rule, not "the first graph that had something to show";
4. `sendRepoList(repos, thisTab.topLevelRepoPath)` (Task 7);
5. `sendSettingsData(readUserSettings())`;
6. subscribe to the watcher hub (Task 8);
7. `refreshCoordinator.reload()`;
8. `telemetry.sendPanelOpened(trigger, toTabCountBucket(registry.count()))` — **only here**. A reveal is
   never a `panelOpened`.

### Status bar and keybinding

`speedyGit.showGraph` keeps its command id, its `Ctrl/Cmd+Shift+G` binding and the status bar item, and
now means "return to the most recently active graph, or open the first one". The status bar passes
`'statusBar'` as its trigger (a new catalog value, Task 14) instead of masquerading as `'command'`.

### Edge cases

| Situation | Behaviour |
| --- | --- |
| No workspace folder and no discovered repo | Today's `showErrorMessage('Speedy Git: No workspace folder open')`, before any tab is created. `openNewGraphTab` with no origin hits the same path. |
| `openForRepo` for a repo VS Code knows but discovery does not list yet | `setActiveRepo` logs and no-ops for an unknown path (existing behaviour). Create the tab anyway on the SCM-supplied path — the services are path-bound and the SCM provider is authoritative about its own root. |
| Two rapid `Open New Graph Tab` clicks | Each creates a tab; both load. No debounce — immediate creation is the product requirement. |
| Extension deactivate | `registry.dispose()` disposes every tab, then `ExtensionServices.dispose()`. |

### Tests — `src/__tests__/ExtensionController.test.ts` (extend)

With the registry stubbed: `showGraph` reveals instead of creating when a tab exists, and emits no
`panelOpened`; `showGraph` with no tabs creates one on the saved default; `openForRepo` reveals a tab
whose *top-level* repo matches even while it displays a submodule, and creates one otherwise, and never
calls `setDisplayedRepo` on an existing tab; `openNewGraphTab` uses the origin's top-level repo and view
column; What's New is offered on the first created tab only.

---

## Task 7 — Per-tab repo list, saved default, and repo removal

**Goal:** the selector inside each tab reflects *that* tab.

- `GraphTab.sendRepoList()` posts `{ repos: discovery.getRepos(), activeRepoPath: runtime.topLevelRepoPath }`.
  The webview's `setRepos` contract is unchanged — `activeParentRepoPath` now just means "this tab's
  parent repo" — so `graphStore` needs no change beyond a comment.
- `submoduleHandlers.switchRepo` (an explicit user switch): `context.setSavedDefaultRepo(repoPath)`,
  then `tab.setTopLevelRepo(repoPath)`, then `sendRepoList` **for this tab only**. Other tabs are not
  notified and not reloaded.
- `submoduleHandlers.displayRepo` (submodule navigation): never touches the saved default, never
  notifies other tabs. `runtime.isDisplayingSubmodule` and the title update follow the displayed path.
- `discovery.onDidChangeRepos` → for **each** tab, `tab.sendRepoList()` (each with its own selection).

### Repo removed from the workspace (chosen behaviour: retarget)

In `GitRepoDiscoveryService`, move the user-facing notification out of the service and into the
controller, so it fires once per removal rather than once per affected tab:

1. Discovery updates `_repos`; if the saved default is gone it falls back to `repos[0]` (existing code,
   minus the `showInformationMessage`).
2. The controller computes the affected tabs = those whose `topLevelRepoPath` **or**
   `displayedRepoPath` is the removed path or inside it (so a tab sitting in a submodule of the removed
   repo is caught too).
3. If `repos.length > 0`: each affected tab does `setTopLevelRepo(repos[0].path)` → full reload, filters
   reset via the existing `parentChanged` branch in `setRepos`. One
   `showInformationMessage('Speedy Git: Repository "X" was removed. Switched to "Y".')`, naming the
   count when more than one tab moved.
4. If `repos.length === 0`: leave every tab exactly where it is — there is nothing to retarget to, and
   the git data is still on disk. Post `repoList` with an empty list so the selector empties.
5. Unaffected tabs get a plain `sendRepoList()` and nothing else.

### Tests — `src/__tests__/GraphTab.repoList.test.ts`

Each tab receives its own `activeRepoPath`; `switchRepo` writes the saved default and leaves peer tabs
untouched; `displayRepo` leaves the saved default alone; repo removal retargets only affected tabs
(including a tab displaying a submodule of the removed repo), notifies once, and is a no-op when no
repos remain.

---

## Task 8 — `GitWatcherHub` and refresh routing

**Goal:** one watcher set per object store, changes routed to the tabs they affect, and the
linked-worktree/submodule `.git`-is-a-file bug fixed. Constraint 3.

### New `src/services/GitWatcherHub.ts` (replaces `GitWatcherService`)

```ts
subscribe(repoPath: string, onChange: (changed: RepoIdentity) => void): vscode.Disposable
```

- Resolves the identity (Task 1), then joins or creates the **watcher set for `identity.commonGitDir`**,
  ref-counted. Disposing the last subscription for a common dir disposes its watchers.
- Watch patterns, all built with `new vscode.RelativePattern(vscode.Uri.file(dir), pattern)` against the
  **resolved** directories — never `<repo>/.git/...`:

  | Base | Patterns | Why |
  | --- | --- | --- |
  | `identity.gitDir` (per worktree) | `HEAD`, `index`, `MERGE_HEAD`, `REBASE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD` | Checkout and in-progress operation state are per working tree. |
  | `identity.commonGitDir` | `refs/**`, `packed-refs`, `FETCH_HEAD`, `ORIG_HEAD` | Refs, tags and fetch results are shared by every linked worktree. |

  Both bases are subscribed for each distinct `gitDir` joining the set, so a repo *and* its worktrees each
  get their per-worktree watchers while sharing the common-dir ones.
- `vscode.git` API subscription stays in the hub and stays window-wide: on a repository state change,
  resolve that repository's root to an identity and emit it. Existing `onDidOpenRepository` handling is
  preserved.
- Debounce is **per emitting identity**, not global: the existing 1000 ms debounce / 2000 ms minimum
  interval logic moves into a small per-key `Debouncer`, so activity in repo A cannot delay repo B's
  refresh. Pure `src/utils/debounceByKey.ts`, tested with fake timers.
- Emission payload is the `RepoIdentity` of the repo that changed, not a bare path.

### Routing

`ExtensionController` subscribes the hub once per tab (on tab creation and again on every repo change,
disposing the previous subscription), and each emission runs:

```
for (const tab of tabsAffectedByChange(registry.snapshots(), changed)) tab.triggerAutoRefresh()
```

`RefreshCoordinator` is unchanged: a hidden tab sets `deferredRefresh` and catches up on
`setPanelVisible(true)`. Its `setPanelVisible` is now fed from `onViewStateChanged({visible})`.

### Edge cases and error handling

| Situation | Behaviour |
| --- | --- |
| Git dir outside every workspace folder (the normal case for a linked worktree, and for `.git/modules/<name>` of a submodule) | `vscode.workspace.createFileSystemWatcher` with an absolute `RelativePattern` supports out-of-workspace paths, including recursive globs, from VS Code 1.64; our `engines.vscode` floor is `^1.85.0`. Used as-is, no fallback set. If a platform ever fails to deliver these, the `vscode.git` API subscription and manual refresh still cover the repo — a missed event degrades to "refresh is a click away", not to wrong data. |
| Identity resolution fails for a tab's repo | No subscription. The tab still auto-refreshes from the `vscode.git` API path when that repo is one VS Code tracks, and always from manual refresh. Log once at debug; never throw. |
| Two tabs on the same repo | One shared watcher set; both tabs are woken by `tabsAffectedByChange`. |
| A repo and its linked worktree in two tabs | One shared common-dir watcher plus two per-worktree sets. A branch move in either wakes both (shared `commonGitDir`) — required by idea spec §6. |
| Submodule pointer moves | The submodule's own git dir is `<parent>/.git/modules/<name>`; its `commonGitDir` differs from the parent's, so rule 1 misses it. Rule 2 (`isSubmoduleOf`) is what wakes the parent tab. Test this explicitly. |
| Operation storms (rebase writes refs dozens of times) | Existing debounce + minimum interval, now per key. |
| Last tab closes | Every subscription released → refcounts hit zero → all watchers disposed. Verify no watcher survives. |

### Tests

`src/__tests__/GitWatcherHub.test.ts` (mock `createFileSystemWatcher`): watcher sets are created once
per common dir and ref-counted; patterns are built against the resolved dirs, not `<repo>/.git`;
disposal releases; a failed identity resolution subscribes nothing and does not throw.
`src/__tests__/debounceByKey.test.ts`: independent keys, coalescing, minimum interval.
Routing itself is covered by `graphTabRouting.test.ts` (Task 4).

---

## Task 9 — Diff and file URIs carry their repository

**Goal:** a `git-show:` document resolves against the repo that produced it, forever. Idea spec §7.

### New `shared/gitShowUri.ts` (pure)

```ts
export interface GitShowUriParts { repoPath: string; revision: string; filePath: string; label: string; }
export function buildGitShowUriParts(parts: GitShowUriParts): { authority: string; path: string; query: string; fragment: string };
export function parseGitShowUriParts(uri: { authority: string; query: string; fragment: string }): GitShowUriParts | null;
export const STAGED_AUTHORITY = 'staged';
export const WORKTREE_AUTHORITY = 'worktree';
```

- `authority` keeps its current meaning: a commit hash, or the `staged` / `worktree` sentinel.
- `query` keeps the file path.
- **`fragment` carries the repository path.** The fragment participates in `Uri.toString()`, so two
  repos with an identical file name at an identical hash are distinct documents, while two views of the
  same file in the same repo still share one document (and one VS Code editor). Putting it in `query`
  instead would require an escaping scheme for a path that may contain `?`, `&` and `#`; `fragment` is
  the last component and needs none beyond what `vscode.Uri` already does.
- `parseGitShowUriParts` returns `null` when `authority`, `query` or `fragment` is missing.

### `GitShowContentProvider`

- Constructor takes `resolveDiffService: (repoPath: string) => GitDiffService` instead of
  `() => GitDiffService`. The resolver is backed by `ExtensionServices.diffServices`, a
  `Map<normalizedRepoPath, GitDiffService>` populated on demand (`GitDiffService` is a stateless wrapper
  over `GitExecutor`, so the map is a cheap memo, bounded by the number of repos the session touched).
- A URI with no fragment throws `Invalid git-show URI: missing repository` — **never** a fallback to
  some "current" service. That silent fallback is the bug this task exists to remove.
- The submodule/gitlink handling, the `COMMAND_FAILED → ''` rule for "file not found at revision", and
  both sentinels are unchanged.
- Registration moves from the lazy block in `showGraph` to `activate()`, once, pushed into
  `context.subscriptions`.

### `EditorCommandService`

Every URI it builds gains the fragment, taken from `this.runtime.currentRepoPath` — the *displayed*
repo, which is the repo the file belongs to:
`openDiffEditor` (both sides, including the `worktree` sentinel side of a submodule diff),
`openStagedDiffEditor` (both sides), `openFileAtRevision`, `openCompareDiffEditor` (both sides).
`openCurrentFile` already resolves a `file://` path against `getWorkspacePath()`, which is per-tab; no
change beyond a comment noting why it needs none.

No RPC payload changes: the repo is the tab's, and the tab is the one handling the request.

### Edge cases

| Situation | Behaviour |
| --- | --- |
| The originating tab is closed while its diff editor stays open | The diff keeps working: the content provider resolves from the extension-wide map by path, with no reference to the tab. This is the acceptance criterion "diffs retain the correct repository identity across graph focus changes, repository switches and graph closure". |
| The tab switches repository while its diff is open | Same — the open editor's URI still names the old repo. |
| Two tabs open the same file at the same hash in the same repo | Identical URIs → one shared document. Correct and desirable. |
| Same file name, same hash prefix, two different repos | Different fragments → different documents. This is the "identical file names" case in the acceptance criteria. |
| A URI built by an older session (window reload) | Webview panels do not survive reload, so no stale URIs are restored — but VS Code *does* restore ordinary text editors. A restored fragment-less `git-show:` URI throws the clear error above rather than reading the wrong repo. Acceptable and explicitly better than a silent wrong answer. |

### Tests

`shared/__tests__/gitShowUri.test.ts`: round-trip; paths containing `#`, `?`, spaces and non-ASCII;
Windows drive letters and backslashes; both sentinels; every missing-component rejection.
`src/__tests__/GitShowContentProvider.test.ts` (new): resolves the service for the URI's repo, not a
global one; two repos with the same file/hash get different services; missing fragment throws;
`COMMAND_FAILED` still yields `''`; gitlink pointer fallback preserved.
`src/__tests__/EditorCommandService.test.ts` (extend): every builder sets the fragment to the runtime's
current repo path.

---

## Task 10 — Cross-tab busy state (`RepoActivityRegistry`)

**Goal:** "tabs showing the same working tree show another tab's in-flight operation as busy", with no
new extension-level lock.

### New `src/RepoActivityRegistry.ts`

```ts
begin(workingTreeKey: string, tabId: string, operation: TrackedOperation): vscode.Disposable
isBusy(workingTreeKey: string, exceptTabId: string): boolean
readonly onDidChange: vscode.Event<{ workingTreeKey: string }>
```

- **Key = `identity.gitDir`** — the per-working-tree git dir. This is precisely "the same working tree":
  a linked worktree has its own `gitDir`, so a checkout in a sibling worktree correctly does **not**
  mark this tab busy, while a second tab on the same checkout does.
- A counter per key (nested/concurrent operations from different tabs are counted, not booleaned), with
  the owning tab ids recorded so `isBusy` can exclude the asker.

### Wiring — `WebviewMessageRouter`

The router already wraps `TRACKED_OPERATIONS` for telemetry. Extend that same wrapper:

```ts
const token = MUTATING_OPERATIONS.has(message.type)
  ? context.beginRepoActivity(message.type)   // no-op Disposable when identity is null
  : null;
try { await handler(message, context); } finally { token?.dispose(); }
```

`MUTATING_OPERATIONS` is a new export in `shared/telemetry.ts` = `TRACKED_OPERATIONS` minus the two
read-only members already documented there (`compareRefs`, `locateHead`). Deriving it keeps one list.

`begin`/`dispose` around the handler covers `branchCheckoutHandlers` for free, including its stash →
checkout → pull → refresh sequence, because that whole sequence is one awaited handler call.

### Broadcast

`onDidChange` → the controller posts `{ type: 'peerActivity', payload: { busy } }` to each tab in
`peersSharingWorkingTree(...)`, where `busy = registry.isBusy(key, tab.id)`. A tab whose own operation
is running is excluded — it already has its own busy state.

### Webview

- `graphStore.peerOperationInProgress: boolean`, set from `peerActivity`.
- `stores/graphSelectors.ts` → `useOperationInProgress` ORs it in, so every existing consumer (toolbar
  buttons, menu gating, dialogs) inherits the disabled state without a second rule. This is the reason
  the selector exists.
- A single inline note in the toolbar while `peerOperationInProgress && !ownOperationInProgress`:
  "Another Speedy Git view is running a Git operation." — `dialogNoteClassName` styling,
  `WARNING_COLOR` tone, no repo or branch name in the text.
- `commitMenuAvailability` and friends are **not** changed: gating already flows from
  `useOperationInProgress`.

### Edge cases

| Situation | Behaviour |
| --- | --- |
| The initiating tab is closed mid-operation | The handler's `finally` still runs, so the token releases when the operation actually completes, and peers un-busy then. Exactly the idea spec's "in-flight operations of a closed tab run to completion". |
| The handler throws | `finally` releases. Covered by a test. |
| Identity is null | `beginRepoActivity` returns a no-op disposable; no mirroring, no crash. |
| Two peers both start an operation | Counter > 1; each sees the other as busy (`isBusy` excludes only the asker). Both reach git; git's `index.lock` decides. No new lock, as decided. |
| A peer arrives (new tab) while an operation runs | Tab creation sends the current `peerActivity` state as part of its initial messages, so it does not miss the edge. |

### Tests

`src/__tests__/RepoActivityRegistry.test.ts`: count up/down, exclusion of the asker, release on throw,
release after the owning tab is removed, no-op key.
`src/__tests__/WebviewMessageRouter.test.ts` (extend): a mutating op begins and ends activity, a
read-only tracked op (`compareRefs`) does not, an untracked op does not.
`webview-ui/src/stores/__tests__/graphSelectors.test.ts`: `useOperationInProgress` reflects peer state.

---

## Task 11 — Stale-dialog revalidation for ref-position-dependent actions

**Goal:** idea spec §7 — reset, rebase onto, force-push, delete branch and drop commit re-read their
target immediately before running, and refuse to act on a moved ref.

### New `shared/refRevalidation.ts` (pure)

```ts
export interface RefExpectation {
  /** What to re-resolve: a branch name, a remote-tracking ref, or 'HEAD'. */
  ref: string;
  /** The hash the dialog displayed when the user opened it. */
  expectedHash: string;
}
export interface RefMovedInfo { ref: string; expectedHash: string; actualHash: string | null; }
export function isRefMoved(expected: RefExpectation, actual: string | null): boolean;
export function describeRefMoved(info: RefMovedInfo, action: string): string;
```

`describeRefMoved` produces the user-facing text — "`<ref>` changed since you opened this dialog"
(or "no longer exists" when `actual` is `null`) — in one place, so the five dialogs cannot word it five
ways. Hash comparison is full-hash equality; the dialog always has the full hash.

### Which ref each action checks

| Action | Ref re-resolved | Rationale |
| --- | --- | --- |
| `resetBranch` | the branch being moved (or `HEAD` when detached) | Resetting a branch that moved discards someone else's commits. |
| `rebase` / `interactiveRebase` | the upstream/onto ref **and** `HEAD` | Both ends define the replayed range. |
| `push` with a force mode | the remote-tracking ref for the destination, as `resolvePublishedBranchRemote` already resolves it | A force-push after a peer fetched new upstream commits is the classic data loss. |
| `deleteBranch` / `deleteRemoteBranch` | the branch tip | Deleting a branch that advanced loses the new commits. |
| `dropCommit` | `HEAD` | The rebase that implements the drop is computed from HEAD. |

Non-force pushes, merges, cherry-picks, reverts, tags, stashes and checkouts are **not** revalidated —
per the idea spec, they rely on git failing.

### Protocol — one generic mechanism, zero changes to the five dialogs

The five dialogs already close on confirm and let the operation run, so re-opening them to re-confirm
would mean surgery in five components. Instead the refusal is answered by **one app-level dialog**, and
the backend echoes the request back so the webview can re-send it verbatim.

- Each listed request payload gains an **optional** `expect?: RefExpectation`. Optional keeps every
  existing call site and test compiling; the five dialogs each add one field to the payload they
  already build.
- **Backend**, before any mutation and after the operation guard, via one shared helper
  `revalidateRef(message, context): Promise<RefMovedInfo | null>`:
  `git rev-parse --verify <ref>` through the tab's `GitLogService`. On a match (or when `expect` is
  absent) it returns `null` and the handler proceeds unchanged. On a mismatch or a missing ref it posts

  ```ts
  { type: 'refMoved', payload: { ref, expectedHash, actualHash, request: message } }
  ```

  and the handler returns **without acting**. Each of the five handlers gains two lines:
  `const moved = await revalidateRef(message, context); if (moved) return;`
- **Webview:** `graphStore.refMoved` holds the payload; `App` renders a new
  `components/RefMovedDialog.tsx` — a thin `ConfirmDialog` showing `describeRefMoved(...)` in a
  `dialogWarningClassName` box, with **Run anyway** (danger) and **Cancel**. "Run anyway" re-sends
  `payload.request` verbatim with `expect.expectedHash` replaced by `actualHash`. When `actualHash` is
  `null` the dialog offers **Close** only.
- Nothing else in the webview changes: no dialog is kept open, no targeted re-fetch, no per-action UI.
  The displayed graph catches up through the tab's normal auto-refresh.

### Edge cases

| Situation | Behaviour |
| --- | --- |
| Ref deleted entirely | `actualHash: null` → "no longer exists" wording; `RefMovedDialog` offers Close only, because there is nothing to re-run against. |
| Detached HEAD | `ref: 'HEAD'`; `rev-parse --verify HEAD` answers the commit. Works unchanged. |
| Unborn branch | `rev-parse` fails → treated as "no longer exists". |
| The move was this tab's own refresh (nothing changed for the user) | Hash comparison is on the value the dialog *displayed*, so a refresh that did not move the ref never triggers the box. |
| No `expect` sent (a call site we missed) | `revalidateRef` returns `null` and the handler acts as today. A test asserts each of the five call sites supplies it. |
| The user re-sends and the ref moves *again* in between | The re-send carries the newer hash, so a third move produces a second `refMoved`. The dialog simply reopens with the new information — no special casing. |

### Telemetry

No new event. The extra confirm is counted by `useDialogTelemetry` as part of the same open cycle — a
user who abandons at the warning records `cancelled`, one who re-confirms records `confirmed`. Note this
explicitly in the task so the numbers are read correctly.

### Tests

`shared/__tests__/refRevalidation.test.ts`: `isRefMoved` (equal, moved, missing), both message forms.
`src/__tests__/refRevalidationHandlers.test.ts`: the shared `revalidateRef` helper refuses and posts
`refMoved` (echoing the request) when the ref moved, returns `null` when it matches, and returns `null`
when `expect` is absent — plus one case per handler asserting it calls the helper before mutating.
`webview-ui/src/components/__tests__/RefMovedDialog.test.tsx`: renders the moved and the deleted
wording, re-sends the echoed request with the new hash on "Run anyway", sends nothing on Cancel.

---

## Task 12 — Persisted UI state: seed on open, last write wins

**Goal:** idea spec §5's saved-preferences rule, which today's cache almost implements by accident.

- `PersistedUIStateStore.invalidateCache()` is replaced by **`reloadRepoLayout()`**: re-read only
  `commitTableLayout` for the new repo (`loadRepoTableLayout()`) and write it into the existing cache.
  The global members (`detailsPanelPosition`, `fileViewMode`, `bottomPanelHeight`, `rightPanelWidth`)
  keep the values this tab was seeded with. Today's `invalidateCache` drops everything, which on a repo
  switch would silently import a peer tab's panel layout — the one thing the product rule forbids.
- `savePersistedUIState` is unchanged: it merges the partial into *this tab's* cache and writes the
  whole global object, which is last-write-wins across tabs by construction. Document that in the
  method's doc comment, since it is now a product rule rather than an implementation detail.
- `saveRepoTableLayout` is already keyed per repo; unchanged.
- `RepoDataLoader` still sends `persistedUIState` from the tab's own store on initial load, which is the
  "read once, when it opens" half.

### Edge cases

- Two tabs writing simultaneously: `globalState.update` serialises per key; the later write wins and
  neither tab's cache is corrupted (each holds its own object).
- A tab switching repos writes its seeded global values back on its next save, potentially reverting a
  peer's newer change. That is exactly "last write wins" and is accepted.
- `ExtensionController.readSignatureColumnVisible` constructs a throwaway store for the settings
  snapshot; it keeps working, but point it at the saved default repo explicitly rather than at
  `discovery.getActiveRepoPath()` by coincidence.

### Tests — `src/__tests__/PersistedUIStateStore.test.ts` (extend)

Two stores over one fake memento: A's save does not change B's cached read; B's later save wins in
storage; `reloadRepoLayout` changes only the layout and preserves the seeded globals; the layout comes
from the new repo's key.

---

## Task 13 — Toolbar button and Command Palette command

**Goal:** the entry points. Idea spec §4 and §11.

### Webview

- New `NewTabIcon` in `webview-ui/src/components/icons.tsx` (a plus-on-panel glyph, `currentColor`,
  matching the existing 16px icon conventions).
- In `ControlBar.tsx`, immediately **after** the Go to HEAD button and before the `ml-auto` loaded
  counter:

  ```tsx
  <ToolbarIconButton
    label="New Tab"
    icon={<NewTabIcon className={iconClass} />}
    onClick={() => { trackUiInteraction('toolbar', 'openNewGraphTab'); rpcClient.openNewGraphTab(); }}
    aria-label="Open New Graph Tab"
    {...TOGGLE_BUTTON_TONES.inactive}
    title="Open New Graph Tab"
  />
  ```

  Never disabled: a graph is open, so there is always a repository to open another on. It is not
  disabled by `useOperationInProgress` either — opening a view is not a git operation.
- `rpcClient.openNewGraphTab()` — a one-way send, no pending-response bookkeeping.

### Backend

- `shared/messages.ts`: `| { type: 'openNewGraphTab'; payload: Record<string, never> }` plus the
  `REQUEST_TYPES` entry.
- `vscodeCommandHandlers`: `openNewGraphTab: async (_m, context) => { context.openNewGraphTab(); }`.
- `WebviewRequestContext.openNewGraphTab()` → `ExtensionController.openNewGraphTab('toolbarButton')`
  with this tab as origin.

### `package.json`

```jsonc
{ "command": "speedyGit.openNewGraphTab", "title": "Open New Graph Tab", "category": "Speedy Git", "icon": "$(zap)" }
```
plus a `commandPalette` entry `{ "command": "speedyGit.openNewGraphTab", "when": "workspaceFolderCount > 0" }`.
No keybinding, no menu contribution. `extension.ts` registers it as
`() => controller?.openNewGraphTab('commandPalette')`.

### Tests

`webview-ui/src/components/__tests__/ControlBar.test.tsx` (extend or add): the button renders with the
accessible name "Open New Graph Tab", sits after Go to HEAD, sends the RPC once per click, and emits the
`toolbar`/`openNewGraphTab` UI event.

---

## Task 14 — Telemetry

**Goal:** idea spec §10, within the existing consent and privacy policy. Nothing repository-derived.

### `shared/telemetry.ts`

```ts
export const PANEL_OPENED_TRIGGERS = ['command', 'scmButton', 'statusBar', 'toolbarButton', 'commandPalette'] as const;
export type PanelOpenedTrigger = (typeof PANEL_OPENED_TRIGGERS)[number];

export const TAB_COUNT_BUCKETS = ['1', '2', '3-5', '6+'] as const;
export type TabCountBucket = (typeof TAB_COUNT_BUCKETS)[number];
export function toTabCountBucket(n: number): TabCountBucket;   // <=1 → '1', 2 → '2', 3..5 → '3-5', else '6+'

export const MUTATING_OPERATIONS: ReadonlySet<RequestMessage['type']>; // Task 10
```

- `UI_ACTIONS` gains `'openNewGraphTab'`.
- `TelemetryService.sendPanelOpened(trigger: PanelOpenedTrigger, openTabCount: TabCountBucket)`; the
  trigger parameter's inline union is replaced by the exported type so the catalog is the only source.
- Counted **only on tab creation**, never on a reveal. The bucket is the count *after* the new tab is
  registered, so the first graph of a session reports `'1'`.

### `telemetry.json`

Update `panelOpened`: extend the `trigger` comment to the five values, and add
`openTabCount` (`SystemMetaData` / `FeatureInsight`, comment `"'1' | '2' | '3-5' | '6+' — bucketed number of open Speedy Git graph tabs after this one opened."`).

### Explicitly not collected

Repository paths or names, how many *distinct* repositories are open, whether tabs show the same repo,
branch names, submodule names, which editor group a tab is in, and anything about refresh routing or
peer-busy state. Background refreshes, peer-activity broadcasts and watcher events emit nothing.

### Tests

`src/__tests__/telemetry.test.ts`: `toTabCountBucket` boundaries (0, 1, 2, 3, 5, 6, 50);
`PANEL_OPENED_TRIGGERS` is exhaustive against every call site (a `satisfies` assertion in the
controller plus a test that each trigger value is reachable).
`src/__tests__/TelemetryService.test.ts`: `panelOpened` carries both properties; a reveal sends nothing.

---

## Task 15 — Docs, version, release pass, performance validation

### Docs

- `docs/architecture.md`: entries for every new file (`ExtensionServices.ts`, `GraphTabRegistry.ts`,
  `RepoActivityRegistry.ts`, `webview/GraphTab.ts`, `webview/createGitServices.ts`,
  `services/GitRepoIdentityService.ts`, `services/GitWatcherHub.ts`, `utils/debounceByKey.ts`,
  `shared/repoIdentity.ts`, `shared/graphTabRouting.ts`, `shared/gitShowUri.ts`,
  `shared/refRevalidation.ts`), the removal of `WebviewProvider.ts` and `GitWatcherService.ts`, and a
  refreshed "last reconciled" date.
- `CLAUDE.md`:
  - A new **"Multiple Graph Tabs — one tab owns a view"** subsection under the webview conventions,
    stating: `GraphTab` owns everything view-scoped; `ExtensionServices` owns everything that must be
    single (avatars, discovery, telemetry, watcher hub, activity registry, What's New); a handler
    never reaches the registry, only `WebviewRequestContext`; a revealed tab is never reloaded or
    retargeted; `panelOpened` fires on creation only.
  - *Shared Logic — Reuse, Don't Reimplement* entries for `shared/repoIdentity.ts`,
    `shared/graphTabRouting.ts`, `shared/gitShowUri.ts` and `shared/refRevalidation.ts`, each stating
    the subtle rule it encodes (working tree vs object store vs submodule containment; MRU and routing;
    the fragment-carries-the-repo contract; the five revalidated actions and their wording).
  - The avatar section's "created per `WebviewProvider`" wording updated to extension-wide.
- `CHANGELOG.md`: a 5.17.0 entry covering multiple graph tabs, the linked-worktree/submodule watcher
  fix, and the diff-repository-identity fix.

### Version and release

- `package.json` → `5.17.0`.
- **What's New pass with the maintainer is a required step before tagging.** Not written in this spec by
  decision. If an entry is wanted, it credits @jinho9265 (the issue reporter) via `ContributorThanks`,
  leads with an illustration of two graph tabs side by side, and uses `UiLabel` for the exact string
  "Open New Graph Tab". No entry is added without that conversation.

### Performance validation (idea spec §10)

Before release, on `~/repos/test-repo` and on a large real repository:

1. Open 5 graph tabs (mixed: same repo twice, a submodule, a linked worktree, a second repo).
2. Record extension-host memory (VS Code's Process Explorer) at 1 tab and at 5 tabs, and confirm
   scrolling in the focused tab stays smooth with 4 hidden tabs retained.
3. Watch the `Speedy Git` output channel (it logs every git command) while running an operation in one
   tab: each affected tab refreshes once, unaffected tabs spawn nothing, and the avatar queue issues
   one lookup per interval in total rather than one per tab.

Record the memory numbers in this file under a "Measured" heading when the pass is done.

---

## Consolidated edge-case and error-handling register

Collected here so nothing above is lost in a task; each row names the task that owns it.

| # | Case | Handling | Task |
| --- | --- | --- | --- |
| 1 | Identity cannot be resolved (not a repo, permissions) | Tab loads; no watcher subscription, no busy mirroring; services surface their own errors | 1, 8, 10 |
| 2 | Bare repo (`--show-toplevel` empty) | `topLevel: ''`; never matches `isSubmoduleOf` | 1 |
| 3 | Symlinked / differently-spelled repo path | Treated as distinct, matching `GitRepoDiscoveryService`'s documented stance | 1 |
| 4 | Windows path casing | One `pathsEqual` helper; drive letter normalised, path not lowercased on POSIX | 1 |
| 5 | Origin panel hidden when `Open New Graph Tab` fires | `ViewColumn.Active` fallback | 5, 6 |
| 6 | Window reload | No serializer; VS Code drops the tabs, which is the wanted session-only behaviour | 5 |
| 7 | No workspace folder / no repo | Existing error message; no tab created | 6 |
| 8 | SCM opens a repo discovery does not list | Create the tab on the SCM-supplied path anyway | 6 |
| 9 | Repo removed from the workspace | Retarget only affected tabs (including a tab inside its submodule) to `repos[0]`, one notification; no repos left → leave tabs, empty the selector | 7 |
| 10 | Out-of-workspace git dir (worktree, `.git/modules/*`) | Absolute `RelativePattern`, supported at our 1.85 floor; `vscode.git` events and manual refresh are the safety net | 8 |
| 11 | Submodule pointer moves | Parent tab woken by `isSubmoduleOf`, not by shared object store | 8 |
| 12 | Parent repo commits | Submodule tab **not** woken — its history did not change | 8 |
| 13 | Operation storm (rebase) | Per-key debounce + minimum interval | 8 |
| 14 | Last tab closes | All watcher refcounts hit zero; avatar singletons survive | 2, 8 |
| 15 | Diff open after its tab closed or switched repo | Resolves by URI fragment from the extension-wide map | 9 |
| 16 | Same file+hash in two repos | Distinct URIs via fragment | 9 |
| 17 | Fragment-less `git-show:` URI restored by VS Code | Clear thrown error, never a wrong-repo read | 9 |
| 18 | Operation started in a tab that is then closed | Runs to completion; activity token released in `finally`; no toast anywhere | 3, 10 |
| 19 | Handler throws mid-operation | Activity token released in `finally` | 10 |
| 20 | Two tabs start conflicting operations | Both reach git; `index.lock` / `OperationGuard` decide; no new lock | 10 |
| 21 | New tab opens during a peer's operation | Initial messages include current `peerActivity` | 10 |
| 22 | Target ref moved while a dialog was open | Backend refuses and echoes the request; one app-level `RefMovedDialog` offers Run anyway / Cancel | 11 |
| 23 | Target ref deleted while a dialog was open | "No longer exists"; `RefMovedDialog` offers Close only | 11 |
| 24 | Two tabs saving UI state at once | Last write wins on the global object; each tab's cache intact | 12 |
| 25 | Repo switch importing a peer's panel layout | Prevented: only the table layout is re-read | 12 |
| 26 | Duplicate avatar enqueues from two tabs on one repo | `AvatarRefreshQueue`'s existing `queued` Set already dedupes; regression test added | 2 |
| 27 | Avatar batch delivered while a tab is closing | `postMessage` no-ops on a disposed panel | 2, 5 |
| 28 | Rapid repeated `Open New Graph Tab` | Each click creates a tab; no debounce, by product decision | 6 |

---

## Test inventory

New files:
`src/__tests__/repoIdentity.test.ts`, `GitRepoIdentityService.test.ts`, `ExtensionServices.test.ts`,
`createGitServices.test.ts`, `GraphTabRegistry.test.ts`, `GitWatcherHub.test.ts`,
`debounceByKey.test.ts`, `GitShowContentProvider.test.ts`, `RepoActivityRegistry.test.ts`,
`GraphTab.repoList.test.ts`, `refRevalidationHandlers.test.ts`;
`shared/__tests__/graphTabRouting.test.ts`, `gitShowUri.test.ts`, `refRevalidation.test.ts`.

Extended:
`ExtensionController.test.ts`, `WebviewPanelHost.test.ts`, `WebviewRuntime.test.ts`,
`WebviewMessageRouter.test.ts`, `PersistedUIStateStore.test.ts`, `EditorCommandService.test.ts`,
`AvatarRefreshQueue.test.ts`, `telemetry.test.ts`, `TelemetryService.test.ts`,
`submoduleHandlers.test.ts`;
`webview-ui/.../ControlBar.test.tsx`, `graphSelectors.test.ts`, `RefMovedDialog.test.tsx` (new).

Renamed: `WebviewProvider.test.ts` → `GraphTab.test.ts` (must stay green).

## Acceptance checklist (traces idea spec §11)

- [ ] Ordinary Open reveals the MRU surviving graph; creates only when none is open. *(T6)*
- [ ] Every graph has an Open New Graph Tab icon button next to Go to HEAD with tooltip and accessible name. *(T13)*
- [ ] Clicking it creates another graph immediately, no picker, same repo allowed twice. *(T6, T13)*
- [ ] Native VS Code controls close and arrange graphs; closing the last is allowed. *(T4, T5)*
- [ ] Repository, filters, search, selection, layout and scroll are per tab. *(T3, T12)*
- [ ] Git changes update every affected view; unrelated views stay quiet. *(T8)*
- [ ] Same-repository views share checkout and operation state. *(T8, T10)*
- [ ] Conflicting operations and stale confirmations cannot silently act on invalid assumptions. *(T10, T11)*
- [ ] Diffs keep their repository across focus changes, repo switches and tab closure. *(T9)*
- [ ] Tab title is the repository or submodule name only. *(T5)*
- [ ] SCM Open in Speedy Git reveals or creates; never retargets. *(T6)*
- [ ] What's New offered at most once per version, in the first graph of a session only. *(T2, T6)*
- [ ] Window reload restores no tabs. *(T5)*
- [ ] Multiple tabs do not multiply authorization flows or change the privacy policy. *(T2, T14)*

# Refactor Idea: Graph Store Maintainability and Scroll Performance

Status: discussion draft (verified 2026-05-10)

This note captures the current refactor direction for `webview-ui/src/stores/graphStore.ts` before making code changes. The goal is to reduce avoidable render work and make the store easier to maintain without changing user-visible behavior.

## Verification Notes (2026-05-10)

A second-pass codebase audit confirmed the major claims below, with these adjustments:

- `graphStore.ts` is **1,216 lines** (was stated as "over 1,200" — accurate).
- `WebviewProvider.ts` is **2,196 lines** with **one** major `Promise.allSettled` block (lines ~614–623), not "repeated blocks." Item F is re-scoped accordingly.
- `GraphCell` already uses a selector (`useGraphStore((s) => s.userSettings.graphColors)`), not a bare subscription. Item B is reframed as cleanup, not a perf win.
- `CommitContextMenu` has **12 wrapper-level `useGraphStore` selectors** mounted **per visible row**. With overscan ~50 that is ~600 subscriptions in the scroll path — by far the largest per-row subscription cost. Item E is elevated in priority.
- `CompareABMarker` confirmed at **4 subscriptions per row** (both `CommitRow` and `CommitTableRow` mount it).
- All five components in Item 1 confirmed to call `useGraphStore()` without a selector on at least one line.
- All six pure-helper extraction candidates in Item 2 confirmed present and pure.
- `MultiSelectDropdown` debug `useEffect` blocks confirmed at lines 99–105.

## Context

`webview-ui/src/stores/graphStore.ts` is currently the only Zustand store file and is over 1,200 lines. The size of the file is not a direct runtime performance problem, but it does make maintenance harder because unrelated concerns live in one large interface and one large store initializer.

The store currently owns several domains:

- Commit graph data and topology
- Repo and submodule navigation state
- Filter and search state
- Selection and details panel state
- Tooltip and avatar caches
- Operation state for rebase, cherry-pick, revert, checkout, branch deletion
- Uncommitted-file state
- Compare refs state
- Persisted UI layout state

The main risk is not that Zustand has one large object. The risk is that broad subscriptions and mixed responsibilities make it easier to trigger unnecessary React work or accidentally break cross-domain invariants.

## Current Recommendation

### 1. Replace whole-store component subscriptions

Several components call `useGraphStore()` without a selector. That subscribes the component to every store update, including unrelated updates such as tooltip movement, signature loading, success messages, compare state, or dialog state.

Known examples:

- `webview-ui/src/App.tsx`
- `webview-ui/src/components/GraphContainer.tsx`
- `webview-ui/src/components/ControlBar.tsx`
- `webview-ui/src/components/CommitDetailsPanel.tsx`
- `webview-ui/src/components/RemoteManagementDialog.tsx`

Recommended change:

- Replace whole-store subscriptions with explicit selectors.
- Use multiple primitive selectors where simple.
- Use `useShallow` (or `zustand/shallow` with the equality form) only when selecting a grouped object is clearer and stable enough.
- Keep callback-only access in event handlers as `useGraphStore.getState()` when the component does not need to re-render from that value.

**Hard rule (selector gotcha):** a naive object-returning selector such as `useGraphStore((s) => ({ a: s.a, b: s.b }))` returns a *new* object on every store update and re-renders on every change to the entire store — strictly worse than the bare subscription. Either use multiple primitive selectors, or wrap with `useShallow`. Do not skip this.

Expected benefit:

- Lower re-render fanout.
- Better scroll performance when unrelated state changes during graph rendering.
- Easier reasoning about why a component re-renders.

Risk: medium. Each component must be migrated and smoke-tested individually; missing a destructured field silently breaks behavior.

### 2. Extract pure helper logic from `graphStore.ts`

Move pure data-transformation logic out of the store file while preserving the single public store API.

Good extraction candidates:

- `computeHiddenCommitHashes`
- `mergeStashesIntoCommits`
- `mergeUncommittedIntoCommits`
- `computeMergedTopology`
- `joinRepoPath`
- Small helper types such as `UncommittedContext`

Potential target files:

- `webview-ui/src/utils/commitVisibility.ts`
- `webview-ui/src/utils/mergedCommits.ts`
- `webview-ui/src/utils/repoPath.ts`

Recommended constraints:

- Keep functions pure and unit-testable.
- Do not introduce a new state library or new package.
- Preserve existing action behavior and store field names.
- Keep `useGraphStore` import paths stable for components.

Expected benefit:

- Smaller `graphStore.ts`.
- Easier review by humans and AI agents.
- Lower chance of accidental changes to unrelated store concerns.
- More focused tests for graph data derivation.

### 3. Do not split the store into slices/files yet

Earlier recommendation included a possible future split into Zustand slices. We are intentionally not taking that step now.

Reasoning:

- Extracting helper logic already reduces the file size and complexity.
- This app has many cross-domain actions that update graph data, selection, filters, cache state, and UI state together.
- A slice split could make those cross-domain invariants harder to inspect unless done very carefully.
- The immediate performance risk is broad subscriptions and expensive row rendering, not the physical file layout.

Decision for now:

- Keep one Zustand store.
- Extract pure helpers.
- Revisit slices only if `graphStore.ts` remains hard to maintain after helper extraction.

### 4. Profile before optimizing topology or scroll internals

Large-repo scrolling can feel slow for several reasons. We should identify which one applies before changing graph internals.

Likely causes to investigate:

- High overscan: `GraphContainer` renders visible rows plus `overScan` rows before and after the viewport.
- Heavy row content: each row can render an SVG graph cell, context menu wrappers, refs, compare markers, avatars, and formatted dates.
- Branchy repositories: graph rows may render many passing lane SVG lines.
- Prefetch hitches: `appendCommits` recomputes merged commits and topology across all loaded commits, so each new batch can become more expensive as the loaded set grows.
- Store subscription fanout: broad subscriptions can re-render graph components for unrelated state changes.

Recommended profiling steps:

1. Compare scrolling with `speedyGit.overScan` set to a low value such as `5` or `10`.
2. Compare scrolling with avatars disabled.
3. Compare normal list mode against table mode.
4. Watch for periodic freezes when reaching the end of loaded commits; that points toward prefetch and topology recomputation.
5. Use VS Code "Open Webview Developer Tools" and record a Performance trace while scrolling.

What to look for in a trace:

- Long React render tasks during normal scrolling.
- Long SVG/layout/paint work.
- Time spent in `calculateTopology`.
- Time spent around `appendCommits`, `setInitialData`, or `recomputeVisibility`.
- Excessive rerenders after unrelated store updates.

Potential follow-up fixes after profiling:

- Reduce default `overScan` if it materially improves scroll smoothness.
- Avoid whole-store subscriptions in hot components.
- Pass `graphColors` into `GraphCell` from the row/container instead of subscribing inside every graph cell.
- Move compare marker state selection up so every row does not create multiple compare selectors.
- Consider lazy-loading or simplifying context menu wrappers for rows if Radix wrappers show up as a scroll cost.
- Cache or precompute display-only row fields if rendering repeatedly formats the same data.
- Investigate incremental topology update only if traces show `calculateTopology` is the bottleneck during prefetch.

## Additional Low-Risk Findings From Codebase Scan

These are separate from a store-file refactor. They are intended as small, low-risk changes that either remove avoidable render work or improve maintainability without changing behavior.

### A. Remove debug logging from `MultiSelectDropdown`

`webview-ui/src/components/MultiSelectDropdown.tsx` still logs mount/unmount and open-state changes. `pnpm lint` currently passes with two warnings, both from those debug effects' dependency arrays.

Recommended change:

- Delete the two debug-only `useEffect` blocks.

Expected benefit:

- Removes console noise in the webview developer tools.
- Clears the current lint warnings.
- Very low behavioral risk because these effects only log.

### B. Move graph colors out of per-cell store subscriptions (cleanup, not perf)

`GraphContainer` already passes `userSettings` to each row, and each row already reads `userSettings.graphColors` for lane styling. `GraphCell` subscribes via a selector (`useGraphStore((s) => s.userSettings.graphColors)`), so it only re-renders when `graphColors` itself changes — which is rare. Treat this as a code-clarity / consistency cleanup, not a scroll-performance win.

Recommended change:

- Add `graphColors` or `palette` as a `GraphCell` prop.
- Remove `useGraphStore` from `GraphCell`.
- Keep the default palette fallback in one shared helper.

Expected benefit:

- One fewer store coupling in the virtualized row hot path; easier to reason about.
- Aligns `GraphCell` with the prop-drilled `userSettings` pattern already used by rows.
- Low risk because graph color data is already available in the parent row.

### C. Hoist compare marker selection out of each row

Both `CommitRow` and `CommitTableRow` mount a `CompareABMarker` that subscribes four times to compare state for every visible row. Compare state changes are rare, but the subscription count scales with overscan and row count.

Recommended change:

- Select compare marker state once in `GraphContainer`.
- Pass a small marker context or precomputed `isA`/`isB` booleans into each row.
- Extract the duplicated marker rendering shared by classic and table rows.

Expected benefit:

- Fewer Zustand subscriptions in the scroll path.
- Less duplicated row code.
- Low risk if the marker matching logic remains centralized in `slotMatchesCommitRow`.

### D. Avoid repeated reachability map construction in row context menus

`CommitContextMenu` is mounted for every visible commit row and calls `isReachableFromHead`. That utility builds a new `Map` from all commits on every call. `CommitTooltip` also calls it repeatedly while building reference sections.

Recommended change:

- Add a small reachability helper that builds the commit map once, then answers repeated reachability checks.
- For row rendering, prefer computing current-branch reachability once per `mergedCommits` / HEAD change and passing a `Set<string>` or boolean into row menus.

Expected benefit:

- Removes repeated O(n) map construction from visible-row rendering.
- Helps large repos most, especially with high overscan.
- Low to moderate risk; keep existing `commitReachability` tests and add one test for the reusable checker.

### E. Apply the lazy context-menu item pattern more broadly (largest per-row win)

`AuthorContextMenu` and `DateContextMenu` intentionally keep row wrappers free of Zustand subscriptions and mount store-connected menu items only when the menu opens (see the explicit comment in `AuthorContextMenu.tsx` referencing this pattern). `CommitContextMenu` and `BranchContextMenu` do not follow this pattern yet; they subscribe to multiple store fields while mounted in visible rows.

Verified scope:

- `CommitContextMenu` has **12 wrapper-level `useGraphStore` selectors** (lines ~66–77) and is mounted **per visible row**. With overscan ~50, that is roughly **600 active subscriptions** in the scroll path from this component alone — the single biggest per-row subscription cost in the webview.
- `BranchContextMenu` similarly subscribes at the wrapper level and is mounted **multiple times per row** (one per branch ref badge), so the multiplier is even higher in branchy repos.

Recommended change:

- Keep context-menu triggers lightweight.
- Move store-connected menu content into lazily mounted inner components where practical (mirror the `AuthorContextMenu` / `AuthorFilterMenuItems` split).
- Do this incrementally, starting with `BranchContextMenu` because rows can contain multiple instances and the per-row multiplier is highest.

Expected benefit:

- Removes the largest single source of per-row subscriptions.
- Less subscription work per visible row/ref badge.
- Easier maintenance because menu state and menu actions become more isolated.

Risk: medium-high. These menus contain many commands and dialogs; refactor one menu at a time with focused interaction tests / manual checks. Schedule after the safer extractions in Items A, 2, and D have landed so the rest of the diff stays small.

### F. Extract `WebviewProvider` payload assembly helpers

`src/WebviewProvider.ts` is **2,196 lines**. `sendInitialData` contains **one** large `Promise.allSettled` block (lines ~614–623) that unwraps eight settled results inline. This is not a direct performance problem, and it is not a "repeated" pattern across the file — but the block itself is dense and ripe for a small helper that reduces inline noise and makes future AI edits safer.

Recommended change:

- Extract a small private helper that unwraps a `PromiseSettledResult<T>` to `T | undefined` (or `T | fallback`) with consistent error-logging.
- Apply it to the `sendInitialData` block; do not hunt for additional uses unless they appear naturally.
- Keep the public message protocol and service calls unchanged.
- Do not split the whole provider yet.

Expected benefit:

- One denser block becomes easier to scan.
- Consistent error handling for settled-result unwrapping.
- Low behavior risk if covered by existing `WebviewProvider` tests.

## Non-Goals

- No package installation.
- No behavior change to graph rendering, filtering, repo switching, compare refs, or operation dialogs.
- No migration to multiple independent Zustand stores.
- No large rewrite before profiling confirms where scroll time is spent.

## Suggested Implementation Order

Reordered strictly by risk-ascending so the safest, highest-confidence changes land first. Each numbered step should ship as its own PR with green tests and a manual smoke pass (scroll a large repo, open compare, switch repos).

| Step | Task | Risk | Why this position |
|------|------|------|-------------------|
| 1 | **Item A** — delete the two debug `useEffect` blocks in `MultiSelectDropdown.tsx`. | Zero | Trivial deletion; clears lint warnings. |
| 2 | **Item 2** — extract pure helpers (`computeHiddenCommitHashes`, `mergeStashesIntoCommits`, `mergeUncommittedIntoCommits`, `computeMergedTopology`, `joinRepoPath`, `UncommittedContext`) into `webview-ui/src/utils/`. Add focused unit tests. | Very low | Pure functions; no behavior change; biggest single maintainability win. |
| 3 | **Item F** — extract the settled-result unwrap helper in `WebviewProvider.sendInitialData`. | Low | Localized; covered by existing tests. |
| 4 | **Item D** — cache the reachability map per `mergedCommits` / HEAD change instead of rebuilding it on every `isReachableFromHead` call. | Low | Removes O(n) work from row rendering. |
| 5 | **Profile large-repo scrolling** with the changes above in place. Use steps in section 4 above. | — | Confirms whether the remaining steps are still worth their risk. Do not skip. |
| 6 | **Item C** — hoist `CompareABMarker` selection to `GraphContainer`; pass `isA`/`isB` as props into rows. | Low-medium | Removes ~200+ subscriptions at overscan 50; touches row interfaces. |
| 7 | **Item B** — pass `graphColors` into `GraphCell` as a prop and remove its store coupling (cleanup, not perf). | Low | Small clarity win; do alongside or after C. |
| 8 | **Item 1** — replace the five bare `useGraphStore()` calls with explicit selectors / `useShallow`. One component per PR. Honor the selector gotcha rule. | Medium | Per-component risk of missing a destructured field. |
| 9 | **Item E** — convert `BranchContextMenu` first, then `CommitContextMenu`, to the lazy-mount inner-content pattern used by `AuthorContextMenu`. | Medium-high | Largest per-row subscription win (~600 subs from `CommitContextMenu` alone), but largest blast radius. Land last, after profiling confirms the win. |

Cross-cutting rules:

- One item per PR; do not bundle steps 6–9.
- Hoisting compare-marker state (step 6) and rewriting `CommitContextMenu` (step 9) touch overlapping row code — ship them in separate PRs to keep diffs reviewable.
- Re-run profiling after step 5 and again after step 9 to validate the actual scroll improvement.

## Progress Checklist

Tick items as they land. Each item is independently shippable; we can stop and resume between any two items.

- [x] **Step 1 — Item A:** Delete the two debug `useEffect` blocks in `webview-ui/src/components/MultiSelectDropdown.tsx` (lines ~99–105). Verify `pnpm lint` warnings clear.
- [x] **Step 2 — Item 2:** Extract pure helpers from `graphStore.ts` into `webview-ui/src/utils/`:
  - [x] `computeHiddenCommitHashes` → `commitVisibility.ts`
  - [x] `mergeStashesIntoCommits` → `mergedCommits.ts`
  - [x] `mergeUncommittedIntoCommits` → `mergedCommits.ts`
  - [x] `computeMergedTopology` → `mergedCommits.ts`
  - [x] `joinRepoPath` → `repoPath.ts`
  - [x] `UncommittedContext` type → colocated with `mergedCommits.ts` (its primary consumer)
  - [x] Focused unit tests for each extracted helper (graphStore.ts: 1216 → 1051 lines)
- [x] **Step 3 — Item F:** Extract a `PromiseSettledResult<T>` unwrap helper for `WebviewProvider.sendInitialData` (lines ~614–623). Apply to that block only.
- [x] **Step 4 — Item D:** Cache the reachability map per `mergedCommits` / HEAD change instead of rebuilding it on every `isReachableFromHead` call. Keep existing tests green; add one test for the reusable checker.
  - Added `createReachabilityChecker(commits)` factory that builds the commit map once and returns a checker.
  - `CommitTooltip.tsx`: memoizes one checker per `mergedCommits` change — the loop over all merged commits now reuses a single map instead of rebuilding O(n) times.
  - `CommitContextMenu.tsx`: memoizes per-row to avoid rebuilding on unrelated re-renders. Note: each visible row still mounts its own checker; for further per-row reduction, hoist a precomputed `Set<string>` from `GraphContainer` (deferred — invasive prop-chain change, can pair with Step 6/9 row-interface work if profiling shows it's worth it).
- [x] **Step 5 — Profiling gate (USER INVOLVEMENT REQUIRED):** Profiled 7.58s of fast scrolling on a real repo. Result: **JS is not the bottleneck.**
  - Total breakdown: ~98% idle, **Scripting 78 ms (1%)**, Rendering 47 ms (0.6%), Painting 12 ms (0.2%).
  - Largest single cost: "Recalculate style" at 13 ms — a browser CSS cost, not JS.
  - `calculateTopology` did not appear in the trace (runs at load, not during scroll).
  - Disabling avatars showed no measurable difference; lower `overScan` (50 → 10) helped because fewer DOM rows = less style recalc, not because of JS.
- [ ] ~~**Step 6 — Item C:** Hoist `CompareABMarker` selection to `GraphContainer`.~~ **Skipped — profile shows ~zero JS cost during scroll, so removing subscriptions yields no measurable win. Risk not justified.**
- [x] **Step 7 — Item B:** Pass `graphColors` into `GraphCell` as a prop and remove its `useGraphStore` coupling.
  - Added `resolvePalette(graphColors)` helper in `colorUtils.ts` so the empty-palette fallback lives in one place.
  - `GraphCell` now takes `graphColors: readonly string[]` as a prop; no `useGraphStore` import.
  - `CommitRow` and `CommitTableRow` (which already destructure `graphColors` from `userSettings`) pass it through, and both also use `resolvePalette` for consistency.
- [ ] ~~**Step 8 — Item 1:** Replace bare `useGraphStore()` calls with explicit selectors.~~ **Skipped — same reason as Step 6. JS subscription cost during scroll is negligible per the trace.**
- [ ] ~~**Step 9 — Item E:** Convert context menus to lazy-mount inner-content pattern.~~ **Skipped — this was originally pitched as the largest per-row win (~600 subscriptions). The trace shows the cost of those subscriptions is invisible; the medium-high refactor risk is not justified.**
- [x] **Default `overScan` lowered from 50 → 20** in `package.json`. Confirmed in profile to be the only knob that materially affects scroll smoothness.
- [ ] ~~**Post-Step-9 profiling:** Re-run the trace.~~ Not needed — Steps 6/8/9 not pursued.

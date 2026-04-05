# 033 — Dotted-Line Graph Continuity Idea Spec 

## Problem Statement

When filters hide commits from the graph, the parent hash references still point to the original (unfiltered) commits. This causes **disconnected graph lines** where there should be visual continuity.

### Example (Author Filter)

Given a linear branch with commits (newest first):

```
A (author: Alice)  →  B (author: Bob)  →  C (author: Alice)
```

When Bob is excluded via the author filter, git log returns only A and C. But:

- Commit A has `parents: ["<hash-of-B>"]`
- Commit B is **not in the returned list** (filtered out by `git log --author`)
- Commit C has `parents: ["<hash-of-D>"]` (some earlier commit)

The topology algorithm (`graphTopology.ts:58-59`) builds `commitIndexByHash` from the filtered list. When processing A, it calls `commitIndexByHash.get(parentHash)` for B's hash — returns `undefined` — so **no connection is drawn**. A becomes a dead-end node and C starts a new disconnected line.

### Affected Filter Types

| Filter | Breaks parent chains? | Notes |
|---|---|---|
| **Author** | Yes — today | `--author` applied server-side removes intermediate commits |
| **Date range** | Not today, potentially in future | Currently server-side via `--after`/`--before`; git traverses ancestry correctly. But future enhancements (e.g., strict date windowing) could hide intermediate commits |
| **Search (future)** | Yes — when implemented | Searching by commit message/content will hide non-matching intermediate commits |
| **Custom filters (future)** | Likely | Any filter that selectively hides commits by property |

### Root Cause

The disconnection happens whenever a filter removes commits from the displayed list while their hashes still appear in other commits' parent references. The topology algorithm only sees the filtered commits and cannot resolve parent hashes that reference missing (filtered-out) commits.

This is a **generic problem** — not specific to any one filter type. The solution must be filter-agnostic.

---

## Proposed Solution: Two-Tier Filtering with Dotted-Line Connections

Introduce a **two-tier filtering architecture**:

1. **Structural filters** (server-side) — filters where git naturally preserves parent chain integrity: branch selection, `--all`/`--exclude`. These stay server-side.
2. **Visibility filters** (client-side) — filters that hide individual commits by property (author, future: search, custom). These move to the frontend so the topology algorithm has access to both visible AND hidden commits.

The topology algorithm becomes **filter-agnostic**: it receives all commits plus a `hiddenCommitHashes: Set<string>` (the union of all active visibility filters) and draws **dotted lines in the same lane color** through hidden segments.

### Visual Result

Before (current — disconnected):
```
  A ●          (Alice)
    |
    (gap — no line)

  C ●          (Alice)
    |
  D ●          (Alice)
```

After (proposed — dotted connection):
```
  A ●          (Alice)
    ┊  ← dotted line, same color as A's lane
  C ●          (Alice)
    |
  D ●          (Alice)
```

---

## Technical Details

### 1. Backend: Conditional Server-Side Filtering

**File:** `src/services/GitLogService.ts`

**Structural filters** remain server-side (they don't break parent chains):
- Branch selection (`revisionArgs`)
- `--exclude=refs/stash`, `--all`
- `--date-order`

**Visibility filters** are removed from git args when active so the frontend receives full commit data:

Currently (lines 40-46):
```typescript
if (filters?.authors && filters.authors.length > 0) {
  for (const email of filters.authors) {
    args.push(`--author=${email}`);
  }
} else if (filters?.author) {
  args.push(`--author=${filters.author}`);
}
```

**Change:** When `filters.authors` is set, do NOT add `--author` flags to git log. The `filters.author` (singular, deprecated) path used by `loadMoreCommits` can remain server-side for backward compatibility.

Date filters (`--after`, `--before`) remain server-side for now since they don't break parent chains. If a future enhancement changes this behavior, the same pattern applies: remove the server-side flag and add a client-side visibility filter.

**Pagination consideration:** With server-side filtering, requesting 500 commits returns 500 matching commits. With client-side filtering, we need 500 *visible* commits, which may require fetching more from git. Two options:

- **Option A (simple):** Fetch a larger batch (e.g., `maxCount * 3`) when any visibility filter is active. If still not enough, the existing "load more" mechanism handles it.
- **Option B (precise):** Stream commits until enough visible ones are collected.
- **Recommended:** Option A. The existing pagination/load-more infrastructure handles shortfalls gracefully.

### 2. Frontend Store: Generic Hidden-Commit Derivation

**File:** `webview-ui/src/stores/graphStore.ts`

Introduce a **filter-agnostic** hidden commit computation. Each visibility filter contributes to a single `hiddenCommitHashes: Set<string>`:

```typescript
// Generic function: computes hidden hashes from ALL active visibility filters
function computeHiddenCommitHashes(
  allCommits: Commit[],
  filters: GraphFilters
): Set<string> {
  const hidden = new Set<string>();

  // --- Author visibility filter ---
  if (filters.authors?.length) {
    const included = new Set(filters.authors);
    for (const commit of allCommits) {
      if (!included.has(commit.authorEmail)) {
        hidden.add(commit.hash);
      }
    }
  }

  // --- Future visibility filters plug in here ---
  // Example: search filter
  // if (filters.searchQuery) {
  //   for (const commit of allCommits) {
  //     if (!matchesSearch(commit, filters.searchQuery)) {
  //       hidden.add(commit.hash);
  //     }
  //   }
  // }

  return hidden;
}
```

**Store changes:**

- `commits` — holds the raw list from the backend (unfiltered when visibility filters are active)
- `mergedCommits` — the **visible** commits (all commits minus hidden ones, plus stashes)
- Topology is computed from **all commits**, with the hidden set passed in

```typescript
// In setCommits / recompute helper:
const hiddenHashes = computeHiddenCommitHashes(allCommits, filters);
const visibleCommits = allCommits.filter(c => !hiddenHashes.has(c.hash));
const mergedCommits = mergeStashesIntoCommits(visibleCommits, stashes, filters);
const topology = calculateTopology(allCommits, hiddenHashes); // new signature
```

**Key behavior:** When any visibility filter changes (e.g., toggling an author), **no backend round-trip** is needed. The store recomputes `hiddenHashes` and `mergedCommits` from the already-loaded full commit list. This makes filter toggling instant.

### 3. Topology Algorithm: Filter-Agnostic Hidden-Commit Awareness

**File:** `webview-ui/src/utils/graphTopology.ts`

The topology algorithm is completely **filter-agnostic** — it has no knowledge of which filter caused a commit to be hidden. It only knows "this commit is hidden."

**New function signature:**

```typescript
export function calculateTopology(
  commits: Commit[],
  hiddenHashes?: Set<string>
): GraphTopology
```

**Algorithm changes:**

The topology processes ALL commits (including hidden) to maintain correct lane assignments. For each commit:

1. **If visible:** Process normally (assign lane, draw connections) — same as today.
2. **If hidden:** Still assign a lane and process parents (to keep the lane reservation chain intact), but do NOT add the node to the output `nodes` map.

After processing, add a post-pass to create **skip connections** for visible commits:

```typescript
// For each visible commit, check if any parent is hidden.
// If so, walk through hidden parents until finding a visible ancestor.
// Create a "dotted" connection from this commit to that ancestor.

interface ParentConnection {
  parentHash: string;
  fromLane: number;
  toLane: number;
  colorIndex: number;
  reReserved?: boolean;
  isDotted?: boolean;       // NEW — indicates hidden commits exist between
  hiddenCount?: number;     // NEW — number of hidden commits in between
}
```

**Walk-through-hidden logic:**

```typescript
// Pseudocode for resolving skip connections:
for (const [hash, node] of nodes) {
  for (const conn of node.parentConnections) {
    if (!nodes.has(conn.parentHash) && hiddenHashes?.has(conn.parentHash)) {
      // Parent is hidden — walk the chain
      let current = conn.parentHash;
      let hiddenCount = 0;
      while (current && hiddenHashes.has(current)) {
        hiddenCount++;
        const hiddenCommit = commitByHash.get(current);
        if (!hiddenCommit) break;
        // Follow first parent (mainline)
        current = hiddenCommit.parents[0];
      }
      if (current && nodes.has(current)) {
        // Found visible ancestor — create dotted connection
        const ancestorNode = nodes.get(current)!;
        conn.parentHash = current;
        conn.toLane = ancestorNode.lane;
        conn.isDotted = true;
        conn.hiddenCount = hiddenCount;
      }
    }
  }
}
```

**Row indexing:** The `commitIndexByHash` and `passingLanesByRow` maps must be indexed by **visible** commit positions (since those are the rendered rows). The `computePassingLanes` function iterates visible commits only, but uses the topology nodes (which were assigned considering all commits).

### 4. GraphCell: Render Dotted Connections

**File:** `webview-ui/src/components/GraphCell.tsx`

For connections where `conn.isDotted === true`, use SVG `strokeDasharray` to render a dotted/dashed line instead of a solid one:

```tsx
// In the parent connections rendering section (line 123+):
const strokeProps = conn.isDotted
  ? { strokeDasharray: '4 3', opacity: 0.7 }
  : {};

// Apply to <line> and <path> elements:
<line
  x1={fromX} y1={nodeY + NODE_RADIUS}
  x2={toX}   y2={height}
  stroke={connColor}
  strokeWidth={2}
  {...strokeProps}
/>
```

Similarly, passing lanes (`passingLanesByRow`) that correspond to hidden segments should also be dotted:

```typescript
// In GraphTopology.passingLanesByRow:
passingLanesByRow: Map<number, { lane: number; colorIndex: number; isDotted?: boolean }[]>;
```

### 5. FilterWidget: Skip Backend Calls for Visibility Filters

**File:** `webview-ui/src/components/FilterWidget.tsx`

When toggling author selection (and future visibility filters), do NOT call `rpcClient.getCommits()`. Instead, only update the store filter state. The store recomputes hidden commits and topology locally.

```typescript
// Before (triggers backend round-trip):
setFilters({ authors });
rpcClient.getCommits({ ...useGraphStore.getState().filters, authors });

// After (frontend-only recompute):
setFilters({ authors });
// No rpcClient.getCommits() — store recomputes from cached full commit list
```

Backend round-trips are still needed when structural filters change (branch selection) or when loading more commits.

---

## Summary of File Changes

| File | Change |
|---|---|
| `src/services/GitLogService.ts` | Remove `--author` args when `filters.authors` is set; increase `maxCount` multiplier when visibility filters are active |
| `webview-ui/src/stores/graphStore.ts` | Add generic `computeHiddenCommitHashes()` function; derive hidden set from all active visibility filters; pass to topology; recompute on filter change without backend call |
| `webview-ui/src/utils/graphTopology.ts` | Add `hiddenHashes` param to `calculateTopology`; skip-connection resolution pass; extend `ParentConnection` with `isDotted`/`hiddenCount`; mark dotted passing lanes |
| `webview-ui/src/components/GraphCell.tsx` | Render dotted `strokeDasharray` for `isDotted` connections and passing lanes |
| `webview-ui/src/components/FilterWidget.tsx` | Remove `rpcClient.getCommits()` call on author toggle (and future visibility filter toggles) |

---

## Adding Future Visibility Filters

To add a new filter that hides commits (e.g., search-by-message):

1. **Add filter field** to `GraphFilters` in `shared/types.ts` (e.g., `searchQuery?: string`)
2. **Add filter block** in `computeHiddenCommitHashes()` — check the new filter field and add non-matching commit hashes to the hidden set
3. **Add UI control** — on change, update the store filter state (no backend call needed)
4. **If server-side args existed** for this filter, remove them from `GitLogService.ts` (same pattern as author)

No changes needed to the topology algorithm, rendering, or skip-connection logic — they are filter-agnostic.

---

## Edge Cases

- **Merge commits hidden:** When a hidden commit is a merge, follow its first parent (mainline) during the walk. Secondary parents of hidden commits are ignored for dotted-line purposes — they would create visual noise.
- **All commits between two visible ones hidden:** The dotted line spans the full gap. `hiddenCount` can optionally be displayed as a tooltip or small badge.
- **No visible ancestor found:** The dotted connection simply ends (the visible commit becomes a root-like node). This happens when all ancestors are by excluded authors or outside the filter criteria.
- **Multiple filters hiding the same commit:** A commit hidden by both author AND search filters is still just one entry in `hiddenCommitHashes`. The union-based approach handles this naturally.
- **Stash commits:** Stash resolution (post-loop) remains unchanged — stashes are never hidden by visibility filters.
- **Structural filters remain server-side:** Branch selection and date range filters continue to use git args, since they don't cause broken parent chains. If a future enhancement changes this, the same two-tier pattern applies.
- **Performance:** `computeHiddenCommitHashes()` iterates the full commit list once per filter change — O(n) per active visibility filter. For typical repo sizes (500-2000 loaded commits), this is negligible.

---

## Technical Investigation: Existing Batch Loading Architecture

The following details were investigated to inform the pagination adaptation for client-side filtering.

### Batch Size Configuration

**File:** `package.json` (lines 66-74)

```json
"speedyGit.batchCommitSize": {
  "type": "number",
  "default": 500,
  "minimum": 1,
  "markdownDescription": "Number of commits to load per batch..."
}
```

**Runtime retrieval:** `src/WebviewProvider.ts` (lines 1634-1637)
```typescript
private getBatchSize(): number {
  return this.getSettingsHandler?.().batchCommitSize
    ?? vscode.workspace.getConfiguration('speedyGit').get<number>('batchCommitSize', 500);
}
```

**Default in shared types:** `shared/types.ts` (lines 61-69) — `batchCommitSize: 500`

### Current Prefetch Trigger Mechanism

**File:** `webview-ui/src/components/GraphContainer.tsx` (lines 105-110)

```typescript
useEffect(() => {
  if (!hasMore || prefetching) return;
  if (rangeEnd !== undefined && rangeEnd >= lastBatchStartIndex) {
    rpcClient.firePrefetch();
  }
}, [rangeEnd, lastBatchStartIndex, prefetching, hasMore]);
```

- `rangeEnd`: Last visible row index from `@tanstack/react-virtual` virtualizer (`virtualizer.range?.endIndex`)
- `lastBatchStartIndex`: Set to the commit count BEFORE the latest batch was appended
- `prefetching`: Boolean lock preventing concurrent requests
- `hasMore`: Whether the repository has more commits to load

### How 2-Batch Startup Works

1. `setCommits()` loads batch 1 → sets `lastBatchStartIndex = 0` (`graphStore.ts:345`)
2. `useEffect` fires immediately: `rangeEnd` (~50) >= `lastBatchStartIndex` (0) → **true** → `firePrefetch()` triggers batch 2
3. `appendCommits()` receives batch 2 → sets `lastBatchStartIndex = commits.length` (the OLD length, i.e., batch 1 size) (`graphStore.ts:369`)
4. Now `rangeEnd` (~50) < `lastBatchStartIndex` (500 or 1000) → prefetch does NOT fire
5. User scrolls to row 500+ (or 1000+) → trigger fires → batch 3 loads
6. **Result**: Always 1 full batch loaded ahead of the viewport

### Prefetch Request Flow

**Frontend trigger:** `webview-ui/src/rpc/rpcClient.ts` (lines 488-494)
```typescript
firePrefetch() {
  const store = useGraphStore.getState();
  if (!store.hasMore || store.prefetching) return;
  store.setPrefetching(true);
  const { branches, author, authors, afterDate, beforeDate } = store.filters;
  this.loadMoreCommits(store.commits.length, store.fetchGeneration, { branches, author, authors, afterDate, beforeDate });
}
```

**Backend handler:** `src/WebviewProvider.ts` (lines 678-712)
- Calls `gitLogService.getCommits({ ...filters, maxCount: batchSize, skip })`
- Responds with `commitsAppended` message including `hasMore: commits.length >= batchSize`

**Frontend response:** `webview-ui/src/rpc/rpcClient.ts` (lines 54-61)
- Validates `generation` matches current `fetchGeneration` (discards stale responses)
- Calls `store.appendCommits()` and `store.setPrefetching(false)`

### appendCommits Store Action

**File:** `webview-ui/src/stores/graphStore.ts` (lines 355-373)
```typescript
appendCommits: (newCommits, totalLoadedWithoutFilter) => {
  const { commits, stashes, filters, totalLoadedWithoutFilter: existingTotal, selectedCommit } = get();
  const allCommits = [...commits, ...newCommits];
  const { mergedCommits, topology } = computeMergedTopology(allCommits, stashes, filters);
  // ...
  set({
    commits: allCommits,
    mergedCommits,
    topology,
    selectedCommitIndex,
    lastBatchStartIndex: commits.length,  // OLD length before append
    // ...
  });
},
```

### Overscan (Rendering Buffer — Separate from Data Buffer)

**File:** `package.json` (lines 104-110) — `speedyGit.overScan`, default 50 rows

Used by virtualizer at `GraphContainer.tsx:98`: `overscan: userSettings.overScan`

This renders extra DOM rows above/below the viewport to reduce flicker during fast scrolling. It is a **rendering buffer**, not a data-fetch buffer.

---

## Technical Investigation: Prefetch Adaptation for Client-Side Filtering

### The Problem

After this feature, the virtualizer operates on **visible commits only** (filtered list). But `lastBatchStartIndex` is set based on **total loaded commits**:

- Example: 2000 total loaded, filter hides 80% → 400 visible rows
- `lastBatchStartIndex = 1000` (total-based)
- `rangeEnd` maxes at ~400 (visible-based)
- **400 < 1000 → prefetch trigger NEVER fires**
- User scrolls to the end of 400 visible commits and gets stuck

### Solution: Filter-Aware Prefetch With Capping

**Principle:** The prefetch behavior with filters should match the unfiltered experience — load data ahead of the viewport as the user scrolls. But protect against runaway fetching when filters exclude most commits.

#### Part 1: Adapt Scroll Trigger for Visible Positions

**File to change:** `webview-ui/src/components/GraphContainer.tsx`

When a visibility filter is active, the prefetch trigger must compare `rangeEnd` against **visible commit boundaries**, not total loaded boundaries. The virtualizer's `count` is `visibleCommits.length`, so `rangeEnd` is already in visible-row terms.

Options:
- Track `lastBatchStartIndex` in visible-row terms when filters are active
- Or use a simpler threshold: trigger when `rangeEnd >= visibleCommits.length - threshold`

#### Part 2: Auto-Retry Empty Batches (Up to Cap)

**Files to change:** `webview-ui/src/stores/graphStore.ts`, `webview-ui/src/rpc/rpcClient.ts`

When a fetched batch yields zero visible commits after client-side filtering:

1. Increment a `consecutiveEmptyBatches` counter (new state in graphStore)
2. If `consecutiveEmptyBatches < 3` AND `hasMore` → automatically call `firePrefetch()` again
3. If counter reaches **3** → stop fetching, set a flag to show the gap indicator
4. If ANY batch yields ≥1 visible commit → reset counter to 0, resume normal behavior

**New store state fields:**
```typescript
consecutiveEmptyBatches: number;    // starts at 0, resets when visible commits found
filteredOutCount: number;           // running total of commits filtered out during empty batches
showGapIndicator: boolean;          // true when cap reached
```

**In `appendCommits` (or a new filter-aware variant):**
```typescript
// After appending and computing visible commits:
const newVisibleCount = visibleCommitsAfterAppend - visibleCommitsBefore;
if (newVisibleCount === 0) {
  consecutiveEmptyBatches++;
  filteredOutCount += newCommits.length;
  if (consecutiveEmptyBatches >= 3) {
    showGapIndicator = true;
    // Do NOT auto-prefetch
  } else {
    // Auto-prefetch next batch
    rpcClient.firePrefetch();
  }
} else {
  consecutiveEmptyBatches = 0;
  filteredOutCount = 0;
  showGapIndicator = false;
}
```

#### Part 3: Gap Indicator UI

**File to change:** `webview-ui/src/components/GraphContainer.tsx`

When `showGapIndicator` is true, render a UI element at the bottom of the commit list:

```
┌─────────────────────────────────────────────────────┐
│  [N] commits filtered out across 3 batches.         │
│  [Load more] or adjust your filters.                │
└─────────────────────────────────────────────────────┘
```

- "Load more" button: calls `firePrefetch()`, resets `consecutiveEmptyBatches` to 0 and `showGapIndicator` to false
- Or: detect scroll past the indicator to trigger the same action
- After clicking, the same 3-batch capping logic re-applies

#### Part 4: Generation Tracking (Already Exists)

The existing `fetchGeneration` mechanism (`graphStore.ts:64`, `rpcClient.ts:57`) already handles stale responses. When a filter changes mid-prefetch, `fetchGeneration` is incremented and the old response is discarded. No changes needed here.

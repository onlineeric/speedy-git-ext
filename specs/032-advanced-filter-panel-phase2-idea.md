# 033 — Advanced Filter Panel Phase 2: Dotted-Line Graph Continuity

## Problem Statement

When the author filter excludes an author, commits by that author are removed from the graph entirely. This causes **disconnected graph lines** where there should be visual continuity.

### Example

Given a linear branch with commits (newest first):

```
A (author: Alice)  →  B (author: Bob)  →  C (author: Alice)
```

When Bob is excluded via the author filter, git log returns only A and C. But:

- Commit A has `parents: ["<hash-of-B>"]`
- Commit B is **not in the returned list** (filtered out by `git log --author`)
- Commit C has `parents: ["<hash-of-D>"]` (some earlier commit)

The topology algorithm (`graphTopology.ts:58-59`) builds `commitIndexByHash` from the filtered list. When processing A, it calls `commitIndexByHash.get(parentHash)` for B's hash — returns `undefined` — so **no connection is drawn**. A becomes a dead-end node and C starts a new disconnected line.

### Root Cause

The author filter is applied at the **git command level** (backend) via `--author` flags in `GitLogService.ts:40-46`. The frontend receives only the filtered commits and computes topology from them. Parent hashes still reference the original (unfiltered) commits, so connections break when intermediate commits are missing.

This is different from the branch/date filters where the filtered commits still form valid parent chains (git traverses ancestry naturally for those).

---

## Proposed Solution: Frontend Author Filtering with Dotted-Line Connections

Move author filtering from the backend (`git log --author`) to the frontend. Fetch all commits regardless of author, then filter visibility in the frontend. The topology algorithm gains awareness of "hidden" commits and draws **dotted lines in the same lane color** to indicate hidden commits exist between two visible ones.

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

### 1. Backend: Remove `--author` from git log when using multi-author filter

**File:** `src/services/GitLogService.ts`

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

**Change:** When `filters.authors` is set, do NOT add `--author` flags to git log. Instead, fetch all commits and pass the author filter info to the frontend. The `filters.author` (singular, deprecated) path used by `loadMoreCommits` can remain server-side for backward compatibility.

The response payload should include a flag or the filter metadata so the frontend knows to apply client-side author filtering.

**Pagination consideration:** Currently, `maxCount` limits git log output. With server-side filtering, requesting 500 commits returns 500 matching commits. With client-side filtering, we need 500 *visible* commits, which may require fetching more from git. Two options:

- **Option A (simple):** Fetch a larger batch (e.g., `maxCount * 2` or a configurable multiplier) to ensure enough visible commits after filtering. If still not enough, the existing "load more" mechanism handles it.
- **Option B (precise):** Fetch all commits without `--max-count` when author filter is active. Only viable for repos with reasonable commit counts.
- **Recommended:** Option A. Use a multiplier (e.g., 3x) when author filter is active. The existing pagination/load-more infrastructure handles the rest.

### 2. Shared Types: Add `excludedAuthors` to filter metadata

**File:** `shared/types.ts`

The `GraphFilters` type stays the same (the `authors` field represents selected/included authors). The frontend needs to know which authors to hide. Add a utility or convention:

```typescript
// No type change needed — the frontend derives hidden commits from
// filters.authors (included emails) applied against the full commit list.
```

### 3. Frontend Store: Separate full commits from visible commits

**File:** `webview-ui/src/stores/graphStore.ts`

Currently, `commits` holds the filtered list from the backend, and `mergedCommits` includes stashes. The topology is computed from `mergedCommits`.

**Changes:**

- `commits` — continues to hold the raw list from the backend (now **unfiltered** when author filter is active)
- Add `hiddenCommitHashes: Set<string>` — derived from `filters.authors` applied against `commits`
- `mergedCommits` — the **visible** commits (all commits minus hidden ones, plus stashes)
- Topology is computed from **all commits** (including hidden), but with the hidden set passed in

When `setCommits` or `setFilters` (for authors) is called:

```typescript
// Pseudocode in setCommits / recompute helper:
const hiddenHashes = new Set<string>();
if (filters.authors?.length) {
  const includedEmails = new Set(filters.authors);
  for (const commit of allCommits) {
    if (!includedEmails.has(commit.authorEmail)) {
      hiddenHashes.add(commit.hash);
    }
  }
}

const visibleCommits = allCommits.filter(c => !hiddenHashes.has(c.hash));
const mergedCommits = mergeStashesIntoCommits(visibleCommits, stashes);
const topology = calculateTopology(allCommits, hiddenHashes); // new signature
```

Key behavior: when author filter changes, **no backend round-trip** is needed. The store recomputes `hiddenHashes` and `mergedCommits` from the already-loaded full commit list. This makes author toggling instant.

### 4. Topology Algorithm: Hidden-commit-aware lane assignment

**File:** `webview-ui/src/utils/graphTopology.ts`

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

### 5. GraphCell: Render dotted connections

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

Similarly, passing lanes (`passingLanesByRow`) that correspond to hidden segments should also be dotted. This requires extending the passing lanes data structure:

```typescript
// In GraphTopology.passingLanesByRow:
passingLanesByRow: Map<number, { lane: number; colorIndex: number; isDotted?: boolean }[]>;
```

### 6. Summary of File Changes

| File | Change |
|---|---|
| `src/services/GitLogService.ts` | Remove `--author` args when `filters.authors` is set; increase `maxCount` multiplier |
| `shared/types.ts` | Add `isDotted?: boolean` and `hiddenCount?: number` to topology connection types (internal, not in shared types — these are in `graphTopology.ts`) |
| `webview-ui/src/utils/graphTopology.ts` | Add `hiddenHashes` param to `calculateTopology`; skip-connection resolution pass; extend `ParentConnection` with `isDotted`/`hiddenCount`; mark dotted passing lanes |
| `webview-ui/src/stores/graphStore.ts` | Derive `hiddenCommitHashes` from filters; pass to topology; recompute on author filter change without backend call |
| `webview-ui/src/components/GraphCell.tsx` | Render dotted `strokeDasharray` for `isDotted` connections and passing lanes |
| `webview-ui/src/components/FilterWidget.tsx` | Remove `rpcClient.getCommits()` call on author toggle (filtering is now frontend-only) |

### 7. Edge Cases

- **Merge commits hidden:** When a hidden commit is a merge, follow its first parent (mainline) during the walk. Secondary parents of hidden commits are ignored for dotted-line purposes — they would create visual noise.
- **All commits between two visible ones hidden:** The dotted line spans the full gap. `hiddenCount` can optionally be displayed as a tooltip or small badge.
- **No visible ancestor found:** The dotted connection simply ends (the visible commit becomes a root-like node). This happens when all ancestors are by excluded authors.
- **Stash commits:** Stash resolution (post-loop) remains unchanged — stashes are never filtered by author.
- **Date/branch filters remain server-side:** Only author filtering moves to the frontend. Date and branch filters continue to use git args, since they don't cause broken parent chains (git traverses ancestry correctly for those).

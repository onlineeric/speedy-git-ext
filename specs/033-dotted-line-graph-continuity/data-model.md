# Data Model: Dotted-Line Graph Continuity

**Feature Branch**: `033-dotted-line-graph-continuity`  
**Date**: 2026-04-05

## Entity Modifications

### ParentConnection (Extended)

**File**: `webview-ui/src/utils/graphTopology.ts`

Existing fields:
- `parentHash: string` — Hash of the parent commit
- `fromLane: number` — Lane of the child (this commit)
- `toLane: number` — Lane of the parent commit
- `colorIndex: number` — Lane color for the connection
- `reReserved?: boolean` — Whether the connection was re-reserved to a different lane

New fields:
- `isDotted?: boolean` — `true` when the connection spans hidden (filtered-out) commits
- `hiddenCount?: number` — Number of hidden commits between the two visible commits in this connection

**Validation**: `hiddenCount` is only set when `isDotted` is `true`. Value is always ≥ 1.

---

### PassingLane (Extended)

**File**: `webview-ui/src/utils/graphTopology.ts` (within `passingLanesByRow`)

Current shape: `{ lane: number; colorIndex: number }`

New shape: `{ lane: number; colorIndex: number; isDotted?: boolean }`

- `isDotted?: boolean` — `true` when this passing lane segment passes through a hidden commit gap

---

### GraphTopology (No structural change)

**File**: `webview-ui/src/utils/graphTopology.ts`

Existing interface — no new fields. The `nodes` map excludes hidden commits. `passingLanesByRow` and `commitIndexByHash` are indexed by visible row positions only.

---

### GraphStore State (Extended)

**File**: `webview-ui/src/stores/graphStore.ts`

Repurposed existing field:
- `commits: Commit[]` — Now holds ALL loaded commits (visible + hidden) since the backend no longer applies `--author` filtering. No separate `allCommits` field is needed; the existing `commits` field naturally holds the full list.

New state fields:
- `hiddenCommitHashes: Set<string>` — Union of all commits hidden by active visibility filters
- `consecutiveEmptyBatches: number` — Counter for auto-retry cap (0-3); resets on finding visible commits
- `filteredOutCount: number` — Running total of commits filtered out during consecutive empty batches
- `showGapIndicator: boolean` — `true` when 3-batch cap is reached with no visible commits found

**State transitions**:
- On `setCommits()`: `commits` = received commits (all, since backend no longer filters by author); `hiddenCommitHashes` = computed from `commits` + active filters; `consecutiveEmptyBatches` = 0
- On `appendCommits()`: `commits` = existing + new; recompute `hiddenCommitHashes`; update `consecutiveEmptyBatches` based on visible yield
- On filter toggle (no backend call): recompute `hiddenCommitHashes` from `commits`; recompute `mergedCommits` and `topology`
- On gap indicator scroll-past: reset `consecutiveEmptyBatches` to 0, `showGapIndicator` to false, trigger prefetch

---

### calculateTopology Signature (Extended)

**File**: `webview-ui/src/utils/graphTopology.ts`

Current: `calculateTopology(commits: Commit[]): GraphTopology`

New: `calculateTopology(allCommits: Commit[], hiddenHashes?: Set<string>): GraphTopology`

When `hiddenHashes` is provided:
- All commits are processed for lane assignment
- Hidden commits are excluded from `nodes` output map
- `commitIndexByHash` maps only visible commits to their visible row indices
- Skip connections (dotted) are created in a post-pass

---

## Entity Relationships

```
commits (full list — all loaded, visible + hidden)
    │
    ├── hiddenCommitHashes (computed from commits + filters)
    │       │
    │       └── used by calculateTopology() to:
    │               ├── skip hidden nodes in output
    │               ├── create isDotted connections
    │               └── mark isDotted passing lanes
    │
    └── mergedCommits (visible only, with stashes)
            │
            └── rendered by GraphContainer/GraphCell
                    │
                    ├── solid lines (normal connections)
                    └── dotted lines (isDotted connections)
```

## Key Computed Values

| Value | Source | Recomputed On |
|-------|--------|---------------|
| `hiddenCommitHashes` | `computeHiddenCommitHashes(commits, filters)` | Filter toggle, new commits loaded |
| `mergedCommits` | `commits` filtered by `hiddenCommitHashes`, merged with stashes | Filter toggle, new commits loaded |
| `topology` | `calculateTopology(commits, hiddenCommitHashes)` | Filter toggle, new commits loaded |
| `consecutiveEmptyBatches` | Incremented on empty batch, reset on non-empty | Each prefetch response |
| `showGapIndicator` | `consecutiveEmptyBatches >= 3` | Each prefetch response |

# Contract: Topology API

**Feature**: Dotted-Line Graph Continuity  
**Date**: 2026-04-05

## calculateTopology

### Current Signature
```typescript
export function calculateTopology(commits: Commit[]): GraphTopology
```

### New Signature
```typescript
export function calculateTopology(
  commits: Commit[],
  hiddenHashes?: Set<string>
): GraphTopology
```

### Behavior Contract

**When `hiddenHashes` is `undefined` or empty**:
- Identical behavior to current implementation
- All commits appear as nodes in the output
- Backward compatible — no existing callers break

**When `hiddenHashes` is provided and non-empty**:
- `commits` parameter contains ALL commits (visible + hidden)
- All commits are processed for lane assignment (correct lane reservations)
- Hidden commits are excluded from `topology.nodes`
- `topology.commitIndexByHash` maps visible commits to visible row indices only
- A post-pass creates skip connections for visible commits whose parents are hidden:
  - Walks through hidden parents following first-parent (mainline)
  - Stops at the first visible ancestor
  - Sets `isDotted: true` and `hiddenCount: N` on the connection
  - If no visible ancestor found, connection is removed (commit becomes root-like)
- `topology.passingLanesByRow` marks lanes through hidden gaps as `isDotted: true`
- `topology.maxLanes` accounts for all commits (including hidden) to avoid lane collisions

### Output Types

```typescript
interface ParentConnection {
  parentHash: string;
  fromLane: number;
  toLane: number;
  colorIndex: number;
  reReserved?: boolean;
  isDotted?: boolean;       // true when hidden commits exist between
  hiddenCount?: number;     // number of hidden commits in between (≥1 when isDotted)
}

// passingLanesByRow entry
interface PassingLaneEntry {
  lane: number;
  colorIndex: number;
  isDotted?: boolean;       // true when passing through hidden segment
}
```

---

## computeHiddenCommitHashes

### Signature
```typescript
function computeHiddenCommitHashes(
  commits: Commit[],
  filters: GraphFilters
): Set<string>
```

### Behavior Contract

- Returns the union of all commit hashes hidden by active visibility filters
- Currently only author filter is a visibility filter
- A commit hidden by multiple filters is in the set exactly once
- Empty filters → empty set (all commits visible)
- Stash entries are never included in the hidden set

### Filter Rules

| Filter | Type | Hidden when |
|--------|------|------------|
| `filters.authors` (non-empty) | Visibility | `commit.authorEmail` not in `filters.authors` |
| `filters.branches` | Structural | N/A — handled server-side |
| `filters.afterDate` / `filters.beforeDate` | Structural | N/A — handled server-side |

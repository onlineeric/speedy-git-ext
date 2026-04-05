# Contract: GraphStore API Changes

**Feature**: Dotted-Line Graph Continuity  
**Date**: 2026-04-05

## New State Fields

```typescript
interface GraphStoreState {
  // Existing (repurposed — no new `allCommits` field needed)
  commits: Commit[];                    // now holds ALL loaded commits (visible + hidden),
                                        // since backend no longer applies --author filtering
  mergedCommits: Commit[];              // visible commits + stashes (filtered from `commits`)
  topology: GraphTopology;
  filters: GraphFilters;
  // ...existing fields...

  // New
  hiddenCommitHashes: Set<string>;      // computed from commits + filters
  consecutiveEmptyBatches: number;      // 0-3, resets on non-empty batch
  filteredOutCount: number;             // total filtered-out during consecutive empty run
  showGapIndicator: boolean;            // true when 3-batch cap reached
}
```

## Modified Actions

### setCommits(commits: Commit[])

**Before**: Stores commits, computes topology, resets state  
**After**: Same, plus:
- Computes `hiddenCommitHashes` from `commits` + `filters`
- Filters `commits` to produce visible-only list for `mergedCommits`
- Passes full `commits` + `hiddenCommitHashes` to `calculateTopology()`
- Resets `consecutiveEmptyBatches`, `filteredOutCount`, `showGapIndicator`

### appendCommits(newCommits: Commit[], totalLoadedWithoutFilter?: number)

**Before**: Appends commits, recomputes topology  
**After**: Same, plus:
- Recomputes `hiddenCommitHashes` for the full list
- Counts new visible commits; if zero, increments `consecutiveEmptyBatches`
- If `consecutiveEmptyBatches >= 3`: sets `showGapIndicator = true`
- If any visible: resets `consecutiveEmptyBatches = 0`, `showGapIndicator = false`

### setFilters(filters: Partial<GraphFilters>) — visibility filter path

**Before**: Updates filter state (caller triggers backend fetch)  
**After**: Updates filter state, then:
- Recomputes `hiddenCommitHashes` from existing `commits` + new filters
- Recomputes `mergedCommits` and `topology` from cached data
- **No backend round-trip** for visibility filter changes
- Increments `fetchGeneration` to discard any in-flight stale responses

### resetAllFilters()

**Before**: Clears all filters  
**After**: Same, plus:
- Clears `hiddenCommitHashes` (empty set)
- Recomputes `mergedCommits` to include all loaded commits
- Resets `consecutiveEmptyBatches`, `filteredOutCount`, `showGapIndicator`

## New Helper

### computeHiddenCommitHashes(commits, filters) → Set<string>

Pure function. Called by `setCommits`, `appendCommits`, and `setFilters`.
See topology-api.md contract for full specification.

## Prefetch Interaction

- `firePrefetch()` in `rpcClient.ts` must NOT include `author` (singular) or `authors` (plural) in the git log filters — the backend always fetches all authors
- On empty-batch auto-retry: `appendCommits` calls `rpcClient.firePrefetch()` if `consecutiveEmptyBatches < 3` and `hasMore`
- Gap indicator scroll-past: resets counters and triggers `firePrefetch()`

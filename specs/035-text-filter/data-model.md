# Data Model: Text Filter in Filter Widget

**Branch**: `035-text-filter` | **Date**: 2026-04-07

## Entity Changes

### GraphFilters (existing entity — `shared/types.ts:118`)

| Field | Type | Status | Description |
|-------|------|--------|-------------|
| `branches` | `string[]?` | Existing | Branch names to filter by |
| `author` | `string?` | Existing (deprecated) | Single author filter (backward compat) |
| `authors` | `string[]?` | Existing | Multi-author filter by email |
| `afterDate` | `string?` | Existing | ISO date lower bound |
| `beforeDate` | `string?` | Existing | ISO date upper bound |
| `maxCount` | `number` | Existing | Batch size for loading |
| `skip` | `number?` | Existing | Offset for pagination |
| **`textFilter`** | **`string?`** | **New** | **Plain text to match against commit subject and hash** |

### Validation Rules

- `textFilter` is optional. When `undefined` or empty string, no text filtering is applied.
- Text matching is case-insensitive.
- Hash matching requires `textFilter.length >= 4` (prefix match via `startsWith`).
- `textFilter` is purely client-side — it is NOT sent to the backend in `getCommits()` requests.

### State Transitions

```
textFilter: undefined → (user types text) → "search text"
                       → (user clears)    → undefined
                       → (reset all)      → undefined
```

### Relationships

- `textFilter` combines as AND with `authors` filter in `computeHiddenCommitHashes()`.
- `textFilter` combines as AND with `branches` and `afterDate`/`beforeDate` (those are server-side filters applied before `computeHiddenCommitHashes()` runs).
- `textFilter` does NOT interact with `searchState` (Search feature) — they are independent.

## No New Entities

No new types, interfaces, or data structures are introduced. The only change is adding one optional field to the existing `GraphFilters` interface.

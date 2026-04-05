# Data Model: Advanced Filter Panel

**Feature Branch**: `032-advanced-filter-panel`
**Date**: 2026-04-04

## Entities

### Author

Represents a unique commit author, identified by email address.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Display name (from most recent commit with this email) |
| `email` | `string` | Email address — **primary key** for deduplication |

**Location**: `shared/types.ts`

```typescript
export interface Author {
  name: string;
  email: string;
}
```

**Notes**:
- Sourced from full repository history across all branches via `git log --all --format='%an%x00%ae'`.
- Deduplicated by email on the backend. When multiple names map to the same email, the first encountered name wins (git's default order = most recent commit first).
- The author list is fetched once on initial load and refreshed on fetch/refresh operations.

### GraphFilters (extended)

The combined filter state. Existing fields are preserved; new fields added for author multi-select and date range.

| Field | Type | Description | Status |
|-------|------|-------------|--------|
| `branches` | `string[] \| undefined` | Selected branch names | Existing |
| `author` | `string \| undefined` | **@deprecated** Single author pattern (legacy, kept for loadMoreCommits compat). Add JSDoc `@deprecated` in types.ts. | Existing |
| `authors` | `string[] \| undefined` | Selected author emails for multi-author filtering | **New** |
| `afterDate` | `string \| undefined` | ISO 8601 date/datetime string for "from" filter | **New** |
| `beforeDate` | `string \| undefined` | ISO 8601 date/datetime string for "to" filter | **New** |
| `maxCount` | `number` | Maximum commits to fetch per batch | Existing |
| `skip` | `number \| undefined` | Pagination offset | Existing |

**Location**: `shared/types.ts`

```typescript
export interface GraphFilters {
  branches?: string[];
  author?: string;
  authors?: string[];
  afterDate?: string;   // ISO 8601, e.g., "2026-01-15" or "2026-01-15T14:30:00"
  beforeDate?: string;  // ISO 8601, e.g., "2026-03-01" or "2026-03-01T23:59:59"
  maxCount: number;
  skip?: number;
}
```

**Notes**:
- `authors` (plural) is the new multi-select field. The existing singular `author` field is retained for backward compatibility with `loadMoreCommits` pagination messages. During implementation, `authors` takes precedence — when `authors` is set, it is converted to multiple `--author=` flags in `GitLogService`.
- `afterDate` and `beforeDate` are ISO 8601 strings. The frontend formats dates before sending: From Date without time defaults to `YYYY-MM-DDT00:00:00`, To Date without time defaults to `YYYY-MM-DDT23:59:59`.
- All filter fields are AND-ed together by git natively (multiple `--author` flags are OR-ed among themselves but AND-ed with `--after`/`--before` and branch filters).

### Filter State (frontend store additions)

New fields added to the Zustand `GraphStore` interface.

| Field | Type | Description |
|-------|------|-------------|
| `authorList` | `Author[]` | Full list of unique authors from the repository |
| `authorListLoading` | `boolean` | Whether the author list is being fetched |

**Location**: `webview-ui/src/stores/graphStore.ts`

**Notes**:
- `authorList` is populated by the `authorList` response message.
- The selected authors are stored in `filters.authors` (the existing `filters` field in the store).
- Filter panel open/close state uses the existing `activeToggleWidget` mechanism.

## Relationships

```
GraphFilters (extended)
  ├── branches: string[]      → Branch.name / "remote/Branch.name"
  ├── authors: string[]       → Author.email (references)
  ├── afterDate: string       → ISO 8601 timestamp
  └── beforeDate: string      → ISO 8601 timestamp

Author
  ├── name: string            → Display text
  └── email: string           → Primary key, used in filters.authors[]

GraphStore
  ├── filters: GraphFilters   → Current active filter state
  └── authorList: Author[]    → Available authors for dropdown
```

## State Transitions

### Filter Lifecycle

```
Session Open / Repo Change
  → resetAllFilters()
  → filters = { maxCount: batchSize }
  → authorList = []
  → Trigger: getAuthors + getCommits

User Selects Author(s)
  → setFilters({ authors: [...selectedEmails] })
  → rpcClient.getCommits(filters)
  → Backend: git log --author=email1 --author=email2 ...

User Sets Date Range
  → setFilters({ afterDate: "2026-01-15T00:00:00", beforeDate: "2026-03-01T23:59:59" })
  → Debounce 150ms
  → rpcClient.getCommits(filters)
  → Backend: git log --after="2026-01-15T00:00:00" --before="2026-03-01T23:59:59"

User Clicks "Reset All"
  → resetAllFilters() — clears authors, afterDate, beforeDate
  → Branch filter preserved (FR-010: Reset All only clears author + date)
  → rpcClient.getCommits(filters)

Refresh / Fetch
  → Re-fetch author list (getAuthors)
  → Re-fetch commits with current filters
```

### Centralized Reset (FR-025)

```
resetAllFilters(options?: { preserveBranches?: boolean })
  When called from "Reset All" button:
    → preserveBranches = true
    → Clear: authors, afterDate, beforeDate
    → Keep: branches, maxCount

  When called from session open / repo change:
    → preserveBranches = false
    → Clear: branches, authors, afterDate, beforeDate
    → Keep: maxCount
```

## Validation Rules

| Rule | Field | Description |
|------|-------|-------------|
| Date required when time provided | `afterDate`, `beforeDate` | Time-only input rejected (FR-006). Frontend validates before sending. |
| Email deduplication | `Author.email` | Backend deduplicates authors by email before sending to frontend. |
| From/To date defaults | `afterDate`, `beforeDate` | When no time: From defaults to `T00:00:00`, To defaults to `T23:59:59` (FR-008). |
| Invalid date rejection | `afterDate`, `beforeDate` | Frontend validates date format; invalid values show validation indicator and are not sent to backend. |

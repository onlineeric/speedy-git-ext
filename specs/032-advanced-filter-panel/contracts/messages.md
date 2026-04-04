# Message Contracts: Advanced Filter Panel

**Feature Branch**: `032-advanced-filter-panel`
**Date**: 2026-04-04

This document defines the new and modified message types for the webview-extension communication protocol.

## New Request Messages

### `getAuthors`

Requests the full, deduplicated author list from the repository.

```typescript
{ type: 'getAuthors'; payload: Record<string, never> }
```

**When sent**: On initial load, after fetch/refresh operations.
**Backend handler**: Runs `git log --all --format='%an%x00%ae'`, deduplicates by email, returns sorted list.

## New Response Messages

### `authorList`

Returns the deduplicated list of authors from the repository.

```typescript
{ type: 'authorList'; payload: { authors: Author[] } }
```

**Fields**:
- `authors`: Array of `{ name: string; email: string }` objects, sorted alphabetically by name.

## Modified Request Messages

### `getCommits` (extended payload)

The existing `getCommits` message's `GraphFilters` type is extended with new fields.

```typescript
// Before:
{ type: 'getCommits'; payload: { filters?: Partial<GraphFilters> } }
// GraphFilters: { branches?, author?, maxCount, skip? }

// After:
{ type: 'getCommits'; payload: { filters?: Partial<GraphFilters> } }
// GraphFilters: { branches?, author?, authors?, afterDate?, beforeDate?, maxCount, skip? }
```

**New filter fields**:
- `authors?: string[]` — Array of author email addresses. Backend converts to multiple `--author=` flags.
- `afterDate?: string` — ISO 8601 date/datetime. Backend converts to `--after=`.
- `beforeDate?: string` — ISO 8601 date/datetime. Backend converts to `--before=`.

### `loadMoreCommits` (extended payload)

Pagination message extended to include new filter fields so subsequent batches maintain the same filters.

```typescript
// Before:
{ type: 'loadMoreCommits'; payload: { skip: number; generation: number; filters: { branches?: string[]; author?: string } } }

// After:
{ type: 'loadMoreCommits'; payload: { skip: number; generation: number; filters: { branches?: string[]; author?: string; authors?: string[]; afterDate?: string; beforeDate?: string } } }
```

### `refresh` (no structural change)

Already accepts `Partial<GraphFilters>` — the extended `GraphFilters` type automatically includes new fields.

### `fetch` (no structural change)

Already accepts `Partial<GraphFilters>` — the extended `GraphFilters` type automatically includes new fields.

## Message Flow Diagrams

### Initial Load

```
Webview                          Extension Host
  │                                    │
  │──── getAuthors ───────────────────>│
  │                                    │── git log --all --format='%an%x00%ae'
  │<─── authorList { authors } ────────│
  │                                    │
  │──── getCommits { filters } ───────>│
  │                                    │── git log [--author=...] [--after=...] [--before=...]
  │<─── commits { commits, ... } ──────│
```

### Filter Change (Author Selected)

```
Webview                          Extension Host
  │                                    │
  │  User selects author in dropdown   │
  │  → store.setFilters({ authors })   │
  │                                    │
  │──── getCommits { filters } ───────>│
  │                                    │── git log --author=email1 --author=email2
  │<─── commits { commits, ... } ──────│
```

### Filter Change (Date Range)

```
Webview                          Extension Host
  │                                    │
  │  User enters date in From field    │
  │  → debounce 150ms                  │
  │  → store.setFilters({ afterDate }) │
  │                                    │
  │──── getCommits { filters } ───────>│
  │                                    │── git log --after="2026-01-15T00:00:00"
  │<─── commits { commits, ... } ──────│
```

### Reset All (Manual)

```
Webview                          Extension Host
  │                                    │
  │  User clicks "Reset All"           │
  │  → store.resetAllFilters(          │
  │      { preserveBranches: true })   │
  │                                    │
  │──── getCommits { filters } ───────>│
  │       (authors, dates cleared;     │
  │        branches preserved)         │
  │<─── commits { commits, ... } ──────│
```

## Exhaustive Type Map Updates

The compile-time exhaustive maps in `shared/messages.ts` must be updated:

```typescript
// REQUEST_TYPES — add:
getAuthors: true,

// RESPONSE_TYPES — add:
authorList: true,
```

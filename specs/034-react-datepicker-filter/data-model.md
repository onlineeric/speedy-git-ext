# Data Model: 034-react-datepicker-filter

## Entities

### GraphFilters (existing, unchanged)

```typescript
// shared/types.ts — NO changes needed
interface GraphFilters {
  branches?: string[];
  author?: string;          // deprecated
  authors?: string[];
  afterDate?: string;       // ISO 8601: "YYYY-MM-DDTHH:MM:SS"
  beforeDate?: string;      // ISO 8601: "YYYY-MM-DDTHH:MM:SS"
  maxCount: number;
  skip?: number;
}
```

**Note**: The `afterDate` and `beforeDate` fields remain ISO 8601 strings. No type changes required. The react-datepicker `Date` ↔ string conversion is local to the FilterWidget component.

## State Transitions

### Date Picker Field State

```
[Empty] → (user types or picks date) → [Valid Date]
[Empty] → (user types invalid text) → [Invalid]
[Valid Date] → (user clicks clear) → [Empty]
[Valid Date] → (user modifies to invalid) → [Invalid]
[Invalid] → (user corrects input) → [Valid Date]
[Invalid] → (user clicks clear) → [Empty]
[Empty/Valid] ← (external: context menu sets date) → [Valid Date]
[Any] ← (external: Reset All) → [Empty]
```

### Filter Application Rules

| Field State | Filter Applied? | Store Value |
|-------------|----------------|-------------|
| Empty | No | `undefined` |
| Valid date-only | Yes | `YYYY-MM-DDT00:00:00` (From) / `YYYY-MM-DDT23:59:59` (To) |
| Valid date+time | Yes | `YYYY-MM-DDTHH:mm:00` |
| Invalid | No | Previous valid value retained in store |

## Data Flow (unchanged)

```
FilterWidget (Date objects) 
  → convert to ISO string 
  → graphStore.setFilters() 
  → rpcClient.getCommits() 
  → GitLogService (--after/--before flags) 
  → git process
```

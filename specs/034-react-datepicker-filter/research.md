# Research: 034-react-datepicker-filter

## react-datepicker Library Assessment

**Decision**: Use react-datepicker v9.x as the date/time picker component.

**Rationale**: Explicitly requested by user. It is the most popular React datepicker (9M+ weekly npm downloads), has built-in TypeScript types, supports React 18, and provides all required features natively.

**Alternatives considered**:
- Native HTML `<input type="date">` / `<input type="time">` (current) — limited styling, no calendar dropdown, inconsistent cross-browser
- `react-day-picker` — lighter but lacks built-in time input support
- Custom implementation — violates Constitution Principle IV (Library-First)

## Key Technical Findings

### Value Type
- react-datepicker uses native `Date` objects (`Date | null`), not strings
- Current codebase uses ISO 8601 strings (`YYYY-MM-DDTHH:MM:SS`) in the store and backend
- **Bridge needed**: Convert between `Date` objects (picker) and ISO strings (store) at the component boundary

### Props for Our Use Case

| Prop | Value | Purpose |
|------|-------|---------|
| `selected` | `Date \| null` | Current value |
| `onChange` | `(date: Date \| null) => void` | Date change handler |
| `dateFormat` | `["yyyy-MM-dd HH:mm", "yyyy-MM-dd"]` | Array enables parsing both formats |
| `showTimeInput` | `true` | Free-text time input in calendar popup |
| `timeInputLabel` | `"Time"` | Label for time input |
| `isClearable` | `true` | Built-in clear (x) button |
| `strictParsing` | `true` | Only accept exact format matches |
| `placeholderText` | `"YYYY-MM-DD HH:mm"` | Hint for expected format |

### Manual Typing & Validation
- Typing is enabled by default (no special prop needed)
- `onChangeRaw` fires on every keystroke — can be used for custom validation
- With `strictParsing: true`, only exact `dateFormat` matches are accepted
- `onInputError` fires when user submits (Enter/Tab) an unparseable value

### CSS Requirements
- **Mandatory CSS import**: `react-datepicker/dist/react-datepicker.css`
- Must override styles to match VS Code theme variables (`--vscode-input-background`, `--vscode-input-foreground`, etc.)
- Custom CSS overrides can be added in a separate file alongside the component

### Dependencies Introduced
- `react-datepicker@^9.1.0` — the picker component
- `date-fns@^4.1.0` — transitive dependency (date parsing/formatting)
- `@floating-ui/react@^0.27.15` — transitive dependency (popup positioning)

### Popup Positioning
- Uses `@floating-ui/react` with auto-flip middleware (15px padding)
- Default behavior should work in VS Code webview panels
- `portalId` available if calendar gets clipped by overflow-hidden containers

## Date Format Conversion Strategy

**Decision**: Convert at the FilterWidget boundary only; store/backend remain unchanged.

**Rationale**: Minimizes change scope. The component internally handles `Date` objects; conversion to/from ISO strings happens in two places:
1. **Store → Picker**: Parse `afterDate`/`beforeDate` ISO strings to `Date` objects for `selected` prop
2. **Picker → Store**: Format selected `Date` back to ISO string (`YYYY-MM-DDTHH:MM:SS`)

**Default time handling** (preserved from current logic):
- "From" field: defaults to `T00:00:00` when only date is provided
- "To" field: defaults to `T23:59:59` when only date is provided

## Validation Strategy

**Decision**: Use `strictParsing` + red border on invalid input.

**Rationale**: `strictParsing` ensures only `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` are accepted. Combined with the existing red border pattern, this provides clear feedback without error messages (per clarification).

**Validation rules**:
1. Empty input → valid (no filter applied)
2. `YYYY-MM-DD` → valid date-only
3. `YYYY-MM-DD HH:mm` → valid date+time
4. Time-only (e.g., `14:30`) → invalid
5. Partial date (e.g., `2025-03`) → invalid
6. Nonsense (e.g., `abc`) → invalid
7. Out-of-range (e.g., `2025-13-45`) → invalid (date-fns rejects)

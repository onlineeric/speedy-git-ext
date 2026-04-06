# Implementation Plan: Replace Filter Panel Date/Time Picker with react-datepicker

**Branch**: `034-react-datepicker-filter` | **Date**: 2026-04-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/034-react-datepicker-filter/spec.md`

## Summary

Replace the four native HTML date/time inputs in FilterWidget with two react-datepicker combined input fields (one "From", one "To"). Each field accepts date-only (`YYYY-MM-DD`) or date+time (`YYYY-MM-DD HH:mm`) input via calendar selection or manual typing. The existing ISO 8601 data flow to the Zustand store and backend remains unchanged.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: React 18, Zustand, react-datepicker 9.x (new), date-fns 4.x (transitive)
**Storage**: N/A (in-memory Zustand store, transient per session)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code Extension Webview (Vite + React ESM build)
**Project Type**: VS Code extension (desktop-app)
**Performance Goals**: Filter application within 150ms debounce (current behavior preserved)
**Constraints**: Must fit within existing filter panel layout; CSS must use VS Code theme variables
**Scale/Scope**: 2 date picker fields replacing 4 HTML inputs; single component change

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | No change to virtual scrolling, graph topology, or git operations. Debounce preserved. |
| II. Clean Code & Simplicity | PASS | Replacing 4 inputs with 2 library components simplifies the UI code. |
| III. Type Safety & Explicit Error Handling | PASS | react-datepicker has built-in TS types. Date↔string conversion is typed. No shared type changes. |
| IV. Library-First & Purpose-Built Tools | PASS | Using react-datepicker (battle-tested, 9M+ weekly downloads, TS support). Agent will NOT auto-install; install command provided in quickstart.md. |
| V. Dual-Process Architecture Integrity | PASS | Change is frontend-only (webview). No backend changes. No cross-boundary contract changes. |

**Agent Restrictions**: PASS — No commits, no package installation. Install command in quickstart.md for developer to run manually.

**Build Gates**: `pnpm typecheck` + `pnpm lint` + `pnpm build` + manual smoke test required before completion.

### Post-Phase 1 Re-check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | react-datepicker uses @floating-ui/react for lightweight positioning. No heavy DOM operations. |
| II. Clean Code & Simplicity | PASS | Single component file change. CSS overrides in one new file. |
| III. Type Safety | PASS | Date↔ISO string helper functions are typed. No `any` usage. |
| IV. Library-First | PASS | react-datepicker handles calendar rendering, positioning, and input parsing. |
| V. Architecture | PASS | Frontend-only. Shared types unchanged. Backend unchanged. |

## Project Structure

### Documentation (this feature)

```text
specs/034-react-datepicker-filter/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: react-datepicker research
├── data-model.md        # Phase 1: data model (GraphFilters unchanged)
├── quickstart.md        # Phase 1: setup & build instructions
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
webview-ui/src/
├── components/
│   ├── FilterWidget.tsx              # MODIFY: Replace HTML inputs with react-datepicker
│   └── datepicker-overrides.css      # NEW: VS Code theme CSS overrides for react-datepicker
```

**Structure Decision**: Minimal change footprint — one modified file, one new CSS file. All changes within the existing `webview-ui/src/components/` directory. No new directories, no backend changes.

## Complexity Tracking

> No constitution violations. No complexity justifications needed.

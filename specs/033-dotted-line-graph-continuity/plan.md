# Implementation Plan: Dotted-Line Graph Continuity

**Branch**: `033-dotted-line-graph-continuity` | **Date**: 2026-04-05 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/033-dotted-line-graph-continuity/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

When filters hide commits from the graph, parent hash references still point to the filtered-out commits, causing disconnected graph lines. This feature introduces a **two-tier filtering architecture**: structural filters (branch, date) remain server-side while visibility filters (author) move to client-side. The topology algorithm processes all commits for lane assignment but renders only visible ones, drawing **dotted lines** through hidden segments to maintain visual continuity. Filter toggling becomes instant (no backend round-trip), and a scroll-triggered prefetch with auto-retry and gap indicator handles pagination for filtered views.

## Technical Context

**Language/Version**: TypeScript 5.x (strict with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)  
**Primary Dependencies**: React 18, Zustand, @tanstack/react-virtual, Radix UI, Vite (webview), esbuild (extension)  
**Storage**: In-memory (Zustand store); filter state is transient, not persisted  
**Testing**: Manual smoke test via VS Code "Run Extension" launch config; `pnpm typecheck` + `pnpm lint` + `pnpm build`  
**Target Platform**: VS Code Extension (webview + extension host)  
**Project Type**: VS Code extension (desktop-app)  
**Performance Goals**: <100ms filter toggle for ≤2,000 commits; <500ms for ≤10,000 commits  
**Constraints**: Filter-agnostic architecture; no new package installations; graph topology stays in webview  
**Scale/Scope**: Typical 500–2,000 loaded commits; up to 10,000 for large repos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Performance First** | PASS | Client-side filtering eliminates backend round-trips for filter toggles. `computeHiddenCommitHashes()` is O(n) — negligible for ≤10k commits. Topology processes all commits but lane assignment is already O(n·k) where k=lanes. Prefetch auto-retry capped at 3 batches prevents runaway fetching. |
| **II. Clean Code & Simplicity** | PASS | Filter-agnostic design: single `hiddenHashes: Set<string>` abstraction regardless of filter type. Skip-connection post-pass is cleanly separated from main lane assignment. No speculative abstractions — future filters add one block to `computeHiddenCommitHashes()`. |
| **III. Type Safety & Explicit Error Handling** | PASS | New fields (`isDotted`, `hiddenCount`) extend existing `ParentConnection` interface with optional fields — backward compatible. No new shared types needed; existing `Commit` and `GraphFilters` interfaces suffice. |
| **IV. Library-First** | PASS | No new libraries needed. SVG `strokeDasharray` is native. Tooltip uses SVG `<title>` element. |
| **V. Dual-Process Architecture** | PASS | Backend removes server-side `--author` args (less work for extension host). Frontend gains `computeHiddenCommitHashes()` (filtering moves to webview). Communication protocol unchanged — same message types. Shared types unchanged. |

### Post-Design Re-Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Performance First** | PASS | Research R-002 confirms processing all commits for lane assignment is necessary and remains O(n·k). Skip-connection post-pass is O(v) where v=visible commits. `computePassingLanes()` iterates visible rows only. |
| **II. Clean Code & Simplicity** | PASS | Data model adds 5 store fields, 2 optional connection fields, 1 optional passing-lane field. No new abstractions or patterns introduced beyond `computeHiddenCommitHashes()`. |
| **III. Type Safety** | PASS | All new fields are optional (`isDotted?`, `hiddenCount?`) — existing code paths unaffected. `Set<string>` for hidden hashes is type-safe with no runtime cost. |
| **IV. Library-First** | PASS | No manual parsing introduced. |
| **V. Dual-Process Architecture** | PASS | Confirmed: no new message types needed. Backend simplifies (removes args); frontend gains filtering logic. Clean separation maintained. |

**Gate result**: ALL PASS — no violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/033-dotted-line-graph-continuity/
├── plan.md              # This file
├── research.md          # Phase 0 output — 7 research decisions
├── data-model.md        # Phase 1 output — entity modifications
├── quickstart.md        # Phase 1 output — build & test guide
├── contracts/
│   ├── topology-api.md  # calculateTopology new signature & behavior
│   └── store-api.md     # GraphStore state & action changes
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 output (from /speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── services/
│   └── GitLogService.ts          # Remove --author args
└── WebviewProvider.ts             # No changes (message types unchanged)

webview-ui/src/
├── stores/
│   └── graphStore.ts              # Add hiddenCommitHashes, auto-retry state; modify setCommits/appendCommits/setFilters (existing `commits` field now holds all loaded commits)
├── utils/
│   └── graphTopology.ts           # Add hiddenHashes param; skip-connection post-pass; dotted passing lanes
├── components/
│   ├── GraphCell.tsx              # Render dotted strokeDasharray; SVG <title> tooltip
│   ├── GraphContainer.tsx         # Adapt prefetch trigger for visible rows; render gap indicator
│   └── FilterWidget.tsx           # Remove rpcClient.getCommits() on author toggle
└── rpc/
    └── rpcClient.ts               # Exclude authors from git args in firePrefetch; handle auto-retry trigger

shared/
└── types.ts                       # No changes needed
```

**Structure Decision**: Existing dual-process architecture (extension host `src/` + webview `webview-ui/src/` + `shared/`) unchanged. All modifications are in existing files following existing patterns.

## Complexity Tracking

> No constitution violations detected. No complexity justifications needed.

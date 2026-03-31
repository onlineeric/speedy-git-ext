# Data Model: Responsive Split Layout for Bottom Commit Details Panel

**Date**: 2026-03-31

## Entities

No backend or shared data entities are introduced. This feature restructures presentation of existing commit detail data in the webview.

### Existing Entities (unchanged)

| Entity | Location | Relevance |
|--------|----------|-----------|
| `CommitDetails` | `shared/types.ts` | Supplies the subject, metadata, body, signature-related content, and changed files rendered by the panel |
| `FileChange` | `shared/types.ts` | Drives the files-changed section in both list and tree view modes |
| `PersistedUIState` | `shared/types.ts` | Already stores panel position and size; no new persisted fields are needed |

### New Frontend-Local View Model

| Type | Location | Description |
|------|----------|-------------|
| `BottomPanelLayoutMode` | `webview-ui/src/components/CommitDetailsPanel.tsx` or adjacent local helper | Derived UI state with values `stacked` or `split`, computed from current panel position and available width |

## Derived State Rules

| State | Inputs | Rule |
|-------|--------|------|
| `BottomPanelLayoutMode` | `detailsPanelPosition`, measured panel width, section minimum widths | `split` only when the panel is in bottom position and both sections can retain usable width; otherwise `stacked` |

## State Changes

### Existing Persistent State

| State Variable | Type | Default | Change |
|---------------|------|---------|--------|
| `detailsPanelPosition` | `DetailsPanelPosition` | `bottom` | Reused as-is |
| `bottomPanelHeight` | `number` | `280` | Reused as-is |
| `rightPanelWidth` | `number` | `400` | Reused as-is |
| `fileViewMode` | `FileViewMode` | `list` | Reused as-is |

### New Non-Persistent UI State

| State Variable | Type | Default | Persistence |
|---------------|------|---------|-------------|
| measured panel width | `number` | current rendered width | Not persisted |
| `BottomPanelLayoutMode` | `'stacked' | 'split'` | derived | Not persisted |

# Data Model: UI Enhancements for Merge Dialog and Inline Code Rendering

**Date**: 2026-03-30

## Entities

No new entities are introduced. This feature modifies rendering of existing data only.

### Existing Entities (unchanged)

| Entity | Location | Relevance |
|--------|----------|-----------|
| `MergeOptions` | `shared/types.ts:175-179` | Already includes `squash?: boolean` — no change needed |
| `MergeCommandOptions` | `webview-ui/src/utils/gitCommandBuilder.ts:10-15` | Already includes `squash?: boolean` — no change needed |
| `Commit` | `shared/types.ts` | Has `subject: string` — rendered with inline code parsing |
| `CommitDetails` | `shared/types.ts` | Has `subject: string` and `body: string` — both rendered with inline code parsing |

### New Utility Types

| Type | Location | Description |
|------|----------|-------------|
| `InlineCodeSegment` | `webview-ui/src/utils/inlineCodeRenderer.tsx` | `{ text: string; isCode: boolean }` — intermediate representation from backtick parsing |

## State Changes

### MergeDialog Component State

| State Variable | Type | Default | New? |
|---------------|------|---------|------|
| `noCommit` | `boolean` | `false` | Existing |
| `noFastForward` | `boolean` | `false` | Existing |
| `squash` | `boolean` | `false` | **NEW** |

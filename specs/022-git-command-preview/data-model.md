# Data Model: Centralize Git Command Preview for All Dialogs

**Branch**: `022-git-command-preview` | **Date**: 2026-03-26

## Overview

This feature introduces no new persistent data or state management. All command strings are computed on-the-fly from existing dialog state via pure functions. The only new "data" is the set of typed option objects passed to builder functions.

## Builder Function Option Types

All types below either already exist in `shared/types.ts` or are local to the builder utility. No new shared types are needed.

### Existing Types (from `shared/types.ts`)

| Type | Fields | Used By |
|------|--------|---------|
| `PushForceMode` | `'none' \| 'force-with-lease' \| 'force'` | `buildPushCommand` |
| `ResetMode` | `'soft' \| 'mixed' \| 'hard'` | `buildResetCommand` |
| `MergeOptions` | `noCommit: boolean, noFastForward: boolean, squash?: boolean` | `MergeCommandOptions` (extends with `branch`) |
| `CherryPickOptions` | `appendSourceRef: boolean, noCommit: boolean, mainlineParent?: number` | `buildCherryPickCommand` |

### New Local Types (in `gitCommandBuilder.ts`)

These are option interfaces for builder functions that don't have existing shared types:

```
PushCommandOptions
  ├── remote: string
  ├── branch: string
  ├── setUpstream: boolean
  └── forceMode: PushForceMode

MergeCommandOptions
  ├── branch: string
  ├── noCommit: boolean
  ├── noFastForward: boolean
  └── squash?: boolean

RebaseCommandOptions
  ├── targetRef: string
  └── ignoreDate: boolean

ResetCommandOptions
  ├── hash: string
  └── mode: ResetMode

RevertCommandOptions
  ├── hash: string
  └── mainlineParent?: number

DropCommitCommandOptions
  └── hash: string

CherryPickCommandOptions
  ├── hashes: string[]
  ├── appendSourceRef: boolean
  ├── noCommit: boolean
  └── mainlineParent?: number

CheckoutCommandOptions
  ├── branch: string
  └── pull: boolean

TagCommandOptions
  ├── name: string
  ├── hash: string
  └── message?: string
```

### Component Props

```
CommandPreviewProps
  └── command: string

ConfirmDialogProps (extended)
  └── commandPreview?: string  (NEW optional prop)

RebaseConfirmDialogProps (extended)
  └── targetRef?: string  (NEW optional prop)
```

## Data Flow

```
Dialog State (existing)
    │
    ▼
Builder Function (pure, stateless)
    │  Input: typed options object
    │  Output: command string
    ▼
CommandPreview Component (stateless render)
    │  Input: command string
    │  Output: readonly input + Copy button
    ▼
Clipboard API (on user click)
```

No stores, no side effects, no async operations in the builder path. The only side effect is the clipboard write on Copy button click, which is encapsulated in the CommandPreview component.

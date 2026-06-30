# Implementation Plan: Tag Enhancements

**Branch**: `048-tag-enhancements` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/048-tag-enhancements/spec.md`

## Summary

Close the three dead-ends in the existing tag workflow while keeping the app
speedy and strictly local-only:

1. **Tag metadata visibility** — read annotation message, tagger, date, and
   annotated-vs-lightweight via one local `git for-each-ref refs/tags` call,
   loaded with deferred data and cached in the store, surfaced in the tag badge
   tooltip (the multi-line native `title`, the same mechanism RefLabel already
   uses for worktree paths).
2. **Create + push in one action** — add an "Also push to remote" checkbox
   (default on) to `TagCreationDialog`; the `createTag` handler chains the
   existing `createTag` + `pushTag` ops.
3. **Delete + delete-from-remote** — replace the plain tag delete confirm with a
   dialog carrying an "Also delete from remote" checkbox (default on), mirroring
   `DeleteBranchDialog`; the `deleteTag` handler chains local delete + remote
   delete with benign-no-op handling for a missing remote ref.
4. **Force on push paths** — add a "Force" checkbox (default off) to both the
   create-and-push flow and the standalone "Push Tag" action, appending
   `--force` to the push.

No new network reads, no remote-tag-state queries, no tag-move/retag. The work
is concentrated in `GitTagService`, `tagHandlers`, the two tag dialogs/menus, the
deferred-data loader, the Zustand store, and the shared message/type contracts.

## Technical Context

**Language/Version**: TypeScript 5.x (strict: `noUnusedLocals`,
`noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**: Backend — Node.js extension host, `GitExecutor`
(spawns git, `Result<T, GitError>`); Frontend — React 18, Zustand, Radix UI
(`@radix-ui/react-dialog`, `@radix-ui/react-alert-dialog`, context menu),
Tailwind. No new packages.
**Storage**: N/A — tag metadata is read fresh from git and cached in transient
Zustand state (invalidated on refresh). No persistence.
**Testing**: Vitest (`pnpm test`); existing `src/__tests__/GitTagService.test.ts`
is the pattern (spy on `executor.execute`, assert `args`).
**Target Platform**: VS Code Extension (API 1.80+), webview + extension host.
**Project Type**: VS Code extension — dual-process (backend `src/`, webview
`webview-ui/src/`), shared contracts in `shared/`.
**Performance Goals**: Tag metadata read once per load (single git call for all
tags), O(1) lookup by tag name on hover, zero network and zero per-hover work.
Must not delay initial graph render (loaded as deferred data).
**Constraints**: Local-only (no `git ls-remote`, no host API). All git ops return
`Result<T, GitError>`. Graph topology stays in the webview. 30 s default git
timeout (push/delete-remote get the existing 60 s network timeout).
**Scale/Scope**: Repos with up to thousands of tags — one `for-each-ref` call
scales linearly and runs off the render path.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Performance First** | PASS — metadata read via a single local `for-each-ref`, off the render path (deferred data), cached by tag name for O(1) hover; no network on render or hover. Push/remote-delete reuse the established 60 s network timeout. |
| **II. Clean Code & Simplicity** | PASS — reuses existing patterns (deferred-data loader, `DeleteBranchDialog` local/remote model, command preview, `resolveDefaultRemote`); new logic is a thin chain of existing ops plus one parser. No speculative abstraction (YAGNI: signature-in-tooltip and Commit-Details surfacing are explicitly deferred). |
| **III. Type Safety & Explicit Error Handling** | PASS — new `TagMetadata` entity added to `shared/types.ts`; `createTag`/`deleteTag`/`pushTag` payloads extended in `shared/messages.ts` (single source of truth); all new git ops return `Result<T, GitError>`; benign-no-op detection is an explicit stderr check, genuine failures surface. |
| **IV. Library-First & Purpose-Built** | PASS — uses git's own `for-each-ref` typed format (`%(...)` fields, null-byte separated) rather than regex-scraping; no new packages; no auto-install. |
| **V. Dual-Process Architecture Integrity** | PASS — all git I/O stays in `GitTagService`/`GitLogService` (backend); rendering/caching stays in webview; new data crosses only via typed messages in `shared/`. |

**Result**: PASS — no violations, Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/048-tag-enhancements/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (for-each-ref format, tooltip, chaining, no-op)
├── data-model.md        # Phase 1 — TagMetadata entity + message contract changes
├── quickstart.md        # Phase 1 — manual verification walkthrough
├── contracts/
│   └── rpc-contracts.md  # Phase 1 — RPC message shape changes + deferred metadata message
├── checklists/
│   └── requirements.md   # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
shared/
├── types.ts                     # ADD: TagMetadata interface; tag annotated/lightweight enum-ish flag
└── messages.ts                  # CHANGE: createTag (+push,+force,+remote), deleteTag (+deleteRemote),
                                  #         pushTag (+force); ADD tagMetadata response message

src/                             # Backend (extension host)
├── services/
│   ├── GitTagService.ts         # CHANGE: pushTag(+force); deleteRemoteTag (benign no-op); 
│   │                            #         ADD getTagMetadata() via for-each-ref
│   └── GitLogService.ts         # (reference) parsing conventions for for-each-ref output
├── utils/
│   └── gitParsers.ts            # ADD: parseTagMetadata(stdout) → TagMetadata[]
└── webview/
    ├── handlers/tagHandlers.ts  # CHANGE: createTag chains push; deleteTag chains remote delete;
    │                            #         pushTag honors force (tag metadata rides deferred data, not a new request)
    └── RepoDataLoader.ts        # CHANGE: read + post tag metadata in sendDeferredRepoData

webview-ui/src/                  # Frontend (webview)
├── components/
│   ├── TagCreationDialog.tsx    # CHANGE: "Also push to remote" (default on) + "Force" (default off)
│   ├── BranchContextMenu.tsx    # CHANGE: tag delete → DeleteTagDialog; Push Tag → push dialog w/ force
│   ├── DeleteTagDialog.tsx      # ADD (or extend DeleteBranchDialog pattern): local + remote delete
│   ├── PushTagDialog.tsx        # ADD (optional): standalone push with Force + remote (or inline)
│   └── RefLabel.tsx             # CHANGE: tag badge title enriched from cached metadata
├── stores/
│   └── graphStore.ts            # ADD: tagMetadata: Record<string, TagMetadata>; setter; clear-on-refresh
├── rpc/
│   └── rpcClient.ts             # CHANGE: createTag/deleteTag/pushTag signatures; handle tagMetadata msg
└── utils/
    ├── gitCommandBuilder.ts     # CHANGE: tag command builders (push --force, delete-remote, create+push)
    └── resolveDefaultRemote.ts  # (reuse) default remote for push/remote-delete
```

**Structure Decision**: Single existing dual-process VS Code extension. This
feature touches the established tag slice across all three layers
(`shared/` contracts → `src/` services+handlers → `webview-ui/` dialogs+store)
and adds no new top-level structure. New UI is one dialog (delete-tag) plus
checkboxes on the existing create dialog; backend adds one read method and one
parser and extends three existing ops.

## Complexity Tracking

No constitution violations — section intentionally empty.

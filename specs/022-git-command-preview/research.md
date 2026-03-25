# Research: Centralize Git Command Preview for All Dialogs

**Branch**: `022-git-command-preview` | **Date**: 2026-03-26

## Summary

No significant unknowns — this feature is purely frontend, uses existing patterns, and requires no new dependencies. Research focused on verifying backend command behavior matches planned builder output and identifying the exact insertion points in each dialog.

## Findings

### 1. Command Builder Function Signatures (mapped from backend services)

**Decision**: Each builder function takes a typed options object and returns a string. Signatures derived from backend service implementations to ensure accuracy.

**Rationale**: Backend services in `src/services/` are the source of truth for what git commands are actually executed. Builder functions mirror these but for display purposes.

**Backend-to-builder mapping**:

| Builder | Backend Source | Command Pattern |
|---------|--------------|-----------------|
| `buildPushCommand` | Existing in PushDialog.tsx:19-32 | `git push [-u] [--force-with-lease\|--force] <remote> <branch>` |
| `buildMergeCommand` | GitBranchService.ts:188-205 | `git merge [--squash] [--no-commit] [--no-ff] <branch>` |
| `buildRebaseCommand` | GitRebaseService.ts:83-107 | `git rebase [--ignore-date] <targetRef>` |
| `buildCherryPickCommand` | GitCherryPickService.ts:32-61 | `git cherry-pick [-m N] [-x] [--no-commit] <hash...>` |
| `buildResetCommand` | GitHistoryService.ts:17-28 | `git reset --<mode> <hash>` |
| `buildRevertCommand` | GitRevertService.ts:40-86 | `git revert --no-edit [-m N] <hash>` |
| `buildDropCommitCommand` | GitRebaseService.ts (interactive) | `git rebase -i <hash>~1  # drop <hash>` |
| `buildCheckoutCommand` | N/A (simple checkout) | `git checkout <branch> [&& git pull]` |
| `buildTagCommand` | rpcClient.createTag() | `git tag [-a] <name> [-m "<message>"] <hash>` |

**Alternatives considered**: Generating command strings in the backend and passing them via messages. Rejected because: (1) adds unnecessary cross-boundary complexity, (2) all needed data is already available in the frontend, (3) command builders are pure functions ideal for unit testing.

### 2. Cherry-Pick Flag Interaction: -x suppressed when --no-commit

**Decision**: When `noCommit` is true, omit `-x` flag even if `appendSourceRef` is true.

**Rationale**: The `-x` flag appends "(cherry picked from commit ...)" to the commit message. When `--no-commit` is used, there is no commit message to append to. The backend (`GitCherryPickService.ts:44-47`) enforces this same rule: `if (options.appendSourceRef && !options.noCommit) args.push('-x')`.

### 3. Merge Dialog: noCommit implies noFastForward

**Decision**: When `noCommit` is true in the merge command builder, always include `--no-ff` alongside `--no-commit`.

**Rationale**: The backend (`GitBranchService.ts:196`) pushes both `--no-commit` and `--no-ff` when `noCommit` is true. The MergeDialog UI (line 17) also forces `noFastForward: true` when `noCommit` is true.

### 4. ConfirmDialog Extension Point for Reset

**Decision**: Add optional `commandPreview?: string` prop to ConfirmDialog. When provided, render `<CommandPreview>` between `<AlertDialog.Description>` and the button container.

**Rationale**: ConfirmDialog (56 lines) is a simple, narrow-purpose component. Adding a single optional string prop is the minimal change needed. A broader `children` prop was considered but rejected — it would open the component to arbitrary content injection beyond what's needed.

### 5. RebaseConfirmDialog: Adding targetRef prop

**Decision**: Add optional `targetRef?: string` prop. When provided, compute and display the command preview. Backward compatible — existing callers without targetRef continue to work (no preview shown).

**Rationale**: RebaseConfirmDialog currently receives only `title` and `description` as strings — it has no knowledge of the rebase target. Both callers (CommitContextMenu and BranchContextMenu) have access to the target ref and can pass it.

### 6. Tag Command Variants

**Decision**: Two command formats depending on whether an annotation message is provided:
- Lightweight: `git tag <name> <hash>`
- Annotated: `git tag -a <name> -m "<message>" <hash>`

**Rationale**: The backend calls `rpcClient.createTag(name, hash, message?)`. When message is provided, it creates an annotated tag; otherwise lightweight. The builder mirrors this distinction.

### 7. Existing Test Patterns

**Decision**: Follow the established vitest pattern from `mergeRefs.test.ts` — one `describe` block per builder function, `it()` blocks for each flag combination.

**Rationale**: Consistency with existing test files in `webview-ui/src/utils/__tests__/`. Imports: `{ describe, it, expect } from 'vitest'`. Types imported from `@shared/types` via the `@shared` path alias.

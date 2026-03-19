# Data Model: Rebase Branch on Branch Badge Context Menu

## No Data Model Changes

This feature modifies only the visibility condition of an existing menu item in `BranchContextMenu.tsx`. No new entities, types, state fields, or message types are introduced.

### Existing entities used (no modifications):

| Entity | Location | Role in this feature |
|--------|----------|---------------------|
| `RefInfo` | `shared/types.ts` | Identifies the branch badge being right-clicked (name, type, remote) |
| `Branch` | `shared/types.ts` | Used to find `headBranch` (current branch) and `targetBranch` (target hash) |
| `graphStore.branches` | `webview-ui/src/stores/graphStore.ts` | Source of branch data for condition evaluation |
| `graphStore.rebaseInProgress` | `webview-ui/src/stores/graphStore.ts` | Guards rebase visibility during in-progress operations |
| `graphStore.loading` | `webview-ui/src/stores/graphStore.ts` | Guards rebase visibility during loading |

### Store selector change:

The `mergedCommits` selector (`useGraphStore((s) => s.mergedCommits)`) can be removed from `BranchContextMenu.tsx` since it is no longer used in the `canRebaseOnto` condition. This is a cleanup, not a data model change.

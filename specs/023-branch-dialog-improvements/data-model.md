# Data Model: Branch Checkout & Delete Dialog Improvements

## Existing Entities (No Changes)

### Branch
Already defined in `shared/types.ts`. Used as-is for detecting remote counterparts.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Branch name (without remote prefix, e.g., `feature-x`) |
| remote | string? | Remote name (e.g., `origin`). Undefined for local branches |
| current | boolean | Whether this is the currently checked-out branch |
| hash | string | Commit hash the branch points to |

## Modified Entities

### deleteBranch Request Message Payload
Extend existing payload in `shared/messages.ts`.

| Field | Type | Description | Change |
|-------|------|-------------|--------|
| name | string | Branch name to delete | Existing |
| force | boolean? | Force delete (`-D` vs `-d`) | Existing |
| deleteRemote | `{ remote: string; name: string }`? | Remote branch to also delete | **NEW** |

### deleteBranchNeedsForce Response Message Payload
Extend existing payload in `shared/messages.ts`.

| Field | Type | Description | Change |
|-------|------|-------------|--------|
| name | string | Branch name that needs force delete | Existing |
| deleteRemote | `{ remote: string; name: string }`? | Remote delete option to preserve across dialog transition | **NEW** |

### pendingForceDeleteBranch (Zustand Store)
Change from `string | null` to object type in `graphStore.ts`.

**Before**: `string | null` (branch name only)
**After**: `{ name: string; deleteRemote?: { remote: string; name: string } } | null`

## State Transitions

### Delete Branch Flow

```
[User clicks "Delete Branch"]
  → DeleteBranchDialog opens (with checkbox if remote counterpart exists)
  → User optionally checks "Also delete remote branch"
  → User clicks "Delete"
  → Send deleteBranch { name, deleteRemote? }
  → Backend: git branch -d <name>
    ├── SUCCESS
    │   ├── deleteRemote specified → git push <remote> --delete <name>
    │   │   ├── SUCCESS → success response
    │   │   └── FAIL → error response (local already deleted)
    │   └── no deleteRemote → success response
    └── FAIL (not fully merged)
        → Send deleteBranchNeedsForce { name, deleteRemote? }
        → Store updates pendingForceDeleteBranch with deleteRemote info
        → Force-delete dialog opens (checkbox pre-populated from previous state)
        → User clicks "Force Delete"
        → Send deleteBranch { name, force: true, deleteRemote? }
        → Backend: git branch -D <name>
        → (then deleteRemote if specified, same as above)
```

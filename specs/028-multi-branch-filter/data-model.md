# Data Model: Multi-Branch Filter Selection

**Feature**: 028-multi-branch-filter  
**Date**: 2026-03-31

## Type Changes

### GraphFilters (shared/types.ts)

**Before:**
```typescript
interface GraphFilters {
  branch?: string;
  author?: string;
  maxCount: number;
  skip?: number;
}
```

**After:**
```typescript
interface GraphFilters {
  branches?: string[];
  author?: string;
  maxCount: number;
  skip?: number;
}
```

**Rules:**
- `branches` is `undefined` or empty array → show all branches (no filter)
- `branches` contains 1+ entries → filter to commits reachable from those refs
- Each entry is a branch name string (local: `"main"`, remote: `"origin/main"`)
- No duplicates enforced at the store level (toggle add/remove prevents duplicates)

### FilterableBranchDropdown Props

**Before:**
```typescript
interface FilterableBranchDropdownProps {
  branches: Branch[];
  selectedBranch: string | undefined;
  onBranchSelect: (branch: string | undefined) => void;
}
```

**After:**
```typescript
interface FilterableBranchDropdownProps {
  branches: Branch[];
  selectedBranches: string[];
  onBranchToggle: (branch: string) => void;
  onClearSelection: () => void;
}
```

### loadMoreCommits message filter type (shared/messages.ts)

**Before:**
```typescript
{ type: 'loadMoreCommits'; payload: { skip: number; generation: number; filters: { branch?: string; author?: string } } }
```

**After:**
```typescript
{ type: 'loadMoreCommits'; payload: { skip: number; generation: number; filters: { branches?: string[]; author?: string } } }
```

## State Flow

1. User toggles branch in dropdown → `onBranchToggle("branch-name")`
2. ControlBar adds/removes from `branches[]` → `setFilters({ branches: [...] })`
3. Store updates → `rpcClient.getCommits({ ...filters, branches })` fires immediately
4. Message sent to extension host with `branches: string[]`
5. `WebviewProvider` validates branches still exist, passes to `GitLogService`
6. `GitLogService` pushes each branch as positional arg: `git log branch1 branch2 ...`
7. Commits returned, graph re-rendered

## No New Entities

No new shared types, interfaces, or data structures beyond the changes above. The `Branch`, `Commit`, `RefInfo`, and message types remain unchanged.

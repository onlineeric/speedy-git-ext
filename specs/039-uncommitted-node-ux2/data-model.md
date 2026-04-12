# Data Model: Uncommitted Node UX2

## Existing Entities (no changes)

### FileChange
**Location**: `shared/types.ts`
```typescript
interface FileChange {
  path: string;
  oldPath?: string;
  status: FileChangeStatus;  // 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'unknown'
  additions?: number;
  deletions?: number;
  stageState?: FileStageState; // 'staged' | 'unstaged' | 'conflicted'
}
```
Used by: commit details panel file list, file picker dialog file list (both staged and unstaged sections).

### FileViewMode
**Location**: `shared/types.ts`
```typescript
type FileViewMode = 'list' | 'tree';
```
Shared between: commit details panel and file picker dialog. Persisted via `rpcClient.persistUIState({ fileViewMode })`.

### FileTreeNode
**Location**: `webview-ui/src/utils/fileTreeBuilder.ts`
```typescript
interface FileTreeNode {
  id: string;
  name: string;
  isFolder: boolean;
  depth: number;
  children?: FileTreeNode[];
  fileChange?: FileChange;
}
```
Used by: `FileChangesTreeView` for rendering the hierarchical tree view. Extended with a new utility function.

## New Utility Function

### getDescendantFilePaths
**Location**: `webview-ui/src/utils/fileTreeBuilder.ts`
```typescript
function getDescendantFilePaths(node: FileTreeNode): string[]
```
Recursively collects all `fileChange.path` values from leaf nodes under a folder node. Used by the tri-state folder checkbox in the selectable tree view to determine checked/partial/unchecked state and to toggle all descendants on folder click.

## New Component Props (no new entities — these are component interfaces)

### SelectableFileListProps
```typescript
interface SelectableFileListProps {
  title: string;
  files: FileChange[];
  selectedPaths: Set<string>;
  disabled: boolean;
  onToggleFile: (path: string) => void;
  onToggleAll: () => void;
}
```
Replaces the current `FileGroup` component in `FilePickerDialog.tsx`. Renders either list or tree view based on the shared `fileViewMode` Zustand state.

### FileChangeRow extended props
```typescript
// Added optional prop to existing FileChangeRow
hideActions?: boolean;  // When true, suppresses FileActionIcons rendering
```

### FileChangesTreeView extended props
```typescript
// Added optional props to existing FileChangesTreeView
selectedPaths?: Set<string>;
onTogglePath?: (path: string) => void;
onToggleFolderPaths?: (paths: string[], checked: boolean) => void;
hideActions?: boolean;
```

## State Flow

```
Zustand store (fileViewMode)
  ↕ read/write
ViewModeToggle component
  rendered in: FilePickerDialog section headers + CommitDetailsPanel file list header
  
Zustand store (fileViewMode)
  → rpcClient.persistUIState({ fileViewMode })
  → VS Code globalState (survives reload)
  
FilePickerDialog local state (selectedPaths: Set<string>)
  ↕ read/write
SelectableFileList (list view) / FileChangesTreeView (tree view with selection props)
  checkbox onChange → onToggleFile(path) / onToggleFolderPaths(paths, checked)
  checkbox checked ← selectedPaths.has(path)
```

# Data Model: 018-commit-files-enhancements

**Date**: 2026-03-20

## Existing Entities (No Changes Required)

### FileChange (`shared/types.ts`)

Already contains all fields needed for per-file change counts and action icons.

```typescript
interface FileChange {
  path: string;              // Current file path (used for copy, open current)
  oldPath?: string;          // For renames/copies (displayed with arrow notation)
  status: FileChangeStatus;  // Determines badge, icon visibility, count display
  additions?: number;        // Per-file lines added (undefined for binary)
  deletions?: number;        // Per-file lines deleted (undefined for binary)
}
```

### CommitDetails (`shared/types.ts`)

No changes needed. The `stats` aggregate field will simply no longer be used in the header display (but remains available for other potential uses).

```typescript
interface CommitDetails {
  hash: string;
  abbreviatedHash: string;
  parents: string[];
  author: string;
  authorEmail: string;
  authorDate: string;
  committer: string;
  committerEmail: string;
  committerDate: string;
  subject: string;
  body: string;
  files: FileChange[];
  stats: { additions: number; deletions: number };  // No longer displayed in header
}
```

## New Entities

### FileViewMode (Zustand store state)

Tracks the user's selected view mode for the file changes list. Session-scoped only.

```typescript
type FileViewMode = 'list' | 'tree';
```

**Storage**: Zustand store (`graphStore.ts`)
**Default**: `'list'`
**Persistence**: Session only (not persisted across VS Code restarts)

### FileTreeNode (Frontend-only, computed)

Computed data structure for tree view rendering. Not stored — derived from `FileChange[]` on each render.

```typescript
interface FileTreeNode {
  id: string;               // Unique identifier (the full relative path)
  name: string;             // Display name (file name or compacted folder path)
  isFolder: boolean;        // Whether this is a folder node
  depth: number;            // Nesting depth for indentation
  children?: FileTreeNode[]; // Child nodes (only for folders)
  fileChange?: FileChange;  // Present only for file nodes (leaf nodes)
}
```

**Folder compaction**: When a folder has exactly one child that is also a folder (and no file children), the two are merged into a single node with a combined `name` (e.g., `src/components/ui/`).

## New Message Types

### `openCurrentFile` Request

Opens the current working tree version of a file in an editable editor.

```typescript
// Added to RequestMessage union in shared/messages.ts
{ type: 'openCurrentFile'; payload: { filePath: string } }
```

**Handler**: `WebviewProvider.ts` — constructs URI from workspace folder + relative path, opens via `vscode.workspace.openTextDocument()` + `vscode.window.showTextDocument()`.

**Difference from `openFile`**: `openFile` opens a file at a specific commit (read-only via git-show URI). `openCurrentFile` opens the live working tree file (editable, standard file URI).

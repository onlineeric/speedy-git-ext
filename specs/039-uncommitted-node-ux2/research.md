# Research: Uncommitted Node UX2

## R1: Component extraction strategy — FileChangeRow

**Decision**: Extract `FileChangeRow` from `CommitDetailsPanel.tsx` into `FileChangeShared.tsx` as a named export, alongside the existing `FileStatusBadge`, `FileChangeIndicators`, and `FileActionIcons`.

**Rationale**: `FileChangeRow` is currently an internal function at line 651 of `CommitDetailsPanel.tsx`. It is the exact row layout the file picker dialog needs. Moving it to `FileChangeShared.tsx` keeps all file-rendering primitives in one place and follows DRY. The commit details panel will import it from the new location — no behavior change.

**Alternatives considered**:
- *Duplicate the row in FilePickerDialog* — violates DRY; two copies would drift.
- *Create a new shared file* — would scatter related primitives; `FileChangeShared.tsx` already exists for this purpose.

## R2: Checkbox integration approach for list view

**Decision**: Create a `SelectableFileRow` wrapper component that renders a checkbox + the existing `FileChangeRow` (minus action icons). The wrapper receives `checked`, `onChange`, and `disabled` props. `FileChangeRow` gets an optional `hideActions` prop to suppress `FileActionIcons`.

**Rationale**: The spec requires file action icons to be hidden in the dialog (FR-001), while the commit details panel must continue showing them. A boolean prop on `FileChangeRow` is the minimal change. The checkbox wrapper keeps selection logic separate from presentation.

**Alternatives considered**:
- *Fork FileChangeRow for the dialog* — duplicates layout code; changes to badge/indicator rendering would need to be applied in two places.
- *Render checkbox via a render prop or slot* — over-engineered for a single boolean toggle.

## R3: Tree view with checkboxes and tri-state folders

**Decision**: Add optional selection props to `FileChangesTreeView`: `selectedPaths?: Set<string>`, `onTogglePath?: (path: string) => void`, `onToggleFolderPaths?: (paths: string[], checked: boolean) => void`, `hideActions?: boolean`. When these props are provided, each `FileNode` renders a checkbox and each `FolderNode` renders a tri-state checkbox. When absent, the tree renders exactly as it does today.

**Rationale**: This avoids duplicating the entire tree component. The tri-state folder checkbox needs to know all descendant file paths — a `getDescendantFilePaths(node: FileTreeNode): string[]` utility added to `fileTreeBuilder.ts` provides this. The folder checkbox state (unchecked/partial/checked) is derived from comparing the descendant set against `selectedPaths`.

**Alternatives considered**:
- *Create a separate SelectableFileTreeView component* — duplicates the recursive tree rendering logic; keeping one component with optional selection is simpler.
- *Manage folder selection state independently* — complex and error-prone; deriving from file selection is the single source of truth.

## R4: View mode toggle sharing

**Decision**: Extract the view toggle JSX from `CommitDetailsPanel.tsx` (lines 463-480) into a `ViewModeToggle` component in `FileChangeShared.tsx`. Both the commit details panel and the file picker dialog import and render it. Both call `setFileViewMode` + `rpcClient.persistUIState()` through the same handler.

**Rationale**: The toggle UI is identical in both surfaces. Extracting it avoids duplication and ensures visual consistency. The underlying state (`fileViewMode` in Zustand) and persistence (`rpcClient.persistUIState()`) are already shared — this just shares the UI control.

**Alternatives considered**:
- *Inline the toggle in both places* — small duplication but would drift (different icon sizes, colors, etc.).
- *Put toggle in a hook* — hooks can't return JSX; a component is the right React primitive for shared UI.

## R5: View mode state flow

**Decision**: The file picker dialog reads `fileViewMode` from Zustand (already globally shared). No new state or persistence mechanism is needed. The dialog's `FileGroup` replacement sections each render a `ViewModeToggle`. Clicking either toggle calls the same `setFileViewMode` + `rpcClient.persistUIState()`, which updates all sections in the dialog simultaneously (they all read the same store selector) and persists for the commit details panel.

**Rationale**: The Zustand store is already the single source of truth for `fileViewMode`. The commit details panel already reads from it. Adding the dialog as another consumer requires zero new infrastructure.

**Alternatives considered**:
- *Local dialog state synced on open/close* — introduces sync bugs; the whole point is bidirectional sharing.
- *New RPC message for view mode* — unnecessary; `persistUIState` already handles this.

## R6: Selection state preservation across view mode changes

**Decision**: Selection state is tracked by `selectedPaths: Set<string>` (file paths), which is independent of view mode. Both list and tree views read from and write to the same `selectedPaths` set. Switching view mode re-renders the list but does not modify `selectedPaths`.

**Rationale**: File paths are the canonical identifier in both views. The current `FilePickerDialog` already uses path-based selection — this is preserved unchanged.

**Alternatives considered**: None — path-based selection is the obvious and only correct approach.

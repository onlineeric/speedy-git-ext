import { useState, useMemo, useCallback } from 'react';
import type { FileChange } from '@shared/types';
import type { FileTreeNode } from '../utils/fileTreeBuilder';
import { buildFileTree, getDescendantFilePaths } from '../utils/fileTreeBuilder';
import { FileStatusBadge, FileChangeIndicators, FileActionIcons } from './FileChangeShared';

interface FileChangesTreeViewProps {
  files: FileChange[];
  commitHash?: string;
  parentHash?: string;
  onFileNameClick?: (file: FileChange) => void;
  selectedPaths?: Set<string>;
  onTogglePath?: (path: string) => void;
  onToggleFolderPaths?: (paths: string[], checked: boolean) => void;
  hideActions?: boolean;
  disabled?: boolean;
}

export function FileChangesTreeView({
  files,
  commitHash,
  parentHash,
  onFileNameClick,
  selectedPaths,
  onTogglePath,
  onToggleFolderPaths,
  hideActions,
  disabled,
}: FileChangesTreeViewProps) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleFolder = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (files.length === 0) {
    return (
      <div className="px-1 py-2 text-xs text-[var(--vscode-descriptionForeground)]">
        No files changed
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          collapsed={collapsed}
          onToggle={toggleFolder}
          commitHash={commitHash}
          parentHash={parentHash}
          onFileNameClick={onFileNameClick}
          selectedPaths={selectedPaths}
          onTogglePath={onTogglePath}
          onToggleFolderPaths={onToggleFolderPaths}
          hideActions={hideActions}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  collapsed,
  onToggle,
  commitHash,
  parentHash,
  onFileNameClick,
  selectedPaths,
  onTogglePath,
  onToggleFolderPaths,
  hideActions,
  disabled,
}: {
  node: FileTreeNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  commitHash?: string;
  parentHash?: string;
  onFileNameClick?: (file: FileChange) => void;
  selectedPaths?: Set<string>;
  onTogglePath?: (path: string) => void;
  onToggleFolderPaths?: (paths: string[], checked: boolean) => void;
  hideActions?: boolean;
  disabled?: boolean;
}) {
  if (node.isFolder) {
    return (
      <FolderNode
        node={node}
        collapsed={collapsed}
        onToggle={onToggle}
        commitHash={commitHash}
        parentHash={parentHash}
        onFileNameClick={onFileNameClick}
        selectedPaths={selectedPaths}
        onToggleFolderPaths={onToggleFolderPaths}
        onTogglePath={onTogglePath}
        hideActions={hideActions}
        disabled={disabled}
      />
    );
  }

  return (
    <FileNode
      node={node}
      commitHash={commitHash}
      parentHash={parentHash}
      onFileNameClick={onFileNameClick}
      selectedPaths={selectedPaths}
      onTogglePath={onTogglePath}
      hideActions={hideActions}
      disabled={disabled}
    />
  );
}

function FolderNode({
  node,
  collapsed,
  onToggle,
  commitHash,
  parentHash,
  onFileNameClick,
  selectedPaths,
  onToggleFolderPaths,
  onTogglePath,
  hideActions,
  disabled,
}: {
  node: FileTreeNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  commitHash?: string;
  parentHash?: string;
  onFileNameClick?: (file: FileChange) => void;
  selectedPaths?: Set<string>;
  onToggleFolderPaths?: (paths: string[], checked: boolean) => void;
  onTogglePath?: (path: string) => void;
  hideActions?: boolean;
  disabled?: boolean;
}) {
  const isCollapsed = collapsed.has(node.id);
  const indent = node.depth * 16;

  const descendantPaths = useMemo(() => getDescendantFilePaths(node), [node]);
  const selectedCount = selectedPaths
    ? descendantPaths.filter((p) => selectedPaths.has(p)).length
    : 0;
  const allSelected = selectedPaths ? selectedCount === descendantPaths.length && descendantPaths.length > 0 : false;
  const someSelected = selectedPaths ? selectedCount > 0 && !allSelected : false;

  const handleFolderCheckbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFolderPaths?.(descendantPaths, !allSelected);
  };

  return (
    <>
      <div
        className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-[var(--vscode-list-hoverBackground)]"
        style={{ paddingLeft: indent + 4 }}
        onClick={() => onToggle(node.id)}
      >
        {selectedPaths && onToggleFolderPaths && (
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            disabled={disabled}
            onClick={handleFolderCheckbox}
            onChange={() => {}}
            className="accent-[var(--vscode-focusBorder)] cursor-pointer"
          />
        )}
        <span className="w-3 flex-shrink-0 text-[var(--vscode-descriptionForeground)]">
          {isCollapsed ? '\u25B6' : '\u25BC'}
        </span>
        <span className="truncate font-mono text-[var(--vscode-descriptionForeground)]">
          {node.name}
        </span>
      </div>
      {!isCollapsed && node.children?.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          collapsed={collapsed}
          onToggle={onToggle}
          commitHash={commitHash}
          parentHash={parentHash}
          onFileNameClick={onFileNameClick}
          selectedPaths={selectedPaths}
          onTogglePath={onTogglePath}
          onToggleFolderPaths={onToggleFolderPaths}
          hideActions={hideActions}
          disabled={disabled}
        />
      ))}
    </>
  );
}

function FileNode({
  node,
  commitHash,
  parentHash,
  onFileNameClick,
  selectedPaths,
  onTogglePath,
  hideActions,
  disabled,
}: {
  node: FileTreeNode;
  commitHash?: string;
  parentHash?: string;
  onFileNameClick?: (file: FileChange) => void;
  selectedPaths?: Set<string>;
  onTogglePath?: (path: string) => void;
  hideActions?: boolean;
  disabled?: boolean;
}) {
  const file = node.fileChange!;
  const indent = node.depth * 16;
  const selectable = selectedPaths && onTogglePath && !disabled;

  return (
    <div
      className={`group flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-[var(--vscode-list-hoverBackground)]${selectable ? ' cursor-pointer' : ''}${disabled ? ' opacity-60' : ''}`}
      style={{ paddingLeft: indent + 4 + 16 }}
      title={file.path}
      onClick={selectable ? () => onTogglePath(file.path) : undefined}
    >
      {selectedPaths && onTogglePath && (
        <input
          type="checkbox"
          checked={selectedPaths.has(file.path)}
          disabled={disabled}
          onChange={() => onTogglePath(file.path)}
          onClick={(e) => e.stopPropagation()}
          className="accent-[var(--vscode-focusBorder)] cursor-pointer"
        />
      )}
      <FileStatusBadge status={file.status} />
      <span
        className={`truncate font-mono ${onFileNameClick ? 'cursor-pointer hover:text-[var(--vscode-textLink-foreground)] hover:underline' : ''}`}
        onClick={onFileNameClick ? (e: React.MouseEvent) => { e.stopPropagation(); onFileNameClick(file); } : undefined}
      >
        {node.name}
        {file.oldPath && (
          <span className="text-[var(--vscode-descriptionForeground)]">
            {' ← '}{file.oldPath.split('/').pop()}
          </span>
        )}
      </span>
      <FileChangeIndicators file={file} />
      {!hideActions && commitHash && (
        <FileActionIcons
          file={file}
          commitHash={commitHash}
          parentHash={parentHash}
        />
      )}
    </div>
  );
}

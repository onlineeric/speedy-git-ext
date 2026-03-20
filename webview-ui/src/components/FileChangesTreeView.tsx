import { useState, useMemo, useCallback } from 'react';
import type { FileChange } from '@shared/types';
import type { FileTreeNode } from '../utils/fileTreeBuilder';
import { buildFileTree } from '../utils/fileTreeBuilder';
import { FileStatusBadge, FileChangeIndicators, FileActionIcons } from './FileChangeShared';

interface FileChangesTreeViewProps {
  files: FileChange[];
  commitHash: string;
  parentHash?: string;
  onFileNameClick: (file: FileChange) => void;
}

export function FileChangesTreeView({
  files,
  commitHash,
  parentHash,
  onFileNameClick,
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
}: {
  node: FileTreeNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  commitHash: string;
  parentHash?: string;
  onFileNameClick: (file: FileChange) => void;
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
      />
    );
  }

  return (
    <FileNode
      node={node}
      commitHash={commitHash}
      parentHash={parentHash}
      onFileNameClick={onFileNameClick}
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
}: {
  node: FileTreeNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  commitHash: string;
  parentHash?: string;
  onFileNameClick: (file: FileChange) => void;
}) {
  const isCollapsed = collapsed.has(node.id);
  const indent = node.depth * 16;

  return (
    <>
      <div
        className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-[var(--vscode-list-hoverBackground)]"
        style={{ paddingLeft: indent + 4 }}
        onClick={() => onToggle(node.id)}
      >
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
}: {
  node: FileTreeNode;
  commitHash: string;
  parentHash?: string;
  onFileNameClick: (file: FileChange) => void;
}) {
  const file = node.fileChange!;
  const indent = node.depth * 16;

  return (
    <div
      className="group flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-[var(--vscode-list-hoverBackground)]"
      style={{ paddingLeft: indent + 4 + 16 }}
      title={file.path}
    >
      <FileStatusBadge status={file.status} />
      <span
        className="cursor-pointer truncate font-mono hover:text-[var(--vscode-textLink-foreground)] hover:underline"
        onClick={() => onFileNameClick(file)}
      >
        {node.name}
        {file.oldPath && (
          <span className="text-[var(--vscode-descriptionForeground)]">
            {' ← '}{file.oldPath.split('/').pop()}
          </span>
        )}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <FileChangeIndicators file={file} />
        <FileActionIcons
          file={file}
          commitHash={commitHash}
          parentHash={parentHash}
        />
      </span>
    </div>
  );
}

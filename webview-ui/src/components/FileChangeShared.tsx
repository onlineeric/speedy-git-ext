import { useState } from 'react';
import type { FileChange, FileViewMode } from '@shared/types';
import { UNCOMMITTED_HASH } from '@shared/types';
import { CopyIcon, CheckIcon, FileIcon, FileCodeIcon, StageIcon, UnstageIcon, DiscardIcon, ListViewIcon, TreeViewIcon } from './icons';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';

export function shouldShowChangeCounts(file: FileChange): boolean {
  if (file.status === 'added' || file.status === 'deleted') return false;
  if (file.additions === undefined && file.deletions === undefined) return false;
  if (file.additions === 0 && file.deletions === 0) return false;
  return true;
}

export function getStatusConfig(status: FileChange['status']): {
  letter: string;
  label: string;
  className: string;
} {
  switch (status) {
    case 'added':
      return { letter: 'A', label: 'Added', className: 'text-green-400 bg-green-900/40' };
    case 'modified':
      return { letter: 'M', label: 'Modified', className: 'text-blue-400 bg-blue-900/40' };
    case 'deleted':
      return { letter: 'D', label: 'Deleted', className: 'text-red-400 bg-red-900/40' };
    case 'renamed':
      return { letter: 'R', label: 'Renamed', className: 'text-yellow-400 bg-yellow-900/40' };
    case 'copied':
      return { letter: 'C', label: 'Copied', className: 'text-purple-400 bg-purple-900/40' };
    case 'untracked':
      return { letter: 'U', label: 'Untracked', className: 'text-gray-400 bg-gray-900/40' };
    default:
      return { letter: '?', label: 'Unknown', className: 'text-gray-400 bg-gray-900/40' };
  }
}

export function FileStatusBadge({ status }: { status: FileChange['status'] }) {
  const config = getStatusConfig(status);
  return (
    <span
      className={`flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${config.className}`}
      title={config.label}
    >
      {config.letter}
    </span>
  );
}

export function FileChangeIndicators({ file }: { file: FileChange }) {
  const showCounts = shouldShowChangeCounts(file);

  return (
    <>
      {showCounts && file.additions !== undefined && file.additions > 0 && (
        <span className="text-green-400">+{file.additions}</span>
      )}
      {showCounts && file.deletions !== undefined && file.deletions > 0 && (
        <span className="text-red-400">-{file.deletions}</span>
      )}
    </>
  );
}

export function ViewModeToggle() {
  const fileViewMode = useGraphStore((state) => state.fileViewMode);
  const setFileViewMode = useGraphStore((state) => state.setFileViewMode);

  const handleSetFileViewMode = (mode: FileViewMode) => {
    setFileViewMode(mode);
    rpcClient.persistUIState({ fileViewMode: mode });
  };

  return (
    <span className="flex items-center gap-0.5">
      <button
        className={`rounded p-0.5 ${fileViewMode === 'list' ? 'text-yellow-400' : 'text-[var(--vscode-descriptionForeground)]'} hover:bg-[var(--vscode-toolbar-hoverBackground)]`}
        onClick={() => handleSetFileViewMode('list')}
        title="List view"
      >
        <ListViewIcon size={16} />
      </button>
      <button
        className={`rounded p-0.5 ${fileViewMode === 'tree' ? 'text-yellow-400' : 'text-[var(--vscode-descriptionForeground)]'} hover:bg-[var(--vscode-toolbar-hoverBackground)]`}
        onClick={() => handleSetFileViewMode('tree')}
        title="Tree view"
      >
        <TreeViewIcon size={16} />
      </button>
    </span>
  );
}

export function FileChangeRow({
  file,
  onFileNameClick,
  commitHash = '',
  parentHash,
  onDiscardClick,
  hideActions,
}: {
  file: FileChange;
  onFileNameClick?: () => void;
  commitHash?: string;
  parentHash?: string;
  onDiscardClick?: (file: FileChange) => void;
  hideActions?: boolean;
}) {
  const fileTitle = file.oldPath
    ? `${file.path} ← ${file.oldPath}`
    : file.path;

  return (
    <div
      className="group flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-[var(--vscode-list-hoverBackground)]"
      title={fileTitle}
    >
      <FileStatusBadge status={file.status} />
      <span
        className={`truncate font-mono ${onFileNameClick ? 'cursor-pointer hover:text-[var(--vscode-textLink-foreground)] hover:underline' : ''}`}
        onClick={onFileNameClick}
      >
        {file.path}
        {file.oldPath && (
          <span className="text-[var(--vscode-descriptionForeground)]">
            {' ← '}{file.oldPath}
          </span>
        )}
      </span>
      <FileChangeIndicators file={file} />
      {!hideActions && (
        <FileActionIcons
          file={file}
          commitHash={commitHash}
          parentHash={parentHash}
          onDiscardClick={onDiscardClick}
        />
      )}
    </div>
  );
}

export function FileActionIcons({
  file,
  commitHash,
  parentHash,
  onDiscardClick,
}: {
  file: FileChange;
  commitHash: string;
  parentHash?: string;
  onDiscardClick?: (file: FileChange) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    rpcClient.copyToClipboard(file.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 500);
  };

  const handleOpenAtCommit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (commitHash === UNCOMMITTED_HASH) {
      rpcClient.openCurrentFile(file.path);
      return;
    }
    if (file.status === 'deleted' && parentHash) {
      rpcClient.openFile(parentHash, file.path);
    } else {
      rpcClient.openFile(commitHash || 'HEAD', file.path);
    }
  };

  const handleOpenCurrent = (e: React.MouseEvent) => {
    e.stopPropagation();
    rpcClient.openCurrentFile(file.path);
  };

  const handleStage = (e: React.MouseEvent) => {
    e.stopPropagation();
    rpcClient.stageFiles([file.path]);
  };

  const handleUnstage = (e: React.MouseEvent) => {
    e.stopPropagation();
    rpcClient.unstageFiles([file.path]);
  };

  const handleDiscard = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDiscardClick?.(file);
  };

  const isUncommitted = commitHash === UNCOMMITTED_HASH;
  const isConflicted = file.stageState === 'conflicted';

  // On the uncommitted node, the stage/unstage icon is always visible
  // (no hover gate) because it's the most common action. All other icons
  // remain hover-only.
  return (
    <>
      {isUncommitted && !isConflicted && (
        <span className="flex items-center gap-0.5">
          {file.stageState === 'unstaged' && (
            <>
              <button
                className="rounded p-0.5 text-green-400 hover:text-green-300 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                onClick={handleStage}
                title="Stage file"
              >
                <StageIcon />
              </button>
              {onDiscardClick && (
                <button
                  className="rounded p-0.5 text-red-400 hover:text-red-300 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                  onClick={handleDiscard}
                  title="Discard changes"
                >
                  <DiscardIcon />
                </button>
              )}
            </>
          )}
          {file.stageState === 'staged' && (
            <button
              className="rounded p-0.5 text-yellow-400 hover:text-yellow-300 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
              onClick={handleUnstage}
              title="Unstage file"
            >
              <UnstageIcon />
            </button>
          )}
        </span>
      )}
      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="rounded p-0.5 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          onClick={handleCopyPath}
          title="Copy relative path"
        >
          {copied ? <CheckIcon className="text-green-400" /> : <CopyIcon />}
        </button>
        {!isUncommitted && (
          <button
            className="rounded p-0.5 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            onClick={handleOpenAtCommit}
            title="Open file at this commit"
          >
            <FileCodeIcon />
          </button>
        )}
        {file.status !== 'deleted' && (
          <button
            className="rounded p-0.5 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            onClick={handleOpenCurrent}
            title="Open current version"
          >
            <FileIcon />
          </button>
        )}
      </span>
    </>
  );
}

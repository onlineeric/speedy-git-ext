import { useState } from 'react';
import type { FileChange } from '@shared/types';
import { CopyIcon, CheckIcon, FileIcon, FileCodeIcon } from './icons';
import { rpcClient } from '../rpc/rpcClient';

export function shouldShowChangeCounts(file: FileChange): boolean {
  if (file.status === 'added' || file.status === 'deleted') return false;
  if (file.additions === undefined && file.deletions === undefined) return false;
  if (file.additions === 0 && file.deletions === 0) return false;
  return true;
}

export function isBinaryFile(file: FileChange): boolean {
  return file.additions === undefined && file.deletions === undefined
    && file.status !== 'added' && file.status !== 'deleted';
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
  const binary = isBinaryFile(file);

  return (
    <>
      {binary && (
        <span className="text-[var(--vscode-descriptionForeground)]">binary</span>
      )}
      {showCounts && file.additions !== undefined && file.additions > 0 && (
        <span className="text-green-400">+{file.additions}</span>
      )}
      {showCounts && file.deletions !== undefined && file.deletions > 0 && (
        <span className="text-red-400">-{file.deletions}</span>
      )}
    </>
  );
}

export function FileActionIcons({
  file,
  commitHash,
  parentHash,
}: {
  file: FileChange;
  commitHash: string;
  parentHash?: string;
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

  return (
    <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        className="rounded p-0.5 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
        onClick={handleCopyPath}
        title="Copy relative path"
      >
        {copied ? <CheckIcon className="text-green-400" /> : <CopyIcon />}
      </button>
      <button
        className="rounded p-0.5 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
        onClick={handleOpenAtCommit}
        title="Open file at this commit"
      >
        <FileCodeIcon />
      </button>
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
  );
}

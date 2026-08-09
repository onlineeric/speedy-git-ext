import type { FileChange, FileViewMode } from '@shared/types';
import { UNCOMMITTED_HASH } from '@shared/types';
import { CopyIcon, CopiedIcon, FileIcon, FileCodeIcon, StageIcon, UnstageIcon, DiscardIcon, ListViewIcon, TreeViewIcon } from './icons';
import { rpcClient } from '../rpc/rpcClient';
import { useCopyFeedback } from '../hooks/useCopyFeedback';
import { useGraphStore } from '../stores/graphStore';
import {
  ACCENT_COLOR,
  ADDED_COLOR,
  DELETED_COLOR,
  MODIFIED_COLOR,
  NEUTRAL_COLOR,
  RENAMED_COLOR,
  UNTRACKED_COLOR,
  tint,
} from '../utils/themeColors';

export function shouldShowChangeCounts(file: FileChange): boolean {
  if (file.status === 'added' || file.status === 'deleted') return false;
  if (file.additions === undefined && file.deletions === undefined) return false;
  if (file.additions === 0 && file.deletions === 0) return false;
  return true;
}

export function getStatusConfig(status: FileChange['status']): {
  letter: string;
  label: string;
  color: string;
} {
  switch (status) {
    case 'added':
      return { letter: 'A', label: 'Added', color: ADDED_COLOR };
    case 'modified':
      return { letter: 'M', label: 'Modified', color: MODIFIED_COLOR };
    case 'deleted':
      return { letter: 'D', label: 'Deleted', color: DELETED_COLOR };
    case 'renamed':
      return { letter: 'R', label: 'Renamed', color: RENAMED_COLOR };
    case 'copied':
      return { letter: 'C', label: 'Copied', color: RENAMED_COLOR };
    case 'untracked':
      return { letter: 'U', label: 'Untracked', color: UNTRACKED_COLOR };
    default:
      return { letter: '?', label: 'Unknown', color: NEUTRAL_COLOR };
  }
}

export function FileStatusBadge({ status }: { status: FileChange['status'] }) {
  const config = getStatusConfig(status);
  return (
    <span
      className="flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold"
      style={{ color: config.color, backgroundColor: tint(config.color) }}
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
        <span style={{ color: ADDED_COLOR }}>+{file.additions}</span>
      )}
      {showCounts && file.deletions !== undefined && file.deletions > 0 && (
        <span style={{ color: DELETED_COLOR }}>-{file.deletions}</span>
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
        className="rounded p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
        style={{ color: fileViewMode === 'list' ? ACCENT_COLOR : NEUTRAL_COLOR }}
        onClick={() => handleSetFileViewMode('list')}
        title="List view"
      >
        <ListViewIcon size={16} />
      </button>
      <button
        className="rounded p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
        style={{ color: fileViewMode === 'tree' ? ACCENT_COLOR : NEUTRAL_COLOR }}
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
  const { copied, copy } = useCopyFeedback();

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    copy(file.path);
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
                className="rounded p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                style={{ color: ADDED_COLOR }}
                onClick={handleStage}
                title="Stage file"
              >
                <StageIcon />
              </button>
              {onDiscardClick && (
                <button
                  className="rounded p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                  style={{ color: DELETED_COLOR }}
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
              className="rounded p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
              style={{ color: MODIFIED_COLOR }}
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
          {copied ? <CopiedIcon /> : <CopyIcon />}
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

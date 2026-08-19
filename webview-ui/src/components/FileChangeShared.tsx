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

/**
 * Built once at module load rather than per call: file lists are neither
 * virtualized nor capped, so a large commit renders one badge per file and the
 * `tint()` string would otherwise be rebuilt for every one of them on every
 * render. The style objects are stable references for the same reason.
 */
function statusConfig(letter: string, label: string, color: string) {
  return { letter, label, style: { color, backgroundColor: tint(color) } } as const;
}

const STATUS_CONFIG: Record<FileChange['status'], ReturnType<typeof statusConfig>> = {
  added: statusConfig('A', 'Added', ADDED_COLOR),
  modified: statusConfig('M', 'Modified', MODIFIED_COLOR),
  deleted: statusConfig('D', 'Deleted', DELETED_COLOR),
  renamed: statusConfig('R', 'Renamed', RENAMED_COLOR),
  copied: statusConfig('C', 'Copied', RENAMED_COLOR),
  untracked: statusConfig('U', 'Untracked', UNTRACKED_COLOR),
  unknown: statusConfig('?', 'Unknown', NEUTRAL_COLOR),
};

const ADDED_STYLE = { color: ADDED_COLOR };
const DELETED_STYLE = { color: DELETED_COLOR };
const MODIFIED_STYLE = { color: MODIFIED_COLOR };
const ACCENT_STYLE = { color: ACCENT_COLOR };
const NEUTRAL_STYLE = { color: NEUTRAL_COLOR };

export function FileStatusBadge({ status }: { status: FileChange['status'] }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  return (
    <span
      className="flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold"
      style={config.style}
      title={config.label}
    >
      {config.letter}
    </span>
  );
}

const SUBMODULE_BADGE_STYLE = { color: ACCENT_COLOR, backgroundColor: tint(ACCENT_COLOR) };

/**
 * Marks a row as a submodule pointer rather than a file.
 *
 * Without it the diff these rows open is inexplicable: a submodule change is only ever
 * the two `Subproject commit <hash>` lines, because the parent repo stores a pointer and
 * not the submodule's content. The badge is what makes that two-line diff make sense.
 */
export function SubmoduleBadge() {
  return (
    <span
      className="shrink-0 rounded px-1 text-[10px] font-semibold uppercase tracking-wide"
      style={SUBMODULE_BADGE_STYLE}
      title="Submodule — the diff shows which commit it points at"
    >
      sub
    </span>
  );
}

export function FileChangeIndicators({ file }: { file: FileChange }) {
  const showCounts = shouldShowChangeCounts(file);

  return (
    <>
      {showCounts && file.additions !== undefined && file.additions > 0 && (
        <span style={ADDED_STYLE}>+{file.additions}</span>
      )}
      {showCounts && file.deletions !== undefined && file.deletions > 0 && (
        <span style={DELETED_STYLE}>-{file.deletions}</span>
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
        style={fileViewMode === 'list' ? ACCENT_STYLE : NEUTRAL_STYLE}
        onClick={() => handleSetFileViewMode('list')}
        title="List view"
      >
        <ListViewIcon size={16} />
      </button>
      <button
        className="rounded p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
        style={fileViewMode === 'tree' ? ACCENT_STYLE : NEUTRAL_STYLE}
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
      {file.isSubmodule && <SubmoduleBadge />}
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
                style={ADDED_STYLE}
                onClick={handleStage}
                title="Stage file"
              >
                <StageIcon />
              </button>
              {onDiscardClick && (
                <button
                  className="rounded p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                  style={DELETED_STYLE}
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
              style={MODIFIED_STYLE}
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
        {/* A submodule's working-tree form is a directory, so there is no current
            *file* version to open — offering the button would only ever fail. */}
        {file.status !== 'deleted' && !file.isSubmodule && (
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

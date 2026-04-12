import { memo, useCallback, useRef, useEffect, useState } from 'react';
import type { CommitDetails, FileChange, DetailsPanelPosition, FileViewMode, CommitSignatureInfo } from '@shared/types';
import { UNCOMMITTED_HASH } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { formatRelativeDate } from '../utils/formatDate';
import { renderInlineCode } from '../utils/inlineCodeRenderer';
import { CloseIcon, MoveRightIcon, MoveBottomIcon, ChevronDownIcon, ChevronRightIcon } from './icons';
import { FileChangesTreeView } from './FileChangesTreeView';
import { FileChangeRow, ViewModeToggle } from './FileChangeShared';
import { AuthorBadge } from './AuthorBadge';
import { DiscardDialog } from './DiscardDialog';

const MIN_SIZE = 120;
const MIN_GRAPH_WIDTH = 200;
const SPLIT_DETAILS_MIN_WIDTH = 280;
const SPLIT_FILES_MIN_WIDTH = 360;
const SPLIT_LAYOUT_PADDING = 48;
type BottomPanelLayoutMode = 'stacked' | 'split';

export const CommitDetailsPanel = memo(function CommitDetailsPanel() {
  const {
    commitDetails,
    detailsPanelOpen,
    detailsPanelPosition,
    bottomPanelHeight,
    rightPanelWidth,
    setDetailsPanelOpen,
    toggleDetailsPanelPosition,
    setBottomPanelHeight,
    setRightPanelWidth,
  } = useGraphStore();

  const resizing = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);

  const handleTogglePosition = useCallback(() => {
    const newPosition = detailsPanelPosition === 'bottom' ? 'right' : 'bottom';
    toggleDetailsPanelPosition();
    rpcClient.persistUIState({ detailsPanelPosition: newPosition });
  }, [detailsPanelPosition, toggleDetailsPanelPosition]);

  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      resizing.current = true;

      const startPos = detailsPanelPosition === 'bottom' ? event.clientY : event.clientX;
      const startSize = detailsPanelPosition === 'bottom' ? bottomPanelHeight : rightPanelWidth;
      const containerWidth = panelRef.current?.parentElement?.clientWidth ?? Infinity;
      const maxWidth = containerWidth - MIN_GRAPH_WIDTH;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!resizing.current) return;
        const delta = startPos - (detailsPanelPosition === 'bottom' ? moveEvent.clientY : moveEvent.clientX);
        const clamped = Math.max(MIN_SIZE, startSize + delta);
        if (detailsPanelPosition === 'bottom') {
          setBottomPanelHeight(clamped);
        } else {
          setRightPanelWidth(Math.min(maxWidth, clamped));
        }
      };

      const handleMouseUp = () => {
        resizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        // Persist the final size after drag ends
        const store = useGraphStore.getState();
        if (detailsPanelPosition === 'bottom') {
          rpcClient.persistUIState({ bottomPanelHeight: store.bottomPanelHeight });
        } else {
          rpcClient.persistUIState({ rightPanelWidth: store.rightPanelWidth });
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [detailsPanelPosition, bottomPanelHeight, rightPanelWidth, setBottomPanelHeight, setRightPanelWidth]
  );

  useEffect(() => {
    const element = panelRef.current;
    if (!element) return;

    setPanelWidth(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      setPanelWidth(nextWidth);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!detailsPanelOpen || !commitDetails) {
    return null;
  }

  const isBottom = detailsPanelPosition === 'bottom';
  const bottomLayoutMode = getBottomLayoutMode(panelWidth);
  const panelStyle = isBottom
    ? { height: bottomPanelHeight, minHeight: MIN_SIZE }
    : { width: rightPanelWidth, minWidth: MIN_SIZE };

  return (
    <div
      ref={panelRef}
      className={`relative flex flex-col border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] ${
        isBottom ? 'border-t' : 'border-l'
      }`}
      style={panelStyle}
    >
      <ResizeHandle position={detailsPanelPosition} onMouseDown={handleResizeStart} />
      <PanelHeader
        details={commitDetails}
        position={detailsPanelPosition}
        onClose={() => setDetailsPanelOpen(false)}
        onTogglePosition={handleTogglePosition}
      />
      <PanelBody
        details={commitDetails}
        position={detailsPanelPosition}
        bottomLayoutMode={bottomLayoutMode}
      />
    </div>
  );
});

function getBottomLayoutMode(panelWidth: number): BottomPanelLayoutMode {
  return panelWidth >= SPLIT_DETAILS_MIN_WIDTH + SPLIT_FILES_MIN_WIDTH + SPLIT_LAYOUT_PADDING
    ? 'split'
    : 'stacked';
}

function ResizeHandle({
  position,
  onMouseDown,
}: {
  position: DetailsPanelPosition;
  onMouseDown: (event: React.MouseEvent) => void;
}) {
  const isBottom = position === 'bottom';
  return (
    <div
      className={`flex-shrink-0 ${
        isBottom
          ? 'h-1 cursor-row-resize hover:bg-[var(--vscode-focusBorder)]'
          : 'absolute bottom-0 left-0 top-0 z-10 w-1 cursor-col-resize hover:bg-[var(--vscode-focusBorder)]'
      }`}
      onMouseDown={onMouseDown}
    />
  );
}

function PanelHeader({
  details,
  position,
  onClose,
  onTogglePosition,
}: {
  details: CommitDetails;
  position: DetailsPanelPosition;
  onClose: () => void;
  onTogglePosition: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--vscode-panel-border)] px-3 py-1.5 flex-shrink-0">
      <span className="font-mono text-xs text-[var(--vscode-textLink-foreground)]">
        {details.abbreviatedHash}
      </span>
      <span className="flex-1 truncate text-sm" title={details.subject}>
        {renderInlineCode(details.subject)}
      </span>
      <button
        onClick={onTogglePosition}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-[var(--vscode-foreground)]"
        title={`Move panel to ${position === 'bottom' ? 'right' : 'bottom'}`}
      >
        <span>{'Move'}</span>
        {position === 'bottom' ? <MoveRightIcon /> : <MoveBottomIcon />}
      </button>
      <button
        onClick={onClose}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-[var(--vscode-foreground)]"
        title="Close panel"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function PanelBody({
  details,
  position,
  bottomLayoutMode,
}: {
  details: CommitDetails;
  position: DetailsPanelPosition;
  bottomLayoutMode: BottomPanelLayoutMode;
}) {
  const isSplitBottomLayout = position === 'bottom' && bottomLayoutMode === 'split';

  if (isSplitBottomLayout) {
    return (
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <CommitDetailsSection details={details} splitLayout />
        <FilesChangedSection details={details} splitLayout />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <CommitDetailsSection details={details} />
      <FilesChangedSection details={details} />
    </div>
  );
}

function CommitDetailsSection({
  details,
  splitLayout = false,
}: {
  details: CommitDetails;
  splitLayout?: boolean;
}) {
  const containerClassName = splitLayout
    ? 'flex min-w-0 flex-1 flex-col overflow-hidden border-r border-[var(--vscode-panel-border)]'
    : 'min-w-0';

  const contentClassName = splitLayout
    ? 'min-h-0 flex-1 overflow-auto'
    : '';

  return (
    <section
      className={containerClassName}
      style={splitLayout ? { minWidth: SPLIT_DETAILS_MIN_WIDTH } : undefined}
    >
      <div className={contentClassName}>
        <CommitMetadata details={details} />
        <CommitSignatureSection hash={details.hash} />
      </div>
    </section>
  );
}

function FilesChangedSection({
  details,
  splitLayout = false,
}: {
  details: CommitDetails;
  splitLayout?: boolean;
}) {
  const containerClassName = splitLayout
    ? 'flex min-w-0 flex-[1.15] flex-col overflow-hidden'
    : 'min-w-0';

  const contentClassName = splitLayout
    ? 'min-h-0 flex-1 overflow-auto'
    : '';

  return (
    <section
      className={containerClassName}
      style={splitLayout ? { minWidth: SPLIT_FILES_MIN_WIDTH } : undefined}
    >
      <div className={contentClassName}>
        <FileChangesList details={details} splitLayout={splitLayout} />
      </div>
    </section>
  );
}

function CommitMetadata({ details }: { details: CommitDetails }) {
  return (
    <div className="space-y-1 border-b border-[var(--vscode-panel-border)] px-3 py-2 text-xs">
      <MetadataRow label="Hash" value={details.hash} mono copyable />
      {details.parents.length > 0 && (
        <MetadataRow
          label={details.parents.length > 1 ? 'Parents' : 'Parent'}
          value={details.parents.map((parent) => parent.slice(0, 7)).join(', ')}
          mono
        />
      )}
      <div className="flex gap-2">
        <span className="w-16 flex-shrink-0 text-[var(--vscode-descriptionForeground)]">Author:</span>
        <AuthorBadge name={details.author} email={details.authorEmail} />
      </div>
      <MetadataRow label="Date" value={formatRelativeDate(details.authorDate)} />
      {details.committer !== details.author && (
        <MetadataRow
          label="Committer"
          value={`${details.committer} <${details.committerEmail}>`}
        />
      )}
      {details.body && (
        <div className="pt-1">
          <span className="whitespace-pre-wrap text-[var(--vscode-descriptionForeground)]">
            {renderInlineCode(details.body)}
          </span>
        </div>
      )}
    </div>
  );
}

function MetadataRow({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const handleCopy = () => {
    if (copyable) {
      rpcClient.copyToClipboard(value);
    }
  };

  return (
    <div className="flex gap-2">
      <span className="w-16 flex-shrink-0 text-[var(--vscode-descriptionForeground)]">
        {label}:
      </span>
      <span
        className={`truncate ${mono ? 'font-mono' : ''} ${
          copyable ? 'cursor-pointer hover:text-[var(--vscode-textLink-foreground)]' : ''
        }`}
        title={copyable ? `Click to copy: ${value}` : value}
        onClick={handleCopy}
      >
        {value}
      </span>
    </div>
  );
}

function CommitSignatureSection({ hash }: { hash: string }) {
  const signature = useGraphStore((state) => state.signatureCache[hash]);
  const loading = useGraphStore((state) => !!state.signatureLoading[hash]);

  useEffect(() => {
    if (hash === UNCOMMITTED_HASH) return;
    const store = useGraphStore.getState();
    if (hash in store.signatureCache || store.signatureLoading[hash]) {
      return;
    }
    rpcClient.getSignatureInfo(hash);
  }, [hash]);

  if (loading) {
    return (
      <div className="border-b border-[var(--vscode-panel-border)] px-3 py-2 text-xs text-[var(--vscode-descriptionForeground)]">
        Loading signature verification...
      </div>
    );
  }

  if (!signature) {
    return null;
  }

  const statusConfig = getSignatureStatusConfig(signature);

  return (
    <div className="space-y-1 border-b border-[var(--vscode-panel-border)] px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className={statusConfig.className}>{statusConfig.label}</span>
        <span className="uppercase text-[var(--vscode-descriptionForeground)]">
          {signature.format}
        </span>
      </div>
      {signature.verificationUnavailable ? (
        <div className="text-[var(--vscode-descriptionForeground)]">Verification unavailable</div>
      ) : (
        <>
          {signature.signer && <MetadataRow label="Signer" value={signature.signer} />}
          {signature.keyId && <MetadataRow label="Key ID" value={signature.keyId} mono />}
        </>
      )}
    </div>
  );
}

function getSignatureStatusConfig(signature: CommitSignatureInfo): { label: string; className: string } {
  if (signature.verificationUnavailable) {
    return {
      label: 'Verification Unavailable',
      className: 'font-medium text-[var(--vscode-editorWarning-foreground)]',
    };
  }

  switch (signature.status) {
    case 'good':
      return { label: 'Verified', className: 'font-medium text-green-400' };
    case 'bad':
      return { label: 'Invalid Signature', className: 'font-medium text-red-400' };
    default:
      return { label: 'Unverified', className: 'font-medium text-yellow-400' };
  }
}

function FileChangesList({
  details,
  splitLayout = false,
}: {
  details: CommitDetails;
  splitLayout?: boolean;
}) {
  const fileViewMode = useGraphStore((state) => state.fileViewMode);
  const stagedFiles = useGraphStore((state) => state.uncommittedStagedFiles);
  const unstagedFiles = useGraphStore((state) => state.uncommittedUnstagedFiles);
  const conflictFiles = useGraphStore((state) => state.uncommittedConflictFiles);
  const conflictType = useGraphStore((state) => state.conflictType);

  const handleFileClick = (file: FileChange) => {
    if (details.hash === UNCOMMITTED_HASH) {
      if (file.stageState === 'staged') {
        rpcClient.openStagedDiff(file.path);
      } else {
        rpcClient.openDiff(details.hash, file.path, undefined, file.status);
      }
      return;
    }
    if (file.status === 'deleted') {
      const parentHash = details.parents[0];
      if (parentHash) {
        rpcClient.openFile(parentHash, file.path);
      }
    } else {
      rpcClient.openDiff(details.hash, file.path, details.parents[0]);
    }
  };

  const [discardFile, setDiscardFile] = useState<FileChange | null>(null);

  const handleDiscardConfirm = () => {
    if (discardFile) {
      const includeUntracked = discardFile.status === 'untracked';
      rpcClient.discardFiles([discardFile.path], includeUntracked);
      setDiscardFile(null);
    }
  };

  const isUncommitted = details.hash === UNCOMMITTED_HASH;

  if (isUncommitted) {
    return (
      <div className={`px-3 py-2 ${splitLayout ? 'h-full' : ''}`}>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs text-[var(--vscode-descriptionForeground)]">
            {details.files.length} file{details.files.length !== 1 ? 's' : ''} changed
          </span>
          <ViewModeToggle />
        </div>
        {conflictFiles.length > 0 && (
          <UncommittedFileSection
            title={`${conflictType === 'rebase' ? 'Rebase' : conflictType === 'cherry-pick' ? 'Cherry-pick' : 'Merge'} Conflicts`}
            files={conflictFiles}
            commitHash={details.hash}
            parentHash={details.parents[0]}
            onFileClick={handleFileClick}
            fileViewMode={fileViewMode}
            variant="conflict"
          />
        )}
        {stagedFiles.length > 0 && (
          <UncommittedFileSection
            title="Staged Changes"
            files={stagedFiles}
            commitHash={details.hash}
            parentHash={details.parents[0]}
            onFileClick={handleFileClick}
            fileViewMode={fileViewMode}
            variant="staged"
            onBulkAction={() => rpcClient.unstageAll()}
            bulkActionLabel="Unstage All"
          />
        )}
        {unstagedFiles.length > 0 && (
          <UncommittedFileSection
            title="Unstaged Changes"
            files={unstagedFiles}
            commitHash={details.hash}
            parentHash={details.parents[0]}
            onFileClick={handleFileClick}
            fileViewMode={fileViewMode}
            variant="unstaged"
            onBulkAction={() => rpcClient.stageAll()}
            bulkActionLabel="Stage All"
            onDiscardClick={setDiscardFile}
          />
        )}
        <DiscardDialog
          open={discardFile !== null}
          onOpenChange={(open) => { if (!open) setDiscardFile(null); }}
          file={discardFile}
          onConfirm={handleDiscardConfirm}
        />
      </div>
    );
  }

  return (
    <div className={`px-3 py-2 ${splitLayout ? 'h-full' : ''}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs text-[var(--vscode-descriptionForeground)]">
          {details.files.length} file{details.files.length !== 1 ? 's' : ''} changed
        </span>
        <ViewModeToggle />
      </div>
      {fileViewMode === 'list' ? (
        <div className="space-y-0.5">
          {details.files.map((file) => (
            <FileChangeRow
              key={file.path}
              file={file}
              onFileNameClick={() => handleFileClick(file)}
              commitHash={details.hash}
              parentHash={details.parents[0]}
            />
          ))}
        </div>
      ) : (
        <FileChangesTreeView
          files={details.files}
          commitHash={details.hash}
          parentHash={details.parents[0]}
          onFileNameClick={handleFileClick}
        />
      )}
    </div>
  );
}

function UncommittedFileSection({
  title,
  files,
  commitHash,
  parentHash,
  onFileClick,
  fileViewMode,
  variant,
  onBulkAction,
  bulkActionLabel,
  onDiscardClick,
}: {
  title: string;
  files: FileChange[];
  commitHash: string;
  parentHash?: string;
  onFileClick: (file: FileChange) => void;
  fileViewMode: FileViewMode;
  variant: 'staged' | 'unstaged' | 'conflict';
  onBulkAction?: () => void;
  bulkActionLabel?: string;
  onDiscardClick?: (file: FileChange) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const variantColor =
    variant === 'conflict'
      ? 'text-red-400'
      : variant === 'staged'
        ? 'text-green-400'
        : 'text-[var(--vscode-descriptionForeground)]';

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1 py-1">
        <button
          className="flex items-center gap-1 text-xs font-medium hover:text-[var(--vscode-foreground)]"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          <span className={variantColor}>{title}</span>
          <span className="text-[var(--vscode-descriptionForeground)]">({files.length})</span>
        </button>
        {onBulkAction && bulkActionLabel && (
          <button
            className="ml-auto text-[10px] rounded px-1.5 py-0.5 text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-[var(--vscode-foreground)]"
            onClick={onBulkAction}
            title={bulkActionLabel}
          >
            {bulkActionLabel}
          </button>
        )}
      </div>
      {!collapsed && (
        fileViewMode === 'list' ? (
          <div className="space-y-0.5">
            {files.map((file) => (
              <FileChangeRow
                key={`${variant}-${file.path}`}
                file={file}
                onFileNameClick={() => onFileClick(file)}
                commitHash={commitHash}
                parentHash={parentHash}
                onDiscardClick={onDiscardClick}
              />
            ))}
          </div>
        ) : (
          <FileChangesTreeView
            files={files}
            commitHash={commitHash}
            parentHash={parentHash}
            onFileNameClick={onFileClick}
          />
        )
      )}
    </div>
  );
}


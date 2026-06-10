import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { CommitTableColumnId, CommitTableLayout } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { InfoIcon, SettingsIcon } from './icons';
import {
  COMMIT_TABLE_MIN_WIDTHS,
  computeAutoFitWidth,
  computeColumnMaxWidth,
  materializeCommitTableEffectiveWidths,
  resizeCommitTableColumnPair,
  resolveResizeTarget,
  setCommitTableColumnPreferredWidth,
  type ResolvedCommitTableLayout,
} from '../utils/commitTableLayout';

interface CommitTableHeaderProps {
  layout: ResolvedCommitTableLayout;
}

interface ResizeSession {
  columnId: CommitTableColumnId;
  startX: number;
  startWidth: number;
  /** Width ceiling: containerWidth minus every other visible column's minimum width. */
  maxWidth: number;
  isReverse?: boolean;
  pairResize?: {
    baseLayout: CommitTableLayout;
    leftColumnId: CommitTableColumnId;
    rightColumnId: CommitTableColumnId;
    leftStartWidth: number;
    rightStartWidth: number;
  };
}

const COLUMN_LABELS: Record<CommitTableColumnId, string> = {
  graph: 'Graph',
  hash: 'Hash',
  message: 'Message',
  author: 'Author',
  date: 'Date',
  signature: 'Sig',
};

/** Deep-links VS Code settings to the Speedy Git date-format settings. */
const DATE_FORMAT_SETTINGS_QUERY = '@id:speedyGit.dateFormat,speedyGit.dateFormatCustom';

/** Small icon button shown next to a column label in the table header. */
function HeaderIconButton({
  title,
  ariaLabel,
  onActivate,
  children,
}: {
  title: string;
  ariaLabel?: string;
  onActivate: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="ml-1 flex flex-shrink-0 items-center text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
      title={title}
      aria-label={ariaLabel ?? title}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </button>
  );
}

export function CommitTableHeader({ layout }: CommitTableHeaderProps) {
  const [resizeSession, setResizeSession] = useState<ResizeSession | null>(null);
  const updateCommitTableLayout = useGraphStore((state) => state.updateCommitTableLayout);

  const handleDoubleClick = useCallback((columnId: CommitTableColumnId) => {
    const { commits, topology, userSettings, commitTableLayout } = useGraphStore.getState();
    const autoWidth = computeAutoFitWidth(columnId, commits, topology, userSettings);
    const nextLayout = setCommitTableColumnPreferredWidth(commitTableLayout, columnId, autoWidth);
    updateCommitTableLayout(() => nextLayout);
    rpcClient.persistUIState({ commitTableLayout: nextLayout });
  }, [updateCommitTableLayout]);

  useEffect(() => {
    if (!resizeSession) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const deltaX = event.clientX - resizeSession.startX;
      if (resizeSession.pairResize) {
        const {
          baseLayout,
          leftColumnId,
          rightColumnId,
          leftStartWidth,
          rightStartWidth,
        } = resizeSession.pairResize;
        updateCommitTableLayout(() =>
          resizeCommitTableColumnPair({
            layout: baseLayout,
            leftColumnId,
            rightColumnId,
            leftStartWidth,
            rightStartWidth,
            deltaX,
          })
        );
        return;
      }

      const effectiveDeltaX = resizeSession.isReverse ? -deltaX : deltaX;

      const nextWidth = Math.min(
        resizeSession.maxWidth,
        Math.max(
          COMMIT_TABLE_MIN_WIDTHS[resizeSession.columnId],
          resizeSession.startWidth + effectiveDeltaX
        )
      );
      updateCommitTableLayout((currentLayout) =>
        setCommitTableColumnPreferredWidth(currentLayout, resizeSession.columnId, nextWidth)
      );
    };

    const handlePointerUp = () => {
      const nextLayout = useGraphStore.getState().commitTableLayout;
      rpcClient.persistUIState({ commitTableLayout: nextLayout });
      setResizeSession(null);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };
  }, [resizeSession, updateCommitTableLayout]);

  return (
    <div
      className="grid border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--vscode-descriptionForeground)]"
      style={{
        gridTemplateColumns: layout.gridTemplateColumns,
        width: layout.tableWidth,
      }}
    >
      {layout.columns.map((column, index) => {
        const { target: resizeTarget, isReverse } = resolveResizeTarget(layout.columns, index);
        const resizeLabel = `Resize ${COLUMN_LABELS[resizeTarget.id]} column`;
        const nextColumn = layout.columns[index + 1];
        return (
          <div
            key={column.id}
            className={`relative flex h-8 items-center px-2 ${index < layout.columns.length - 1 ? 'border-r border-[var(--vscode-panel-border)]' : ''}`}
          >
            <span className="truncate">{COLUMN_LABELS[column.id]}</span>
            {column.id === 'signature' && (
              <HeaderIconButton
                title="How signature verification works"
                ariaLabel="Signature verification help"
                onActivate={() => rpcClient.openSignatureHelp()}
              >
                <InfoIcon />
              </HeaderIconButton>
            )}
            {column.id === 'date' && (
              <HeaderIconButton
                title="Configure date format"
                onActivate={() => rpcClient.openSettings(DATE_FORMAT_SETTINGS_QUERY)}
              >
                <SettingsIcon />
              </HeaderIconButton>
            )}
            <button
              type="button"
              className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none"
              aria-label={resizeLabel}
              title={resizeLabel}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleDoubleClick(resizeTarget.id);
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const pairResize = isReverse && nextColumn
                  ? {
                      baseLayout: materializeCommitTableEffectiveWidths(
                        useGraphStore.getState().commitTableLayout,
                        layout.columns
                      ),
                      leftColumnId: column.id,
                      rightColumnId: nextColumn.id,
                      leftStartWidth: column.effectiveWidth,
                      rightStartWidth: nextColumn.effectiveWidth,
                    }
                  : undefined;
                setResizeSession({
                  columnId: resizeTarget.id,
                  startX: event.clientX,
                  startWidth: resizeTarget.effectiveWidth,
                  maxWidth: computeColumnMaxWidth(layout.columns, resizeTarget.id, layout.tableWidth),
                  isReverse,
                  pairResize,
                });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

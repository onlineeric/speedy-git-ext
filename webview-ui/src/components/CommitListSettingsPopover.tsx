import { useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CommitListMode, CommitTableColumnId } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import {
  getOptionalCommitTableColumnIds,
  reorderCommitTableColumns,
  setCommitTableColumnVisibility,
} from '../utils/commitTableLayout';
import { ColumnsIcon } from './icons';

const COLUMN_LABELS: Record<CommitTableColumnId, string> = {
  graph: 'Graph',
  hash: 'Hash',
  message: 'Message',
  author: 'Author',
  date: 'Date',
};

const buttonBaseClass =
  'rounded px-2.5 py-1 text-xs transition-colors focus:outline-none';

export function CommitListSettingsPopover() {
  const activeToggleWidget = useGraphStore((state) => state.activeToggleWidget);
  const setActiveToggleWidget = useGraphStore((state) => state.setActiveToggleWidget);
  const open = activeToggleWidget === 'commitListSettings';
  const commitListMode = useGraphStore((state) => state.commitListMode);
  const commitTableLayout = useGraphStore((state) => state.commitTableLayout);
  const setCommitListMode = useGraphStore((state) => state.setCommitListMode);
  const setCommitTableLayout = useGraphStore((state) => state.setCommitTableLayout);

  const optionalColumnIds = useMemo(
    () => getOptionalCommitTableColumnIds(commitTableLayout),
    [commitTableLayout]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleModeChange = (mode: CommitListMode) => {
    if (mode === commitListMode) {
      return;
    }

    setCommitListMode(mode);
    rpcClient.persistUIState({ commitListMode: mode });
  };

  const handleVisibilityChange = (columnId: CommitTableColumnId, visible: boolean) => {
    const nextLayout = setCommitTableColumnVisibility(commitTableLayout, columnId, visible);
    setCommitTableLayout(nextLayout);
    rpcClient.persistUIState({ commitTableLayout: nextLayout });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = optionalColumnIds.findIndex((columnId) => columnId === active.id);
    const newIndex = optionalColumnIds.findIndex((columnId) => columnId === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const nextOptionalOrder = arrayMove(optionalColumnIds, oldIndex, newIndex);
    const nextLayout = reorderCommitTableColumns(commitTableLayout, nextOptionalOrder);
    setCommitTableLayout(nextLayout);
    rpcClient.persistUIState({ commitTableLayout: nextLayout });
  };

  const triggerColor = open
    ? 'text-sky-400 opacity-100'
    : 'text-[var(--vscode-icon-foreground)] opacity-70 hover:opacity-100';

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setActiveToggleWidget('commitListSettings');
    } else if (open) {
      setActiveToggleWidget(null);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          className={`flex items-center justify-center rounded p-1.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] focus:outline-none ${triggerColor}`}
          title="Commit list settings"
          aria-label="Commit list settings"
        >
          <ColumnsIcon className="h-6 w-6" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-50 w-[320px] rounded border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] p-3 shadow-lg"
          onPointerDownOutside={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-radix-menu-content]') || target.closest('[role="dialog"]')) {
              event.preventDefault();
            }
          }}
        >
          <div className="space-y-3">
            <section>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--vscode-descriptionForeground)]">
                View Mode
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ModeButton
                  active={commitListMode === 'classic'}
                  label="Classic"
                  onClick={() => handleModeChange('classic')}
                />
                <ModeButton
                  active={commitListMode === 'table'}
                  label="Table"
                  onClick={() => handleModeChange('table')}
                />
              </div>
            </section>

            <div className="border-t border-[var(--vscode-panel-border)]" />

            <section className={commitListMode === 'classic' ? 'opacity-50 pointer-events-none' : ''}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--vscode-descriptionForeground)]">
                Columns
              </div>
              <p className="mb-3 text-xs text-[var(--vscode-descriptionForeground)]">
                {commitListMode === 'classic'
                  ? 'Switch to Table mode to configure columns.'
                  : 'Graph stays first and always visible. Drag optional columns to reorder them.'}
              </p>

              <div className="mb-2 flex items-center justify-between rounded border border-[var(--vscode-panel-border)] px-2 py-1.5 text-sm">
                <span>{COLUMN_LABELS.graph}</span>
                <span className="text-xs text-[var(--vscode-descriptionForeground)]">Pinned</span>
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={optionalColumnIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {optionalColumnIds.map((columnId) => (
                      <SortableColumnRow
                        key={columnId}
                        columnId={columnId}
                        label={COLUMN_LABELS[columnId]}
                        visible={commitTableLayout.columns[columnId].visible}
                        onVisibilityChange={handleVisibilityChange}
                        disabled={commitListMode === 'classic'}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </section>
          </div>
          <Popover.Arrow className="fill-[var(--vscode-menu-border)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${buttonBaseClass} ${
        active
          ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
          : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]'
      }`}
    >
      {label}
    </button>
  );
}

function SortableColumnRow({
  columnId,
  label,
  visible,
  onVisibilityChange,
  disabled,
}: {
  columnId: CommitTableColumnId;
  label: string;
  visible: boolean;
  onVisibilityChange: (columnId: CommitTableColumnId, visible: boolean) => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnId,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="flex items-center gap-2 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] px-2 py-1.5"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={`px-1 text-base leading-none text-[var(--vscode-descriptionForeground)] ${disabled ? 'cursor-default' : 'cursor-grab'}`}
        title={`Drag to reorder ${label}`}
        aria-label={`Drag to reorder ${label}`}
        disabled={disabled}
      >
        ⠿
      </button>

      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>

      <label className="flex items-center gap-2 text-xs text-[var(--vscode-descriptionForeground)]">
        <span>{visible ? 'Shown' : 'Hidden'}</span>
        <input
          type="checkbox"
          checked={visible}
          onChange={(event) => onVisibilityChange(columnId, event.target.checked)}
          className="h-3.5 w-3.5"
          disabled={disabled}
        />
      </label>
    </div>
  );
}

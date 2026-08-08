import { useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
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
import type { CommitTableColumnId } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import {
  COMMIT_TABLE_DEFAULT_WIDTHS,
  getOptionalCommitTableColumnIds,
  reorderCommitTableColumns,
  setCommitTableColumnPreferredWidth,
  setCommitTableColumnVisibility,
} from '../utils/commitTableLayout';
import { trackUiInteraction } from '../utils/telemetry';
import { AvatarSettingsSection } from './AvatarSettingsSection';
import { buttonSecondaryClassName, dialogContentClassName } from './dialogStyles';
import { ColumnsIcon } from './icons';
import { ToolbarIconButton, RemoteButtonToggleItem } from './ToolbarIconButton';

/** Column show/hide telemetry actions per optional column (049-usage-telemetry). */
const COLUMN_VISIBILITY_ACTIONS = {
  hash: { show: 'columnShowHash', hide: 'columnHideHash' },
  message: { show: 'columnShowMessage', hide: 'columnHideMessage' },
  author: { show: 'columnShowAuthor', hide: 'columnHideAuthor' },
  date: { show: 'columnShowDate', hide: 'columnHideDate' },
  signature: { show: 'columnShowSignature', hide: 'columnHideSignature' },
} as const;

const COLUMN_LABELS: Record<CommitTableColumnId, string> = {
  graph: 'Graph',
  hash: 'Hash',
  message: 'Message',
  author: 'Author',
  date: 'Date',
  signature: 'Signature',
};

const COLUMN_WARNINGS: Partial<Record<CommitTableColumnId, string>> = {
  signature:
    'Warning: signature checks run in the background and can use high CPU in large repositories. Keep this column hidden on slower machines.',
};

export function CommitListSettingsPopover() {
  // Open state lives in the store so the Author column header's gear can open
  // this same dialog.
  const open = useGraphStore((state) => state.viewSettingsOpen);
  const setOpen = useGraphStore((state) => state.setViewSettingsOpen);
  const commitTableLayout = useGraphStore((state) => state.commitTableLayout);
  const setCommitTableLayout = useGraphStore((state) => state.setCommitTableLayout);

  const optionalColumnIds = useMemo(
    () => getOptionalCommitTableColumnIds(commitTableLayout),
    [commitTableLayout]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleVisibilityChange = (columnId: CommitTableColumnId, visible: boolean) => {
    if (columnId !== 'graph') {
      trackUiInteraction('columnHeader', COLUMN_VISIBILITY_ACTIONS[columnId][visible ? 'show' : 'hide']);
    }
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

  const handleResetWidths = () => {
    // Restore every column's preferredWidth to its factory default.
    let nextLayout = commitTableLayout;
    for (const [columnId, defaultWidth] of Object.entries(COMMIT_TABLE_DEFAULT_WIDTHS)) {
      nextLayout = setCommitTableColumnPreferredWidth(
        nextLayout,
        columnId as Parameters<typeof setCommitTableColumnPreferredWidth>[1],
        defaultWidth
      );
    }
    setCommitTableLayout(nextLayout);
    rpcClient.persistUIState({ commitTableLayout: nextLayout });
  };

  const triggerColor = open
    ? 'text-sky-400 opacity-100'
    : 'text-[var(--vscode-icon-foreground)] opacity-70 hover:opacity-100';

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <ToolbarIconButton
          label="View"
          icon={<ColumnsIcon className="h-6 w-6" />}
          onClick={() => trackUiInteraction('toolbar', 'view')}
          className={triggerColor}
          title="Commit list settings"
          aria-label="Commit list settings"
          extraMenuItems={<RemoteButtonToggleItem />}
        />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className={`${dialogContentClassName} flex max-h-[85vh] w-[46rem] max-w-[92vw] flex-col`}
        >
          <Dialog.Title className="mb-1 text-base font-semibold text-[var(--vscode-foreground)]">
            View settings
          </Dialog.Title>
          <Dialog.Description className="mb-4 text-xs text-[var(--vscode-descriptionForeground)]">
            Choose which columns appear in the commit list and how author avatars are loaded.
          </Dialog.Description>

          {/* Two columns so neither half grows tall enough to need scrolling.
              Stacks on narrow panels, where side-by-side would be unreadable. */}
          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto md:grid-cols-2">
            <section className="min-w-0">
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--vscode-descriptionForeground)]">
                Columns
              </div>
              <p className="mb-3 text-xs text-[var(--vscode-descriptionForeground)]">
                Graph stays first and always visible. Drag optional columns to reorder them.
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
                        warning={COLUMN_WARNINGS[columnId]}
                        visible={commitTableLayout.columns[columnId].visible}
                        onVisibilityChange={handleVisibilityChange}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <div className="mt-4 border-t border-[var(--vscode-panel-border)] pt-2">
                <button
                  type="button"
                  onClick={handleResetWidths}
                  className={`${buttonSecondaryClassName} w-full text-xs`}
                  title="Restore all column widths to their factory defaults"
                >
                  Reset column widths to defaults
                </button>
              </div>
            </section>

            <div className="min-w-0 md:border-l md:border-[var(--vscode-panel-border)] md:pl-6">
              <AvatarSettingsSection />
            </div>
          </div>

          <div className="mt-4 flex justify-end border-t border-[var(--vscode-panel-border)] pt-3">
            <Dialog.Close asChild>
              <button type="button" className={`${buttonSecondaryClassName} text-xs`}>
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SortableColumnRow({
  columnId,
  label,
  warning,
  visible,
  onVisibilityChange,
}: {
  columnId: CommitTableColumnId;
  label: string;
  warning?: string;
  visible: boolean;
  onVisibilityChange: (columnId: CommitTableColumnId, visible: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnId,
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
        className="cursor-grab px-1 text-base leading-none text-[var(--vscode-descriptionForeground)]"
        title={`Drag to reorder ${label}`}
        aria-label={`Drag to reorder ${label}`}
      >
        ⠿
      </button>

      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        {warning && (
          <span
            role="note"
            className="mt-1 block text-[11px] leading-4 text-[var(--vscode-editorWarning-foreground)]"
          >
            {warning}
          </span>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-[var(--vscode-descriptionForeground)]">
        <span>{visible ? 'Shown' : 'Hidden'}</span>
        <input
          type="checkbox"
          checked={visible}
          onChange={(event) => onVisibilityChange(columnId, event.target.checked)}
          className="h-3.5 w-3.5"
        />
      </label>
    </div>
  );
}

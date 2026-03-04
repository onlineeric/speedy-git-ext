import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { RebaseEntry, RebaseAction } from '@shared/types';

interface InteractiveRebaseRowProps {
  entry: RebaseEntry;
  isFirst: boolean;
  onChange: (hash: string, updates: Partial<RebaseEntry>) => void;
}

const ACTIONS: RebaseAction[] = ['pick', 'squash', 'fixup', 'drop', 'reword'];

export const InteractiveRebaseRow = memo(function InteractiveRebaseRow({
  entry,
  isFirst,
  onChange,
}: InteractiveRebaseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.hash,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleActionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const action = e.target.value as RebaseAction;
    onChange(entry.hash, {
      action,
      rewordMessage: action === 'reword' ? (entry.rewordMessage ?? entry.subject) : undefined,
    });
  };

  const handleRewordChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(entry.hash, { rewordMessage: e.target.value });
  };

  const isDropped = entry.action === 'drop';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-1 p-2 mb-1 rounded border ${
        isDropped
          ? 'border-[var(--vscode-inputValidation-errorBorder)] opacity-60'
          : 'border-[var(--vscode-panel-border)]'
      } bg-[var(--vscode-editor-background)]`}
    >
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab text-[var(--vscode-descriptionForeground)] select-none px-1 text-base leading-none"
          title="Drag to reorder"
        >
          ⠿
        </span>

        {/* Action selector */}
        <select
          value={entry.action}
          onChange={handleActionChange}
          className="text-xs rounded px-1 py-0.5 bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border)]"
        >
          {ACTIONS.map((action) => (
            <option
              key={action}
              value={action}
              disabled={isFirst && (action === 'squash' || action === 'fixup')}
            >
              {action}
            </option>
          ))}
        </select>

        {/* Hash */}
        <span className="font-mono text-xs text-[var(--vscode-descriptionForeground)] w-16 shrink-0">
          {entry.abbreviatedHash}
        </span>

        {/* Subject */}
        <span className={`text-xs flex-1 truncate ${isDropped ? 'line-through' : ''}`}>
          {entry.subject}
        </span>
      </div>

      {/* Inline reword textarea */}
      {entry.action === 'reword' && (
        <textarea
          value={entry.rewordMessage ?? ''}
          onChange={handleRewordChange}
          rows={2}
          placeholder="New commit message..."
          className="w-full text-xs p-1 rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] resize-y"
        />
      )}
    </div>
  );
});

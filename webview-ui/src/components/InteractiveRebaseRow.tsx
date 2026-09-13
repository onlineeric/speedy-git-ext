import { memo } from 'react';
import type { RebaseEntry, RebaseAction } from '@shared/types';
import type { RebaseGroupPosition } from '../utils/rebaseGroups';
import type { RebaseDragHandleProps } from './InteractiveRebaseDragBlock';
import { ACCENT_COLOR } from '../utils/themeColors';

interface InteractiveRebaseRowProps {
  entry: RebaseEntry;
  isFirst: boolean;
  /** Where this row sits in a squash group's bracket. */
  groupPosition: RebaseGroupPosition;
  /** Handle of the drag block this row belongs to — the whole group for a grouped row. */
  dragHandle: RebaseDragHandleProps;
  onChange: (hash: string, updates: Partial<RebaseEntry>) => void;
}

/**
 * The bracket joining a squash group, drawn in a gutter beside the row. The
 * vertical line reaches past the row's bottom by the row padding, border and
 * gap (8 + 1 + 4 + 1 + 8 px) so consecutive rows join without a break.
 */
const ROW_JOIN_PX = 22;
/** Roughly the middle of the row's first line, where the bracket's ticks sit. */
const FIRST_LINE_MIDDLE_PX = 10;

function GroupBracket({ position }: { position: RebaseGroupPosition }) {
  if (position === 'none') return <span className="w-2 shrink-0" aria-hidden />;
  const style =
    position === 'lead'
      ? { top: FIRST_LINE_MIDDLE_PX, bottom: -ROW_JOIN_PX, borderTopWidth: 2 }
      : position === 'member'
        ? { top: -2, bottom: -ROW_JOIN_PX }
        : { top: -2, height: FIRST_LINE_MIDDLE_PX + 2, borderBottomWidth: 2 };
  return (
    <span className="relative w-2 shrink-0 self-stretch" aria-hidden>
      <span
        className="absolute left-0 w-2 border-l-2"
        style={{ ...style, borderColor: ACCENT_COLOR, borderStyle: 'solid', borderRightWidth: 0 }}
      />
    </span>
  );
}

const ACTIONS: RebaseAction[] = ['pick', 'squash', 'fixup', 'drop', 'reword'];

export const InteractiveRebaseRow = memo(function InteractiveRebaseRow({
  entry,
  isFirst,
  groupPosition,
  dragHandle,
  onChange,
}: InteractiveRebaseRowProps) {
  const handleActionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const action = e.target.value as RebaseAction;
    onChange(entry.hash, {
      action,
      // The complete message, not the subject: the box's contents become the
      // commit's entire new message, so seeding it with the subject alone would
      // drop the body and trailers of anything the user did not retype.
      rewordMessage: action === 'reword' ? (entry.rewordMessage ?? entry.message) : undefined,
    });
  };

  const handleRewordChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(entry.hash, { rewordMessage: e.target.value });
  };

  const isDropped = entry.action === 'drop';

  return (
    <div
      className={`flex gap-2 p-2 mb-1 rounded border ${
        isDropped
          ? 'border-[var(--vscode-inputValidation-errorBorder)] opacity-60'
          : 'border-[var(--vscode-panel-border)]'
      } bg-[var(--vscode-editor-background)]`}
    >
      <GroupBracket position={groupPosition} />
      <div className="flex flex-1 min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          {/* Drag handle */}
          <span
            {...dragHandle.attributes}
            {...dragHandle.listeners}
            className="cursor-grab text-[var(--vscode-descriptionForeground)] select-none px-1 text-base leading-none"
            title={groupPosition === 'none' ? 'Drag to reorder' : 'Drag to reorder this squash group together'}
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
            rows={4}
            placeholder="New commit message..."
            className="w-full text-xs p-1 rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] resize-y"
          />
        )}
      </div>
    </div>
  );
});

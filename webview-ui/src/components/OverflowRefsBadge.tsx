import * as Popover from '@radix-ui/react-popover';
import type { RefInfo } from '@shared/types';
import { BranchContextMenu } from './BranchContextMenu';
import { getRefStyle } from '../utils/refStyle';

interface OverflowRefsBadgeProps {
  hiddenRefs: RefInfo[];
  commitHash: string;
}

export function OverflowRefsBadge({ hiddenRefs, commitHash }: OverflowRefsBadgeProps) {
  if (hiddenRefs.length === 0) return null;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <span
          className="px-1.5 py-0.5 text-xs rounded border border-amber-500 text-amber-400 hover:border-amber-400 hover:text-amber-300 cursor-pointer font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          +{hiddenRefs.length}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          className="max-w-xs rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50 flex flex-wrap gap-1 p-2"
          onClick={(e) => e.stopPropagation()}
          onPointerDownOutside={(e) => {
            // Don't close if interacting with a context menu or dialog
            const target = e.target as HTMLElement;
            if (target.closest('[data-radix-menu-content]') || target.closest('[role="alertdialog"]') || target.closest('[role="dialog"]')) {
              e.preventDefault();
            }
          }}
        >
          {hiddenRefs.map((ref) => (
            <BranchContextMenu key={`${ref.type}-${ref.name}`} refInfo={ref} commitHash={commitHash}>
              <span
                className={`px-1.5 py-0.5 text-xs rounded ${getRefStyle(ref.type)}`}
                title={ref.remote ? `${ref.remote}/${ref.name}` : ref.name}
              >
                {ref.remote ? `${ref.remote}/${ref.name}` : ref.name}
              </span>
            </BranchContextMenu>
          ))}
          <Popover.Arrow className="fill-[var(--vscode-menu-border)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

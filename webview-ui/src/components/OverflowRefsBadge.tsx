import * as Popover from '@radix-ui/react-popover';
import type { DisplayRef } from '../types/displayRefs';
import { BranchContextMenu } from './BranchContextMenu';
import { RefLabel } from './RefLabel';
import { displayRefToRefInfo } from '../utils/mergeRefs';

interface OverflowRefsBadgeProps {
  hiddenRefs: DisplayRef[];
}

export function OverflowRefsBadge({ hiddenRefs }: OverflowRefsBadgeProps) {
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
            const target = e.target as HTMLElement;
            if (
              target.closest('[data-radix-menu-content]') ||
              target.closest('[role="alertdialog"]') ||
              target.closest('[role="dialog"]')
            ) {
              e.preventDefault();
            }
          }}
        >
          {hiddenRefs.map((displayRef) => {
            const key = displayRef.localName ?? displayRef.remoteName ?? displayRef.tagName ?? displayRef.stashRef;
            return (
              <BranchContextMenu key={key} refInfo={displayRefToRefInfo(displayRef)}>
                <RefLabel displayRef={displayRef} />
              </BranchContextMenu>
            );
          })}
          <Popover.Arrow className="fill-[var(--vscode-menu-border)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

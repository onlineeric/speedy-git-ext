import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit } from '@shared/types';
import { menuContentClass } from './menuStyles';
import { LazyContextMenu } from './LazyContextMenu';
import { useCommitMenuItems } from './useCommitMenuItems';

interface CommitContextMenuProps {
  commit: Commit;
  children: React.ReactNode;
}

export function CommitContextMenu({ commit, children }: CommitContextMenuProps) {
  return (
    <LazyContextMenu body={<CommitContextMenuBody commit={commit} />}>
      {children}
    </LazyContextMenu>
  );
}

/**
 * The commit row's menu. Every item it offers also appears — minus the ones the
 * ref menus cover better — under "Commit actions" on branch and tag badges, so
 * both are built from the same `useCommitMenuItems` hook.
 */
function CommitContextMenuBody({ commit }: { commit: Commit }) {
  const { items, dialogs } = useCommitMenuItems({ commit, surface: 'commitMenu', variant: 'row' });

  return (
    <>
      <ContextMenu.Portal>
        <ContextMenu.Content className={`min-w-[180px] ${menuContentClass}`}>
          {items}
        </ContextMenu.Content>
      </ContextMenu.Portal>
      {dialogs}
    </>
  );
}

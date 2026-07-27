import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit } from '@shared/types';
import { menuContentClass, menuMinWidthClass } from './menuStyles';
import { LazyContextMenu } from './LazyContextMenu';
import { MenuCopySubmenu } from './MenuCopySubmenu';
import { MenuGroupSeparator } from './MenuGroupSeparator';
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
 * ref menus cover better — under the "Commit" group of branch and tag badge
 * menus, so both are built from the same `useCommitMenuItems` hook.
 */
function CommitContextMenuBody({ commit }: { commit: Commit }) {
  const { commitItems, compareItems, createItems, worktreeItem, copyItems, dialogs } =
    useCommitMenuItems({ commit, surface: 'commitMenu', variant: 'row' });

  return (
    <>
      <ContextMenu.Portal>
        <ContextMenu.Content className={`${menuMinWidthClass} ${menuContentClass}`}>
          <MenuGroupSeparator label="Commit" name={commit.abbreviatedHash} />
          {commitItems}

          <MenuGroupSeparator label="Compare" />
          {compareItems}

          <MenuGroupSeparator label="Create" />
          {createItems}

          <MenuGroupSeparator label="Worktree" />
          {worktreeItem}

          <MenuGroupSeparator />
          <MenuCopySubmenu>{copyItems}</MenuCopySubmenu>
        </ContextMenu.Content>
      </ContextMenu.Portal>
      {dialogs}
    </>
  );
}

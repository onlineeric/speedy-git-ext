import type { ComponentPropsWithoutRef } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { dangerItemClass, menuItemClass, menuItemDisabledClass } from './menuStyles';

interface MenuItemProps extends ComponentPropsWithoutRef<typeof ContextMenu.Item> {
  /**
   * Action that rewrites or discards work (Delete Branch, Drop Commit, hard
   * Reset). Warns through colour before the click, not after.
   */
  danger?: boolean;
}

/**
 * A context-menu command.
 *
 * Radix needs `disabled` to stop the click and the menu needs a matching class
 * to stop *looking* clickable. Stating the condition twice at every call site
 * let the two drift — an item that dimmed but still fired, or fired but looked
 * dead — so the condition is given once here and drives both.
 */
export function MenuItem({ danger = false, disabled = false, className, ...props }: MenuItemProps) {
  const styleClass = disabled ? menuItemDisabledClass : danger ? dangerItemClass : menuItemClass;
  return (
    <ContextMenu.Item
      {...props}
      disabled={disabled}
      className={className ? `${styleClass} ${className}` : styleClass}
    />
  );
}

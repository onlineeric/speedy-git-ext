import type { ComponentPropsWithoutRef } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { MENU_COLLISION_PADDING, menuContentClass, menuMinWidthClass } from './menuStyles';

interface MenuShellProps {
  /** Width floor for this menu. Defaults to the captioned-group floor. */
  minWidth?: string;
}

type MenuContentProps = ComponentPropsWithoutRef<typeof ContextMenu.Content> & MenuShellProps;
type MenuSubContentProps = ComponentPropsWithoutRef<typeof ContextMenu.SubContent> & MenuShellProps;

/**
 * The panel a context menu opens in.
 *
 * Exists because the shell is more than a class string: a menu also has to cap
 * its height against the room Radix measured and keep clear of the viewport
 * edge, or a long one (a branch badge's runs to ~20 items) runs off the bottom
 * of a short editor window. Stating that per call site made it opt-in, so a new
 * menu could silently ship without it. Only the width floor varies, so only the
 * width floor is a prop.
 */
export function MenuContent({ minWidth = menuMinWidthClass, className, ...props }: MenuContentProps) {
  return (
    <ContextMenu.Content
      {...props}
      className={`${minWidth} ${menuContentClass}${className ? ` ${className}` : ''}`}
      collisionPadding={MENU_COLLISION_PADDING}
    />
  );
}

/** The same shell for a submenu's panel. */
export function MenuSubContent({ minWidth = menuMinWidthClass, className, ...props }: MenuSubContentProps) {
  return (
    <ContextMenu.SubContent
      {...props}
      className={`${minWidth} ${menuContentClass}${className ? ` ${className}` : ''}`}
      collisionPadding={MENU_COLLISION_PADDING}
    />
  );
}

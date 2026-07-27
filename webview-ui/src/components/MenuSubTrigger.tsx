import * as ContextMenu from '@radix-ui/react-context-menu';
import { ChevronRightIcon } from './icons';
import { menuSubTriggerClass } from './menuStyles';

/**
 * A menu item that opens a submenu.
 *
 * The trailing chevron is the only thing distinguishing it from a command that
 * fires on click, so it is deliberately drawn a size up from the 12px chevrons
 * used elsewhere and at full item contrast — a submenu the user cannot see is a
 * submenu they never open.
 */
export function MenuSubTrigger({ children }: { children: React.ReactNode }) {
  return (
    <ContextMenu.SubTrigger className={menuSubTriggerClass}>
      <span>{children}</span>
      <ChevronRightIcon className="shrink-0" size={15} strokeWidth={1.8} />
    </ContextMenu.SubTrigger>
  );
}

import { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';

interface LazyContextMenuProps {
  /** The trigger content (e.g. a commit row or ref badge). Always rendered. */
  children: React.ReactNode;
  /**
   * The menu body — `ContextMenu.Portal`/`Content` plus any dialogs and the
   * store subscriptions that feed them. Mounted only after the menu is first
   * opened, so idle rows in the virtualized list stay cheap.
   */
  body: React.ReactNode;
  /**
   * Stop the contextmenu event from bubbling to a parent context menu. Used by
   * nested triggers (e.g. a branch badge inside a commit row) so the inner menu
   * wins. Mirrors the wrapper that AuthorContextMenu/DateContextMenu use.
   */
  stopPropagation?: boolean;
}

/**
 * Wraps a Radix context menu so its heavy body is only instantiated after the
 * user actually right-clicks the row. In a virtualized list this keeps every
 * idle row down to a Trigger element — no per-row store subscriptions, dialogs,
 * or menu items — which is what lets fast scrolling keep up without blanking.
 *
 * `ContextMenu.Root` is uncontrolled (Radix owns the open state), so we latch on
 * the first `onOpenChange(true)`. That callback fires synchronously inside the
 * same contextmenu event as Radix's internal open, so React batches both updates
 * and the menu still appears on the very first right-click. Once latched the body
 * stays mounted for the row's lifetime (until it scrolls out and unmounts),
 * which keeps dialog state alive across the menu-close → dialog-open transition.
 */
export function LazyContextMenu({ children, body, stopPropagation }: LazyContextMenuProps) {
  const [activated, setActivated] = useState(false);

  const root = (
    <ContextMenu.Root
      onOpenChange={(open) => {
        if (open) setActivated(true);
      }}
    >
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      {activated && body}
    </ContextMenu.Root>
  );

  if (stopPropagation) {
    return <span onContextMenu={(e) => e.stopPropagation()}>{root}</span>;
  }
  return root;
}

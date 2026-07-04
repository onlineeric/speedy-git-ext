import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { menuContentClass, menuItemClass } from './menuStyles';

interface ToolbarIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Text shown under the icon when `speedyGit.toolbar.showLabels` is enabled. */
  label: string;
  icon: ReactNode;
  /**
   * Adds a "Show/Hide Remote Button" item to the right-click menu. Enabled on
   * the right-aligned buttons (View, Remote, Settings) so the Remote button
   * can be brought back even while it is hidden.
   */
  withRemoteButtonToggle?: boolean;
}

/**
 * Toolbar icon button with an optional tiny text label under the icon,
 * driven by the `speedyGit.toolbar.showLabels` setting (default on).
 *
 * Right-clicking any toolbar button opens a context menu whose single item
 * toggles the labels for ALL toolbar buttons at once — it persists the change
 * through the `setToolbarLabels` RPC, and the refreshed settings flow back to
 * every button via the store.
 *
 * Forwards ref/props to the underlying <button> so it composes with Radix
 * `asChild` triggers (e.g. the View button's Popover.Trigger).
 */
export const ToolbarIconButton = forwardRef<HTMLButtonElement, ToolbarIconButtonProps>(
  function ToolbarIconButton({ label, icon, withRemoteButtonToggle, className, ...buttonProps }, ref) {
    const showLabels = useGraphStore((state) => state.userSettings.toolbarShowLabels);
    const showRemoteButton = useGraphStore((state) => state.userSettings.toolbarShowRemoteButton);

    const layoutClass = showLabels ? 'px-1.5 pt-1 pb-0.5' : 'p-1.5';

    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button
            ref={ref}
            type="button"
            {...buttonProps}
            className={`flex flex-col items-center justify-center rounded focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--vscode-toolbar-hoverBackground)] ${layoutClass} ${className ?? ''}`}
          >
            {icon}
            {showLabels && (
              <span className="select-none text-[11px] leading-[13px] tracking-tight">{label}</span>
            )}
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className={`min-w-[140px] ${menuContentClass}`}>
            <ContextMenu.Item
              className={menuItemClass}
              onSelect={() => rpcClient.setToolbarSetting('showLabels', !showLabels)}
            >
              {showLabels ? 'Hide Labels' : 'Show Labels'}
            </ContextMenu.Item>
            {withRemoteButtonToggle && (
              <ContextMenu.Item
                className={menuItemClass}
                onSelect={() => rpcClient.setToolbarSetting('showRemoteButton', !showRemoteButton)}
              >
                {showRemoteButton ? 'Hide Remote Button' : 'Show Remote Button'}
              </ContextMenu.Item>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    );
  }
);

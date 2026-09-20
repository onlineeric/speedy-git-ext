import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { trackUiInteraction } from '../utils/telemetry';
import { ToolbarIconButton, RemoteButtonToggleItem, TOGGLE_BUTTON_TONES } from './ToolbarIconButton';

const GAP = 4;
const MORE_WIDTH = 36;

/** Widths include separators even while they are invisible in a dropdown. */
export function getToolbarCollapseState({ availableWidth, leftWidths, rightWidths, statusWidth }: {
  availableWidth: number;
  leftWidths: number[];
  rightWidths: number[];
  statusWidth: number;
}) {
  const rowWidth = (widths: number[]) => widths.reduce((sum, width) => sum + width, 0)
    + Math.max(0, widths.length - 1) * GAP;
  const available = availableWidth - statusWidth - GAP * 2;
  const leftWidth = rowWidth(leftWidths);
  const right = leftWidth + rowWidth(rightWidths) > available;
  return { left: right && leftWidth + MORE_WIDTH > available, right };
}

export function getToolbarGroupClassName(collapsed: boolean, open: boolean, side: 'left' | 'right'): string {
  return collapsed
    ? `absolute top-full z-50 mt-1 flex w-max max-h-[calc(100vh-64px)] flex-col items-center gap-1 [&>*]:shrink-0 [&>svg]:absolute [&>svg]:invisible overflow-y-auto rounded border border-[var(--vscode-widget-border)] bg-[var(--vscode-menu-background)] p-1 shadow-lg ${side === 'left' ? 'left-0' : 'right-0'} ${open ? '' : 'invisible'}`
    : 'flex w-max items-center gap-1';
}

/** Measure the actual controls, including labels and conditional buttons, without mounting copies. */
export function ResponsiveToolbar({ left, right, status }: {
  left: ReactNode;
  right: ReactNode;
  status: ReactNode;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState({ left: false, right: false });

  useLayoutEffect(() => {
    const bar = barRef.current!;
    const leftGroup = leftRef.current!;
    const rightGroup = rightRef.current!;
    const statusLabel = statusRef.current!;
    const measure = () => {
      const next = getToolbarCollapseState({
        availableWidth: bar.clientWidth,
        leftWidths: Array.from(leftGroup.children, (item) => item.getBoundingClientRect().width),
        rightWidths: Array.from(rightGroup.children, (item) => item.getBoundingClientRect().width),
        statusWidth: statusLabel.getBoundingClientRect().width,
      });
      setCollapsed((previous) => previous.left === next.left && previous.right === next.right ? previous : next);
    };
    const resize = new ResizeObserver(measure);
    const observe = () => {
      resize.disconnect();
      [bar, statusLabel, ...leftGroup.children, ...rightGroup.children].forEach((item) => resize.observe(item));
      measure();
    };
    const mutations = new MutationObserver(observe);
    mutations.observe(leftGroup, { childList: true, subtree: true });
    mutations.observe(rightGroup, { childList: true, subtree: true });
    observe();
    return () => { resize.disconnect(); mutations.disconnect(); };
  }, []);

  return (
    <div ref={barRef} className="flex min-w-[80px] flex-1 items-center gap-1">
      <ToolbarGroup side="left" collapsed={collapsed.left} contentRef={leftRef}>{left}</ToolbarGroup>
      <div className="ml-auto min-w-0 overflow-hidden">
        <div ref={statusRef} className="w-max whitespace-nowrap">{status}</div>
      </div>
      <ToolbarGroup side="right" collapsed={collapsed.right} contentRef={rightRef}>{right}</ToolbarGroup>
    </div>
  );
}

export function ToolbarGroup({ side, collapsed, contentRef, children }: {
  side: 'left' | 'right';
  collapsed: boolean;
  contentRef: RefObject<HTMLDivElement>;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (!collapsed && open) setOpen(false);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (collapsed && open) contentRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [collapsed, open, contentRef]);

  return (
    <div ref={rootRef} className="relative shrink-0" onKeyDown={(event) => {
      if (!collapsed || !open || !rootRef.current?.contains(event.target as Node)) return;
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const buttons = Array.from(contentRef.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = current + (event.key === 'ArrowDown' ? 1 : -1);
        buttons[(next + buttons.length) % buttons.length]?.focus();
      }
    }}>
      {collapsed && (
        <ToolbarIconButton
          ref={triggerRef}
          label="More"
          icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
          </svg>}
          {...TOGGLE_BUTTON_TONES.inactive}
          className="h-9 w-9 [&>span]:hidden"
          aria-label={`More ${side === 'left' ? 'actions' : 'options'}`}
          title={`More ${side === 'left' ? 'actions' : 'options'}`}
          aria-expanded={open}
          aria-controls={id}
          extraMenuItems={side === 'right' ? <RemoteButtonToggleItem /> : undefined}
          onClick={() => {
            if (!open) trackUiInteraction('toolbar', side === 'left' ? 'moreActions' : 'moreOptions');
            setOpen(!open);
          }}
        />
      )}
      {/* Keep separator widths measurable for the toolbar, but remove them from the dropdown layout. */}
      <div
        ref={contentRef}
        id={id}
        role="group"
        aria-label={side === 'left' ? 'Toolbar actions' : 'Toolbar options'}
        className={getToolbarGroupClassName(collapsed, open, side)}
        onClick={(event) => {
          // Portaled dialogs/context menus remain owned by these same mounted controls.
          if (collapsed && event.target instanceof Element && contentRef.current?.contains(event.target)
            && event.target.closest('button')) {
            setOpen(false);
            triggerRef.current?.focus();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

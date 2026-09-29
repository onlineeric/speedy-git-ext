import {
  cloneElement, useEffect, useId, useLayoutEffect, useRef, useState,
  type CSSProperties, type ReactElement, type ReactNode, type RefObject,
} from 'react';
import { trackUiInteraction } from '../utils/telemetry';
import { ToolbarIconButton, RemoteButtonToggleItem, TOGGLE_BUTTON_TONES } from './ToolbarIconButton';
import { MoreIcon } from './icons';
import { menuPanelClass } from './menuStyles';

const GAP = 4;
const MORE_WIDTH = 36;
/** Above any item's `order`, so the More button always ends the row it sits in. */
const MORE_ORDER = 1000;

/**
 * - `inline`: every item in the toolbar row
 * - `partial`: pinned items stay in the row, the rest move into More (left group only)
 * - `collapsed`: every item is in More
 */
export type ToolbarGroupMode = 'inline' | 'partial' | 'collapsed';

/**
 * One left-group control. `pinned` items stay in the row after the others have
 * moved into More, and go last. The element must accept `style`: its position
 * comes from a flex `order`, so an item keeps its place in the row whichever
 * group it belongs to (New Tab sits after the pinned HEAD, yet collapses first).
 */
export interface ToolbarItem {
  key: string;
  element: ReactElement<{ style?: CSSProperties }>;
  pinned?: boolean;
}

/** Widths include separators even while they are invisible in a dropdown. */
export function getToolbarCollapseState({ availableWidth, leftWidths, leftPinnedWidths = [], rightWidths, statusWidth }: {
  availableWidth: number;
  leftWidths: number[];
  leftPinnedWidths?: number[];
  rightWidths: number[];
  statusWidth: number;
}): { left: ToolbarGroupMode; right: boolean } {
  const rowWidth = (widths: number[]) => widths.reduce((sum, width) => sum + width, 0)
    + Math.max(0, widths.length - 1) * GAP;
  const available = availableWidth - statusWidth - GAP * 2;
  const leftWidth = rowWidth([...leftWidths, ...leftPinnedWidths]);
  const right = leftWidth + rowWidth(rightWidths) > available;
  if (!right || leftWidth + MORE_WIDTH <= available) return { left: 'inline', right };
  // A partial row needs both a pinned item and something to move; otherwise it is
  // just one of the other two modes.
  const partialFits = leftPinnedWidths.length > 0 && leftWidths.length > 0
    && rowWidth(leftPinnedWidths) + GAP + MORE_WIDTH * 2 <= available;
  return { left: partialFits ? 'partial' : 'collapsed', right };
}

export function getToolbarGroupClassName(isPanel: boolean, open: boolean, align: 'left' | 'right'): string {
  // Collapsed, the group *is* a menu panel, so it takes the shared shell rather
  // than re-spelling the theme tokens and the slim scrollbar. Radix's
  // available-height variable is published only inside a Radix menu, and this is
  // not one, so the height caps against the viewport instead.
  // Items sit one or two levels down (through `display: contents` wrappers), so
  // the item and separator rules reach both depths.
  return isPanel
    ? `${menuPanelClass} absolute top-full mt-1 flex w-max max-h-[calc(100vh-64px)] flex-col items-center gap-1 p-1 `
      + `[&>*]:shrink-0 [&>*>*]:shrink-0 [&_[data-toolbar-separator]]:absolute [&_[data-toolbar-separator]]:invisible `
      + `${align === 'left' ? 'left-0' : 'right-0'} ${open ? '' : 'invisible'}`
    : 'contents';
}

/** Give each item its row position, then split it into the collapsible and pinned groups. */
export function splitToolbarItems(items: ToolbarItem[]) {
  const place = ({ key, element }: ToolbarItem, order: number) =>
    cloneElement(element, { key, style: { ...element.props.style, order } });
  return {
    collapsible: items.flatMap((item, index) => item.pinned ? [] : [place(item, index)]),
    pinned: items.flatMap((item, index) => item.pinned ? [place(item, index)] : []),
  };
}

/** Measure the actual controls, including labels and conditional buttons, without mounting copies. */
export function ResponsiveToolbar({ left, right, status }: {
  left: ToolbarItem[];
  right: ReactNode;
  status: ReactNode;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const leftPinnedRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<{ left: ToolbarGroupMode; right: boolean }>({ left: 'inline', right: false });
  const { collapsible, pinned } = splitToolbarItems(left);

  useLayoutEffect(() => {
    const bar = barRef.current!;
    const leftGroup = leftRef.current!;
    const leftPinnedGroup = leftPinnedRef.current!;
    const rightGroup = rightRef.current!;
    const statusLabel = statusRef.current!;
    const widths = (group: HTMLElement) => Array.from(group.children, (item) => item.getBoundingClientRect().width);
    const measure = () => {
      const next = getToolbarCollapseState({
        availableWidth: bar.clientWidth,
        leftWidths: widths(leftGroup),
        leftPinnedWidths: widths(leftPinnedGroup),
        rightWidths: widths(rightGroup),
        statusWidth: statusLabel.getBoundingClientRect().width,
      });
      setCollapsed((previous) => previous.left === next.left && previous.right === next.right ? previous : next);
    };
    const resize = new ResizeObserver(measure);
    const groups = [leftGroup, leftPinnedGroup, rightGroup];
    const observe = () => {
      resize.disconnect();
      [bar, statusLabel, ...groups.flatMap((group) => Array.from(group.children))].forEach((item) => resize.observe(item));
      measure();
    };
    const mutations = new MutationObserver(observe);
    // Direct children only: those are exactly what `measure` sizes, and each one's
    // own size changes are already covered by the per-child ResizeObserver above.
    groups.forEach((group) => mutations.observe(group, { childList: true }));
    observe();
    return () => { resize.disconnect(); mutations.disconnect(); };
  }, []);

  return (
    <div ref={barRef} className="flex min-w-[80px] flex-1 items-center gap-1">
      <ToolbarGroup side="left" mode={collapsed.left} contentRef={leftRef} pinnedRef={leftPinnedRef} pinned={pinned}>
        {collapsible}
      </ToolbarGroup>
      <div className="ml-auto min-w-0 overflow-hidden">
        <div ref={statusRef} className="w-max whitespace-nowrap">{status}</div>
      </div>
      <ToolbarGroup side="right" mode={collapsed.right ? 'collapsed' : 'inline'} contentRef={rightRef}>{right}</ToolbarGroup>
    </div>
  );
}

/** Enabled buttons in the order they are drawn, which `order` can make differ from the DOM's. */
function visibleButtons(panel: HTMLElement): HTMLButtonElement[] {
  // Read each button's order once rather than inside the comparator.
  return Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'), (button) => ({
    button,
    order: Number(getComputedStyle(button).order) || 0,
  }))
    .sort((a, b) => a.order - b.order)
    .map(({ button }) => button);
}

/**
 * Structure is fixed across modes so no control ever remounts (its dialogs and
 * context menus stay open): `outer > [content, pinned] > items`. Whichever
 * wrapper is not the dropdown panel is `display: contents`, so its items lay out
 * directly in the row.
 */
export function ToolbarGroup({ side, mode, contentRef, pinnedRef, pinned, children }: {
  side: 'left' | 'right';
  mode: ToolbarGroupMode;
  contentRef: RefObject<HTMLDivElement>;
  pinnedRef?: RefObject<HTMLDivElement>;
  pinned?: ReactNode;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const collapsed = mode !== 'inline';
  // In `partial` the panel sits under the More button at the end of the pinned row.
  const align = side === 'left' && mode !== 'partial' ? 'left' : 'right';
  const panelRef = mode === 'partial' ? contentRef : outerRef;

  if (!collapsed && open) setOpen(false);

  useEffect(() => {
    if (!open) return;
    // Outside the panel and its trigger, which also closes it when a pinned
    // button beside it is used.
    const dismiss = (event: Event) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
    };
  }, [open, panelRef]);

  useLayoutEffect(() => {
    const current = panelRef.current;
    if (collapsed && open && current) visibleButtons(current)[0]?.focus();
  }, [collapsed, open, panelRef]);

  return (
    <div className="relative flex shrink-0 items-center gap-1" onKeyDown={(event) => {
      const current = panelRef.current;
      const target = event.target as Node;
      if (!collapsed || !open || !current
        || !(current.contains(target) || triggerRef.current?.contains(target))) return;
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const buttons = visibleButtons(current);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = index + (event.key === 'ArrowDown' ? 1 : -1);
        buttons[(next + buttons.length) % buttons.length]?.focus();
      }
    }}>
      {collapsed && (
        <ToolbarIconButton
          ref={triggerRef}
          label="More"
          icon={<MoreIcon className="h-6 w-6" />}
          {...TOGGLE_BUTTON_TONES.inactive}
          style={{ ...TOGGLE_BUTTON_TONES.inactive.style, order: MORE_ORDER }}
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
        ref={outerRef}
        id={mode === 'partial' ? undefined : id}
        role="group"
        aria-label={side === 'left' ? 'Toolbar actions' : 'Toolbar options'}
        className={getToolbarGroupClassName(mode === 'collapsed', open, align)}
        onClick={(event) => {
          // Portaled dialogs/context menus remain owned by these same mounted controls.
          const current = panelRef.current;
          if (collapsed && event.target instanceof Element && current?.contains(event.target)
            && event.target.closest('button')) {
            setOpen(false);
            triggerRef.current?.focus();
          }
        }}
      >
        <div
          ref={contentRef}
          id={mode === 'partial' ? id : undefined}
          className={getToolbarGroupClassName(mode === 'partial', open, align)}
        >
          {children}
        </div>
        {/* Always mounted (even empty) so the toolbar can measure it. */}
        <div ref={pinnedRef} className="contents">{pinned}</div>
      </div>
    </div>
  );
}

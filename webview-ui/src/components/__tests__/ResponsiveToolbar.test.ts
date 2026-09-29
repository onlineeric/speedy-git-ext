import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlBar } from '../ControlBar';
import { getToolbarCollapseState, getToolbarGroupClassName, ToolbarGroup, type ToolbarGroupMode } from '../ResponsiveToolbar';
import { RemoteButtonToggleItem, ToolbarIconButton } from '../ToolbarIconButton';
import { ToolbarSeparatorIcon } from '../icons';
import { useGraphStore } from '../../stores/graphStore';
import { rpcClient } from '../../rpc/rpcClient';

// These are static-render tests, not a replacement for browser layout tests.
// Read current settings instead of Zustand's SSR initial snapshot; layout effects
// cannot run without a DOM and require separate browser testing.
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useLayoutEffect: () => {},
}));
vi.mock('../../stores/graphStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stores/graphStore')>();
  type State = ReturnType<typeof actual.useGraphStore.getState>;
  return {
    ...actual,
    useGraphStore: Object.assign(
      (selector?: (state: State) => unknown) => selector ? selector(actual.useGraphStore.getState()) : actual.useGraphStore.getState(),
      actual.useGraphStore,
    ),
  };
});
vi.mock('../../rpc/rpcClient', () => ({ rpcClient: { setToolbarSetting: vi.fn(), send: vi.fn() } }));

// Supply the layout mode for static rendering; the real collapse calculation is
// tested separately below. Both slots still render the production ToolbarGroup.
const renderState = vi.hoisted(() => ({ mode: 'inline' as ToolbarGroupMode }));
vi.mock('../ResponsiveToolbar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ResponsiveToolbar')>();
  return {
    ...actual,
    ResponsiveToolbar: ({ left, right, status }: Parameters<typeof actual.ResponsiveToolbar>[0]) => {
      const { collapsible, pinned } = actual.splitToolbarItems(left);
      return createElement('div', null,
        createElement(actual.ToolbarGroup, {
          side: 'left', mode: renderState.mode, contentRef: createRef<HTMLDivElement>(), pinned, children: collapsible,
        }),
        status,
        createElement(actual.ToolbarGroup, {
          side: 'right', mode: renderState.mode === 'inline' ? 'inline' : 'collapsed', contentRef: createRef<HTMLDivElement>(), children: right,
        }),
      );
    },
  };
});

const initialState = useGraphStore.getState();
beforeEach(() => {
  useGraphStore.setState(initialState, true);
  vi.clearAllMocks();
  renderState.mode = 'inline';
});

const widths = {
  leftWidths: [60, 16, 60], // Two labelled actions and a separator.
  rightWidths: [60, 60],
  statusWidth: 40,
};

function setSettings(toolbarShowLabels: boolean, toolbarShowRemoteButton = true) {
  useGraphStore.setState({
    userSettings: { ...initialState.userSettings, toolbarShowLabels, toolbarShowRemoteButton },
  });
}

function renderGroup(collapsed: boolean) {
  return renderToStaticMarkup(createElement(ToolbarGroup, {
    side: 'left', mode: collapsed ? 'collapsed' : 'inline', contentRef: createRef<HTMLDivElement>(),
    children: [
      createElement(ToolbarIconButton, {
        key: 'filter', label: 'Filter', title: 'Filter', icon: createElement('svg', { 'data-testid': 'button-icon' }),
      }),
      createElement(ToolbarSeparatorIcon, { key: 'separator', className: 'h-6 w-4' }),
    ],
  }));
}

describe('toolbar collapse decisions', () => {
  it('collapses right first, then left, and restores both when widened', () => {
    const states = [400, 250, 180, 250, 400].map((availableWidth) => getToolbarCollapseState({ ...widths, availableWidth }));
    expect(states).toEqual([
      { left: 'inline', right: false },
      { left: 'inline', right: true },
      { left: 'collapsed', right: true },
      { left: 'inline', right: true },
      { left: 'inline', right: false },
    ]);
  });

  it('keeps groups inline at the exact fit and collapses one pixel below it', () => {
    expect(getToolbarCollapseState({ ...widths, availableWidth: 316 })).toEqual({ left: 'inline', right: false });
    expect(getToolbarCollapseState({ ...widths, availableWidth: 315 })).toEqual({ left: 'inline', right: true });
    expect(getToolbarCollapseState({ ...widths, availableWidth: 228 })).toEqual({ left: 'inline', right: true });
    expect(getToolbarCollapseState({ ...widths, availableWidth: 227 })).toEqual({ left: 'collapsed', right: true });
  });

  it('recalculates when hiding and showing labels changes measured button widths', () => {
    const labelled = { ...widths, availableWidth: 250 };
    const iconsOnly = { ...labelled, leftWidths: [36, 16, 36], rightWidths: [36, 36] };
    expect(getToolbarCollapseState(labelled)).toEqual({ left: 'inline', right: true });
    expect(getToolbarCollapseState(iconsOnly)).toEqual({ left: 'inline', right: false });
    expect(getToolbarCollapseState(labelled)).toEqual({ left: 'inline', right: true });
  });

  it('recalculates when buttons are hidden, restored, added or removed', () => {
    const allButtons = { ...widths, availableWidth: 260 };
    expect(getToolbarCollapseState(allButtons)).toEqual({ left: 'inline', right: true });
    expect(getToolbarCollapseState({ ...allButtons, rightWidths: [60] })).toEqual({ left: 'inline', right: false });
    expect(getToolbarCollapseState(allButtons)).toEqual({ left: 'inline', right: true });
    expect(getToolbarCollapseState({ ...allButtons, leftWidths: [...widths.leftWidths, 60] })).toEqual({ left: 'collapsed', right: true });
    expect(getToolbarCollapseState(allButtons)).toEqual({ left: 'inline', right: true });
  });

  it('retains separator width when calculating whether the toolbar can be restored', () => {
    // At this width the actions alone fit, but their inline separator does not.
    expect(getToolbarCollapseState({ ...widths, availableWidth: 210 })).toEqual({ left: 'collapsed', right: true });
    expect(getToolbarCollapseState({ ...widths, availableWidth: 210, leftWidths: [60, 60] })).toEqual({ left: 'inline', right: true });
  });
});

describe('left group two-phase collapse', () => {
  // Collapsible: two actions + a separator; pinned: two actions (Refresh/Fetch/HEAD in the real bar).
  const phased = { leftWidths: [60, 60, 16], leftPinnedWidths: [60, 60], rightWidths: [60, 60], statusWidth: 40 };

  it('collapses right, then the unpinned left items, then everything, and restores in reverse', () => {
    const states = [500, 400, 300, 200, 300, 400, 500].map((availableWidth) => getToolbarCollapseState({ ...phased, availableWidth }));
    expect(states).toEqual([
      { left: 'inline', right: false },
      { left: 'inline', right: true },
      { left: 'partial', right: true },
      { left: 'collapsed', right: true },
      { left: 'partial', right: true },
      { left: 'inline', right: true },
      { left: 'inline', right: false },
    ]);
  });

  it('switches phases at the exact fit', () => {
    // Whole left row (272) + left More (36) fits in 356 - status - gaps.
    expect(getToolbarCollapseState({ ...phased, availableWidth: 356 }).left).toBe('inline');
    expect(getToolbarCollapseState({ ...phased, availableWidth: 355 }).left).toBe('partial');
    // Pinned row (124) + gap + left More + right More fits in 248 - status - gaps.
    expect(getToolbarCollapseState({ ...phased, availableWidth: 248 }).left).toBe('partial');
    expect(getToolbarCollapseState({ ...phased, availableWidth: 247 }).left).toBe('collapsed');
  });

  it('skips the partial phase when nothing is pinned, or nothing is left to move', () => {
    expect(getToolbarCollapseState({ ...phased, leftPinnedWidths: [], availableWidth: 150 }).left).toBe('collapsed');
    expect(getToolbarCollapseState({ ...phased, leftWidths: [], leftPinnedWidths: [60, 60, 16, 60, 60], availableWidth: 300 }).left)
      .toBe('collapsed');
  });

  function panelOf(markup: string) {
    // The dropdown panel is the only element carrying the menu shell.
    const start = markup.lastIndexOf('<div', markup.indexOf('menu-scroll'));
    return markup.slice(start);
  }

  it('keeps Refresh, Fetch and HEAD in the row and moves the rest into the dropdown', () => {
    renderState.mode = 'partial';
    const markup = renderToStaticMarkup(createElement(ControlBar));
    const leftPanel = panelOf(markup).split('role="group" aria-label="Toolbar options"')[0];
    const [panelItems, afterPanel] = leftPanel.split('</div><div class="contents">');
    for (const title of ['title="Filter"', 'title="Search commits"', 'title="Compare refs (Base vs Target)"', 'title="Worktrees"', 'title="Open New Graph Tab"']) {
      expect(panelItems).toContain(title);
    }
    for (const title of ['title="Refresh"', 'title="Go to HEAD commit (current checkout)"']) {
      expect(panelItems).not.toContain(title);
      expect(afterPanel).toContain(title);
    }
    expect(afterPanel).toMatch(/title="(Fetch all remotes|No remotes configured)"/);
  });

  it.each(['inline', 'partial', 'collapsed'] as const)('keeps the full-width order and every right-click menu in %s mode', (mode) => {
    renderState.mode = mode;
    const markup = renderToStaticMarkup(createElement(ControlBar));
    const order = (title: string) => Number(new RegExp(`style="[^"]*order:(\\d+)[^"]*"[^>]*title="${title}"`).exec(markup)?.[1]);
    expect(['Filter', 'Search commits', 'Refresh', 'Open New Graph Tab'].map(order)).toEqual([0, 1, 5, 9]);
    // Each button is still its own mounted context-menu trigger.
    const buttons = markup.match(/<button[^>]*>/g) ?? [];
    for (const label of ['title="Filter"', 'title="Refresh"', 'aria-label="Go to HEAD commit"', 'aria-label="Open New Graph Tab"']) {
      expect(buttons.find((button) => button.includes(label))).toContain('data-state="closed"');
    }
  });
});

describe('toolbar settings rendering', () => {
  it.each([false, true])('shows/hides/restores labels with collapsed=%s', (collapsed) => {
    setSettings(true);
    expect(renderGroup(collapsed)).toContain('>Filter</span>');
    setSettings(false);
    const withoutLabels = renderGroup(collapsed);
    expect(withoutLabels).not.toContain('>Filter</span>');
    expect(withoutLabels).toContain('title="Filter"');
    expect(withoutLabels).toContain('data-testid="button-icon"');
    setSettings(true);
    expect(renderGroup(collapsed)).toContain('>Filter</span>');
  });

  it.each([false, true])('hides/restores the Remote button while keeping other actions, collapsed=%s', (collapsed) => {
    renderState.mode = collapsed ? 'collapsed' : 'inline';
    for (const visible of [true, false, true]) {
      setSettings(true, visible);
      const markup = renderToStaticMarkup(createElement(ControlBar));
      expect(markup.includes('aria-label="Manage Remotes"')).toBe(visible);
      expect(markup).toContain('aria-label="Commit list settings"');
      expect(markup).toContain('aria-label="Open extension settings"');
      expect(markup).toContain('aria-label="Help and feedback"');
    }
  });

  it.each([true, false])('keeps the right-click Remote toggle working when visible=%s', (visible) => {
    setSettings(true, visible);
    const item = RemoteButtonToggleItem();
    expect(item.props.children).toBe(visible ? 'Hide Remote Button' : 'Show Remote Button');
    item.props.onSelect();
    expect(rpcClient.setToolbarSetting).toHaveBeenCalledWith('showRemoteButton', !visible);
  });
});

describe('dropdown separator CSS', () => {
  it.each(['left', 'right'] as const)('hides only standalone separators in the %s dropdown without losing measurable width', async (side) => {
    const classes = getToolbarGroupClassName(true, true, side);
    const result = await postcss([tailwindcss({
      content: [{ raw: classes }], corePlugins: { preflight: false },
    })]).process('@tailwind utilities;', { from: undefined });
    const separatorRules: Record<string, string> = {};
    result.root.walkRules((rule) => {
      if (rule.selector.endsWith(' [data-toolbar-separator]')) {
        rule.walkDecls((declaration) => { separatorRules[declaration.prop] = declaration.value; });
      }
    });
    // Targeted by role, not by element: an icon-only control placed directly in a
    // group must stay visible, and the SVGs inside buttons must too.
    // display:none would lose separator width and make collapse decisions oscillate.
    expect(separatorRules).toEqual({ position: 'absolute', visibility: 'hidden' });

    const inline = await postcss([tailwindcss({
      content: [{ raw: getToolbarGroupClassName(false, false, side) }], corePlugins: { preflight: false },
    })]).process('@tailwind utilities;', { from: undefined });
    inline.root.walkDecls((declaration) => {
      expect(['visibility', 'position', 'display'].includes(declaration.prop)
        && ['hidden', 'none', 'absolute'].includes(declaration.value)).toBe(false);
    });
  });

  it('applies separator hiding to the rendered dropdown, then removes it in the toolbar', () => {
    expect(renderGroup(true)).toContain('[&amp;_[data-toolbar-separator]]:invisible');
    expect(renderGroup(true)).toContain('[&amp;_[data-toolbar-separator]]:absolute');
    expect(renderGroup(true)).toContain('data-toolbar-separator');
    expect(renderGroup(false)).not.toContain('[&amp;_[data-toolbar-separator]]:invisible');
    expect(renderGroup(false)).not.toContain('[&amp;_[data-toolbar-separator]]:absolute');
  });
});

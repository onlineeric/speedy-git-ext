import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlBar } from '../ControlBar';
import { getToolbarCollapseState, getToolbarGroupClassName, ToolbarGroup } from '../ResponsiveToolbar';
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
const renderState = vi.hoisted(() => ({ collapsed: false }));
vi.mock('../ResponsiveToolbar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ResponsiveToolbar')>();
  return {
    ...actual,
    ResponsiveToolbar: ({ left, right, status }: Parameters<typeof actual.ResponsiveToolbar>[0]) => createElement('div', null,
      createElement(actual.ToolbarGroup, { side: 'left', collapsed: renderState.collapsed, contentRef: createRef<HTMLDivElement>(), children: left }),
      status,
      createElement(actual.ToolbarGroup, { side: 'right', collapsed: renderState.collapsed, contentRef: createRef<HTMLDivElement>(), children: right }),
    ),
  };
});

const initialState = useGraphStore.getState();
beforeEach(() => {
  useGraphStore.setState(initialState, true);
  vi.clearAllMocks();
  renderState.collapsed = false;
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
    side: 'left', collapsed, contentRef: createRef<HTMLDivElement>(),
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
      { left: false, right: false },
      { left: false, right: true },
      { left: true, right: true },
      { left: false, right: true },
      { left: false, right: false },
    ]);
  });

  it('keeps groups inline at the exact fit and collapses one pixel below it', () => {
    expect(getToolbarCollapseState({ ...widths, availableWidth: 316 })).toEqual({ left: false, right: false });
    expect(getToolbarCollapseState({ ...widths, availableWidth: 315 })).toEqual({ left: false, right: true });
    expect(getToolbarCollapseState({ ...widths, availableWidth: 228 })).toEqual({ left: false, right: true });
    expect(getToolbarCollapseState({ ...widths, availableWidth: 227 })).toEqual({ left: true, right: true });
  });

  it('recalculates when hiding and showing labels changes measured button widths', () => {
    const labelled = { ...widths, availableWidth: 250 };
    const iconsOnly = { ...labelled, leftWidths: [36, 16, 36], rightWidths: [36, 36] };
    expect(getToolbarCollapseState(labelled)).toEqual({ left: false, right: true });
    expect(getToolbarCollapseState(iconsOnly)).toEqual({ left: false, right: false });
    expect(getToolbarCollapseState(labelled)).toEqual({ left: false, right: true });
  });

  it('recalculates when buttons are hidden, restored, added or removed', () => {
    const allButtons = { ...widths, availableWidth: 260 };
    expect(getToolbarCollapseState(allButtons)).toEqual({ left: false, right: true });
    expect(getToolbarCollapseState({ ...allButtons, rightWidths: [60] })).toEqual({ left: false, right: false });
    expect(getToolbarCollapseState(allButtons)).toEqual({ left: false, right: true });
    expect(getToolbarCollapseState({ ...allButtons, leftWidths: [...widths.leftWidths, 60] })).toEqual({ left: true, right: true });
    expect(getToolbarCollapseState(allButtons)).toEqual({ left: false, right: true });
  });

  it('retains separator width when calculating whether the toolbar can be restored', () => {
    // At this width the actions alone fit, but their inline separator does not.
    expect(getToolbarCollapseState({ ...widths, availableWidth: 210 })).toEqual({ left: true, right: true });
    expect(getToolbarCollapseState({ ...widths, availableWidth: 210, leftWidths: [60, 60] })).toEqual({ left: false, right: true });
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
    renderState.collapsed = collapsed;
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
      if (rule.selector.endsWith('>[data-toolbar-separator]')) {
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
    expect(renderGroup(true)).toContain('[&amp;&gt;[data-toolbar-separator]]:invisible');
    expect(renderGroup(true)).toContain('[&amp;&gt;[data-toolbar-separator]]:absolute');
    expect(renderGroup(true)).toContain('data-toolbar-separator');
    expect(renderGroup(false)).not.toContain('[&amp;&gt;[data-toolbar-separator]]:invisible');
    expect(renderGroup(false)).not.toContain('[&amp;&gt;[data-toolbar-separator]]:absolute');
  });
});

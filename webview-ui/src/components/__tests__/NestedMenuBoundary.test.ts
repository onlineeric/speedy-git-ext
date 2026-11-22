import type { MouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NestedMenuBoundary } from '../NestedMenuBoundary';

// GH #225: a menu nested inside a commit row must not select the row.
describe('NestedMenuBoundary', () => {
  const boundary = NestedMenuBoundary({ children: 'badge' });
  const event = (fromPortal: boolean) => ({
    currentTarget: { contains: () => !fromPortal },
    target: {},
    stopPropagation: vi.fn(),
  }) as unknown as MouseEvent;

  it('keeps the right-click for the nested menu', () => {
    const contextMenu = event(false);
    boundary.props.onContextMenu(contextMenu);
    expect(contextMenu.stopPropagation).toHaveBeenCalledOnce();
  });

  it('stops clicks on menu items and dialogs rendered in portals', () => {
    const click = event(true);
    boundary.props.onClick(click);
    expect(click.stopPropagation).toHaveBeenCalledOnce();
  });

  it('lets a click on the trigger itself select the row', () => {
    const click = event(false);
    boundary.props.onClick(click);
    expect(click.stopPropagation).not.toHaveBeenCalled();
  });
});

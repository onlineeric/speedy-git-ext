import type { MouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NestedMenuBoundary } from '../NestedMenuBoundary';

describe('NestedMenuBoundary', () => {
  it('keeps the right-click for the nested menu', () => {
    const contextMenu = { stopPropagation: vi.fn() } as unknown as MouseEvent;
    NestedMenuBoundary({ children: 'badge' }).props.onContextMenu(contextMenu);
    expect(contextMenu.stopPropagation).toHaveBeenCalledOnce();
  });

  it('leaves clicks alone, so clicking a badge still selects its row', () => {
    expect(NestedMenuBoundary({ children: 'badge' }).props.onClick).toBeUndefined();
  });
});

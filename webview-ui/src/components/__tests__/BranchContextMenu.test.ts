import type { MouseEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Commit } from '@shared/types';
import { BranchContextMenu } from '../BranchContextMenu';
import { requestBranchCheckout } from '../../utils/branchCheckout';

vi.mock('../../utils/branchCheckout', () => ({
  requestBranchCheckout: vi.fn(), getBranchCheckoutState: vi.fn(),
}));

// The always-mounted wrapper has no hooks. Exercise its event boundary without
// mounting the heavy lazy menu, exactly as on the very first badge interaction.
describe('branch badge double-click event', () => {
  const refInfo = { type: 'branch' as const, name: 'feature' };
  const wrapper = () => BranchContextMenu({ refInfo, commit: {} as Commit, children: 'feature' });
  function event(overrides = {}) {
    return {
      currentTarget: { contains: () => true }, target: {}, stopPropagation: vi.fn(),
      button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
      ...overrides,
    } as unknown as MouseEvent<HTMLSpanElement>;
  }
  beforeEach(() => vi.clearAllMocks());

  it('accepts a double-click on nested badge content before opening the menu', () => {
    const click = event();
    wrapper().props.onDoubleClick(click);
    expect(requestBranchCheckout).toHaveBeenCalledExactlyOnceWith(refInfo, 'doubleClick');
    expect(click.stopPropagation).toHaveBeenCalledOnce();
  });

  it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])('ignores %s double-clicks used for selection', (modifier) => {
    wrapper().props.onDoubleClick(event({ [modifier]: true }));
    expect(requestBranchCheckout).not.toHaveBeenCalled();
  });

  it('ignores non-primary buttons and events from portal dialogs', () => {
    wrapper().props.onDoubleClick(event({ button: 2 }));
    wrapper().props.onDoubleClick(event({ currentTarget: { contains: () => false } }));
    expect(requestBranchCheckout).not.toHaveBeenCalled();
  });

  it('does not intercept the existing single-click row selection', () => {
    expect(wrapper().props.onClick).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { isOwnOperationInProgress, type OwnOperationState } from '../graphSelectors';

function idle(overrides: Partial<OwnOperationState> = {}): OwnOperationState {
  return {
    loading: false,
    isLoadingRepo: false,
    activeBranchCheckout: null,
    rebaseInProgress: false,
    cherryPickInProgress: false,
    revertInProgress: false,
    mergeInProgress: false,
    ...overrides,
  };
}

describe('isOwnOperationInProgress', () => {
  it('is false when nothing is running', () => {
    expect(isOwnOperationInProgress(idle())).toBe(false);
  });

  it.each([
    ['loading', { loading: true }],
    ['isLoadingRepo', { isLoadingRepo: true }],
    ['activeBranchCheckout', { activeBranchCheckout: { requestId: 1 } }],
    ['rebaseInProgress', { rebaseInProgress: true }],
    ['cherryPickInProgress', { cherryPickInProgress: true }],
    ['revertInProgress', { revertInProgress: true }],
    ['mergeInProgress', { mergeInProgress: true }],
  ])('is true while %s', (_label, overrides) => {
    expect(isOwnOperationInProgress(idle(overrides as Partial<OwnOperationState>))).toBe(true);
  });

  it('ignores a peer tab\'s operation — the regression test for the merged-selector shortcut', () => {
    // A peer's work must never disable a control here: the only Cancel lives in
    // the tab that started it.
    const withPeerBusy = { ...idle(), peerOperationInProgress: true };
    expect(isOwnOperationInProgress(withPeerBusy)).toBe(false);
  });
});

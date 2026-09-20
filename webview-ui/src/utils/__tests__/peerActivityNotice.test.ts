import { describe, it, expect } from 'vitest';
import { PEER_ACTIVITY_NOTICE, peerActivityNotice } from '../peerActivityNotice';

describe('peerActivityNotice', () => {
  it('shows the notice when a peer is busy and this tab is not', () => {
    expect(peerActivityNotice(true, false)).toBe(PEER_ACTIVITY_NOTICE);
  });

  it('stays silent when this tab has its own operation running', () => {
    expect(peerActivityNotice(true, true)).toBeNull();
  });

  it('stays silent when no peer is busy', () => {
    expect(peerActivityNotice(false, false)).toBeNull();
    expect(peerActivityNotice(false, true)).toBeNull();
  });

  it('names no repository, branch or path', () => {
    expect(PEER_ACTIVITY_NOTICE).toBe('Another Speedy Git view is running a Git operation.');
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('vscode', () => ({
  authentication: {
    getSession: mocks.getSession,
    onDidChangeSessions: vi.fn(() => ({ dispose: vi.fn() })),
  },
}));

import { GitHubAuthService, type AvatarAuthChange } from '../services/GitHubAuthService.js';

const SESSION = { accessToken: 't', account: { label: 'octocat' } };

function createService(optedIn: boolean) {
  const state = { optedIn };
  const context = {
    subscriptions: [],
    globalState: {
      get: (_key: string, fallback: boolean) => state.optedIn ?? fallback,
      update: vi.fn(async (_key: string, value: boolean) => { state.optedIn = value; }),
    },
  } as unknown as vscode.ExtensionContext;
  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as vscode.LogOutputChannel;
  const onStateChanged = vi.fn<(change: AvatarAuthChange) => void>();
  return { service: new GitHubAuthService(context, log, onStateChanged), onStateChanged, state };
}

/**
 * The opt-in is the identity the tracked GitHub rate limit belongs to, and this
 * service is its only writer — so it is what has to report a flip. Consumers
 * retire the budget on `granted`/`revoked` and leave it alone on `refreshed`;
 * getting that wrong either parks avatar lookups on a limit that no longer
 * applies, or re-spends the API budget on every window reload.
 */
describe('GitHubAuthService identity flips', () => {
  beforeEach(() => mocks.getSession.mockReset());

  it('reports granted when authorization is newly given', async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    const { service, onStateChanged, state } = createService(false);

    await expect(service.requestAuthorization()).resolves.toBe('granted');

    expect(onStateChanged).toHaveBeenCalledExactlyOnceWith('granted');
    expect(state.optedIn).toBe(true);
  });

  it('reports revoked when the token is removed while opted in', async () => {
    const { service, onStateChanged, state } = createService(true);

    await service.removeAuthorization();

    expect(onStateChanged).toHaveBeenCalledExactlyOnceWith('revoked');
    expect(state.optedIn).toBe(false);
  });

  it('reports refreshed when removing a token that was never granted', async () => {
    const { service, onStateChanged } = createService(false);

    await service.removeAuthorization();

    // Nothing flipped, so the budget in force is still the one we are tracking.
    expect(onStateChanged).toHaveBeenCalledExactlyOnceWith('refreshed');
  });

  it('reports revoked when the session is gone at startup', async () => {
    mocks.getSession.mockResolvedValue(undefined);
    const { service, onStateChanged, state } = createService(true);

    await service.initialize();

    expect(onStateChanged).toHaveBeenCalledExactlyOnceWith('revoked');
    expect(state.optedIn).toBe(false);
  });

  it('reports refreshed when restoring the same session at startup', async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    const { service, onStateChanged, state } = createService(true);

    await service.initialize();

    // The same authorization as before — re-opening cached answers here would
    // discard the negative cache on every window reload.
    expect(onStateChanged).toHaveBeenCalledExactlyOnceWith('refreshed');
    expect(state.optedIn).toBe(true);
    expect(service.getToken()).toBe('t');
  });

  it('stays quiet when the user was never opted in', async () => {
    const { service, onStateChanged } = createService(false);

    await service.initialize();

    expect(onStateChanged).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});

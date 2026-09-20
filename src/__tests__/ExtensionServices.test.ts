import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ExtensionServices } from '../ExtensionServices.js';
import { createTelemetryStub } from './telemetryTestStub.js';
import type { ResponseMessage } from '../../shared/messages.js';

const authMock = vi.hoisted(() => ({
  initializeCalls: 0,
  onStateChanged: undefined as ((change: 'granted' | 'revoked' | 'refreshed') => void) | undefined,
  optedIn: true,
}));

/** The options the (mocked) avatar queue was constructed with, so the test can drive its callbacks. */
const queueMock = vi.hoisted(() => ({
  options: undefined as { postAvatarUrls: (urls: Record<string, string>) => void } | undefined,
  onIdentityChanged: undefined as (() => void) | undefined,
}));

vi.mock('vscode', () => ({
  EventEmitter: class {
    private listeners: Array<(value: unknown) => void> = [];
    event = (listener: (value: unknown) => void) => {
      this.listeners.push(listener);
      return { dispose: vi.fn() };
    };
    fire(value: unknown) { this.listeners.forEach((listener) => listener(value)); }
    dispose() { this.listeners = []; }
  },
  Disposable: class {
    constructor(private readonly callOnDispose: () => void) {}
    dispose() { this.callOnDispose(); }
  },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  RelativePattern: class { constructor(public base: unknown, public pattern: string) {} },
  extensions: { getExtension: vi.fn(() => undefined) },
  workspace: {
    workspaceFolders: [],
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(), onDidCreate: vi.fn(), onDidDelete: vi.fn(), dispose: vi.fn(),
    })),
  },
  window: { showInformationMessage: vi.fn() },
  authentication: { onDidChangeSessions: vi.fn(() => ({ dispose: vi.fn() })) },
}));

vi.mock('../services/GitHubAuthService.js', () => ({
  GitHubAuthService: class {
    constructor(
      _context: unknown,
      _log: unknown,
      onStateChanged: (change: 'granted' | 'revoked' | 'refreshed') => void,
    ) {
      authMock.onStateChanged = onStateChanged;
    }
    async initialize() { authMock.initializeCalls += 1; }
    isOptedIn() { return authMock.optedIn; }
    get accountLabel() { return 'octocat'; }
  },
}));

const reopenUnresolved = vi.fn(() => [] as string[]);
const onIdentityChanged = vi.fn();
queueMock.onIdentityChanged = onIdentityChanged;

vi.mock('../services/AvatarCacheStore.js', () => ({
  AvatarCacheStore: class {
    reopenUnresolved = reopenUnresolved;
    clear = vi.fn().mockResolvedValue(undefined);
    dispose = vi.fn();
  },
}));

vi.mock('../services/AvatarRefreshQueue.js', () => ({
  AvatarRefreshQueue: class {
    onIdentityChanged = () => queueMock.onIdentityChanged?.();
    clear = vi.fn();
    dispose = vi.fn();
    constructor(options: { postAvatarUrls: (urls: Record<string, string>) => void }) {
      queueMock.options = options;
    }
  },
}));

function createServices() {
  const context = {
    subscriptions: [],
    globalState: { get: vi.fn(), update: vi.fn().mockResolvedValue(undefined) },
    extensionUri: {},
  } as never;
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;
  return new ExtensionServices(context, log, createTelemetryStub());
}

beforeEach(() => {
  authMock.initializeCalls = 0;
  authMock.optedIn = true;
  reopenUnresolved.mockReset().mockReturnValue([]);
  onIdentityChanged.mockReset();
});

describe('ExtensionServices', () => {
  it('initializes GitHub auth exactly once per session, not once per tab', () => {
    createServices();
    expect(authMock.initializeCalls).toBe(1);
  });

  it('delivers an avatar batch to every open tab', () => {
    const services = createServices();
    const received: ResponseMessage[] = [];
    services.connectTabs({ broadcast: (message) => received.push(message), reloadAll: vi.fn() });

    queueMock.options?.postAvatarUrls({ 'dev@example.com': 'https://avatars/1.png' });

    expect(received).toEqual([
      { type: 'avatarUrls', payload: { urls: { 'dev@example.com': 'https://avatars/1.png' } } },
    ]);
  });

  it('broadcasts the auth state to every tab when the rate limit changes', () => {
    const services = createServices();
    const received: ResponseMessage[] = [];
    services.connectTabs({ broadcast: (message) => received.push(message), reloadAll: vi.fn() });

    services.broadcastAvatarAuthState();

    expect(received[0].type).toBe('avatarAuthState');
  });

  it('on `granted`, retires the budget, reopens cached answers and reloads every tab', () => {
    const services = createServices();
    const reloadAll = vi.fn();
    services.connectTabs({ broadcast: vi.fn(), reloadAll });
    reopenUnresolved.mockReturnValue(['dev@example.com']);

    authMock.onStateChanged?.('granted');

    expect(onIdentityChanged).toHaveBeenCalledOnce();
    expect(reloadAll).toHaveBeenCalledOnce();
  });

  it('on `refreshed`, does neither — the cached answers were obtained under this very authorization', () => {
    const services = createServices();
    const reloadAll = vi.fn();
    services.connectTabs({ broadcast: vi.fn(), reloadAll });

    authMock.onStateChanged?.('refreshed');

    expect(onIdentityChanged).not.toHaveBeenCalled();
    expect(reopenUnresolved).not.toHaveBeenCalled();
    expect(reloadAll).not.toHaveBeenCalled();
  });

  it('on `revoked`, retires the budget but reopens nothing', () => {
    const services = createServices();
    const reloadAll = vi.fn();
    services.connectTabs({ broadcast: vi.fn(), reloadAll });

    authMock.onStateChanged?.('revoked');

    expect(onIdentityChanged).toHaveBeenCalledOnce();
    expect(reopenUnresolved).not.toHaveBeenCalled();
    expect(reloadAll).not.toHaveBeenCalled();
  });

  it('memoizes one diff service per repository, so a closed tab\'s diff keeps resolving', () => {
    const services = createServices();

    const first = services.resolveDiffService('/repos/a');
    const again = services.resolveDiffService('/repos/a/');
    const other = services.resolveDiffService('/repos/b');

    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });

  it('offers What\'s New to the first graph only, tracked by one session flag', () => {
    const services = createServices();
    expect(services.whatsNewOfferedThisSession).toBe(false);
    services.whatsNewOfferedThisSession = true;
    expect(services.whatsNewOfferedThisSession).toBe(true);
  });
});

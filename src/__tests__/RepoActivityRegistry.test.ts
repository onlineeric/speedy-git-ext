import { describe, expect, it, vi } from 'vitest';
import { RepoActivityRegistry } from '../RepoActivityRegistry.js';

vi.mock('vscode', () => ({
  Disposable: class {
    constructor(private readonly callOnDispose: () => void) {}
    dispose() { this.callOnDispose(); }
  },
  EventEmitter: class {
    private listeners: Array<(value: unknown) => void> = [];
    event = (listener: (value: unknown) => void) => {
      this.listeners.push(listener);
      return { dispose: vi.fn() };
    };
    fire(value: unknown) { this.listeners.forEach((listener) => listener(value)); }
    dispose() { this.listeners = []; }
  },
}));

const KEY = '/repos/a/.git';

describe('RepoActivityRegistry', () => {
  it('reports a peer as busy while its operation runs, and not afterwards', () => {
    const registry = new RepoActivityRegistry();

    const token = registry.begin(KEY, 'tab-1', 'mergeBranch');
    expect(registry.isBusy(KEY, 'tab-2')).toBe(true);

    token.dispose();
    expect(registry.isBusy(KEY, 'tab-2')).toBe(false);
  });

  it('excludes the asker — a tab is never busy on account of itself', () => {
    const registry = new RepoActivityRegistry();
    registry.begin(KEY, 'tab-1', 'mergeBranch');

    expect(registry.isBusy(KEY, 'tab-1')).toBe(false);
  });

  it('counts concurrent operations rather than booleaning them', () => {
    const registry = new RepoActivityRegistry();

    const first = registry.begin(KEY, 'tab-1', 'mergeBranch');
    const second = registry.begin(KEY, 'tab-1', 'push');

    first.dispose();
    expect(registry.isBusy(KEY, 'tab-2')).toBe(true);

    second.dispose();
    expect(registry.isBusy(KEY, 'tab-2')).toBe(false);
  });

  it('shows two peers each other as busy — git, not this registry, decides the collision', () => {
    const registry = new RepoActivityRegistry();
    registry.begin(KEY, 'tab-1', 'push');
    registry.begin(KEY, 'tab-2', 'pull');

    expect(registry.isBusy(KEY, 'tab-1')).toBe(true);
    expect(registry.isBusy(KEY, 'tab-2')).toBe(true);
  });

  it('keeps working trees apart — a sibling worktree is not this checkout', () => {
    const registry = new RepoActivityRegistry();
    registry.begin(KEY, 'tab-1', 'checkoutBranch');

    expect(registry.isBusy('/repos/a/.git/worktrees/feat', 'tab-2')).toBe(false);
  });

  it('releases even when the owning tab is gone — the token is what matters', () => {
    const registry = new RepoActivityRegistry();
    const token = registry.begin(KEY, 'closed-tab', 'push');

    token.dispose();
    expect(registry.isBusy(KEY, 'any-other-tab')).toBe(false);
  });

  it('is idempotent on a double dispose, so one release cannot free two operations', () => {
    const registry = new RepoActivityRegistry();
    const first = registry.begin(KEY, 'tab-1', 'push');
    registry.begin(KEY, 'tab-1', 'pull');

    first.dispose();
    first.dispose();

    expect(registry.isBusy(KEY, 'tab-2')).toBe(true);
  });

  it('a tab with no resolved identity gets a no-op token and marks nobody busy', () => {
    const registry = new RepoActivityRegistry();
    const token = registry.begin('', 'tab-1', 'push');

    expect(registry.isBusy('', 'tab-2')).toBe(false);
    expect(() => token.dispose()).not.toThrow();
  });

  it('announces every change, so peers can be re-notified', () => {
    const registry = new RepoActivityRegistry();
    const changes: Array<{ workingTreeKey: string }> = [];
    registry.onDidChange((change) => changes.push(change));

    registry.begin(KEY, 'tab-1', 'push').dispose();

    expect(changes).toEqual([{ workingTreeKey: KEY }, { workingTreeKey: KEY }]);
  });
});

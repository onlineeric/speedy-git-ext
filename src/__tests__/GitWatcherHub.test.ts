import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitWatcherHub } from '../services/GitWatcherHub.js';
import { GitError } from '../../shared/errors.js';
import type { RepoIdentity } from '../utils/repoIdentity.js';

const vscodeMock = vi.hoisted(() => ({
  createFileSystemWatcher: vi.fn(),
  created: [] as Array<{ base: string; pattern: string; dispose: ReturnType<typeof vi.fn> }>,
}));

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
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  RelativePattern: class {
    constructor(public base: { fsPath: string }, public pattern: string) {}
  },
  extensions: { getExtension: vi.fn(() => undefined) },
  workspace: { createFileSystemWatcher: vscodeMock.createFileSystemWatcher },
}));

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

const REPO_A: RepoIdentity = {
  repoPath: '/repos/a',
  gitDir: '/repos/a/.git',
  commonGitDir: '/repos/a/.git',
  topLevel: '/repos/a',
};

const WORKTREE_A: RepoIdentity = {
  repoPath: '/repos/a.worktrees/feat',
  gitDir: '/repos/a/.git/worktrees/feat',
  commonGitDir: '/repos/a/.git',
  topLevel: '/repos/a.worktrees/feat',
};

const REPO_B: RepoIdentity = {
  repoPath: '/repos/b',
  gitDir: '/repos/b/.git',
  commonGitDir: '/repos/b/.git',
  topLevel: '/repos/b',
};

function createIdentities(map: Record<string, RepoIdentity>) {
  return {
    resolve: vi.fn(async (repoPath: string) => {
      const identity = map[repoPath];
      return identity
        ? { success: true as const, value: identity }
        : { success: false as const, error: new GitError('Not a git repository', 'NOT_A_REPOSITORY') };
    }),
    peek: vi.fn((repoPath: string) => map[repoPath] ?? null),
  } as never;
}

function basesFor(patternPrefix?: string) {
  return vscodeMock.created
    .filter((watcher) => !patternPrefix || watcher.pattern.startsWith(patternPrefix))
    .map((watcher) => watcher.base);
}

beforeEach(() => {
  vscodeMock.created.length = 0;
  vscodeMock.createFileSystemWatcher.mockReset();
  vscodeMock.createFileSystemWatcher.mockImplementation((pattern: { base: { fsPath: string }; pattern: string }) => {
    const watcher = {
      base: pattern.base.fsPath,
      pattern: pattern.pattern,
      onDidChange: vi.fn(),
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    };
    vscodeMock.created.push(watcher);
    return watcher;
  });
});

describe('GitWatcherHub', () => {
  it('watches the RESOLVED git dirs, never <repo>/.git', async () => {
    const hub = new GitWatcherHub(mockLog, createIdentities({ '/repos/a.worktrees/feat': WORKTREE_A }));

    await hub.watch('/repos/a.worktrees/feat');

    // Per-worktree state lives in the worktree's own git dir...
    expect(basesFor('HEAD')).toEqual(['/repos/a/.git/worktrees/feat']);
    // ...and shared refs in the common one. Neither is `<repo>/.git`, which for
    // a linked worktree is a FILE and would have matched nothing.
    expect(basesFor('refs/')).toEqual(['/repos/a/.git']);
    expect(basesFor()).not.toContain('/repos/a.worktrees/feat/.git');
  });

  it('splits the patterns between the two bases by what each owns', async () => {
    const hub = new GitWatcherHub(mockLog, createIdentities({ '/repos/a': REPO_A }));

    await hub.watch('/repos/a');

    const patterns = vscodeMock.created.map((watcher) => watcher.pattern);
    expect(patterns).toEqual(expect.arrayContaining(['HEAD', 'index', 'MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']));
    expect(patterns).toEqual(expect.arrayContaining(['refs/**', 'packed-refs', 'FETCH_HEAD', 'ORIG_HEAD']));
  });

  it('shares one common-dir watcher set between two tabs on the same repo', async () => {
    const hub = new GitWatcherHub(mockLog, createIdentities({ '/repos/a': REPO_A }));

    await hub.watch('/repos/a');
    const afterFirst = vscodeMock.created.length;
    await hub.watch('/repos/a');

    expect(vscodeMock.created.length).toBe(afterFirst);
  });

  it('gives a repo and its linked worktree one common set plus two per-worktree sets', async () => {
    const hub = new GitWatcherHub(
      mockLog,
      createIdentities({ '/repos/a': REPO_A, '/repos/a.worktrees/feat': WORKTREE_A }),
    );

    await hub.watch('/repos/a');
    await hub.watch('/repos/a.worktrees/feat');

    expect(basesFor('refs/')).toEqual(['/repos/a/.git']);
    expect(basesFor('HEAD').sort()).toEqual(['/repos/a/.git', '/repos/a/.git/worktrees/feat']);
  });

  it('creates a separate set for an unrelated repo', async () => {
    const hub = new GitWatcherHub(mockLog, createIdentities({ '/repos/a': REPO_A, '/repos/b': REPO_B }));

    await hub.watch('/repos/a');
    await hub.watch('/repos/b');

    expect(basesFor('refs/').sort()).toEqual(['/repos/a/.git', '/repos/b/.git']);
  });

  it('keeps the watchers while another subscription holds them, and disposes them at zero', async () => {
    const hub = new GitWatcherHub(mockLog, createIdentities({ '/repos/a': REPO_A }));

    const first = await hub.watch('/repos/a');
    const second = await hub.watch('/repos/a');

    first.dispose();
    expect(vscodeMock.created.every((watcher) => watcher.dispose.mock.calls.length === 0)).toBe(true);

    second.dispose();
    expect(vscodeMock.created.every((watcher) => watcher.dispose.mock.calls.length === 1)).toBe(true);
  });

  it('leaves no watcher alive once the last tab closes', async () => {
    const hub = new GitWatcherHub(
      mockLog,
      createIdentities({ '/repos/a': REPO_A, '/repos/a.worktrees/feat': WORKTREE_A }),
    );

    const repo = await hub.watch('/repos/a');
    const worktree = await hub.watch('/repos/a.worktrees/feat');
    repo.dispose();
    worktree.dispose();

    expect(vscodeMock.created.every((watcher) => watcher.dispose.mock.calls.length >= 1)).toBe(true);
  });

  it('subscribes nothing — and does not throw — when the identity cannot be resolved', async () => {
    const hub = new GitWatcherHub(mockLog, createIdentities({}));

    const subscription = await hub.watch('/not/a/repo');

    expect(vscodeMock.created).toHaveLength(0);
    expect(() => subscription.dispose()).not.toThrow();
  });

  it('disposes every watcher on hub dispose', async () => {
    const hub = new GitWatcherHub(mockLog, createIdentities({ '/repos/a': REPO_A }));
    await hub.watch('/repos/a');

    hub.dispose();

    expect(vscodeMock.created.every((watcher) => watcher.dispose.mock.calls.length === 1)).toBe(true);
  });
});

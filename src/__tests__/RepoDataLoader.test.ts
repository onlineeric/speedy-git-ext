import { describe, expect, it, vi } from 'vitest';
import type { Commit } from '../../shared/types.js';
import { DEFAULT_USER_SETTINGS } from '../../shared/types.js';
import { GitServiceRegistry } from '../webview/GitServiceRegistry.js';
import { PersistedUIStateStore } from '../webview/PersistedUIStateStore.js';
import { RepoDataLoader, computeCommitFingerprint } from '../webview/RepoDataLoader.js';
import { WebviewRuntime } from '../webview/WebviewRuntime.js';
import { createTelemetryStub } from './telemetryTestStub.js';

vi.mock('vscode', () => ({
  Uri: {
    file: vi.fn((fsPath: string) => ({ fsPath })),
  },
  extensions: {
    getExtension: vi.fn(),
  },
}));

function makeCommit(hash: string, refs: Commit['refs'] = []): Commit {
  return {
    hash,
    abbreviatedHash: hash.slice(0, 7),
    parents: [],
    author: 'Test',
    authorEmail: 'test@example.com',
    authorDate: 0,
    subject: `commit ${hash}`,
    refs,
  };
}

function createLoaderFixture(options: {
  runtime?: WebviewRuntime;
  commits?: Commit[];
  branches?: Array<{ name: string; remote?: string; current: boolean; hash: string }>;
  deferredUncommitted?: Promise<never>;
} = {}) {
  const runtime = options.runtime ?? new WebviewRuntime('/repo-a');
  const commits = options.commits ?? [makeCommit('aaa1111')];
  const branches = options.branches ?? [];
  const postMessage = vi.fn();
  const gitLogService = {
    getCommits: vi.fn().mockResolvedValue({
      success: true,
      value: { commits, totalLoadedWithoutFilter: commits.length },
    }),
    getBranches: vi.fn().mockResolvedValue({ success: true, value: branches }),
    getAuthors: vi.fn().mockResolvedValue({ success: true, value: [] }),
  };
  const services = new GitServiceRegistry({
    gitLogService,
    gitDiffService: {
      getUncommittedSummary: vi.fn(() => options.deferredUncommitted ?? Promise.resolve({
        success: true,
        value: {
          stagedFiles: [],
          unstagedFiles: [],
          conflictFiles: [],
          stagedCount: 0,
          unstagedCount: 0,
          untrackedCount: 0,
        },
      })),
    },
    gitRemoteService: { getRemotes: vi.fn().mockResolvedValue({ success: true, value: [] }) },
    gitWorktreeService: { listWorktrees: vi.fn().mockResolvedValue({ success: true, value: [] }) },
    gitStashService: { getStashes: vi.fn().mockResolvedValue({ success: true, value: [] }) },
    gitRevertService: { getRevertState: vi.fn().mockResolvedValue({ success: true, value: 'idle' }) },
    gitTagService: { getTagMetadata: vi.fn().mockResolvedValue({ success: true, value: [] }) },
    gitCherryPickService: { getCherryPickState: vi.fn(() => ({ success: true, value: 'idle' })) },
    gitRebaseService: {
      getRebaseState: vi.fn(() => ({ success: true, value: { state: 'idle' } })),
      getConflictInfo: vi.fn(),
    },
    gitSubmoduleService: { getSubmodules: vi.fn().mockResolvedValue({ success: true, value: [] }) },
  } as never);
  const telemetry = createTelemetryStub();
  const uiStateStore = new PersistedUIStateStore({
    globalState: {
      get: vi.fn(),
      update: vi.fn(),
    },
  } as never, () => runtime.currentRepoPath);
  const dataLoader = new RepoDataLoader({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    runtime,
    services,
    uiStateStore,
    postMessage,
    getSettings: () => ({ ...DEFAULT_USER_SETTINGS, avatarsEnabled: false }),
    getBatchSize: () => 500,
    getSubmoduleHandlers: () => undefined,
    telemetry,
  });

  return { dataLoader, runtime, services, postMessage, gitLogService, telemetry };
}

describe('RepoDataLoader', () => {
  it('posts initialData before unresolved deferred data', async () => {
    const deferredUncommitted = new Promise<never>(() => undefined);
    const commit = makeCommit('aaa1111');
    const { dataLoader, services, postMessage, gitLogService } = createLoaderFixture({
      commits: [commit],
      deferredUncommitted,
    });

    await dataLoader.sendInitialData();

    expect(gitLogService.getAuthors).not.toHaveBeenCalled();
    expect(services.current().gitDiffService.getUncommittedSummary).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'initialData',
      payload: expect.objectContaining({ commits: [commit] }),
    }));
  });

  it('uses commits=null on auto-refresh when fingerprint is unchanged', async () => {
    const commit = makeCommit('aaa1111');
    const runtime = new WebviewRuntime('/repo-a');
    runtime.initialLoadSent = true;
    runtime.lastCommitFingerprint = computeCommitFingerprint([commit]);
    runtime.isDisplayingSubmodule = true;
    const { dataLoader, postMessage } = createLoaderFixture({ runtime, commits: [commit] });

    await dataLoader.sendInitialData(undefined, true);

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'initialData',
      payload: expect.objectContaining({ commits: null }),
    }));
  });

  it('removes stale branch filters before fetching commits', async () => {
    const runtime = new WebviewRuntime('/repo-a');
    runtime.currentFilters = { branches: ['main', 'missing'], maxCount: 250 };
    runtime.isDisplayingSubmodule = true;
    const { dataLoader, gitLogService } = createLoaderFixture({
      runtime,
      branches: [{ name: 'main', current: true, hash: 'aaa1111' }],
    });

    await dataLoader.sendInitialData();

    expect(gitLogService.getCommits).toHaveBeenCalledWith(expect.objectContaining({
      branches: ['main'],
      maxCount: 500,
    }));
    expect(runtime.currentFilters.branches).toEqual(['main']);
  });

  it('skips background submodule refresh while displaying a submodule', async () => {
    const runtime = new WebviewRuntime('/repo-a/submodule');
    runtime.isDisplayingSubmodule = true;
    const { dataLoader, services } = createLoaderFixture({ runtime });

    await dataLoader.sendInitialData();

    expect(services.current().gitSubmoduleService.getSubmodules).not.toHaveBeenCalled();
  });
});

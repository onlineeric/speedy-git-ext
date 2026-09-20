import { describe, expect, it, vi } from 'vitest';
import { GitShowContentProvider } from '../GitShowContentProvider.js';
import { buildGitShowUriParts, STAGED_AUTHORITY, WORKTREE_AUTHORITY } from '../utils/gitShowUri.js';
import { GitError } from '../../shared/errors.js';
import type { GitDiffService } from '../services/GitDiffService.js';

vi.mock('vscode', () => ({}));

function uriFor(repoPath: string, revision: string, filePath: string, nonce?: string) {
  const parts = buildGitShowUriParts({ repoPath, revision, filePath, label: 'label', ...(nonce ? { nonce } : {}) });
  return { ...parts, toString: () => `git-show://${parts.authority}${parts.path}?${parts.query}#${parts.fragment}` };
}

function fakeDiffService(overrides: Partial<Record<keyof GitDiffService, unknown>> = {}) {
  return {
    getCommitFile: vi.fn().mockResolvedValue({ success: true, value: 'commit content' }),
    getStagedFileContent: vi.fn().mockResolvedValue({ success: true, value: 'staged content' }),
    getWorkingTreeSubmoduleContent: vi.fn().mockResolvedValue({ success: true, value: 'Subproject commit abc' }),
    ...overrides,
  } as unknown as GitDiffService;
}

describe('GitShowContentProvider', () => {
  it('resolves the service for the URI\'s own repository', async () => {
    const service = fakeDiffService();
    const resolve = vi.fn(() => service);
    const provider = new GitShowContentProvider(resolve);

    const content = await provider.provideTextDocumentContent(uriFor('/repos/a', 'abc1234', 'src/index.ts') as never);

    expect(resolve).toHaveBeenCalledExactlyOnceWith('/repos/a');
    expect(service.getCommitFile).toHaveBeenCalledWith('abc1234', 'src/index.ts');
    expect(content).toBe('commit content');
  });

  it('gives two repos with the same file at the same hash two different services', async () => {
    const byRepo = new Map([
      ['/repos/a', fakeDiffService({ getCommitFile: vi.fn().mockResolvedValue({ success: true, value: 'from A' }) })],
      ['/repos/b', fakeDiffService({ getCommitFile: vi.fn().mockResolvedValue({ success: true, value: 'from B' }) })],
    ]);
    const provider = new GitShowContentProvider((repoPath) => byRepo.get(repoPath)!);

    await expect(provider.provideTextDocumentContent(uriFor('/repos/a', 'abc1234', 'src/index.ts') as never))
      .resolves.toBe('from A');
    await expect(provider.provideTextDocumentContent(uriFor('/repos/b', 'abc1234', 'src/index.ts') as never))
      .resolves.toBe('from B');
  });

  it('keeps resolving after the originating tab switched repo or closed', async () => {
    // Nothing about the provider depends on a tab: the repo is in the URI.
    const service = fakeDiffService();
    const provider = new GitShowContentProvider(() => service);
    const uri = uriFor('/repos/a', 'abc1234', 'src/index.ts');

    await provider.provideTextDocumentContent(uri as never);
    await provider.provideTextDocumentContent(uri as never);

    expect(service.getCommitFile).toHaveBeenCalledTimes(2);
  });

  it('throws on a fragment-less URI rather than guessing a repository', async () => {
    const resolve = vi.fn(() => fakeDiffService());
    const provider = new GitShowContentProvider(resolve);

    await expect(
      provider.provideTextDocumentContent({
        authority: 'abc1234',
        path: '/label',
        query: 'src/index.ts',
        fragment: '',
        toString: () => 'git-show://abc1234/label?src/index.ts',
      } as never),
    ).rejects.toThrow(/missing repository/);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('throws when the hash is missing', async () => {
    const provider = new GitShowContentProvider(() => fakeDiffService());

    await expect(
      provider.provideTextDocumentContent({
        authority: '',
        path: '/label',
        query: 'f.ts',
        fragment: 'repo=%2Frepos%2Fa',
        toString: () => 'git-show:',
      } as never),
    ).rejects.toThrow(/missing hash/);
  });

  it('reads the index for the staged sentinel', async () => {
    const service = fakeDiffService();
    const provider = new GitShowContentProvider(() => service);

    const content = await provider.provideTextDocumentContent(
      uriFor('/repos/a', STAGED_AUTHORITY, 'src/index.ts') as never,
    );

    expect(service.getStagedFileContent).toHaveBeenCalledWith('src/index.ts');
    expect(content).toBe('staged content');
  });

  it('answers a gitlink with its pointer line for the worktree sentinel, nonce and all', async () => {
    const service = fakeDiffService();
    const provider = new GitShowContentProvider(() => service);

    const content = await provider.provideTextDocumentContent(
      uriFor('/repos/a', WORKTREE_AUTHORITY, 'sub', 'nonce-1') as never,
    );

    expect(service.getWorkingTreeSubmoduleContent).toHaveBeenCalledWith('sub');
    expect(content).toBe('Subproject commit abc');
  });

  it('answers empty for "file not found at revision", which diff views expect', async () => {
    const provider = new GitShowContentProvider(() =>
      fakeDiffService({
        getCommitFile: vi.fn().mockResolvedValue({
          success: false,
          error: new GitError('no such path', 'COMMAND_FAILED'),
        }),
      }),
    );

    await expect(provider.provideTextDocumentContent(uriFor('/repos/a', 'abc1234', 'gone.ts') as never))
      .resolves.toBe('');
  });

  it('rethrows a real failure', async () => {
    const provider = new GitShowContentProvider(() =>
      fakeDiffService({
        getCommitFile: vi.fn().mockResolvedValue({
          success: false,
          error: new GitError('git took too long', 'TIMEOUT'),
        }),
      }),
    );

    await expect(provider.provideTextDocumentContent(uriFor('/repos/a', 'abc1234', 'f.ts') as never))
      .rejects.toThrow(/git took too long/);
  });
});

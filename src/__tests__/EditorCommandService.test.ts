import * as vscode from 'vscode';
import { describe, expect, it, vi } from 'vitest';
import { GitServiceRegistry } from '../webview/GitServiceRegistry.js';
import { EditorCommandService } from '../webview/EditorCommandService.js';
import { WebviewRuntime } from '../webview/WebviewRuntime.js';
import { UNCOMMITTED_HASH } from '../../shared/types.js';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  Uri: {
    file: vi.fn((fsPath: string) => ({ scheme: 'file', fsPath })),
    from: vi.fn((parts: Record<string, unknown>) => parts),
    parse: vi.fn((value: string) => ({ value })),
    joinPath: vi.fn((base: unknown, ...segments: string[]) => ({ base, segments })),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/repo-a' } }],
    openTextDocument: vi.fn(),
  },
  window: {
    showTextDocument: vi.fn(),
    showWarningMessage: vi.fn(),
  },
}));

function makeEditorCommandService(options: {
  repoPath?: string;
  headHash?: string;
  worktrees?: Array<{ path: string; isMain?: boolean; isCurrent?: boolean }>;
} = {}) {
  const headHash = options.headHash ?? 'abc123456789';
  const services = new GitServiceRegistry({
    gitLogService: {
      // HEAD comes from `rev-parse HEAD`, never from the first row of the graph walk:
      // that walk is date-ordered across every ref (and stash bases), so its newest
      // commit is only HEAD by coincidence.
      getHeadCommitHash: vi.fn().mockResolvedValue({ success: true, value: headHash }),
    },
    gitWorktreeService: {
      listWorktrees: vi.fn().mockResolvedValue({
        success: true,
        value: options.worktrees ?? [],
      }),
    },
  } as never);
  const service = new EditorCommandService(
    { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    { fsPath: '/extension' } as never,
    new WebviewRuntime(options.repoPath ?? '/repo-a'),
    services,
  );

  return { service, services };
}

describe('EditorCommandService', () => {
  it('opens staged diffs using HEAD on the left and the staged sentinel on the right', async () => {
    const { service } = makeEditorCommandService({ headHash: 'abcdef123456' });

    await service.openStagedDiffEditor('src/file.ts');

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.diff',
      expect.objectContaining({ authority: 'abcdef123456' }),
      expect.objectContaining({ authority: 'staged' }),
      'src/file.ts (Staged)',
    );
  });

  it('routes the working-tree side of a submodule through the content provider, not a file URI', async () => {
    const { service } = makeEditorCommandService({ repoPath: '/repo-a', headHash: 'abcdef123456' });

    // A checked-out submodule is a directory. Handing `vscode.diff` a file:// URI for it
    // is what produced issue #184's unopenable/blank working-tree diff.
    await service.openDiffEditor(UNCOMMITTED_HASH, 'submodules/repo-a', undefined, 'modified', true);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.diff',
      expect.objectContaining({ authority: 'abcdef123456' }),
      expect.objectContaining({ scheme: 'git-show', authority: 'worktree', query: 'submodules/repo-a' }),
      'submodules/repo-a (Working Tree)',
    );
  });

  it('uses a fresh virtual document when reopening a working-tree submodule diff', async () => {
    const { service } = makeEditorCommandService();
    const commands = vi.mocked(vscode.commands.executeCommand);
    commands.mockClear();
    await service.openDiffEditor(UNCOMMITTED_HASH, 'submodules/repo-a', undefined, 'modified', true);
    await service.openDiffEditor(UNCOMMITTED_HASH, 'submodules/repo-a', undefined, 'modified', true);
    const first = commands.mock.calls[0][2] as vscode.Uri;
    const second = commands.mock.calls[1][2] as vscode.Uri;
    expect(first.fragment).toBeTruthy();
    expect(second.fragment).not.toBe(first.fragment);
    expect(second.query).toBe(first.query);
    expect(second.authority).toBe('worktree');
  });

  it('still uses a plain file URI for an ordinary uncommitted file', async () => {
    const { service } = makeEditorCommandService({ repoPath: '/repo-a' });

    await service.openDiffEditor(UNCOMMITTED_HASH, 'src/file.ts', undefined, 'modified');

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.diff',
      expect.anything(),
      expect.objectContaining({ scheme: 'file' }),
      'src/file.ts (Working Tree)',
    );
  });

  it('uses the worktree sentinel for a submodule in a compare working-tree slot', async () => {
    const { service } = makeEditorCommandService({ repoPath: '/repo-a' });

    await service.openCompareDiffEditor({
      filePath: 'submodules/repo-a',
      aHash: 'a'.repeat(40),
      bHash: null,
      status: 'modified',
      title: 'compare',
      isSubmodule: true,
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.diff',
      expect.objectContaining({ authority: 'a'.repeat(40) }),
      expect.objectContaining({ authority: 'worktree' }),
      'compare',
    );
  });

  it('does not open current files outside the workspace path', async () => {
    const { service } = makeEditorCommandService({ repoPath: '/repo-a' });

    await service.openCurrentFile('../outside.ts');

    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('guards removal of main and current worktrees', async () => {
    const main = makeEditorCommandService({
      worktrees: [{ path: '/repo-a', isMain: true }],
    });
    const current = makeEditorCommandService({
      worktrees: [{ path: '/repo-a-linked', isCurrent: true }],
    });
    const removable = makeEditorCommandService({
      worktrees: [{ path: '/repo-a-linked' }],
    });

    await expect(main.service.findRemovableWorktree('/repo-a')).resolves.toMatchObject({
      success: false,
      error: expect.objectContaining({ message: 'The main worktree cannot be removed.' }),
    });
    await expect(current.service.findRemovableWorktree('/repo-a-linked')).resolves.toMatchObject({
      success: false,
      error: expect.objectContaining({ message: 'You cannot remove the worktree you are currently in.' }),
    });
    // A removable worktree answers with the list the guard checked, so the caller
    // can resolve the base dir without a second `git worktree list`.
    await expect(removable.service.findRemovableWorktree('/repo-a-linked')).resolves.toMatchObject({
      success: true,
      value: [expect.objectContaining({ path: '/repo-a-linked' })],
    });
  });

  it('marks every git-show URI with the repository the tab is displaying', async () => {
    // The fragment is what keeps an open diff pointed at the right repo after
    // the tab switches repo or closes — and what keeps two repos' identical
    // files apart.
    const { service } = makeEditorCommandService({ repoPath: '/repos/a', headHash: 'abcdef123456' });
    const executeCommand = vi.mocked(vscode.commands.executeCommand);

    const gitShowUris = async (run: () => Promise<void>) => {
      executeCommand.mockClear();
      await run();
      return executeCommand.mock.calls
        .flat()
        .filter((argument): argument is { scheme: string; fragment: string } =>
          typeof argument === 'object' && argument !== null && (argument as { scheme?: string }).scheme === 'git-show');
    };

    const cases: Array<[string, () => Promise<void>]> = [
      ['openDiffEditor', () => service.openDiffEditor('abc1234', 'src/index.ts', 'def5678')],
      ['openStagedDiffEditor', () => service.openStagedDiffEditor('src/index.ts')],
      ['openUncommittedSubmoduleDiff', () => service.openDiffEditor(UNCOMMITTED_HASH, 'sub', undefined, 'modified', true)],
      ['openCompareDiffEditor', () => service.openCompareDiffEditor({
        filePath: 'src/index.ts', aHash: 'abc1234', bHash: null, status: 'modified', title: 't', isSubmodule: true,
      })],
    ];

    for (const [label, run] of cases) {
      const uris = await gitShowUris(run);
      expect(uris.length, `${label} built no git-show URI`).toBeGreaterThan(0);
      for (const uri of uris) {
        expect(uri.fragment, `${label} lost the repository`).toContain('repo=%2Frepos%2Fa');
      }
    }

    // openFileAtRevision goes through openTextDocument rather than vscode.diff.
    const openTextDocument = vi.mocked(vscode.workspace.openTextDocument);
    openTextDocument.mockClear();
    await service.openFileAtRevision('abc1234', 'src/index.ts');
    const opened = openTextDocument.mock.calls[0][0] as unknown as { scheme: string; fragment: string };
    expect(opened.scheme).toBe('git-show');
    expect(opened.fragment).toContain('repo=%2Frepos%2Fa');
  });

  it('keeps a cache-busting nonce on the submodule working-tree side, alongside the repo', async () => {
    // That side's content moves on its own (pointer + git's -dirty suffix), so
    // reopening must not be served VS Code's cached document.
    const { service } = makeEditorCommandService({ repoPath: '/repos/a' });
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    executeCommand.mockClear();

    await service.openCompareDiffEditor({
      filePath: 'sub', aHash: 'abc1234', bHash: null, status: 'modified', title: 't', isSubmodule: true,
    });
    await service.openCompareDiffEditor({
      filePath: 'sub', aHash: 'abc1234', bHash: null, status: 'modified', title: 't', isSubmodule: true,
    });

    const worktreeFragments = executeCommand.mock.calls
      .flat()
      .filter((argument): argument is { authority: string; fragment: string } =>
        typeof argument === 'object' && argument !== null && (argument as { authority?: string }).authority === 'worktree')
      .map((uri) => uri.fragment);

    expect(worktreeFragments).toHaveLength(2);
    for (const fragment of worktreeFragments) {
      expect(fragment).toContain('repo=%2Frepos%2Fa');
      expect(fragment).toContain('nonce=');
    }
    expect(worktreeFragments[0]).not.toBe(worktreeFragments[1]);
  });
});

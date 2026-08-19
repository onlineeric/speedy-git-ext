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
    await expect(removable.service.findRemovableWorktree('/repo-a-linked')).resolves.toEqual({
      success: true,
    });
  });
});

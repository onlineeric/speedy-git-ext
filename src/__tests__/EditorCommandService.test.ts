import * as vscode from 'vscode';
import { describe, expect, it, vi } from 'vitest';
import { GitServiceRegistry } from '../webview/GitServiceRegistry.js';
import { EditorCommandService } from '../webview/EditorCommandService.js';
import { WebviewRuntime } from '../webview/WebviewRuntime.js';

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
      getCommits: vi.fn().mockResolvedValue({
        success: true,
        value: {
          commits: [{
            hash: headHash,
            abbreviatedHash: headHash.slice(0, 7),
            parents: [],
            author: 'Test',
            authorEmail: 'test@example.com',
            authorDate: 0,
            subject: 'HEAD',
            refs: [],
          }],
          totalLoadedWithoutFilter: 1,
        },
      }),
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

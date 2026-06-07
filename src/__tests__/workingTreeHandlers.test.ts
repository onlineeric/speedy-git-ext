import { describe, expect, it, vi } from 'vitest';
import { GitServiceRegistry } from '../webview/GitServiceRegistry.js';
import { workingTreeHandlers } from '../webview/handlers/workingTreeHandlers.js';

describe('workingTreeHandlers', () => {
  it('refreshes only uncommitted changes after a successful index mutation', async () => {
    const uncommittedSummary = {
      stagedFiles: [],
      unstagedFiles: [],
      conflictFiles: [],
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
    };
    const services = new GitServiceRegistry({
      gitIndexService: {
        stageFiles: vi.fn().mockResolvedValue({ success: true, value: 'Files staged' }),
      },
      gitDiffService: {
        getUncommittedSummary: vi.fn().mockResolvedValue({ success: true, value: uncommittedSummary }),
      },
    } as never);
    const context = {
      services,
      postMessage: vi.fn(),
    };

    await workingTreeHandlers.stageFiles({
      type: 'stageFiles',
      payload: { paths: ['src/file.ts'] },
    }, context as never);

    expect(services.current().gitIndexService.stageFiles).toHaveBeenCalledWith(['src/file.ts']);
    expect(context.postMessage).toHaveBeenCalledWith({
      type: 'success',
      payload: { message: 'Files staged' },
    });
    expect(context.postMessage).toHaveBeenCalledWith({
      type: 'uncommittedChanges',
      payload: uncommittedSummary,
    });
  });

  it('posts conflict state from uncommitted summary', async () => {
    const services = new GitServiceRegistry({
      gitDiffService: {
        getUncommittedSummary: vi.fn().mockResolvedValue({
          success: true,
          value: {
            stagedFiles: [],
            unstagedFiles: [],
            conflictFiles: [{ path: 'src/conflict.ts', status: 'modified' }],
            conflictType: 'merge',
            stagedCount: 0,
            unstagedCount: 1,
            untrackedCount: 0,
          },
        }),
      },
    } as never);
    const context = {
      services,
      postMessage: vi.fn(),
    };

    await workingTreeHandlers.getConflictState({ type: 'getConflictState', payload: {} }, context as never);

    expect(context.postMessage).toHaveBeenCalledWith({
      type: 'conflictState',
      payload: {
        inConflict: true,
        conflictType: 'merge',
        conflictFiles: ['src/conflict.ts'],
      },
    });
  });
});

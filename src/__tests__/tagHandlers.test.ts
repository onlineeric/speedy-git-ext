import { describe, expect, it, vi } from 'vitest';
import { GitServiceRegistry } from '../webview/GitServiceRegistry.js';
import { tagHandlers } from '../webview/handlers/tagHandlers.js';
import { GitError } from '../../shared/errors.js';

function makeContext(gitTagService: Record<string, unknown>) {
  const services = new GitServiceRegistry({ gitTagService } as never);
  const reload = vi.fn().mockResolvedValue(undefined);
  const context = {
    services,
    postMessage: vi.fn(),
    refreshCoordinator: { reload },
  };
  return { context, reload };
}

describe('tagHandlers.createTag', () => {
  it('creates only (no push) and refreshes when push is absent', async () => {
    const createTag = vi.fn().mockResolvedValue({ success: true, value: "Created tag 'v1.0'" });
    const pushTag = vi.fn();
    const { context, reload } = makeContext({ createTag, pushTag });

    await tagHandlers.createTag({ type: 'createTag', payload: { name: 'v1.0', hash: 'abc1234' } }, context as never);

    expect(createTag).toHaveBeenCalledWith('v1.0', 'abc1234', undefined);
    expect(pushTag).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
    expect(context.postMessage).toHaveBeenCalledWith({ type: 'success', payload: { message: "Created tag 'v1.0'" } });
  });

  it('chains create → push and reports combined success', async () => {
    const createTag = vi.fn().mockResolvedValue({ success: true, value: "Created tag 'v1.0'" });
    const pushTag = vi.fn().mockResolvedValue({ success: true, value: "Pushed tag 'v1.0'" });
    const { context, reload } = makeContext({ createTag, pushTag });

    await tagHandlers.createTag(
      { type: 'createTag', payload: { name: 'v1.0', hash: 'abc1234', push: { remote: 'origin', force: true } } },
      context as never,
    );

    expect(pushTag).toHaveBeenCalledWith('v1.0', 'origin', true);
    expect(reload).toHaveBeenCalled();
    expect(context.postMessage).toHaveBeenCalledWith({ type: 'success', payload: { message: "Created and pushed tag 'v1.0'" } });
  });

  it('reports created-locally-but-push-failed on push failure (FR-010)', async () => {
    const createTag = vi.fn().mockResolvedValue({ success: true, value: "Created tag 'v1.0'" });
    const pushTag = vi.fn().mockResolvedValue({ success: false, error: new GitError('network down', 'COMMAND_FAILED') });
    const { context, reload } = makeContext({ createTag, pushTag });

    await tagHandlers.createTag(
      { type: 'createTag', payload: { name: 'v1.0', hash: 'abc1234', push: { remote: 'origin' } } },
      context as never,
    );

    expect(reload).toHaveBeenCalled(); // local tag must still appear
    const errorCall = context.postMessage.mock.calls.find(([m]) => m.type === 'error');
    expect(errorCall).toBeDefined();
    expect(errorCall![0].payload.error.message).toContain('created locally');
    expect(errorCall![0].payload.error.message).toContain('network down');
  });

  it('stops and posts error when create itself fails', async () => {
    const createTag = vi.fn().mockResolvedValue({ success: false, error: new GitError('exists', 'COMMAND_FAILED') });
    const pushTag = vi.fn();
    const { context, reload } = makeContext({ createTag, pushTag });

    await tagHandlers.createTag(
      { type: 'createTag', payload: { name: 'v1.0', hash: 'abc1234', push: { remote: 'origin' } } },
      context as never,
    );

    expect(pushTag).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(context.postMessage).toHaveBeenCalledWith({ type: 'error', payload: { error: expect.any(GitError) } });
  });
});

describe('tagHandlers.deleteTag', () => {
  it('deletes locally only when deleteRemote is absent', async () => {
    const deleteTag = vi.fn().mockResolvedValue({ success: true, value: "Deleted tag 'v1.0'" });
    const deleteRemoteTag = vi.fn();
    const { context, reload } = makeContext({ deleteTag, deleteRemoteTag });

    await tagHandlers.deleteTag({ type: 'deleteTag', payload: { name: 'v1.0' } }, context as never);

    expect(deleteRemoteTag).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
    expect(context.postMessage).toHaveBeenCalledWith({ type: 'success', payload: { message: "Deleted tag 'v1.0'" } });
  });

  it('chains local → remote delete and reports combined success', async () => {
    const deleteTag = vi.fn().mockResolvedValue({ success: true, value: "Deleted tag 'v1.0'" });
    const deleteRemoteTag = vi.fn().mockResolvedValue({ success: true, value: 'ok' });
    const { context } = makeContext({ deleteTag, deleteRemoteTag });

    await tagHandlers.deleteTag(
      { type: 'deleteTag', payload: { name: 'v1.0', deleteRemote: { remote: 'origin' } } },
      context as never,
    );

    expect(deleteRemoteTag).toHaveBeenCalledWith('origin', 'v1.0');
    expect(context.postMessage).toHaveBeenCalledWith({
      type: 'success',
      payload: { message: "Deleted tag 'v1.0' locally and on origin" },
    });
  });

  it('reports deleted-locally-but-remote-delete-failed on genuine remote failure (FR-013)', async () => {
    const deleteTag = vi.fn().mockResolvedValue({ success: true, value: "Deleted tag 'v1.0'" });
    const deleteRemoteTag = vi.fn().mockResolvedValue({ success: false, error: new GitError('auth failed', 'COMMAND_FAILED') });
    const { context, reload } = makeContext({ deleteTag, deleteRemoteTag });

    await tagHandlers.deleteTag(
      { type: 'deleteTag', payload: { name: 'v1.0', deleteRemote: { remote: 'origin' } } },
      context as never,
    );

    expect(reload).toHaveBeenCalled();
    const errorCall = context.postMessage.mock.calls.find(([m]) => m.type === 'error');
    expect(errorCall).toBeDefined();
    expect(errorCall![0].payload.error.message).toContain('deleted locally');
    expect(errorCall![0].payload.error.message).toContain('auth failed');
  });
});

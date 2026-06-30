import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

export const tagHandlers = {
  createTag: async (message, context) => {
    const { name, hash, message: annotation, push } = message.payload;
    const tagService = context.services.current().gitTagService;
    const result = await tagService.createTag(name, hash, annotation);
    if (!result.success) {
      context.postMessage({ type: 'error', payload: { error: result.error } });
      return;
    }

    // The local tag now exists regardless of push outcome — always refresh.
    await context.refreshCoordinator.reload();

    if (!push) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      return;
    }

    const pushResult = await tagService.pushTag(name, push.remote, push.force);
    if (pushResult.success) {
      context.postMessage({ type: 'success', payload: { message: `Created and pushed tag '${name}'` } });
    } else {
      // FR-010: created locally but push failed — report both facts, not a blanket error.
      context.postMessage({
        type: 'error',
        payload: { error: { message: `Tag '${name}' created locally, but pushing to ${push.remote} failed: ${pushResult.error.message}` } },
      });
    }
  },

  deleteTag: async (message, context) => {
    const { name, deleteRemote } = message.payload;
    const tagService = context.services.current().gitTagService;
    const result = await tagService.deleteTag(name);
    if (!result.success) {
      context.postMessage({ type: 'error', payload: { error: result.error } });
      return;
    }

    await context.refreshCoordinator.reload();

    if (!deleteRemote) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      return;
    }

    const remoteResult = await tagService.deleteRemoteTag(deleteRemote.remote, name);
    if (remoteResult.success) {
      context.postMessage({ type: 'success', payload: { message: `Deleted tag '${name}' locally and on ${deleteRemote.remote}` } });
    } else {
      // FR-013: local delete succeeded but remote delete genuinely failed — surface both.
      context.postMessage({
        type: 'error',
        payload: { error: { message: `Tag '${name}' deleted locally, but deleting from ${deleteRemote.remote} failed: ${remoteResult.error.message}` } },
      });
    }
  },

  pushTag: async (message, context) => {
    const result = await context.services.current().gitTagService.pushTag(
      message.payload.name,
      message.payload.remote,
      message.payload.force,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },
} satisfies Pick<RequestHandlerMap, 'createTag' | 'deleteTag' | 'pushTag'>;

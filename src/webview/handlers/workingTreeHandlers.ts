import type { GitError, Result } from '../../../shared/errors.js';
import { UNCOMMITTED_HASH, buildUncommittedSubject } from '../../../shared/types.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';
import type { WebviewRequestContext } from '../WebviewRequestContext.js';

export const workingTreeHandlers = {
  getUncommittedChanges: async (_message, context) => {
    const result = await context.services.current().gitDiffService.getUncommittedSummary();
    if (result.success) {
      context.postMessage({ type: 'uncommittedChanges', payload: result.value });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  stageFiles: async (message, context) => {
    await handleIndexMutation(context, context.services.current().gitIndexService.stageFiles(message.payload.paths));
  },

  unstageFiles: async (message, context) => {
    await handleIndexMutation(context, context.services.current().gitIndexService.unstageFiles(message.payload.paths));
  },

  stageAll: async (_message, context) => {
    await handleIndexMutation(context, context.services.current().gitIndexService.stageAll());
  },

  unstageAll: async (_message, context) => {
    await handleIndexMutation(context, context.services.current().gitIndexService.unstageAll());
  },

  discardFiles: async (message, context) => {
    await handleIndexMutation(context, context.services.current().gitIndexService.discardFiles(message.payload.paths, message.payload.includeUntracked));
  },

  discardAllUnstaged: async (_message, context) => {
    await handleIndexMutation(context, context.services.current().gitIndexService.discardAllUnstaged());
  },

  getConflictState: async (_message, context) => {
    const result = await context.services.current().gitDiffService.getUncommittedSummary();
    if (result.success) {
      const { conflictFiles, conflictType } = result.value;
      context.postMessage({
        type: 'conflictState',
        payload: {
          inConflict: conflictFiles.length > 0,
          conflictType,
          conflictFiles: conflictFiles.map((file) => file.path),
        },
      });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  openStagedDiff: async (message, context) => {
    await context.editorCommands.openStagedDiffEditor(message.payload.filePath);
  },

  openDiff: async (message, context) => {
    await context.editorCommands.openDiffEditor(message.payload.hash, message.payload.filePath, message.payload.parentHash, message.payload.status);
  },

  openFile: async (message, context) => {
    await context.editorCommands.openFileAtRevision(message.payload.hash, message.payload.filePath);
  },

  openCurrentFile: async (message, context) => {
    await context.editorCommands.openCurrentFile(message.payload.filePath);
  },
} satisfies Pick<
  RequestHandlerMap,
  | 'getUncommittedChanges'
  | 'stageFiles'
  | 'unstageFiles'
  | 'stageAll'
  | 'unstageAll'
  | 'discardFiles'
  | 'discardAllUnstaged'
  | 'getConflictState'
  | 'openStagedDiff'
  | 'openDiff'
  | 'openFile'
  | 'openCurrentFile'
>;

export async function postUncommittedCommitDetails(context: WebviewRequestContext): Promise<boolean> {
  const [summaryResult, headHash] = await Promise.all([
    context.services.current().gitDiffService.getUncommittedSummary(),
    context.editorCommands.getHeadHash(),
  ]);
  if (!summaryResult.success) {
    context.postMessage({ type: 'error', payload: { error: summaryResult.error } });
    return true;
  }

  const { stagedFiles, unstagedFiles, conflictFiles, stagedCount, unstagedCount, untrackedCount } = summaryResult.value;
  const files = [...stagedFiles, ...unstagedFiles, ...conflictFiles];
  const details = {
    hash: UNCOMMITTED_HASH,
    abbreviatedHash: '---',
    parents: headHash ? [headHash] : [],
    author: '---',
    authorEmail: '',
    authorDate: Date.now(),
    committer: '---',
    committerEmail: '',
    committerDate: Date.now(),
    subject: buildUncommittedSubject(stagedCount, unstagedCount, untrackedCount),
    body: '',
    files,
    stats: files.reduce((acc, file) => ({
      additions: acc.additions + (file.additions ?? 0),
      deletions: acc.deletions + (file.deletions ?? 0),
    }), { additions: 0, deletions: 0 }),
  };
  context.postMessage({ type: 'commitDetails', payload: { details } });
  context.postMessage({ type: 'uncommittedChanges', payload: summaryResult.value });
  return true;
}

async function handleIndexMutation(context: WebviewRequestContext, resultPromise: Promise<Result<string, GitError>>): Promise<void> {
  const result = await resultPromise;
  if (result.success) {
    context.postMessage({ type: 'success', payload: { message: result.value } });
    await workingTreeHandlers.getUncommittedChanges({ type: 'getUncommittedChanges', payload: {} }, context);
  } else {
    context.postMessage({ type: 'error', payload: { error: result.error } });
  }
}

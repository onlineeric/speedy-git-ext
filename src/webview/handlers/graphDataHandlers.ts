import * as vscode from 'vscode';
import { GitExecutor } from '../../services/GitExecutor.js';
import { parseBranchRefName } from '../../utils/gitParsers.js';
import { MAX_BATCH_COMMIT_SIZE, UNCOMMITTED_HASH } from '../../../shared/types.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';
import { postUncommittedCommitDetails } from './workingTreeHandlers.js';

export const graphDataHandlers = {
  getAuthors: async (_message, context) => {
    const result = await context.services.current().gitLogService.getAuthors();
    if (result.success) {
      context.postMessage({ type: 'authorList', payload: { authors: result.value } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  getCommits: async (message, context) => {
    if (message.payload.filters) {
      context.runtime.currentFilters = { maxCount: context.runtime.currentFilters.maxCount, ...message.payload.filters };
    }
    context.postMessage({ type: 'loading', payload: { loading: true } });
    const batchSize = context.getBatchSize();
    const result = await context.services.current().gitLogService.getCommits({ ...message.payload.filters, maxCount: batchSize });
    if (result.success) {
      context.postMessage({
        type: 'commits',
        payload: {
          commits: result.value.commits,
          totalLoadedWithoutFilter: result.value.totalLoadedWithoutFilter,
        },
      });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
    context.postMessage({ type: 'loading', payload: { loading: false } });
  },

  loadMoreCommits: async (message, context) => {
    const batchSize = context.getBatchSize();
    const { skip, generation, filters, targetIndex } = message.payload;
    // Targeted loads (Go to HEAD) grow the batch to reach a known log position
    // in one request, rounded up to whole batches and capped at the same ceiling
    // a configured batch size gets — so a single response never carries an
    // unbounded commit payload, and a targeted batch is never smaller than a
    // regular one. The webview keeps requesting until the target is loaded.
    const maxCount = targetIndex !== undefined && targetIndex >= skip
      ? Math.min(Math.ceil((targetIndex - skip + 1) / batchSize) * batchSize, MAX_BATCH_COMMIT_SIZE)
      : batchSize;
    const result = await context.services.current().gitLogService.getCommits({ ...filters, maxCount, skip });
    const postAppended = (value: Extract<typeof result, { success: true }>['value']) => {
      context.postMessage({
        type: 'commitsAppended',
        payload: {
          commits: value.commits,
          hasMore: value.commits.length >= maxCount,
          generation,
          totalLoadedWithoutFilter: value.totalLoadedWithoutFilter,
        },
      });
    };
    if (result.success) {
      postAppended(result.value);
    } else {
      context.postMessage({ type: 'prefetchError', payload: { error: result.error } });
      vscode.window.showErrorMessage('Failed to load commits', 'Retry').then(async (choice) => {
        if (choice !== 'Retry') return;
        const retryResult = await context.services.current().gitLogService.getCommits({ ...filters, maxCount, skip });
        if (retryResult.success) {
          postAppended(retryResult.value);
        } else {
          context.postMessage({ type: 'prefetchError', payload: { error: retryResult.error } });
        }
      });
    }
  },

  locateHead: async (message, context) => {
    const gitLogService = context.services.current().gitLogService;

    const headResult = await gitLogService.getHeadCommitHash();
    if (!headResult.success) {
      // Unresolvable HEAD (e.g. unborn branch in a fresh repo) is a normal
      // state, not a git failure — let the webview show a friendly notice.
      context.postMessage({ type: 'headLocation', payload: { hash: null, index: -1 } });
      return;
    }

    // Fast path: the webview already displays this exact commit as HEAD, and
    // `rev-parse` just confirmed it against the repository. Its row position is
    // known client-side, so the log walk below would be pure overhead — and on
    // a large repository that walk dominates the whole click.
    if (headResult.value === message.payload.displayedHeadHash) {
      context.postMessage({ type: 'headLocation', payload: { hash: headResult.value, index: null } });
      return;
    }

    const positionResult = await gitLogService.getCommitPosition(headResult.value, message.payload.filters);
    if (!positionResult.success) {
      context.postMessage({ type: 'headLocationFailed', payload: { error: positionResult.error } });
      return;
    }

    context.postMessage({
      type: 'headLocation',
      payload: { hash: headResult.value, index: positionResult.value },
    });
  },

  getBranches: async (_message, context) => {
    const result = await context.services.current().gitLogService.getBranches();
    if (result.success) {
      context.postMessage({ type: 'branches', payload: { branches: result.value } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  getCommitDetails: async (message, context) => {
    if (message.payload.hash === UNCOMMITTED_HASH) {
      await postUncommittedCommitDetails(context);
      return;
    }

    const result = await context.services.current().gitDiffService.getCommitDetails(message.payload.hash);
    if (result.success) {
      context.postMessage({ type: 'commitDetails', payload: { details: result.value } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  getContainingBranches: async (message, context) => {
    const executor = new GitExecutor(context.log);
    const result = await executor.execute({
      // `%(refname)` (not `:short`) so a local branch with a slash is never read
      // as `<remote>/<branch>` — see parseBranchRefName.
      args: ['branch', '-a', '--contains', message.payload.hash, '--format=%(refname)'],
      cwd: context.runtime.currentRepoPath,
    });
    let branches: string[] = [];
    let status: 'loaded' | 'error' = 'loaded';
    if (result.success) {
      branches = result.value.stdout
        .split('\n')
        .map(parseBranchRefName)
        .filter((name): name is string => name !== null);
    } else {
      status = 'error';
    }
    context.postMessage({
      type: 'containingBranches',
      payload: { hash: message.payload.hash, branches, status },
    });
  },

  refresh: async (message, context) => {
    if (message.payload.filters) {
      context.runtime.currentFilters = { maxCount: context.runtime.currentFilters.maxCount, ...message.payload.filters };
    }
    await context.refreshCoordinator.reload(message.payload.filters);
  },
} satisfies Pick<
  RequestHandlerMap,
  | 'getAuthors'
  | 'getCommits'
  | 'loadMoreCommits'
  | 'locateHead'
  | 'getBranches'
  | 'getCommitDetails'
  | 'getContainingBranches'
  | 'refresh'
>;

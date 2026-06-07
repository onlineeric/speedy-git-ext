import * as vscode from 'vscode';
import { GitExecutor } from '../../services/GitExecutor.js';
import { UNCOMMITTED_HASH } from '../../../shared/types.js';
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
    const { skip, generation, filters } = message.payload;
    const result = await context.services.current().gitLogService.getCommits({ ...filters, maxCount: batchSize, skip });
    if (result.success) {
      context.postMessage({
        type: 'commitsAppended',
        payload: {
          commits: result.value.commits,
          hasMore: result.value.commits.length >= batchSize,
          generation,
          totalLoadedWithoutFilter: result.value.totalLoadedWithoutFilter,
        },
      });
    } else {
      context.postMessage({ type: 'prefetchError', payload: { error: result.error } });
      vscode.window.showErrorMessage('Failed to load commits', 'Retry').then(async (choice) => {
        if (choice !== 'Retry') return;
        const retryResult = await context.services.current().gitLogService.getCommits({ ...filters, maxCount: batchSize, skip });
        if (retryResult.success) {
          context.postMessage({
            type: 'commitsAppended',
            payload: {
              commits: retryResult.value.commits,
              hasMore: retryResult.value.commits.length >= batchSize,
              generation,
              totalLoadedWithoutFilter: retryResult.value.totalLoadedWithoutFilter,
            },
          });
        } else {
          context.postMessage({ type: 'prefetchError', payload: { error: retryResult.error } });
        }
      });
    }
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
      args: ['branch', '-a', '--contains', message.payload.hash, '--format=%(refname:short)'],
      cwd: context.runtime.currentRepoPath,
    });
    let branches: string[] = [];
    let status: 'loaded' | 'error' = 'loaded';
    if (result.success) {
      branches = result.value.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((name) => name.startsWith('remotes/') ? name.slice('remotes/'.length) : name)
        .filter((name) => name !== 'HEAD' && !name.endsWith('/HEAD'));
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
  | 'getBranches'
  | 'getCommitDetails'
  | 'getContainingBranches'
  | 'refresh'
>;

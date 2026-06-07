import * as vscode from 'vscode';
import type { InitialDataPayload, ResponseMessage } from '../../shared/messages.js';
import type { Commit, GraphFilters, UncommittedSummary, UserSettings } from '../../shared/types.js';
import { DEFAULT_USER_SETTINGS } from '../../shared/types.js';
import type { Result } from '../../shared/errors.js';
import { GitHubAvatarService } from '../services/GitHubAvatarService.js';
import type { GitServiceRegistry } from './GitServiceRegistry.js';
import type { PersistedUIStateStore } from './PersistedUIStateStore.js';
import type { WebviewRuntime } from './WebviewRuntime.js';

export interface SubmoduleNavigationHandlers {
  getStack: () => import('../../shared/types.js').SubmoduleNavEntry[];
  openSubmodule: (submodulePath: string) => Promise<void> | void;
  backToParentRepo: () => Promise<void> | void;
}

export interface RepoDataLoaderDependencies {
  readonly log: vscode.LogOutputChannel;
  readonly runtime: WebviewRuntime;
  readonly services: GitServiceRegistry;
  readonly uiStateStore: PersistedUIStateStore;
  readonly postMessage: (message: ResponseMessage) => void;
  readonly getSettings: () => UserSettings | undefined;
  readonly getBatchSize: () => number;
  readonly getSubmoduleHandlers: () => SubmoduleNavigationHandlers | undefined;
}

function emptyUncommittedSummary(): UncommittedSummary {
  return {
    stagedFiles: [],
    unstagedFiles: [],
    conflictFiles: [],
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
  };
}

function unwrapSettledResult<T>(
  settled: PromiseSettledResult<Result<T>>,
  label: string,
  errors: string[],
): T | undefined {
  if (settled.status === 'rejected') {
    const reason = String(settled.reason);
    if (reason) errors.push(`${label}: ${reason}`);
    return undefined;
  }
  if (settled.value.success) {
    return settled.value.value;
  }
  const reason = settled.value.error.message;
  if (reason) errors.push(`${label}: ${reason}`);
  return undefined;
}

export function computeCommitFingerprint(commits: Commit[]): string {
  if (commits.length === 0) return '';
  return commits
    .map((commit) => `${commit.hash}|${commit.refs.map((ref) => `${ref.type}:${ref.remote ?? ''}/${ref.name}`).join(',')}`)
    .join(';');
}

export class RepoDataLoader {
  private gitHubAvatarService: GitHubAvatarService | null = null;
  private gitHubAvatarInitialized = false;

  constructor(private readonly deps: RepoDataLoaderDependencies) {}

  resetRepoScopedState(): void {
    this.gitHubAvatarService = null;
    this.gitHubAvatarInitialized = false;
  }

  async sendInitialData(filters?: Partial<GraphFilters>, isAutoRefresh = false): Promise<void> {
    const { log, runtime } = this.deps;
    const loadLabel = isAutoRefresh ? 'auto-refresh' : runtime.initialLoadSent ? 'refresh' : 'initial';
    log.info(`Loading repo data (${loadLabel})`);

    if (!isAutoRefresh && runtime.initialLoadSent) {
      this.refreshVSCodeSourceControl();
    }

    this.deps.postMessage({
      type: 'persistedUIState',
      payload: { uiState: this.deps.uiStateStore.loadPersistedUIState() },
    });

    let effectiveFilters = filters ?? runtime.currentFilters;
    const settings = this.deps.getSettings();
    if (settings) {
      this.deps.postMessage({ type: 'settingsData', payload: { settings } });
    }

    const services = this.deps.services.current();
    if (effectiveFilters.branches && effectiveFilters.branches.length > 0) {
      const branchResult = await services.gitLogService.getBranches();
      if (branchResult.success) {
        const branchNames = new Set(
          branchResult.value.flatMap((branch) => [
            branch.name,
            ...(branch.remote ? [`${branch.remote}/${branch.name}`] : []),
          ]),
        );
        const validBranches = effectiveFilters.branches.filter((name) => branchNames.has(name));
        if (validBranches.length !== effectiveFilters.branches.length) {
          runtime.currentFilters = {
            ...runtime.currentFilters,
            branches: validBranches.length > 0 ? validBranches : undefined,
          };
          effectiveFilters = runtime.currentFilters;
        }
      }
    }

    if (effectiveFilters) {
      runtime.currentFilters = { ...runtime.currentFilters, ...effectiveFilters };
    }

    const isInitialLoad = !runtime.initialLoadSent;
    if (isInitialLoad) {
      this.deps.postMessage({ type: 'loading', payload: { loading: true } });
    }

    const batchSize = this.deps.getBatchSize();
    const errors: string[] = [];
    const currentServices = this.deps.services.current();
    const [commitsSettled, branchesSettled] = await Promise.allSettled([
      currentServices.gitLogService.getCommits({ ...effectiveFilters, maxCount: batchSize }),
      currentServices.gitLogService.getBranches(),
    ]);

    const commitsValue = unwrapSettledResult(commitsSettled, 'commits', errors);
    let fetchedCommits: Commit[] = [];
    let commitsForPayload: Commit[] | null = [];
    let totalLoadedWithoutFilter = 0;
    let hasMore = true;
    if (commitsValue) {
      fetchedCommits = commitsValue.commits;
      totalLoadedWithoutFilter = commitsValue.totalLoadedWithoutFilter ?? 0;
      hasMore = fetchedCommits.length >= batchSize;

      const fingerprint = computeCommitFingerprint(fetchedCommits);
      const commitsUnchanged = isAutoRefresh && fingerprint === runtime.lastCommitFingerprint;
      runtime.lastCommitFingerprint = fingerprint;

      commitsForPayload = commitsUnchanged ? null : fetchedCommits;
    } else {
      commitsForPayload = [];
      hasMore = false;
    }

    const branches = unwrapSettledResult(branchesSettled, 'branches', errors) ?? [];

    const payload: InitialDataPayload = {
      commits: commitsForPayload,
      totalLoadedWithoutFilter,
      hasMore,
      branches,
      stashes: [],
      uncommittedChanges: emptyUncommittedSummary(),
      remotes: [],
      authors: [],
      worktrees: [],
      cherryPickState: 'idle',
      rebaseState: 'idle',
      rebaseConflictInfo: null,
      revertState: 'idle',
      errors,
    };

    this.deps.postMessage({ type: 'initialData', payload });

    if (isInitialLoad) {
      this.deps.postMessage({ type: 'loading', payload: { loading: false } });
      runtime.initialLoadSent = true;
    }

    void this.sendDeferredRepoData(runtime.fetchGeneration);

    if (!runtime.isDisplayingSubmodule) {
      void this.sendSubmodulesData();
    }

    if ((settings ?? DEFAULT_USER_SETTINGS).avatarsEnabled !== false && fetchedCommits.length > 0) {
      void this.fetchAndSendGitHubAvatars(fetchedCommits);
    }
  }

  async sendDeferredRepoData(generation: number): Promise<void> {
    const services = this.deps.services.current();
    const [
      uncommittedSettled,
      remotesSettled,
      worktreesSettled,
      stashesSettled,
      revertStateSettled,
    ] = await Promise.allSettled([
      services.gitDiffService.getUncommittedSummary(),
      services.gitRemoteService.getRemotes(),
      services.gitWorktreeService.listWorktrees(),
      services.gitStashService.getStashes(),
      services.gitRevertService.getRevertState(),
    ]);

    if (generation !== this.deps.runtime.fetchGeneration) return;

    const errors: string[] = [];
    const uncommittedChanges = unwrapSettledResult(uncommittedSettled, 'uncommittedChanges', errors);
    const remotes = unwrapSettledResult(remotesSettled, 'remotes', errors);
    const worktrees = unwrapSettledResult(worktreesSettled, 'worktrees', errors);
    const stashes = unwrapSettledResult(stashesSettled, 'stashes', errors);
    const revertState = unwrapSettledResult(revertStateSettled, 'revertState', errors);

    if (uncommittedChanges) {
      this.deps.postMessage({ type: 'uncommittedChanges', payload: uncommittedChanges });
    }
    if (remotes) {
      this.deps.postMessage({ type: 'remotes', payload: { remotes } });
    }
    if (worktrees) {
      this.deps.postMessage({ type: 'worktreeList', payload: { worktrees } });
    }
    if (stashes) {
      this.deps.postMessage({ type: 'stashes', payload: { stashes } });
    }
    if (revertState) {
      this.deps.postMessage({ type: 'revertState', payload: { state: revertState } });
    }

    const currentServices = this.deps.services.current();
    const cherryPickStateResult = currentServices.gitCherryPickService.getCherryPickState();
    if (generation !== this.deps.runtime.fetchGeneration) return;
    if (cherryPickStateResult.success) {
      this.deps.postMessage({ type: 'cherryPickState', payload: { state: cherryPickStateResult.value } });
    }

    const rebaseStateResult = currentServices.gitRebaseService.getRebaseState();
    if (generation !== this.deps.runtime.fetchGeneration) return;
    if (rebaseStateResult.success) {
      let conflictInfo = rebaseStateResult.value.conflictInfo ?? undefined;
      if (rebaseStateResult.value.state === 'in-progress') {
        const conflictResult = await currentServices.gitRebaseService.getConflictInfo();
        if (generation !== this.deps.runtime.fetchGeneration) return;
        conflictInfo = conflictResult.success ? conflictResult.value : conflictInfo;
      }
      this.deps.postMessage({
        type: 'rebaseState',
        payload: { state: rebaseStateResult.value.state, conflictInfo },
      });
    }

    if (errors.length > 0) {
      this.deps.log.warn(`Deferred repo data failed: ${errors.join('; ')}`);
    }
  }

  async sendSubmodulesData(): Promise<void> {
    const generation = this.deps.runtime.fetchGeneration;
    const result = await this.deps.services.current().gitSubmoduleService.getSubmodules();
    if (generation !== this.deps.runtime.fetchGeneration) return;
    if (result.success) {
      this.deps.postMessage({
        type: 'submodulesData',
        payload: {
          submodules: result.value,
          stack: this.deps.getSubmoduleHandlers()?.getStack() ?? [],
        },
      });
    } else {
      this.deps.postMessage({ type: 'error', payload: { error: result.error } });
    }
  }

  private async fetchAndSendGitHubAvatars(commits: Commit[]): Promise<void> {
    if (!this.gitHubAvatarInitialized) {
      this.gitHubAvatarInitialized = true;
      const remotesResult = await this.deps.services.current().gitRemoteService.getRemotes();
      if (remotesResult.success) {
        const origin = remotesResult.value.find((remote) => remote.name === 'origin');
        if (origin) {
          const parsed = GitHubAvatarService.parseGitHubRemote(origin.fetchUrl);
          if (parsed) {
            this.gitHubAvatarService = new GitHubAvatarService(parsed.owner, parsed.repo);
          }
        }
      }
    }

    if (!this.gitHubAvatarService) return;

    const avatarResult = await this.gitHubAvatarService.fetchAvatarUrls(commits);
    if (avatarResult.success && Object.keys(avatarResult.value).length > 0) {
      this.deps.postMessage({ type: 'avatarUrls', payload: { urls: avatarResult.value } });
    }
  }

  private refreshVSCodeSourceControl(): void {
    try {
      const ext = vscode.extensions.getExtension('vscode.git');
      if (!ext?.isActive) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gitApi: any = ext.exports.getAPI(1);
      const repo = gitApi?.getRepository(vscode.Uri.file(this.deps.runtime.currentRepoPath));
      if (repo) {
        (repo.status() as Promise<void>).then(undefined, (err: unknown) => {
          this.deps.log.debug(`VS Code git repo.status() failed: ${err}`);
        });
      }
    } catch (err) {
      this.deps.log.debug(`VS Code git refresh failed: ${err}`);
    }
  }
}

import * as vscode from 'vscode';
import type { InitialDataPayload, ResponseMessage } from '../../shared/messages.js';
import type { Commit, GraphFilters, TagMetadata, UncommittedSummary, UserSettings } from '../../shared/types.js';
import { DEFAULT_USER_SETTINGS } from '../../shared/types.js';
import { GitError, type GitErrorCode, type Result } from '../../shared/errors.js';
import { toCommitCountBucket } from '../../shared/telemetry.js';
import { GitHubAvatarService } from '../services/GitHubAvatarService.js';
import type { TelemetryService } from '../services/TelemetryService.js';
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
  readonly telemetry: TelemetryService;
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
  onError?: (code: GitErrorCode) => void,
): T | undefined {
  if (settled.status === 'rejected') {
    const reason = String(settled.reason);
    if (reason) errors.push(`${label}: ${reason}`);
    onError?.(settled.reason instanceof GitError ? settled.reason.code : 'UNKNOWN');
    return undefined;
  }
  if (settled.value.success) {
    return settled.value.value;
  }
  const reason = settled.value.error.message;
  if (reason) errors.push(`${label}: ${reason}`);
  onError?.(settled.value.error.code ?? 'UNKNOWN');
  return undefined;
}

export function computeCommitFingerprint(commits: Commit[]): string {
  if (commits.length === 0) return '';
  return commits
    .map((commit) => `${commit.hash}|${commit.refs.map((ref) => `${ref.type}:${ref.remote ?? ''}/${ref.name}`).join(',')}`)
    .join(';');
}

export class RepoDataLoader {
  /** One-shot: the `perf initialLoad` telemetry event fires once per session. */
  private initialLoadPerfSent = false;
  private gitHubAvatarService: GitHubAvatarService | null = null;
  // In-flight init, so concurrent loads coalesce onto one attempt. Cleared once
  // settled; a failed attempt (null service) is retried on the next load.
  private gitHubAvatarInit: Promise<GitHubAvatarService | null> | null = null;

  constructor(private readonly deps: RepoDataLoaderDependencies) {}

  resetRepoScopedState(): void {
    this.gitHubAvatarService = null;
    this.gitHubAvatarInit = null;
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
    const loadStart = performance.now();
    const [commitsSettled, branchesSettled] = await Promise.allSettled([
      currentServices.gitLogService.getCommits({ ...effectiveFilters, maxCount: batchSize }),
      currentServices.gitLogService.getBranches(),
    ]);

    // Untracked-path failures (FR-014): area + standardized code only.
    const reportLoadError = (code: GitErrorCode) => this.deps.telemetry.sendError('dataLoader', code);

    const commitsValue = unwrapSettledResult(commitsSettled, 'commits', errors, reportLoadError);
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

    const branches = unwrapSettledResult(branchesSettled, 'branches', errors, reportLoadError) ?? [];

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

    if (isInitialLoad && !this.initialLoadPerfSent) {
      // Once per session (US5): duration of the first data load with the
      // commit count expressed only as a coarse bucket (FR-013).
      this.initialLoadPerfSent = true;
      this.deps.telemetry.sendPerfInitialLoad(
        performance.now() - loadStart,
        toCommitCountBucket(fetchedCommits.length),
      );
    }

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
      tagMetadataSettled,
    ] = await Promise.allSettled([
      services.gitDiffService.getUncommittedSummary(),
      services.gitRemoteService.getRemotes(),
      services.gitWorktreeService.listWorktrees(),
      services.gitStashService.getStashes(),
      services.gitRevertService.getRevertState(),
      services.gitTagService.getTagMetadata(),
    ]);

    if (generation !== this.deps.runtime.fetchGeneration) return;

    const errors: string[] = [];
    // Untracked-path failures (FR-014): area + standardized code only.
    const reportLoadError = (code: GitErrorCode) => this.deps.telemetry.sendError('dataLoader', code);
    const uncommittedChanges = unwrapSettledResult(uncommittedSettled, 'uncommittedChanges', errors, reportLoadError);
    const remotes = unwrapSettledResult(remotesSettled, 'remotes', errors, reportLoadError);
    const worktrees = unwrapSettledResult(worktreesSettled, 'worktrees', errors, reportLoadError);
    const stashes = unwrapSettledResult(stashesSettled, 'stashes', errors, reportLoadError);
    const revertState = unwrapSettledResult(revertStateSettled, 'revertState', errors, reportLoadError);
    const tagMetadata = unwrapSettledResult(tagMetadataSettled, 'tagMetadata', errors, reportLoadError);

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
    if (tagMetadata) {
      const metadata: Record<string, TagMetadata> = {};
      for (const tag of tagMetadata) metadata[tag.name] = tag;
      this.deps.postMessage({ type: 'tagMetadata', payload: { metadata } });
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
      // Untracked-path failure (FR-014): area + standardized code only.
      this.deps.telemetry.sendError('dataLoader', result.error.code ?? 'UNKNOWN');
      this.deps.postMessage({ type: 'error', payload: { error: result.error } });
    }
  }

  private async fetchAndSendGitHubAvatars(commits: Commit[]): Promise<void> {
    const service = await this.ensureGitHubAvatarService();
    if (!service) return;

    const avatarResult = await service.fetchAvatarUrls(commits);
    if (!avatarResult.success) return;

    const resolved = Object.keys(avatarResult.value).length;
    this.deps.log.debug(`GitHub avatars: resolved ${resolved} email(s)`);

    const rateLimitWarning = service.getRateLimitWarning();
    if (rateLimitWarning) {
      this.deps.log.warn(rateLimitWarning);
    }

    if (resolved > 0) {
      this.deps.postMessage({ type: 'avatarUrls', payload: { urls: avatarResult.value } });
    }
  }

  /**
   * Resolve the avatar service for the current repo, building it once and
   * coalescing concurrent callers onto a single init. A failed attempt leaves
   * the service null and clears the latch, so a later load retries it (e.g.
   * once `origin` is added or a transient `getRemotes` failure clears).
   */
  private ensureGitHubAvatarService(): Promise<GitHubAvatarService | null> {
    if (this.gitHubAvatarService) return Promise.resolve(this.gitHubAvatarService);
    if (!this.gitHubAvatarInit) {
      this.gitHubAvatarInit = this.createGitHubAvatarService().then((service) => {
        this.gitHubAvatarService = service;
        this.gitHubAvatarInit = null;
        return service;
      });
    }
    return this.gitHubAvatarInit;
  }

  /** Build the avatar service from the `origin` GitHub remote, or null if unavailable. */
  private async createGitHubAvatarService(): Promise<GitHubAvatarService | null> {
    const remotesResult = await this.deps.services.current().gitRemoteService.getRemotes();
    if (!remotesResult.success) return null;

    const origin = remotesResult.value.find((remote) => remote.name === 'origin');
    if (!origin) return null;

    const parsed = GitHubAvatarService.parseGitHubRemote(origin.fetchUrl);
    if (!parsed) return null;

    const token = await this.getGitHubToken();
    this.deps.log.info(
      `GitHub avatars enabled for ${parsed.owner}/${parsed.repo} (${token ? 'authenticated' : 'unauthenticated'})`,
    );
    return new GitHubAvatarService(parsed.owner, parsed.repo, token);
  }

  /**
   * Best-effort silent GitHub session token from VS Code's built-in auth.
   * Never prompts: when the user isn't signed in we fall back to unauthenticated
   * requests. Failures are non-fatal and only reduce the API rate limit.
   */
  private async getGitHubToken(): Promise<string | null> {
    try {
      const session = await vscode.authentication.getSession('github', [], { silent: true });
      return session?.accessToken ?? null;
    } catch (error) {
      this.deps.log.debug(`GitHub auth session unavailable: ${String(error)}`);
      return null;
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

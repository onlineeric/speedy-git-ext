import * as vscode from 'vscode';
import type { InitialDataPayload, ResponseMessage } from '../../shared/messages.js';
import type { AvatarUrlMap, Commit, GraphFilters, TagMetadata, UncommittedSummary, UserSettings } from '../../shared/types.js';
import { DEFAULT_USER_SETTINGS } from '../../shared/types.js';
import { GitError, type GitErrorCode, type Result } from '../../shared/errors.js';
import { toCommitCountBucket } from '../../shared/telemetry.js';
import { GitHubAvatarService } from '../services/GitHubAvatarService.js';
import type { AvatarCacheStore } from '../services/AvatarCacheStore.js';
import type { AvatarRefreshQueue } from '../services/AvatarRefreshQueue.js';
import type { TelemetryService } from '../services/TelemetryService.js';
import type { GitServiceRegistry } from './GitServiceRegistry.js';
import type { PersistedUIStateStore } from './PersistedUIStateStore.js';
import type { WebviewRuntime } from './WebviewRuntime.js';

export interface SubmoduleNavigationHandlers {
  getStack: () => import('../../shared/types.js').SubmoduleNavEntry[];
  openSubmodule: (submodulePath: string) => Promise<void> | void;
  backToParentRepo: () => Promise<void> | void;
}

/** A repository on github.com, as parsed from the `origin` remote. */
export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export interface RepoDataLoaderDependencies {
  readonly log: vscode.LogOutputChannel;
  readonly runtime: WebviewRuntime;
  readonly services: GitServiceRegistry;
  readonly uiStateStore: PersistedUIStateStore;
  readonly avatarCache: AvatarCacheStore;
  readonly avatarQueue: AvatarRefreshQueue;
  /** Whether GitHub lookups are authorized, for the orientation log line. */
  readonly isAvatarAuthorized: () => boolean;
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
  private gitHubRepo: GitHubRepoRef | null = null;
  // In-flight init, so concurrent loads coalesce onto one attempt. Cleared once
  // settled; a failed attempt (null repo) is retried on the next load.
  private gitHubRepoInit: Promise<GitHubRepoRef | null> | null = null;
  /** Keeps the once-per-repo orientation log out of every auto-refresh. */
  private loggedGitHubRepoState = false;

  constructor(private readonly deps: RepoDataLoaderDependencies) {}

  resetRepoScopedState(): void {
    // Only the owner/repo pair is repo-scoped. The avatar cache and its refresh
    // queue deliberately survive repo switches: an avatar belongs to an account,
    // not to a repository.
    this.gitHubRepo = null;
    this.gitHubRepoInit = null;
    this.loggedGitHubRepoState = false;
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
    const reportLoadError = isAutoRefresh
      ? undefined
      : (code: GitErrorCode) => this.deps.telemetry.sendError('dataLoader', code);

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

    void this.sendDeferredRepoData(runtime.fetchGeneration, !isAutoRefresh);

    if (!runtime.isDisplayingSubmodule) {
      void this.sendSubmodulesData(!isAutoRefresh);
    }

    if ((settings ?? DEFAULT_USER_SETTINGS).avatarsEnabled !== false && fetchedCommits.length > 0) {
      void this.hydrateAndQueueAvatars(fetchedCommits);
    }
  }

  async sendDeferredRepoData(generation: number, reportTelemetryErrors = true): Promise<void> {
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
    const reportLoadError = reportTelemetryErrors
      ? (code: GitErrorCode) => this.deps.telemetry.sendError('dataLoader', code)
      : undefined;
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

  async sendSubmodulesData(reportTelemetryErrors = true): Promise<void> {
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
      if (reportTelemetryErrors) {
        this.deps.telemetry.sendError('dataLoader', result.error.code ?? 'UNKNOWN');
      }
      this.deps.postMessage({ type: 'error', payload: { error: result.error } });
    }
  }

  /**
   * Hydrate avatars for a freshly loaded commit batch.
   *
   * Cheap and synchronous on the load path: dedupe emails, read what the cache
   * already holds, post it in one message. Anything missing or past its refresh
   * window is handed to the background queue, which trickles through it at its
   * own pace — nothing here waits on the network.
   */
  private async hydrateAndQueueAvatars(commits: Commit[]): Promise<void> {
    const repo = await this.ensureGitHubRepo();
    if (!repo) {
      // Log once per repo, not per load: without this the feature simply does
      // nothing and there is no way to tell whether it is broken or just not
      // applicable here.
      if (!this.loggedGitHubRepoState) {
        this.loggedGitHubRepoState = true;
        this.deps.log.info(
          'GitHub avatars unavailable: no `origin` remote pointing at github.com. '
          + 'Falling back to Gravatar and initials.',
        );
      }
      return;
    }

    const now = Date.now();
    const refreshDays = (this.deps.getSettings() ?? DEFAULT_USER_SETTINGS).avatarRefreshDays;

    // Dedupe by email, keeping the author's oldest and newest commit in this
    // batch as lookup candidates. Order matters: GitHub only knows commits that
    // have been pushed, and the newest rows are the ones most likely to be local
    // only — so the oldest sighting is tried first.
    const emailToHashes = new Map<string, { newest: string; oldest: string }>();
    for (const commit of commits) {
      const email = commit.authorEmail.toLowerCase();
      const existing = emailToHashes.get(email);
      if (existing) {
        existing.oldest = commit.hash;
      } else {
        emailToHashes.set(email, { newest: commit.hash, oldest: commit.hash });
      }
    }

    const urls: AvatarUrlMap = {};
    const sightings: Array<{ email: string; owner: string; repo: string; hashes: string[] }> = [];

    for (const [email, { newest, oldest }] of emailToHashes) {
      const hashes = newest === oldest ? [oldest] : [oldest, newest];
      // Free path: a GitHub no-reply email carries the account id, so it never
      // needs an API call and never enters the queue.
      const noreplyUrl = GitHubAvatarService.resolveNoreplyAvatarUrl(email);
      if (noreplyUrl) {
        urls[email] = noreplyUrl;
        continue;
      }

      // Show whatever we have straight away, even if it is past its window —
      // the refresh happens behind the picture that is already on screen.
      const cached = this.deps.avatarCache.get(email);
      if (cached?.avatarUrl) urls[email] = cached.avatarUrl;

      sightings.push({ email, owner: repo.owner, repo: repo.repo, hashes });
    }

    if (!this.loggedGitHubRepoState) {
      this.loggedGitHubRepoState = true;
      this.deps.log.info(
        `GitHub avatars enabled for ${repo.owner}/${repo.repo} `
        + `(${this.deps.isAvatarAuthorized() ? 'authorized, 5000 lookups/hr' : 'not authorized, 60 lookups/hr shared per IP'}), `
        + `refresh window ${refreshDays} day(s)`,
      );
    }

    if (Object.keys(urls).length > 0) {
      this.deps.postMessage({ type: 'avatarUrls', payload: { urls } });
    }

    const due = this.deps.avatarCache.touch(sightings, refreshDays, now);

    // Per-load accounting, at debug so auto-refresh does not flood the channel.
    const noreplyCount = emailToHashes.size - sightings.length;
    this.deps.log.debug(
      `GitHub avatars: ${emailToHashes.size} unique author(s) — `
      + `${Object.keys(urls).length} shown now (${noreplyCount} free no-reply), ${due.length} queued for lookup`,
    );

    if (due.length > 0) {
      this.deps.avatarQueue.enqueue(due);
    }
  }

  /**
   * Resolve the current repo's GitHub owner/name, once per repo. A failed
   * attempt clears the latch so a later load retries it (e.g. once `origin` is
   * added, or after a transient `getRemotes` failure).
   */
  private ensureGitHubRepo(): Promise<GitHubRepoRef | null> {
    if (this.gitHubRepo) return Promise.resolve(this.gitHubRepo);
    if (!this.gitHubRepoInit) {
      this.gitHubRepoInit = this.resolveGitHubRepo().then((repo) => {
        this.gitHubRepo = repo;
        this.gitHubRepoInit = null;
        return repo;
      });
    }
    return this.gitHubRepoInit;
  }

  /** Parse the `origin` remote into a GitHub owner/repo pair, or null. */
  private async resolveGitHubRepo(): Promise<GitHubRepoRef | null> {
    const remotesResult = await this.deps.services.current().gitRemoteService.getRemotes();
    if (!remotesResult.success) return null;

    const origin = remotesResult.value.find((remote) => remote.name === 'origin');
    if (!origin) return null;

    return GitHubAvatarService.parseGitHubRemote(origin.fetchUrl);
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

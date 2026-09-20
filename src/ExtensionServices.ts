import * as vscode from 'vscode';
import type { ResponseMessage } from '../shared/messages.js';
import { AvatarCacheStore } from './services/AvatarCacheStore.js';
import { AvatarRefreshQueue } from './services/AvatarRefreshQueue.js';
import { GitDiffService } from './services/GitDiffService.js';
import { GitHubAuthService, type AvatarAuthChange } from './services/GitHubAuthService.js';
import { GitHubAvatarService } from './services/GitHubAvatarService.js';
import { GitRepoDiscoveryService } from './services/GitRepoDiscoveryService.js';
import { GitRepoIdentityService } from './services/GitRepoIdentityService.js';
import { GitWatcherHub } from './services/GitWatcherHub.js';
import { RepoActivityRegistry } from './RepoActivityRegistry.js';
import type { TelemetryService } from './services/TelemetryService.js';
import { WhatsNewStore } from './services/WhatsNewStore.js';
import { normalizeRepoPath } from './utils/repoIdentity.js';

/**
 * Everything that must exist exactly ONCE per window, regardless of how many
 * graph tabs are open.
 *
 * The dividing line is ownership, not convenience: a `GraphTab` owns everything
 * view-scoped, and anything whose correctness depends on there being one of it
 * — the avatar rate-limit budget, the GitHub session listener, the storage
 * budget, the "first graph of this session" flag — lives here. N tabs must not
 * mean N caches, N auth listeners or N trickle queues.
 */
export class ExtensionServices implements vscode.Disposable {
  readonly repoDiscovery: GitRepoDiscoveryService;
  readonly avatarCache: AvatarCacheStore;
  readonly avatarAuth: GitHubAuthService;
  readonly avatarService: GitHubAvatarService;
  readonly avatarQueue: AvatarRefreshQueue;
  readonly whatsNew: WhatsNewStore;
  readonly identities: GitRepoIdentityService;
  readonly watcherHub: GitWatcherHub;
  readonly activity: RepoActivityRegistry;

  /**
   * Whether any graph has already been offered this version's release notes in
   * this window session. Set when a tab is created, whether or not the dialog
   * qualified — the rule is "the first graph opened", not "the first graph that
   * had something to show".
   */
  whatsNewOfferedThisSession = false;

  /**
   * `GitDiffService` is a stateless wrapper over `GitExecutor`, so this is a
   * cheap memo keyed by repo path, bounded by the repos the session touched. It
   * is what lets a `git-show:` document outlive the tab that opened it.
   */
  private readonly diffServices = new Map<string, GitDiffService>();

  /** Wired to the tab registry after construction — the registry needs these services. */
  private broadcastToTabs: (message: ResponseMessage) => void = () => {};
  private reloadAllTabs: () => void = () => {};

  constructor(
    readonly context: vscode.ExtensionContext,
    readonly log: vscode.LogOutputChannel,
    readonly telemetry: TelemetryService,
  ) {
    this.repoDiscovery = new GitRepoDiscoveryService(log);
    this.identities = new GitRepoIdentityService(log);
    this.watcherHub = new GitWatcherHub(log, this.identities);
    this.activity = new RepoActivityRegistry();
    this.whatsNew = new WhatsNewStore(context, log);

    this.avatarCache = new AvatarCacheStore(context, log);
    this.avatarAuth = new GitHubAuthService(context, log, (change) => this.onAvatarAuthChanged(change));
    this.avatarService = new GitHubAvatarService();
    this.avatarQueue = new AvatarRefreshQueue({
      log,
      cache: this.avatarCache,
      auth: this.avatarAuth,
      avatarService: this.avatarService,
      // Every open tab receives the same batch. Batching semantics are
      // unchanged, so a background refresh still cannot cause a re-render
      // storm; it now reaches N webviews instead of one.
      postAvatarUrls: (urls) => this.broadcast({ type: 'avatarUrls', payload: { urls } }),
      onRateLimitChanged: () => this.broadcastAvatarAuthState(),
      // Untracked-path failure (FR-014): functional area + standardized code
      // only — never the email, hash, repo or GitHub's response.
      onLookupFailed: () => telemetry.sendError('avatarService', 'COMMAND_FAILED'),
    });
    // Exactly once per session, not once per tab.
    void this.avatarAuth.initialize();
  }

  /** Closes the construction-order edge: the registry needs the services, so this is a setter. */
  connectTabs(handlers: {
    broadcast: (message: ResponseMessage) => void;
    reloadAll: () => void;
  }): void {
    this.broadcastToTabs = handlers.broadcast;
    this.reloadAllTabs = handlers.reloadAll;
  }

  broadcast(message: ResponseMessage): void {
    this.broadcastToTabs(message);
  }

  /** The diff service for a repository, created on first use and kept for the session. */
  resolveDiffService(repoPath: string): GitDiffService {
    const key = normalizeRepoPath(repoPath);
    let service = this.diffServices.get(key);
    if (!service) {
      service = new GitDiffService(key, this.log);
      this.diffServices.set(key, service);
    }
    return service;
  }

  /** Push the current avatar authorization + rate-limit state to every open tab. */
  broadcastAvatarAuthState(): void {
    this.broadcast(this.buildAvatarAuthState());
  }

  buildAvatarAuthState(): Extract<ResponseMessage, { type: 'avatarAuthState' }> {
    const rateLimit = this.avatarService.getRateLimit();
    const limited = this.avatarService.isRateLimited(Date.now());
    return {
      type: 'avatarAuthState',
      payload: {
        authorized: this.avatarAuth.isOptedIn(),
        accountLabel: this.avatarAuth.accountLabel,
        rateLimitResetAt: limited ? rateLimit.resetAt : null,
      },
    };
  }

  async clearAvatarCache(): Promise<void> {
    this.avatarQueue.clear();
    await this.avatarCache.clear();
    this.log.info('GitHub avatar cache cleared');
  }

  /**
   * Authorizing raises the rate limit and grants private-repo access, so every
   * email that failed while unauthenticated is worth retrying now rather than
   * after the refresh window.
   *
   * Re-opening cached answers happens only on `granted`. Restoring the session
   * at startup, or an unrelated GitHub session event, reports `refreshed` — the
   * cached answers were obtained under the very same authorization, so
   * re-opening them there would discard the whole negative cache on every window
   * reload and re-spend the API budget.
   *
   * Retiring the tracked rate limit is the wider case: `revoked` retires it too,
   * because the budget belongs to whoever spent it and both directions of the
   * flip leave us spending someone else's. Announcing the new state afterwards
   * is what takes the "limit reached" notice down.
   */
  private onAvatarAuthChanged(change: AvatarAuthChange): void {
    if (change !== 'refreshed') this.avatarQueue.onIdentityChanged();

    this.broadcastAvatarAuthState();
    if (change !== 'granted') return;

    const reopened = this.avatarCache.reopenUnresolved();
    if (reopened.length > 0) {
      // Cleared their `refreshedOn`, so they are expired again — the next load
      // supplies fresh lookup recipes and re-queues them.
      this.log.info(`GitHub avatars: ${reopened.length} unresolved email(s) will retry after authorization`);
      this.reloadAllTabs();
    }
  }

  /**
   * Disposed only on extension deactivate. Closing the last graph tab does NOT
   * come through here: the account-scoped avatar cache must survive reopening,
   * and the auth service must not re-register its listener. Watcher
   * subscriptions are released by refcount as tabs close, so no filesystem
   * watcher survives the last tab regardless.
   */
  dispose(): void {
    this.avatarQueue.dispose();
    // Flush whatever the queue resolved since the last debounced write, so a
    // shutdown never throws away avatars we already spent API budget on.
    this.avatarCache.dispose();
    this.watcherHub.dispose();
    this.activity.dispose();
    this.repoDiscovery.dispose();
    this.diffServices.clear();
  }
}

import type * as vscode from 'vscode';
import type { AvatarUrlMap } from '../../shared/types.js';
import type { AvatarCacheStore } from './AvatarCacheStore.js';
import type { GitHubAuthService } from './GitHubAuthService.js';
import type { GitHubAvatarService } from './GitHubAvatarService.js';
import {
  AVATAR_REFRESH_INTERVAL_MS,
  applyAvatarLookupOutcome,
  compareAvatarRefreshPriority,
  toDayNumber,
  type AvatarLookupOutcome,
  type AvatarLookupTask,
} from './avatarCachePolicy.js';

/**
 * Resolved avatars are posted in batches on this interval rather than one
 * message per result. A message per avatar would mean a store write and a React
 * render per avatar — the one way background avatar work could be felt while
 * scrolling the commit table.
 */
const RESULT_FLUSH_MS = 1_000;

/** Plain-English outcome for the log; the union's `kind` alone reads as jargon. */
function describeOutcome(outcome: AvatarLookupOutcome): string {
  switch (outcome.kind) {
    case 'found': return 'avatar found';
    case 'noAccount': return 'no GitHub account for this email';
    case 'notFound': return 'commit not on GitHub (404/422 — unpushed or no access)';
    case 'rateLimited': return 'rate limited';
    case 'networkError': return 'request failed';
  }
}

/**
 * Background drain for pending avatar lookups.
 *
 * Runs entirely in the extension host, which is a separate process from the
 * webview renderer, so it cannot block scrolling or rendering no matter how
 * long it runs. Within that process it is also close to free: the loop spends
 * its life awaiting a timer or an in-flight `fetch`, neither of which occupies
 * the event loop.
 *
 * Owns the lookup recipe — repo and candidate commits — because that is derived
 * from the commits currently loaded and is worthless once they change. Only the
 * answer reaches the cache.
 *
 * Pacing is one lookup per {@link AVATAR_REFRESH_INTERVAL_MS}. When GitHub says
 * the budget is spent the whole queue parks until the reset rather than
 * hammering.
 */
export class AvatarRefreshQueue {
  /** Tasks waiting to be looked up, best candidate first. */
  private queue: AvatarLookupTask[] = [];
  private queued = new Set<string>();
  /** Email currently being looked up; still "queued" as far as callers care. */
  private inFlight: string | null = null;
  private running = false;
  private disposed = false;
  /** Whether the webview was last told the queue is paused on the rate limit. */
  private rateLimitAnnounced = false;
  /** Ends the wait the loop is currently in; null when it is not in one. */
  private wakeFromPause: (() => void) | null = null;

  /** Results waiting to be posted as one batch. */
  private pendingResults: AvatarUrlMap = {};
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly deps: {
      readonly log: vscode.LogOutputChannel;
      readonly cache: AvatarCacheStore;
      readonly auth: GitHubAuthService;
      readonly avatarService: GitHubAvatarService;
      readonly postAvatarUrls: (urls: AvatarUrlMap) => void;
      readonly onRateLimitChanged: () => void;
      /** Reports a transport failure for telemetry; carries no lookup detail. */
      readonly onLookupFailed: () => void;
    },
  ) {}

  /**
   * Add lookups. Re-sorts so the best candidate is next: visible gaps before
   * stale pictures, most recently seen first.
   */
  enqueue(tasks: AvatarLookupTask[]): void {
    if (this.disposed) return;

    let added = false;
    for (const task of tasks) {
      // `inFlight` too: the email leaves `queued` the moment its lookup starts,
      // and its record is not stamped until the lookup answers — so an
      // auto-refresh landing in that window would otherwise re-queue an email
      // that is already being looked up and spend the budget on it twice.
      if (this.queued.has(task.email) || task.email === this.inFlight) continue;
      this.queued.add(task.email);
      this.queue.push(task);
      added = true;
    }
    if (!added) return;

    this.sortQueue();
    void this.run();
  }

  private sortQueue(): void {
    const cache = this.deps.cache;
    // Each record is fetched once up front rather than twice per comparison:
    // a full backlog is AVATAR_CACHE_MAX_ENTRIES long and every load re-sorts it,
    // so the comparator runs tens of thousands of times per sort.
    const keyed = this.queue.map((task) => ({ task, record: cache.get(task.email) }));
    keyed.sort((a, b) =>
      a.record && b.record ? compareAvatarRefreshPriority(a.record, b.record) : 0,
    );
    this.queue = keyed.map((entry) => entry.task);
  }

  private async run(): Promise<void> {
    if (this.running || this.disposed) return;
    this.running = true;

    try {
      while (this.queue.length > 0 && !this.disposed) {
        await this.wait(AVATAR_REFRESH_INTERVAL_MS);
        if (this.disposed) break;

        const now = Date.now();
        if (this.deps.avatarService.isRateLimited(now)) {
          const resetAt = this.deps.avatarService.getRateLimit().resetAt;
          const waitMs = resetAt !== null ? Math.max(0, resetAt - now) : 60_000;
          this.deps.log.debug(`Avatar refresh paused for ${Math.round(waitMs / 1000)}s (GitHub rate limit)`);
          this.announceRateLimit(true);
          await this.wait(waitMs);
          continue;
        }

        // The window has reopened; nothing else tells the webview to drop the
        // "limit reached" notice, so it would otherwise sit there for good.
        this.announceRateLimit(false);

        const task = this.queue.shift();
        if (task === undefined) break;
        this.queued.delete(task.email);
        this.inFlight = task.email;

        try {
          await this.processOne(task);
        } finally {
          this.inFlight = null;
        }
      }

      if (!this.disposed) {
        this.deps.log.debug('Avatar refresh queue drained');
      }
    } finally {
      this.running = false;
    }
  }

  private async processOne(task: AvatarLookupTask): Promise<void> {
    const record = this.deps.cache.get(task.email);
    if (!record) return;

    const hash = task.hashes[0];
    if (hash === undefined) return;

    const outcome = await this.deps.avatarService.lookupCommitAuthorAvatar(
      { owner: task.owner, repo: task.repo, hash },
      this.deps.auth.getToken(),
    );

    // One line per lookup: the only place that records what GitHub actually
    // said about a given author. Local log channel only — emails and hashes
    // must never reach telemetry.
    const remaining = this.deps.avatarService.getRateLimit().remaining;
    this.deps.log.debug(
      `Avatar lookup ${task.email} @ ${hash.slice(0, 8)} → ${describeOutcome(outcome)} `
      + `(${remaining} lookups left this hour, ${this.queue.length} still queued)`,
    );

    if (outcome.kind === 'rateLimited') {
      const paused = this.deps.avatarService.isRateLimited(Date.now());
      this.announceRateLimit(paused);

      if (paused) {
        // Put it back untouched — the pause happens at the top of the loop.
        this.requeue(task);
        return;
      }

      // GitHub refused the request without reporting a spent budget: a secondary
      // rate limit, a blocked resource, or SSO enforcement. Requeueing would
      // hand the same task straight back to a loop that will not pause, so the
      // queue would hammer GitHub once a second forever. Drop it instead — the
      // record stays unstamped, so the next load re-queues it.
      this.deps.log.debug(
        `Avatar lookup ${task.email}: GitHub refused the request without reporting a rate-limit reset; `
        + 'retrying on the next load',
      );
      this.deps.onLookupFailed();
      return;
    }

    if (outcome.kind === 'networkError') {
      // Deliberately leaves the record unstamped, so it stays expired and the
      // next load re-queues it. Stamping would cost a full refresh window for
      // being briefly offline.
      this.deps.onLookupFailed();
      return;
    }

    const remainingHashes = outcome.kind === 'notFound' ? task.hashes.slice(1) : [];
    const candidatesExhausted = outcome.kind === 'notFound' && remainingHashes.length === 0;

    const updated = applyAvatarLookupOutcome(record, outcome, toDayNumber(Date.now()), {
      candidatesExhausted,
    });
    // The policy returns the same record when the outcome changed nothing (a
    // `notFound` with candidates left); writing it would dirty the cache and
    // re-serialize the whole map for nothing.
    if (updated !== record) this.deps.cache.update(task.email, updated);

    if (outcome.kind === 'notFound' && remainingHashes.length > 0) {
      this.deps.log.debug(
        `Avatar lookup ${task.email}: trying next candidate commit ${remainingHashes[0].slice(0, 8)}`,
      );
      this.requeue({ ...task, hashes: remainingHashes });
      return;
    }

    if (updated.avatarUrl && updated.avatarUrl !== record.avatarUrl) {
      this.bufferResult(task.email, updated.avatarUrl);
    }
  }

  /**
   * Tell the webview about the rate limit only when it actually flips, so the
   * "limit reached" notice appears once and — just as importantly — is taken
   * back down once the window reopens.
   */
  private announceRateLimit(limited: boolean): void {
    if (limited === this.rateLimitAnnounced) return;
    this.rateLimitAnnounced = limited;
    this.deps.onRateLimitChanged();
  }

  /**
   * The account we authenticate as changed, so the tracked budget and any pause
   * measured against it belong to an identity we no longer use — see
   * {@link GitHubAvatarService.resetRateLimit}. Retiring the budget and waking
   * the pause are one call because doing them in the other order re-parks the
   * loop on its next turn, and doing only one of them is never right.
   *
   * Without this the queue would stay asleep — and the webview would keep
   * showing "limit reached" — until a reset that no longer governs anything.
   */
  onIdentityChanged(): void {
    if (this.disposed) return;
    this.deps.avatarService.resetRateLimit();
    // Set rather than announced: the caller reports the new state itself, and
    // the loop only clears this flag on a turn a drained queue never takes.
    this.rateLimitAnnounced = false;
    this.wakeFromPause?.();
  }

  private requeue(task: AvatarLookupTask): void {
    if (this.queued.has(task.email) || this.disposed) return;
    this.queued.add(task.email);
    this.queue.push(task);
  }

  /** Hold a result briefly so several land in the webview as one update. */
  private bufferResult(email: string, avatarUrl: string): void {
    this.pendingResults[email] = avatarUrl;
    if (this.flushTimer !== undefined) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flushResults();
    }, RESULT_FLUSH_MS);
    this.flushTimer.unref?.();
  }

  private flushResults(): void {
    const urls = this.pendingResults;
    this.pendingResults = {};
    if (Object.keys(urls).length > 0) {
      this.deps.postAvatarUrls(urls);
    }
  }

  /**
   * Every wait the loop takes, all interruptible. The rate-limit pause is the
   * one that has to be — it runs up to a full hour, and both
   * {@link onIdentityChanged} and {@link dispose} need it to end early. Cutting
   * the 1s pacing tick short on the same signal costs nothing, so the loop needs
   * only one kind of wait rather than a rule about which one can be woken.
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.wakeFromPause = null;
        resolve();
      };
      const timer = setTimeout(finish, ms);
      timer.unref?.();
      this.wakeFromPause = finish;
    });
  }

  /**
   * Drop everything waiting, without stopping the queue. Used when the cache is
   * cleared: the queued emails point at records that no longer exist.
   */
  clear(): void {
    this.queue = [];
    this.queued.clear();
    this.pendingResults = {};
  }

  dispose(): void {
    this.disposed = true;
    this.queue = [];
    this.queued.clear();
    // Otherwise a queue parked on the rate limit holds its loop open for up to
    // an hour after the panel is gone.
    this.wakeFromPause?.();
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.flushResults();
  }
}

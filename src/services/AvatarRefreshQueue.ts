import type * as vscode from 'vscode';
import type { AvatarUrlMap } from '../../shared/types.js';
import type { AvatarCacheStore } from './AvatarCacheStore.js';
import type { GitHubAuthService } from './GitHubAuthService.js';
import type { GitHubAvatarService } from './GitHubAvatarService.js';
import {
  AVATAR_REFRESH_INTERVAL_MS,
  applyAvatarLookupOutcome,
  avatarUrlFromRecord,
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
  private running = false;
  private disposed = false;

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
      if (this.queued.has(task.email)) continue;
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
    this.queue.sort((a, b) => {
      const recordA = cache.get(a.email);
      const recordB = cache.get(b.email);
      if (!recordA || !recordB) return 0;
      return compareAvatarRefreshPriority(recordA, recordB);
    });
  }

  private async run(): Promise<void> {
    if (this.running || this.disposed) return;
    this.running = true;

    try {
      while (this.queue.length > 0 && !this.disposed) {
        await this.delay(AVATAR_REFRESH_INTERVAL_MS);
        if (this.disposed) break;

        const now = Date.now();
        if (this.deps.avatarService.isRateLimited(now)) {
          const resetAt = this.deps.avatarService.getRateLimit().resetAt;
          const waitMs = resetAt !== null ? Math.max(0, resetAt - now) : 60_000;
          this.deps.log.debug(`Avatar refresh paused for ${Math.round(waitMs / 1000)}s (GitHub rate limit)`);
          this.deps.onRateLimitChanged();
          await this.delay(waitMs);
          continue;
        }

        const task = this.queue.shift();
        if (task === undefined) break;
        this.queued.delete(task.email);

        await this.processOne(task);
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
      // Put it back untouched — the pause happens at the top of the loop.
      this.requeue(task);
      this.deps.onRateLimitChanged();
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
    this.deps.cache.update(task.email, updated);

    if (outcome.kind === 'notFound' && remainingHashes.length > 0) {
      this.deps.log.debug(
        `Avatar lookup ${task.email}: trying next candidate commit ${remainingHashes[0].slice(0, 8)}`,
      );
      this.requeue({ ...task, hashes: remainingHashes });
      return;
    }

    const url = avatarUrlFromRecord(updated);
    if (url && url !== avatarUrlFromRecord(record)) {
      this.bufferResult(task.email, url);
    }
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
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
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.flushResults();
  }
}

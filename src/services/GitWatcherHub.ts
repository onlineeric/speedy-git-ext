import * as vscode from 'vscode';
import { DebouncerByKey } from '../utils/debounceByKey.js';
import { normalizeRepoPath, type RepoIdentity } from '../utils/repoIdentity.js';
import type { GitRepoIdentityService } from './GitRepoIdentityService.js';

const DEBOUNCE_MS = 1000;
const MIN_INTERVAL_MS = 2000;

/** Per working tree: checkout and in-progress operation state. */
const WORKTREE_PATTERNS = ['HEAD', 'index', 'MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'];
/** Shared by a repo and every linked worktree: refs, tags and fetch results. */
const COMMON_PATTERNS = ['refs/**', 'packed-refs', 'FETCH_HEAD', 'ORIG_HEAD'];

interface WatcherSet {
  /** How many tab subscriptions currently hold this common-dir set. */
  refCount: number;
  watchers: vscode.FileSystemWatcher[];
  /** Per-worktree watchers, keyed by git dir, so two worktrees share the common set. */
  worktrees: Map<string, { refCount: number; watchers: vscode.FileSystemWatcher[] }>;
}

/**
 * One watcher set per object store, for the whole window, ref-counted by the
 * tabs that subscribe to it.
 *
 * **Watches the resolved git directories, never `<repo>/.git/...`.** A linked
 * worktree and a submodule both have a `.git` *file* pointing elsewhere, so the
 * literal path matches nothing and their changes were silently missed. The two
 * bases are separate because they answer different questions: the per-worktree
 * git dir owns HEAD and the index, while the common dir owns refs that every
 * linked worktree shares.
 */
export class GitWatcherHub implements vscode.Disposable {
  private readonly sets = new Map<string, WatcherSet>();
  private readonly listeners = new Set<(changed: RepoIdentity) => void>();
  private readonly identitiesByKey = new Map<string, RepoIdentity>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly debouncer: DebouncerByKey<string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private gitApi: any;
  private gitApiSubscribed = false;

  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly identities: GitRepoIdentityService,
  ) {
    this.debouncer = new DebouncerByKey({ debounceMs: DEBOUNCE_MS, minIntervalMs: MIN_INTERVAL_MS }, (key) => {
      const identity = this.identitiesByKey.get(key);
      if (!identity) return;
      for (const listener of this.listeners) listener(identity);
    });
  }

  /**
   * Subscribe a listener to *every* repository change the hub detects. Routing
   * to the tabs a change actually affects is the caller's job
   * (`tabsAffectedByChange`), because only the caller knows the open tabs.
   */
  onDidDetectChange(listener: (changed: RepoIdentity) => void): vscode.Disposable {
    this.listeners.add(listener);
    return new vscode.Disposable(() => this.listeners.delete(listener));
  }

  /**
   * Watch the repository at `repoPath`, joining the existing watcher set when
   * one already covers its object store.
   *
   * An unresolvable identity subscribes nothing and never throws: the tab still
   * auto-refreshes from the `vscode.git` API when VS Code tracks that repo, and
   * always from a manual refresh.
   */
  async watch(repoPath: string): Promise<vscode.Disposable> {
    await this.ensureGitApiSubscription();

    const resolved = await this.identities.resolve(repoPath);
    if (!resolved.success) {
      this.log.debug(`GitWatcherHub: no watchers for ${repoPath} — ${resolved.error.message}`);
      return new vscode.Disposable(() => {});
    }

    const identity = resolved.value;
    this.identitiesByKey.set(identity.commonGitDir, identity);

    let set = this.sets.get(identity.commonGitDir);
    if (!set) {
      set = {
        refCount: 0,
        watchers: this.createWatchers(identity.commonGitDir, COMMON_PATTERNS, identity.commonGitDir),
        worktrees: new Map(),
      };
      this.sets.set(identity.commonGitDir, set);
    }
    set.refCount += 1;

    let worktree = set.worktrees.get(identity.gitDir);
    if (!worktree) {
      worktree = {
        refCount: 0,
        watchers: this.createWatchers(identity.gitDir, WORKTREE_PATTERNS, identity.commonGitDir),
      };
      set.worktrees.set(identity.gitDir, worktree);
    }
    worktree.refCount += 1;

    let released = false;
    return new vscode.Disposable(() => {
      if (released) return;
      released = true;
      this.release(identity);
    });
  }

  private createWatchers(baseDir: string, patterns: string[], emitKey: string): vscode.FileSystemWatcher[] {
    const base = vscode.Uri.file(baseDir);
    return patterns.map((pattern) => {
      // An absolute RelativePattern watches out-of-workspace paths — the normal
      // case for a linked worktree and for `.git/modules/<name>` — including
      // recursive globs, from VS Code 1.64; our floor is 1.85.
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(base, pattern));
      watcher.onDidChange(() => this.debouncer.schedule(emitKey));
      watcher.onDidCreate(() => this.debouncer.schedule(emitKey));
      watcher.onDidDelete(() => this.debouncer.schedule(emitKey));
      return watcher;
    });
  }

  private release(identity: RepoIdentity): void {
    const set = this.sets.get(identity.commonGitDir);
    if (!set) return;

    const worktree = set.worktrees.get(identity.gitDir);
    if (worktree) {
      worktree.refCount -= 1;
      if (worktree.refCount <= 0) {
        for (const watcher of worktree.watchers) watcher.dispose();
        set.worktrees.delete(identity.gitDir);
      }
    }

    set.refCount -= 1;
    if (set.refCount > 0) return;

    for (const watcher of set.watchers) watcher.dispose();
    for (const remaining of set.worktrees.values()) {
      for (const watcher of remaining.watchers) watcher.dispose();
    }
    this.sets.delete(identity.commonGitDir);
    this.debouncer.cancel(identity.commonGitDir);
  }

  /**
   * The `vscode.git` API subscription is window-wide and set up once. A
   * repository's state change resolves that repository's root to an identity
   * and emits it, so it routes exactly like a filesystem event.
   */
  private async ensureGitApiSubscription(): Promise<void> {
    if (this.gitApiSubscribed) return;
    this.gitApiSubscribed = true;

    try {
      const ext = vscode.extensions.getExtension('vscode.git');
      if (!ext) {
        this.log.debug('GitWatcherHub: vscode.git extension not found, skipping API subscription');
        return;
      }
      if (!ext.isActive) await ext.activate();
      this.gitApi = ext.exports.getAPI(1);
      if (!this.gitApi) {
        this.log.debug('GitWatcherHub: could not get git API v1');
        return;
      }

      for (const repo of this.gitApi.repositories) this.subscribeToRepository(repo);

      this.disposables.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.gitApi.onDidOpenRepository((repo: any) => this.subscribeToRepository(repo)),
      );
      // No action needed for onDidCloseRepository — disposables handle cleanup.

      this.log.debug(`GitWatcherHub: subscribed to vscode.git API (${this.gitApi.repositories.length} repos)`);
    } catch {
      this.log.debug('GitWatcherHub: failed to subscribe to vscode.git API, relying on filesystem watchers');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private subscribeToRepository(repo: any): void {
    const rootPath: string | undefined = repo?.rootUri?.fsPath;
    if (!rootPath) return;
    this.disposables.push(
      repo.state.onDidChange(() => {
        void this.emitForRepoPath(rootPath);
      }),
    );
  }

  private async emitForRepoPath(repoPath: string): Promise<void> {
    const key = normalizeRepoPath(repoPath);
    let identity = this.identities.peek(key);
    if (!identity) {
      const resolved = await this.identities.resolve(key);
      if (!resolved.success) return;
      identity = resolved.value;
    }
    this.identitiesByKey.set(identity.commonGitDir, identity);
    this.debouncer.schedule(identity.commonGitDir);
  }

  dispose(): void {
    this.debouncer.dispose();
    for (const set of this.sets.values()) {
      for (const watcher of set.watchers) watcher.dispose();
      for (const worktree of set.worktrees.values()) {
        for (const watcher of worktree.watchers) watcher.dispose();
      }
    }
    this.sets.clear();
    this.identitiesByKey.clear();
    this.listeners.clear();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }
}

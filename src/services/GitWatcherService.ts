import * as vscode from 'vscode';

const DEBOUNCE_MS = 1000;
const MIN_INTERVAL_MS = 2000;

/**
 * Watches for git state changes via VSCode git extension API and filesystem watchers.
 * Emits a debounced `onDidDetectChange` event when git state changes are detected.
 */
export class GitWatcherService implements vscode.Disposable {
  private readonly _onDidDetectChange = new vscode.EventEmitter<void>();
  readonly onDidDetectChange = this._onDidDetectChange.event;

  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private lastRefreshTime = 0;
  private readonly disposables: vscode.Disposable[] = [];
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private gitApi: any;

  constructor(private readonly log: vscode.LogOutputChannel) {
    this.disposables.push(this._onDidDetectChange);
  }

  /** Initialize the watcher — call after construction to set up git API subscription */
  async initialize(repoPath: string): Promise<void> {
    await this.subscribeToGitApi();
    this.createFileWatchers(repoPath);
  }

  /** Update the watched repository path. Recreates filesystem watchers for the new path. */
  setRepoPath(repoPath: string): void {
    this.disposeFileWatchers();
    this.createFileWatchers(repoPath);
  }

  /** Subscribe to VSCode's built-in git extension state changes (US1) */
  private async subscribeToGitApi(): Promise<void> {
    try {
      const ext = vscode.extensions.getExtension('vscode.git');
      if (!ext) {
        this.log.debug('GitWatcherService: vscode.git extension not found, skipping API subscription');
        return;
      }
      if (!ext.isActive) {
        await ext.activate();
      }
      this.gitApi = ext.exports.getAPI(1);
      if (!this.gitApi) {
        this.log.debug('GitWatcherService: could not get git API v1');
        return;
      }

      // Subscribe to state changes for all existing repositories
      for (const repo of this.gitApi.repositories) {
        this.subscribeToRepository(repo);
      }

      // Handle dynamically opened/closed repositories
      this.disposables.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.gitApi.onDidOpenRepository((repo: any) => {
          this.subscribeToRepository(repo);
        })
      );
      // No action needed for onDidCloseRepository — disposables handle cleanup

      this.log.debug(`GitWatcherService: subscribed to vscode.git API (${this.gitApi.repositories.length} repos)`);
    } catch {
      this.log.debug('GitWatcherService: failed to subscribe to vscode.git API, relying on filesystem watchers');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private subscribeToRepository(repo: any): void {
    this.disposables.push(
      repo.state.onDidChange(() => {
        this.scheduleRefresh();
      })
    );
  }

  /** Create filesystem watchers for key .git files (US2) */
  private createFileWatchers(repoPath: string): void {
    const gitPatterns = [
      '.git/HEAD',
      '.git/index',
      '.git/MERGE_HEAD',
      '.git/REBASE_HEAD',
      '.git/refs/**',
    ];

    for (const pattern of gitPatterns) {
      const relativePattern = new vscode.RelativePattern(repoPath, pattern);
      const watcher = vscode.workspace.createFileSystemWatcher(relativePattern);
      watcher.onDidChange(() => this.scheduleRefresh());
      watcher.onDidCreate(() => this.scheduleRefresh());
      watcher.onDidDelete(() => this.scheduleRefresh());
      this.fileWatchers.push(watcher);
    }

    this.log.debug(`GitWatcherService: created ${this.fileWatchers.length} filesystem watchers for ${repoPath}`);
  }

  /** Dispose only the filesystem watchers (used when repo path changes) */
  private disposeFileWatchers(): void {
    for (const w of this.fileWatchers) {
      w.dispose();
    }
    this.fileWatchers = [];
  }

  /** Debounced handler with minimum interval — all change sources funnel into this */
  private scheduleRefresh(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    const elapsed = Date.now() - this.lastRefreshTime;
    const delay = Math.max(DEBOUNCE_MS, MIN_INTERVAL_MS - elapsed);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.lastRefreshTime = Date.now();
      this.log.info(`[TRACE] GitWatcherService: firing change event (delay was ${delay}ms)`);
      this._onDidDetectChange.fire();
    }, delay);
  }

  dispose(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.disposeFileWatchers();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import type { RequestMessage, ResponseMessage, InitialDataPayload } from '../shared/messages.js';
import type {
  Commit,
  CommitListMode,
  CommitTableColumnId,
  CommitTableLayout,
  FileChangeStatus,
  GraphFilters,
  PersistedUIState,
  RepoInfo,
  SubmoduleNavEntry,
  UncommittedSummary,
  UserSettings,
} from '../shared/types.js';
import {
  COMMIT_TABLE_COLUMN_IDS,
  DEFAULT_PERSISTED_UI_STATE,
  UNCOMMITTED_HASH,
  buildUncommittedSubject,
  cloneCommitTableLayout,
} from '../shared/types.js';
import type { GitLogService } from './services/GitLogService.js';
import type { GitDiffService } from './services/GitDiffService.js';
import type { GitBranchService } from './services/GitBranchService.js';
import { isCheckoutConflict } from './services/GitBranchService.js';
import type { GitRemoteService } from './services/GitRemoteService.js';
import type { GitTagService } from './services/GitTagService.js';
import type { GitStashService } from './services/GitStashService.js';
import type { GitHistoryService } from './services/GitHistoryService.js';
import type { GitCherryPickService } from './services/GitCherryPickService.js';
import type { GitRevertService } from './services/GitRevertService.js';
import type { GitRebaseService } from './services/GitRebaseService.js';
import type { GitSignatureService } from './services/GitSignatureService.js';
import type { GitSubmoduleService } from './services/GitSubmoduleService.js';
import type { GitWorktreeService } from './services/GitWorktreeService.js';
import type { GitIndexService } from './services/GitIndexService.js';
import type { GitRepoDiscoveryService } from './services/GitRepoDiscoveryService.js';
import { GitError, type Result } from '../shared/errors.js';
import { GitExecutor } from './services/GitExecutor.js';
import { GitHubAvatarService } from './services/GitHubAvatarService.js';

function repoLayoutKey(repoPath: string): string {
  const hash = crypto.createHash('sha256').update(repoPath).digest('hex').slice(0, 16);
  return `speedyGit.repoTableLayout.${hash}`;
}

function clonePersistedUIStateDefaults(): PersistedUIState {
  return {
    ...DEFAULT_PERSISTED_UI_STATE,
    commitTableLayout: cloneCommitTableLayout(DEFAULT_PERSISTED_UI_STATE.commitTableLayout),
  };
}

function isCommitListMode(value: unknown): value is CommitListMode {
  return value === 'classic' || value === 'table';
}

function isCommitTableColumnId(value: unknown): value is CommitTableColumnId {
  return typeof value === 'string' && COMMIT_TABLE_COLUMN_IDS.includes(value as CommitTableColumnId);
}

function validateCommitTableLayout(
  value: unknown,
  fallback: CommitTableLayout
): CommitTableLayout {
  const defaults = DEFAULT_PERSISTED_UI_STATE.commitTableLayout;
  const baseLayout = cloneCommitTableLayout(fallback);

  if (!value || typeof value !== 'object') {
    return baseLayout;
  }

  const raw = value as Record<string, unknown>;
  let nextOrder = [...baseLayout.order];
  if (raw.order !== undefined) {
    if (Array.isArray(raw.order)) {
      const uniqueIds = new Set<CommitTableColumnId>();
      const parsedOrder: CommitTableColumnId[] = [];

      for (const item of raw.order) {
        if (!isCommitTableColumnId(item) || uniqueIds.has(item)) {
          parsedOrder.length = 0;
          break;
        }
        uniqueIds.add(item);
        parsedOrder.push(item);
      }

      nextOrder = parsedOrder.length === COMMIT_TABLE_COLUMN_IDS.length
        ? parsedOrder
        : [...defaults.order];
    } else {
      nextOrder = [...defaults.order];
    }
  }

  const nextColumns = cloneCommitTableLayout(baseLayout).columns;
  const rawColumns = raw.columns;
  for (const columnId of COMMIT_TABLE_COLUMN_IDS) {
    const defaultColumn = defaults.columns[columnId];
    const baseColumn = baseLayout.columns[columnId];
    const rawColumn = rawColumns && typeof rawColumns === 'object'
      ? (rawColumns as Record<string, unknown>)[columnId]
      : undefined;

    if (!rawColumn || typeof rawColumn !== 'object') {
      nextColumns[columnId] = { ...baseColumn };
      continue;
    }

    const columnRecord = rawColumn as Record<string, unknown>;
    nextColumns[columnId] = {
      visible: columnId === 'graph'
        ? true
        : typeof columnRecord.visible === 'boolean'
          ? columnRecord.visible
          : columnRecord.visible !== undefined
            ? defaultColumn.visible
            : baseColumn.visible,
      preferredWidth:
        typeof columnRecord.preferredWidth === 'number'
        && isFinite(columnRecord.preferredWidth)
        && columnRecord.preferredWidth > 0
          ? Math.round(columnRecord.preferredWidth)
          : columnRecord.preferredWidth !== undefined
            ? defaultColumn.preferredWidth
            : baseColumn.preferredWidth,
    };
  }

  nextColumns.graph.visible = true;

  return {
    order: nextOrder,
    columns: nextColumns,
  };
}

export class WebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  /** Incremented on each repo switch to discard stale commit responses */
  private fetchGeneration = 0;
  private currentRepoPath: string;
  /** Stores the most recently applied filters so all refresh calls preserve them */
  private currentFilters: Partial<GraphFilters> = {};
  /** GitHub avatar service — initialized lazily when the remote is detected as GitHub */
  private gitHubAvatarService: GitHubAvatarService | null = null;
  private gitHubAvatarInitialized = false;
  private isRefreshing = false;
  private pendingRefresh = false;
  private isPanelVisible = false;
  private deferredRefresh = false;
  /** Tracks whether the initial load has been sent — subsequent loads are "refreshes" and should not show loading overlay */
  private initialLoadSent = false;
  /** Fingerprint of the last commit data sent to webview, used to skip no-op auto-refreshes */
  private lastCommitFingerprint = '';
  /** In-memory cache of persisted UI state to avoid stale reads in rapid sequential saves */
  private uiStateCache: PersistedUIState | undefined;
  private getSettingsHandler: (() => UserSettings) | undefined;
  private submoduleHandlers:
    | {
        getStack: () => SubmoduleNavEntry[];
        openSubmodule: (submodulePath: string) => Promise<void> | void;
        backToParentRepo: () => Promise<void> | void;
      }
    | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private gitLogService: GitLogService,
    private gitDiffService: GitDiffService,
    private gitBranchService: GitBranchService,
    private gitRemoteService: GitRemoteService,
    private gitTagService: GitTagService,
    private gitStashService: GitStashService,
    private gitHistoryService: GitHistoryService,
    private gitCherryPickService: GitCherryPickService,
    private gitRevertService: GitRevertService,
    private gitRebaseService: GitRebaseService,
    private gitSignatureService: GitSignatureService,
    private gitSubmoduleService: GitSubmoduleService,
    private gitWorktreeService: GitWorktreeService,
    private gitIndexService: GitIndexService,
    private readonly log: vscode.LogOutputChannel,
    private readonly gitRepoDiscoveryService?: GitRepoDiscoveryService,
    currentRepoPath?: string
  ) {
    this.currentRepoPath = currentRepoPath ?? this.getWorkspacePath() ?? '';
  }

  /** Callback invoked when the user switches repos; updates services before commits are fetched */
  private onSwitchRepo: ((repoPath: string) => void) | undefined;

  /** Register the callback that reinitializes services for a new repo path */
  setSwitchRepoHandler(handler: (repoPath: string) => void) {
    this.onSwitchRepo = handler;
  }

  setSettingsProvider(handler: () => UserSettings) {
    this.getSettingsHandler = handler;
  }

  setSubmoduleNavigationHandlers(handlers: {
    getStack: () => SubmoduleNavEntry[];
    openSubmodule: (submodulePath: string) => Promise<void> | void;
    backToParentRepo: () => Promise<void> | void;
  }) {
    this.submoduleHandlers = handlers;
  }

  /** Replace all services when the active repo changes */
  updateServices(
    gitLogService: GitLogService,
    gitDiffService: GitDiffService,
    gitBranchService: GitBranchService,
    gitRemoteService: GitRemoteService,
    gitTagService: GitTagService,
    gitStashService: GitStashService,
    gitHistoryService: GitHistoryService,
    gitCherryPickService: GitCherryPickService,
    gitRevertService: GitRevertService,
    gitRebaseService: GitRebaseService,
    gitSignatureService: GitSignatureService,
    gitSubmoduleService: GitSubmoduleService,
    gitWorktreeService: GitWorktreeService,
    gitIndexService: GitIndexService,
    currentRepoPath: string
  ) {
    this.gitLogService = gitLogService;
    this.gitDiffService = gitDiffService;
    this.gitBranchService = gitBranchService;
    this.gitRemoteService = gitRemoteService;
    this.gitTagService = gitTagService;
    this.gitStashService = gitStashService;
    this.gitHistoryService = gitHistoryService;
    this.gitCherryPickService = gitCherryPickService;
    this.gitRevertService = gitRevertService;
    this.gitRebaseService = gitRebaseService;
    this.gitSignatureService = gitSignatureService;
    this.gitSubmoduleService = gitSubmoduleService;
    this.gitWorktreeService = gitWorktreeService;
    this.gitIndexService = gitIndexService;
    this.currentRepoPath = currentRepoPath;
    // Invalidate UI state cache so per-repo column layout is reloaded for the new repo
    this.uiStateCache = undefined;
    this.gitHubAvatarService = null;
    this.gitHubAvatarInitialized = false;
    this.lastCommitFingerprint = '';
    this.initialLoadSent = false;
  }

  /** Returns true if the webview panel is currently open */
  isPanelOpen(): boolean {
    return this.panel !== undefined;
  }

  /** Reload all data for the current active repo (use after a repo switch when panel is already open) */
  async reload() {
    await this.sendInitialData();
  }

  /** Trigger a non-disruptive auto-refresh. Drops if already refreshing, defers if panel hidden. */
  async triggerAutoRefresh(): Promise<void> {
    if (!this.isPanelVisible) {
      this.deferredRefresh = true;
      return;
    }
    if (this.isRefreshing) {
      this.pendingRefresh = true;
      return;
    }
    await this.sendInitialData(undefined, true);
  }

  /** Push an updated repo list to the webview */
  sendRepoList(repos: RepoInfo[], activeRepoPath: string) {
    this.postMessage({ type: 'repoList', payload: { repos, activeRepoPath } });
  }

  sendSettingsData(settings: UserSettings) {
    this.postMessage({ type: 'settingsData', payload: { settings } });
  }

  private static readonly UI_STATE_KEY = 'speedyGit.uiState';
  private static readonly MIN_PANEL_SIZE = 120;

  private loadPersistedUIState(): PersistedUIState {
    if (this.uiStateCache) return this.uiStateCache;

    const stored = this.context.globalState.get<unknown>(WebviewProvider.UI_STATE_KEY);
    const defaults = clonePersistedUIStateDefaults();

    if (!stored || typeof stored !== 'object' || stored === null) {
      this.uiStateCache = {
        ...defaults,
        commitTableLayout: cloneCommitTableLayout(this.loadRepoTableLayout()),
      };
      return this.uiStateCache;
    }

    const raw = stored as Record<string, unknown>;

    if (raw.version !== defaults.version) {
      this.uiStateCache = {
        ...defaults,
        commitTableLayout: cloneCommitTableLayout(this.loadRepoTableLayout()),
      };
      return this.uiStateCache;
    }

    this.uiStateCache = {
      version: defaults.version,
      detailsPanelPosition:
        raw.detailsPanelPosition === 'bottom' || raw.detailsPanelPosition === 'right'
          ? raw.detailsPanelPosition
          : defaults.detailsPanelPosition,
      fileViewMode:
        raw.fileViewMode === 'list' || raw.fileViewMode === 'tree'
          ? raw.fileViewMode
          : defaults.fileViewMode,
      bottomPanelHeight:
        typeof raw.bottomPanelHeight === 'number' && isFinite(raw.bottomPanelHeight) && raw.bottomPanelHeight >= WebviewProvider.MIN_PANEL_SIZE
          ? raw.bottomPanelHeight
          : defaults.bottomPanelHeight,
      rightPanelWidth:
        typeof raw.rightPanelWidth === 'number' && isFinite(raw.rightPanelWidth) && raw.rightPanelWidth >= WebviewProvider.MIN_PANEL_SIZE
          ? raw.rightPanelWidth
          : defaults.rightPanelWidth,
      commitListMode:
        isCommitListMode(raw.commitListMode)
          ? raw.commitListMode
          : defaults.commitListMode,
      // Column layout is loaded from per-repo storage, not global state
      commitTableLayout: cloneCommitTableLayout(this.loadRepoTableLayout()),
    };
    return this.uiStateCache;
  }

  /** Load per-repo column table layout from globalState, falling back to defaults. */
  private loadRepoTableLayout(): CommitTableLayout {
    const defaults = clonePersistedUIStateDefaults();
    const key = repoLayoutKey(this.currentRepoPath);
    const stored = this.context.globalState.get<unknown>(key);
    return validateCommitTableLayout(stored, defaults.commitTableLayout);
  }

  /** Save per-repo column table layout to globalState. */
  private saveRepoTableLayout(layout: CommitTableLayout) {
    const key = repoLayoutKey(this.currentRepoPath);
    void this.context.globalState.update(key, cloneCommitTableLayout(layout));
  }

  private savePersistedUIState(partial: Partial<Omit<PersistedUIState, 'version'>>) {
    const current = this.loadPersistedUIState();
    const defaults = clonePersistedUIStateDefaults();

    // Route commitTableLayout to per-repo storage
    if (partial.commitTableLayout !== undefined) {
      const validatedLayout = validateCommitTableLayout(
        partial.commitTableLayout,
        current.commitTableLayout
      );
      this.saveRepoTableLayout(validatedLayout);
      // Update cache with the new layout
      if (this.uiStateCache) {
        this.uiStateCache.commitTableLayout = cloneCommitTableLayout(validatedLayout);
      }
    }

    // Validate and save global-only fields
    const globalValidated: Partial<Omit<PersistedUIState, 'version' | 'commitTableLayout'>> = {
      ...(partial.detailsPanelPosition === 'bottom' || partial.detailsPanelPosition === 'right'
        ? { detailsPanelPosition: partial.detailsPanelPosition }
        : {}),
      ...(partial.fileViewMode === 'list' || partial.fileViewMode === 'tree'
        ? { fileViewMode: partial.fileViewMode }
        : {}),
      ...(typeof partial.bottomPanelHeight === 'number' && isFinite(partial.bottomPanelHeight)
        ? { bottomPanelHeight: Math.max(WebviewProvider.MIN_PANEL_SIZE, partial.bottomPanelHeight) }
        : partial.bottomPanelHeight !== undefined ? { bottomPanelHeight: defaults.bottomPanelHeight } : {}),
      ...(typeof partial.rightPanelWidth === 'number' && isFinite(partial.rightPanelWidth)
        ? { rightPanelWidth: Math.max(WebviewProvider.MIN_PANEL_SIZE, partial.rightPanelWidth) }
        : partial.rightPanelWidth !== undefined ? { rightPanelWidth: defaults.rightPanelWidth } : {}),
      ...(partial.commitListMode !== undefined
        ? {
            commitListMode: isCommitListMode(partial.commitListMode)
              ? partial.commitListMode
              : defaults.commitListMode,
          }
        : {}),
    };

    // Only update global state if there are global fields to save
    if (Object.keys(globalValidated).length > 0) {
      this.uiStateCache = {
        ...current,
        ...globalValidated,
        // Keep the current (possibly just-updated) repo layout in cache
        commitTableLayout: this.uiStateCache?.commitTableLayout
          ? cloneCommitTableLayout(this.uiStateCache.commitTableLayout)
          : cloneCommitTableLayout(current.commitTableLayout),
      };
      // Save global state without commitTableLayout
      const { commitTableLayout: _excluded, ...globalState } = this.uiStateCache;
      void this.context.globalState.update(WebviewProvider.UI_STATE_KEY, globalState);
    }
  }

  async show() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'speedyGit',
      'Speedy Git',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        ],
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      'resources',
      'speedy-git-ext-icon-128.png'
    );

    this.panel.webview.html = this.getWebviewContent(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: RequestMessage) => {
        this.handleMessage(message).catch((error) => {
          this.log.error(`Error handling message: ${message.type} — ${error}`);
          this.postMessage({
            type: 'error',
            payload: { error: { message: String(error) } },
          });
        });
      },
      undefined,
      this.context.subscriptions
    );

    this.isPanelVisible = true;
    this.panel.onDidChangeViewState((e) => {
      this.isPanelVisible = e.webviewPanel.visible;
      if (this.isPanelVisible && this.deferredRefresh) {
        this.deferredRefresh = false;
        void this.triggerAutoRefresh();
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.isPanelVisible = false;
    });

    // Send repo list first so the dropdown is populated before commits arrive
    if (this.gitRepoDiscoveryService) {
      this.sendRepoList(
        this.gitRepoDiscoveryService.getRepos(),
        this.gitRepoDiscoveryService.getActiveRepoPath()
      );
    }

    await this.sendInitialData();
  }

  private computeCommitFingerprint(commits: Commit[]): string {
    if (commits.length === 0) return '';
    return commits.map((c) => c.hash).join(',');
  }

  /** Refresh the VS Code Source Control panel for the current repo without prompting the user.
   * Uses the git extension API directly to target the specific repository by path. */
  private refreshVSCodeSourceControl(): void {
    try {
      const ext = vscode.extensions.getExtension('vscode.git');
      if (!ext?.isActive) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gitApi: any = ext.exports.getAPI(1);
      const repo = gitApi?.getRepository(vscode.Uri.file(this.currentRepoPath));
      if (repo) {
        (repo.status() as Promise<void>).then(undefined, (err: unknown) => {
          this.log.debug(`VS Code git repo.status() failed: ${err}`);
        });
      }
    } catch (err) {
      this.log.debug(`VS Code git refresh failed: ${err}`);
    }
  }

  private async sendInitialData(filters?: Partial<GraphFilters>, isAutoRefresh = false) {
    // Notify VS Code's Source Control panel to refresh after extension-initiated git operations.
    // Skip during auto-refreshes since those are already triggered by VS Code detecting git changes.
    if (!isAutoRefresh) {
      this.refreshVSCodeSourceControl();
    }
    this.isRefreshing = true;
    try {
      // Send persisted UI state first so the webview can hydrate before first render
      const persistedUIState = this.loadPersistedUIState();
      this.postMessage({ type: 'persistedUIState', payload: { uiState: persistedUIState } });

      let effectiveFilters = filters ?? this.currentFilters;
      const settings = this.getSettingsHandler?.();
      if (settings) {
        this.sendSettingsData(settings);
      }

      // Check if the filtered branches still exist before fetching commits
      if (effectiveFilters.branches && effectiveFilters.branches.length > 0) {
        const branchResult = await this.gitLogService.getBranches();
        if (branchResult.success) {
          const branchNames = new Set(
            branchResult.value.flatMap((b) => [b.name, ...(b.remote ? [`${b.remote}/${b.name}`] : [])])
          );
          const validBranches = effectiveFilters.branches.filter((name) => branchNames.has(name));
          if (validBranches.length !== effectiveFilters.branches.length) {
            this.currentFilters = { ...this.currentFilters, branches: validBranches.length > 0 ? validBranches : undefined };
            effectiveFilters = this.currentFilters;
          }
        }
      }

      if (effectiveFilters) {
        this.currentFilters = { ...this.currentFilters, ...effectiveFilters };
      }

      // Only show loading indicator for initial load (not refresh / auto-refresh).
      // During refresh, the current graph stays visible — the toolbar spinner provides feedback.
      const isInitialLoad = !this.initialLoadSent;
      if (isInitialLoad) {
        this.postMessage({ type: 'loading', payload: { loading: true } });
      }

      const batchSize = this.getBatchSize();
      const errors: string[] = [];

      // Fetch all data sources in parallel using Promise.allSettled for partial failure resilience
      const [
        commitsSettled,
        uncommittedSettled,
        branchesSettled,
        authorsSettled,
        remotesSettled,
        submodulesSettled,
        worktreesSettled,
        stashesSettled,
        revertStateSettled,
      ] = await Promise.allSettled([
        this.gitLogService.getCommits({ ...effectiveFilters, maxCount: batchSize }),
        this.gitDiffService.getUncommittedSummary(),
        this.gitLogService.getBranches(),
        this.gitLogService.getAuthors(),
        this.gitRemoteService.getRemotes(),
        this.gitSubmoduleService.getSubmodules(),
        this.gitWorktreeService.listWorktrees(),
        this.gitStashService.getStashes(),
        this.gitRevertService.getRevertState(),
      ]);

      // Extract commits with fingerprint optimization
      let fetchedCommits: Commit[] = [];
      let commitsForPayload: Commit[] | null = [];
      let totalLoadedWithoutFilter = 0;
      let hasMore = true;
      if (commitsSettled.status === 'fulfilled' && commitsSettled.value.success) {
        fetchedCommits = commitsSettled.value.value.commits;
        totalLoadedWithoutFilter = commitsSettled.value.value.totalLoadedWithoutFilter ?? 0;
        hasMore = fetchedCommits.length >= batchSize;

        const fingerprint = this.computeCommitFingerprint(fetchedCommits);
        const commitsUnchanged = isAutoRefresh && fingerprint === this.lastCommitFingerprint;
        this.lastCommitFingerprint = fingerprint;

        commitsForPayload = commitsUnchanged ? null : fetchedCommits;
      } else {
        const reason = commitsSettled.status === 'rejected'
          ? String(commitsSettled.reason)
          : commitsSettled.value.success ? '' : commitsSettled.value.error.message;
        if (reason) errors.push(`commits: ${reason}`);
        commitsForPayload = [];
        hasMore = false;
      }

      // Extract uncommitted changes
      const defaultUncommitted: UncommittedSummary = {
        stagedFiles: [], unstagedFiles: [], conflictFiles: [],
        stagedCount: 0, unstagedCount: 0, untrackedCount: 0,
      };
      let uncommittedChanges = defaultUncommitted;
      if (uncommittedSettled.status === 'fulfilled' && uncommittedSettled.value.success) {
        uncommittedChanges = uncommittedSettled.value.value;
      } else {
        const reason = uncommittedSettled.status === 'rejected'
          ? String(uncommittedSettled.reason)
          : uncommittedSettled.value.success ? '' : uncommittedSettled.value.error.message;
        if (reason) errors.push(`uncommittedChanges: ${reason}`);
      }

      // Extract branches
      let branches: import('../shared/types.js').Branch[] = [];
      if (branchesSettled.status === 'fulfilled' && branchesSettled.value.success) {
        branches = branchesSettled.value.value;
      } else {
        const reason = branchesSettled.status === 'rejected'
          ? String(branchesSettled.reason)
          : branchesSettled.value.success ? '' : branchesSettled.value.error.message;
        if (reason) errors.push(`branches: ${reason}`);
      }

      // Extract authors
      let authors: import('../shared/types.js').Author[] = [];
      if (authorsSettled.status === 'fulfilled' && authorsSettled.value.success) {
        authors = authorsSettled.value.value;
      } else {
        const reason = authorsSettled.status === 'rejected'
          ? String(authorsSettled.reason)
          : authorsSettled.value.success ? '' : authorsSettled.value.error.message;
        if (reason) errors.push(`authors: ${reason}`);
      }

      // Extract remotes
      let remotes: import('../shared/types.js').RemoteInfo[] = [];
      if (remotesSettled.status === 'fulfilled' && remotesSettled.value.success) {
        remotes = remotesSettled.value.value;
      } else {
        const reason = remotesSettled.status === 'rejected'
          ? String(remotesSettled.reason)
          : remotesSettled.value.success ? '' : remotesSettled.value.error.message;
        if (reason) errors.push(`remotes: ${reason}`);
      }

      // Extract submodules
      let submodules: import('../shared/types.js').Submodule[] = [];
      if (submodulesSettled.status === 'fulfilled' && submodulesSettled.value.success) {
        submodules = submodulesSettled.value.value;
      } else {
        const reason = submodulesSettled.status === 'rejected'
          ? String(submodulesSettled.reason)
          : submodulesSettled.value.success ? '' : submodulesSettled.value.error.message;
        if (reason) errors.push(`submodules: ${reason}`);
      }

      // Extract worktrees
      let worktrees: import('../shared/types.js').WorktreeInfo[] = [];
      if (worktreesSettled.status === 'fulfilled' && worktreesSettled.value.success) {
        worktrees = worktreesSettled.value.value;
      } else {
        const reason = worktreesSettled.status === 'rejected'
          ? String(worktreesSettled.reason)
          : worktreesSettled.value.success ? '' : worktreesSettled.value.error.message;
        if (reason) errors.push(`worktrees: ${reason}`);
      }

      // Extract stashes
      let stashes: import('../shared/types.js').StashEntry[] = [];
      if (stashesSettled.status === 'fulfilled') {
        const val = stashesSettled.value;
        if ('success' in val && val.success) {
          stashes = val.value;
        } else if ('success' in val && !val.success) {
          errors.push(`stashes: ${val.error.message}`);
        }
      } else {
        errors.push(`stashes: ${String(stashesSettled.reason)}`);
      }

      // Extract revert state
      let revertState: import('../shared/types.js').RevertState = 'idle';
      if (revertStateSettled.status === 'fulfilled' && revertStateSettled.value.success) {
        revertState = revertStateSettled.value.value;
      } else {
        const reason = revertStateSettled.status === 'rejected'
          ? String(revertStateSettled.reason)
          : revertStateSettled.value.success ? '' : revertStateSettled.value.error.message;
        if (reason) errors.push(`revertState: ${reason}`);
      }

      // Cherry-pick and rebase state checks are synchronous (fs.existsSync)
      let cherryPickState: import('../shared/types.js').CherryPickState = 'idle';
      const cherryPickStateResult = this.gitCherryPickService.getCherryPickState();
      if (cherryPickStateResult.success) {
        cherryPickState = cherryPickStateResult.value;
      }

      let rebaseState: import('../shared/types.js').RebaseState = 'idle';
      let rebaseConflictInfo: import('../shared/types.js').RebaseConflictInfo | null = null;
      const rebaseStateResult = this.gitRebaseService.getRebaseState();
      if (rebaseStateResult.success) {
        rebaseState = rebaseStateResult.value.state;
        if (rebaseState === 'in-progress') {
          const conflictResult = await this.gitRebaseService.getConflictInfo();
          rebaseConflictInfo = conflictResult.success
            ? conflictResult.value
            : rebaseStateResult.value.conflictInfo ?? null;
        }
      }

      // Build and send the batched payload
      const payload: InitialDataPayload = {
        commits: commitsForPayload,
        totalLoadedWithoutFilter,
        hasMore,
        branches,
        stashes,
        uncommittedChanges,
        remotes,
        authors,
        worktrees,
        submodules,
        submoduleStack: this.submoduleHandlers?.getStack() ?? [],
        cherryPickState,
        rebaseState,
        rebaseConflictInfo,
        revertState,
        errors,
      };

      this.postMessage({ type: 'initialData', payload });

      if (isInitialLoad) {
        this.postMessage({ type: 'loading', payload: { loading: false } });
        this.initialLoadSent = true;
      }

      // Fetch GitHub avatars in background (non-blocking), skip if avatars disabled
      if (settings?.avatarsEnabled !== false && fetchedCommits.length > 0) {
        void this.fetchAndSendGitHubAvatars(fetchedCommits);
      }
    } finally {
      this.isRefreshing = false;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.triggerAutoRefresh();
      }
    }
  }

  /** Initialize GitHubAvatarService lazily from remote URL, then fetch avatar URLs for the given commits */
  private async fetchAndSendGitHubAvatars(commits: Commit[]) {
    if (!this.gitHubAvatarInitialized) {
      this.gitHubAvatarInitialized = true;
      const remotesResult = await this.gitRemoteService.getRemotes();
      if (remotesResult.success) {
        const origin = remotesResult.value.find((r) => r.name === 'origin');
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
      this.postMessage({ type: 'avatarUrls', payload: { urls: avatarResult.value } });
    }
  }

  private async sendSubmodulesData() {
    const result = await this.gitSubmoduleService.getSubmodules();
    if (result.success) {
      this.postMessage({
        type: 'submodulesData',
        payload: {
          submodules: result.value,
          stack: this.submoduleHandlers?.getStack() ?? [],
        },
      });
    } else {
      this.postMessage({ type: 'error', payload: { error: result.error } });
    }
  }

  private async handleMessage(message: RequestMessage) {
    this.log.debug(`Received message: ${message.type}`);
    switch (message.type) {
      case 'getAuthors': {
        const result = await this.gitLogService.getAuthors();
        if (result.success) {
          this.postMessage({ type: 'authorList', payload: { authors: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'getCommits': {
        if (message.payload.filters) {
          this.currentFilters = { maxCount: this.currentFilters.maxCount, ...message.payload.filters };
        }
        this.postMessage({ type: 'loading', payload: { loading: true } });
        const batchSize = this.getBatchSize();
        const result = await this.gitLogService.getCommits({ ...message.payload.filters, maxCount: batchSize });
        if (result.success) {
          this.postMessage({
            type: 'commits',
            payload: {
              commits: result.value.commits,
              totalLoadedWithoutFilter: result.value.totalLoadedWithoutFilter,
            },
          });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        this.postMessage({ type: 'loading', payload: { loading: false } });
        break;
      }
      case 'loadMoreCommits': {
        const batchSize = this.getBatchSize();
        const { skip, generation, filters } = message.payload;
        const result = await this.gitLogService.getCommits({ ...filters, maxCount: batchSize, skip });
        if (result.success) {
          this.postMessage({
            type: 'commitsAppended',
            payload: {
              commits: result.value.commits,
              hasMore: result.value.commits.length >= batchSize,
              generation,
              totalLoadedWithoutFilter: result.value.totalLoadedWithoutFilter,
            },
          });
        } else {
          this.postMessage({ type: 'prefetchError', payload: { error: result.error } });
          vscode.window.showErrorMessage('Failed to load commits', 'Retry').then(async (choice) => {
            if (choice !== 'Retry') return;
            const retryResult = await this.gitLogService.getCommits({ ...filters, maxCount: batchSize, skip });
            if (retryResult.success) {
              this.postMessage({
                type: 'commitsAppended',
                payload: {
                  commits: retryResult.value.commits,
                  hasMore: retryResult.value.commits.length >= batchSize,
                  generation,
                  totalLoadedWithoutFilter: retryResult.value.totalLoadedWithoutFilter,
                },
              });
            } else {
              this.postMessage({ type: 'prefetchError', payload: { error: retryResult.error } });
            }
          });
        }
        break;
      }
      case 'openSettings': {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'speedyGit');
        break;
      }
      case 'getSettings': {
        const settings = this.getSettingsHandler?.();
        if (settings) {
          this.sendSettingsData(settings);
        }
        break;
      }
      case 'getSubmodules': {
        await this.sendSubmodulesData();
        break;
      }
      case 'getBranches': {
        const result = await this.gitLogService.getBranches();
        if (result.success) {
          this.postMessage({ type: 'branches', payload: { branches: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'getCommitDetails': {
        if (message.payload.hash === UNCOMMITTED_HASH) {
          const [summaryResult, headHash] = await Promise.all([
            this.gitDiffService.getUncommittedSummary(),
            this.getHeadHash(),
          ]);
          if (summaryResult.success) {
            const { stagedFiles, unstagedFiles, conflictFiles, stagedCount, unstagedCount, untrackedCount } = summaryResult.value;
            const files = [...stagedFiles, ...unstagedFiles, ...conflictFiles];
            const details = {
              hash: UNCOMMITTED_HASH,
              abbreviatedHash: '---',
              parents: headHash ? [headHash] : [],
              author: '---',
              authorEmail: '',
              authorDate: Date.now(),
              committer: '---',
              committerEmail: '',
              committerDate: Date.now(),
              subject: buildUncommittedSubject(stagedCount, unstagedCount, untrackedCount),
              body: '',
              files,
              stats: files.reduce((acc, f) => ({
                additions: acc.additions + (f.additions ?? 0),
                deletions: acc.deletions + (f.deletions ?? 0),
              }), { additions: 0, deletions: 0 }),
            };
            this.postMessage({ type: 'commitDetails', payload: { details } });
            this.postMessage({ type: 'uncommittedChanges', payload: summaryResult.value });
          } else {
            this.postMessage({ type: 'error', payload: { error: summaryResult.error } });
          }
          break;
        }
        const result = await this.gitDiffService.getCommitDetails(message.payload.hash);
        if (result.success) {
          this.postMessage({ type: 'commitDetails', payload: { details: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'checkoutBranch': {
        const checkoutResult = await this.gitBranchService.checkout(message.payload.name, message.payload.remote);
        if (!checkoutResult.success) {
          if (isCheckoutConflict(checkoutResult.error)) {
            this.postMessage({ type: 'checkoutNeedsStash', payload: { name: message.payload.name, pull: message.payload.pull } });
            break;
          }
          this.postMessage({ type: 'error', payload: { error: checkoutResult.error } });
          break;
        }
        if (message.payload.pull) {
          const pullResult = await this.gitRemoteService.pull();
          if (!pullResult.success) {
            this.postMessage({ type: 'checkoutPullFailed', payload: { branch: message.payload.name, error: { message: pullResult.error.message } } });
            await this.sendInitialData();
            break;
          }
        }
        this.postMessage({ type: 'success', payload: { message: checkoutResult.value } });
        await this.sendInitialData();
        break;
      }
      case 'checkoutCommit': {
        const checkoutResult = await this.gitBranchService.checkoutCommit(message.payload.hash);
        if (!checkoutResult.success) {
          if (isCheckoutConflict(checkoutResult.error)) {
            this.postMessage({ type: 'checkoutCommitNeedsStash', payload: { hash: message.payload.hash } });
            break;
          }
          this.postMessage({ type: 'error', payload: { error: checkoutResult.error } });
          void vscode.window.showErrorMessage(checkoutResult.error.message);
          break;
        }
        this.postMessage({ type: 'success', payload: { message: checkoutResult.value } });
        await this.sendInitialData();
        break;
      }
      case 'stashAndCheckout': {
        const stashResult = await this.gitStashService.stash();
        if (!stashResult.success) {
          this.postMessage({ type: 'error', payload: { error: stashResult.error } });
          break;
        }
        const checkoutAfterStash = await this.gitBranchService.checkout(message.payload.name, message.payload.remote);
        if (!checkoutAfterStash.success) {
          this.postMessage({ type: 'error', payload: { error: checkoutAfterStash.error } });
          break;
        }
        if (message.payload.pull) {
          const pullAfterStash = await this.gitRemoteService.pull();
          if (!pullAfterStash.success) {
            this.postMessage({ type: 'checkoutPullFailed', payload: { branch: message.payload.name, error: { message: pullAfterStash.error.message } } });
            await this.sendInitialData();
            break;
          }
        }
        this.postMessage({ type: 'success', payload: { message: checkoutAfterStash.value } });
        await this.sendInitialData();
        break;
      }
      case 'stashAndCheckoutCommit': {
        const stashResult = await this.gitStashService.stash();
        if (!stashResult.success) {
          this.postMessage({ type: 'error', payload: { error: stashResult.error } });
          break;
        }
        const checkoutAfterStash = await this.gitBranchService.checkoutCommit(message.payload.hash);
        if (!checkoutAfterStash.success) {
          this.postMessage({ type: 'error', payload: { error: checkoutAfterStash.error } });
          break;
        }
        this.postMessage({ type: 'success', payload: { message: checkoutAfterStash.value } });
        await this.sendInitialData();
        break;
      }
      case 'fetch': {
        if (message.payload.filters) {
          this.currentFilters = { maxCount: this.currentFilters.maxCount, ...message.payload.filters };
        }
        const result = await this.gitBranchService.fetch(
          message.payload.remote,
          message.payload.prune
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData(message.payload.filters);
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'copyToClipboard': {
        await vscode.env.clipboard.writeText(message.payload.text);
        this.postMessage({ type: 'success', payload: { message: 'Copied to clipboard' } });
        break;
      }
      case 'openDiff': {
        await this.openDiffEditor(message.payload.hash, message.payload.filePath, message.payload.parentHash, message.payload.status);
        break;
      }
      case 'openFile': {
        await this.openFileAtRevision(message.payload.hash, message.payload.filePath);
        break;
      }
      case 'openCurrentFile': {
        await this.openCurrentFile(message.payload.filePath);
        break;
      }
      case 'getWorktreeList': {
        const result = await this.gitWorktreeService.listWorktrees();
        this.postMessage({
          type: 'worktreeList',
          payload: { worktrees: result.success ? result.value : [] },
        });
        break;
      }
      case 'getContainingBranches': {
        const executor = new GitExecutor(this.log);
        const result = await executor.execute({
          args: ['branch', '-a', '--contains', message.payload.hash, '--format=%(refname:short)'],
          cwd: this.currentRepoPath,
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
        this.postMessage({
          type: 'containingBranches',
          payload: { hash: message.payload.hash, branches, status },
        });
        break;
      }
      case 'openExternal': {
        await vscode.env.openExternal(vscode.Uri.parse(message.payload.url));
        break;
      }
      case 'updatePersistedUIState': {
        this.savePersistedUIState(message.payload.uiState);
        break;
      }
      case 'refresh': {
        if (message.payload.filters) {
          this.currentFilters = { maxCount: this.currentFilters.maxCount, ...message.payload.filters };
        }
        await this.sendInitialData(message.payload.filters);
        break;
      }
      // Branch ops
      case 'createBranch': {
        const result = await this.gitBranchService.createBranch(
          message.payload.name,
          message.payload.startPoint
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'renameBranch': {
        const result = await this.gitBranchService.renameBranch(
          message.payload.oldName,
          message.payload.newName
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'deleteBranch': {
        const result = await this.gitBranchService.deleteBranch(
          message.payload.name,
          message.payload.force
        );
        if (result.success) {
          // If remote deletion was also requested, attempt it after successful local delete
          if (message.payload.deleteRemote) {
            const remoteResult = await this.gitBranchService.deleteRemoteBranch(
              message.payload.deleteRemote.remote,
              message.payload.deleteRemote.name
            );
            if (!remoteResult.success) {
              this.postMessage({ type: 'error', payload: { error: { message: `Local branch deleted. Remote deletion failed: ${remoteResult.error.message}` } } });
              await this.sendInitialData();
              break;
            }
          }
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else if (result.error.code === 'BRANCH_NOT_FULLY_MERGED' && !message.payload.force) {
          this.postMessage({ type: 'deleteBranchNeedsForce', payload: { name: message.payload.name, deleteRemote: message.payload.deleteRemote } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'deleteRemoteBranch': {
        const result = await this.gitBranchService.deleteRemoteBranch(
          message.payload.remote,
          message.payload.name
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'mergeBranch': {
        const result = await this.gitBranchService.merge(
          message.payload.branch,
          message.payload.noFastForward,
          message.payload.squash,
          message.payload.noCommit
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      // Remote ops
      case 'push': {
        const result = await this.gitRemoteService.push(
          message.payload.remote,
          message.payload.branch,
          message.payload.setUpstream,
          message.payload.forceMode
        );
        if (result.success) {
          this.postMessage({ type: 'pushResult', payload: { success: true, message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'pushResult', payload: { success: false, message: result.error.message } });
        }
        break;
      }
      case 'pull': {
        const result = await this.gitRemoteService.pull(
          message.payload.remote,
          message.payload.branch,
          message.payload.rebase
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'getRemotes': {
        const result = await this.gitRemoteService.getRemotes();
        if (result.success) {
          this.postMessage({ type: 'remotes', payload: { remotes: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'addRemote': {
        const result = await this.gitRemoteService.addRemote(
          message.payload.name,
          message.payload.url
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.gitBranchService.fetch(message.payload.name);
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'removeRemote': {
        const result = await this.gitRemoteService.removeRemote(message.payload.name);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'editRemote': {
        const result = await this.gitRemoteService.editRemote(
          message.payload.name,
          message.payload.newUrl
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      // Tag ops
      case 'createTag': {
        const result = await this.gitTagService.createTag(
          message.payload.name,
          message.payload.hash,
          message.payload.message
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'deleteTag': {
        const result = await this.gitTagService.deleteTag(message.payload.name);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'pushTag': {
        const result = await this.gitTagService.pushTag(
          message.payload.name,
          message.payload.remote
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      // Stash ops
      case 'getStashes': {
        const result = await this.gitStashService.getStashes();
        if (result.success) {
          this.postMessage({ type: 'stashes', payload: { stashes: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'applyStash': {
        const result = await this.gitStashService.applyStash(message.payload.index);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'popStash': {
        const result = await this.gitStashService.popStash(message.payload.index);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'dropStash': {
        const result = await this.gitStashService.dropStash(message.payload.index);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      // History ops
      case 'resetBranch': {
        const result = await this.gitHistoryService.reset(
          message.payload.hash,
          message.payload.mode
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      // Cherry-pick ops
      case 'cherryPick': {
        const result = await this.gitCherryPickService.cherryPick(
          message.payload.hashes,
          message.payload.options
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
          this.postMessage({ type: 'cherryPickState', payload: { state: 'idle' } });
        } else if (result.error.code === 'CHERRY_PICK_CONFLICT') {
          this.postMessage({ type: 'error', payload: { error: result.error } });
          this.postMessage({ type: 'cherryPickState', payload: { state: 'in-progress' } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'abortCherryPick': {
        const result = await this.gitCherryPickService.abortCherryPick();
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
          this.postMessage({ type: 'cherryPickState', payload: { state: 'idle' } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'continueCherryPick': {
        const result = await this.gitCherryPickService.continueCherryPick();
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
          this.postMessage({ type: 'cherryPickState', payload: { state: 'idle' } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
          this.postMessage({ type: 'cherryPickState', payload: { state: 'in-progress' } });
        }
        break;
      }
      case 'getCommitParents': {
        const parentsResult = await this.gitHistoryService.getCommitParents(message.payload.hashes);
        if (parentsResult.success) {
          this.postMessage({ type: 'commitParents', payload: { parents: parentsResult.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: parentsResult.error } });
        }
        break;
      }
      case 'revert': {
        const operationError = await this.getOperationInProgressError();
        if (operationError) {
          this.postMessage({ type: 'error', payload: { error: operationError } });
          this.postMessage({ type: 'revertState', payload: { state: 'idle' } });
          break;
        }
        const result = await this.gitRevertService.revert(message.payload.hash, message.payload.mainlineParent);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
          this.postMessage({ type: 'revertState', payload: { state: 'idle' } });
        } else if (result.error.code === 'REVERT_CONFLICT') {
          this.postMessage({ type: 'error', payload: { error: result.error } });
          this.postMessage({ type: 'revertState', payload: { state: 'in-progress' } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
          this.postMessage({ type: 'revertState', payload: { state: 'idle' } });
        }
        break;
      }
      case 'continueRevert': {
        const result = await this.gitRevertService.continueRevert();
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
          this.postMessage({ type: 'revertState', payload: { state: 'idle' } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
          this.postMessage({ type: 'revertState', payload: { state: 'in-progress' } });
        }
        break;
      }
      case 'abortRevert': {
        const result = await this.gitRevertService.abortRevert();
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
          this.postMessage({ type: 'revertState', payload: { state: 'idle' } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      // Rebase ops
      case 'rebase': {
        const dirtyCheck = await this.gitRebaseService.isDirtyWorkingTree();
        if (!dirtyCheck.success) {
          this.postMessage({ type: 'error', payload: { error: dirtyCheck.error } });
          this.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
          break;
        }
        if (dirtyCheck.value) {
          this.postMessage({ type: 'error', payload: { error: { message: 'Working tree has uncommitted changes. Commit, stash, or discard them before rebasing.' } } });
          this.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
          break;
        }
        const rebaseResult = await this.gitRebaseService.rebase(message.payload.targetRef, message.payload.ignoreDate);
        if (rebaseResult.success) {
          this.postMessage({ type: 'success', payload: { message: rebaseResult.value } });
          await this.sendInitialData();
          this.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
        } else if (rebaseResult.error.code === 'REBASE_CONFLICT') {
          this.postMessage({ type: 'error', payload: { error: rebaseResult.error } });
          const conflictInfo = await this.gitRebaseService.getConflictInfo();
          this.postMessage({ type: 'rebaseState', payload: { state: 'in-progress', conflictInfo: conflictInfo.success ? conflictInfo.value : undefined } });
        } else {
          this.postMessage({ type: 'error', payload: { error: rebaseResult.error } });
          this.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
        }
        break;
      }
      case 'interactiveRebase': {
        const dirtyCheckIR = await this.gitRebaseService.isDirtyWorkingTree();
        if (!dirtyCheckIR.success) {
          this.postMessage({ type: 'error', payload: { error: dirtyCheckIR.error } });
          this.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
          break;
        }
        if (dirtyCheckIR.value) {
          this.postMessage({ type: 'error', payload: { error: { message: 'Working tree has uncommitted changes. Commit, stash, or discard them before rebasing.' } } });
          this.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
          break;
        }
        const iRebaseResult = await this.gitRebaseService.interactiveRebase(message.payload.config);
        if (iRebaseResult.success) {
          this.postMessage({ type: 'success', payload: { message: iRebaseResult.value } });
          await this.sendInitialData();
          this.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
        } else if (iRebaseResult.error.code === 'REBASE_CONFLICT') {
          this.postMessage({ type: 'error', payload: { error: iRebaseResult.error } });
          const conflictInfo = await this.gitRebaseService.getConflictInfo();
          this.postMessage({ type: 'rebaseState', payload: { state: 'in-progress', conflictInfo: conflictInfo.success ? conflictInfo.value : undefined } });
        } else {
          this.postMessage({ type: 'error', payload: { error: iRebaseResult.error } });
          this.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
        }
        break;
      }
      case 'getRebaseCommits': {
        const dirtyCheckRC = await this.gitRebaseService.isDirtyWorkingTree();
        if (!dirtyCheckRC.success) {
          this.postMessage({ type: 'error', payload: { error: dirtyCheckRC.error } });
          break;
        }
        if (dirtyCheckRC.value) {
          this.postMessage({ type: 'error', payload: { error: { message: 'Working tree has uncommitted changes. Commit, stash, or discard them before rebasing.' } } });
          break;
        }
        const commitsResult = await this.gitRebaseService.getRebaseCommits(message.payload.baseHash);
        if (commitsResult.success) {
          this.postMessage({ type: 'rebaseCommits', payload: { entries: commitsResult.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: commitsResult.error } });
        }
        break;
      }
      case 'abortRebase': {
        const abortResult = await this.gitRebaseService.abortRebase();
        if (abortResult.success) {
          this.postMessage({ type: 'success', payload: { message: abortResult.value } });
          await this.sendInitialData();
          this.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
        } else {
          this.postMessage({ type: 'error', payload: { error: abortResult.error } });
        }
        break;
      }
      case 'continueRebase': {
        const continueResult = await this.gitRebaseService.continueRebase();
        if (continueResult.success) {
          this.postMessage({ type: 'success', payload: { message: continueResult.value } });
          await this.sendInitialData();
          this.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
        } else if (continueResult.error.code === 'REBASE_CONFLICT') {
          this.postMessage({ type: 'error', payload: { error: continueResult.error } });
          const conflictInfo = await this.gitRebaseService.getConflictInfo();
          this.postMessage({ type: 'rebaseState', payload: { state: 'in-progress', conflictInfo: conflictInfo.success ? conflictInfo.value : undefined } });
        } else {
          this.postMessage({ type: 'error', payload: { error: continueResult.error } });
        }
        break;
      }
      case 'getSignatureInfo': {
        const result = await this.gitSignatureService.getSignatureInfo(message.payload.hash);
        if (result.success) {
          this.postMessage({
            type: 'signatureInfo',
            payload: { hash: message.payload.hash, signature: result.value },
          });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
          this.postMessage({
            type: 'signatureInfo',
            payload: {
              hash: message.payload.hash,
              signature: {
                status: 'unknown',
                signer: '',
                keyId: '',
                fingerprint: '',
                format: 'gpg',
                verificationUnavailable: true,
              },
            },
          });
        }
        break;
      }
      case 'isCommitPushed': {
        const result = await this.gitHistoryService.isCommitPushed(message.payload.hash);
        if (result.success) {
          this.postMessage({
            type: 'commitPushedResult',
            payload: { hash: message.payload.hash, pushed: result.value },
          });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'dropCommit': {
        const operationError = await this.getOperationInProgressError();
        if (operationError) {
          this.postMessage({ type: 'error', payload: { error: operationError } });
          break;
        }

        const dirtyCheck = await this.gitRebaseService.isDirtyWorkingTree();
        if (!dirtyCheck.success) {
          this.postMessage({ type: 'error', payload: { error: dirtyCheck.error } });
          break;
        }
        if (dirtyCheck.value) {
          this.postMessage({ type: 'error', payload: { error: { message: 'Working tree has uncommitted changes. Commit, stash, or discard them before dropping a commit.' } } });
          break;
        }

        const dropBaseHash = `${message.payload.hash}~1`;
        const commitsResult = await this.gitRebaseService.getRebaseCommits(dropBaseHash);
        if (!commitsResult.success) {
          this.postMessage({ type: 'error', payload: { error: commitsResult.error } });
          break;
        }

        const entries = commitsResult.value.map((entry) => ({
          ...entry,
          action: (entry.hash === message.payload.hash ? 'drop' : 'pick') as import('../shared/types.js').RebaseAction,
        }));
        const result = await this.gitRebaseService.interactiveRebase({
          baseHash: dropBaseHash,
          entries,
          squashMessages: [],
        });
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: `Dropped ${message.payload.hash.slice(0, 7)} from the current branch.` } });
          await this.sendInitialData();
          this.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
        } else if (result.error.code === 'REBASE_CONFLICT') {
          this.postMessage({ type: 'error', payload: { error: result.error } });
          const conflictInfo = await this.gitRebaseService.getConflictInfo();
          this.postMessage({ type: 'rebaseState', payload: { state: 'in-progress', conflictInfo: conflictInfo.success ? conflictInfo.value : undefined } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'openSubmodule': {
        if (this.submoduleHandlers) {
          await this.submoduleHandlers.openSubmodule(message.payload.submodulePath);
          await this.sendInitialData();
        }
        break;
      }
      case 'backToParentRepo': {
        if (this.submoduleHandlers) {
          await this.submoduleHandlers.backToParentRepo();
          await this.sendInitialData();
        }
        break;
      }
      case 'updateSubmodule': {
        const result = await this.gitSubmoduleService.updateSubmodule(message.payload.submodulePath);
        if (result.success) {
          this.postMessage({ type: 'submoduleOperationResult', payload: { success: true } });
          await this.sendInitialData();
        } else {
          this.postMessage({
            type: 'submoduleOperationResult',
            payload: { success: false, error: result.error.message },
          });
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'initSubmodule': {
        const result = await this.gitSubmoduleService.initSubmodule(message.payload.submodulePath);
        if (result.success) {
          this.postMessage({ type: 'submoduleOperationResult', payload: { success: true } });
          await this.sendInitialData();
        } else {
          this.postMessage({
            type: 'submoduleOperationResult',
            payload: { success: false, error: result.error.message },
          });
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'switchRepo': {
        const { repoPath } = message.payload;
        const discovery = this.gitRepoDiscoveryService;
        if (!discovery) break;

        const knownRepo = discovery.getRepos().find((r) => r.path === repoPath);
        if (!knownRepo) {
          this.postMessage({ type: 'error', payload: { error: { message: `Repository not found: ${repoPath}` } } });
          break;
        }

        this.fetchGeneration++;
        const currentGeneration = this.fetchGeneration;

        // Repo switches reset branch filtering in the webview, so clear the
        // backend's remembered filters before reloading commits.
        this.currentFilters = { maxCount: this.currentFilters.maxCount };

        // Reinitialize services and clear submodule stack for the new repo
        // (switchActiveRepo also calls discovery.setActiveRepo internally)
        this.onSwitchRepo?.(repoPath);

        // Send updated repo list immediately so the dropdown reflects the switch
        this.sendRepoList(discovery.getRepos(), discovery.getActiveRepoPath());
        if (currentGeneration !== this.fetchGeneration) {
          break;
        }
        await this.sendInitialData();
        break;
      }
      case 'getUncommittedChanges': {
        const result = await this.gitDiffService.getUncommittedSummary();
        if (result.success) {
          this.postMessage({ type: 'uncommittedChanges', payload: result.value });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'stageFiles': {
        await this.handleIndexMutation(this.gitIndexService.stageFiles(message.payload.paths));
        break;
      }
      case 'unstageFiles': {
        await this.handleIndexMutation(this.gitIndexService.unstageFiles(message.payload.paths));
        break;
      }
      case 'stageAll': {
        await this.handleIndexMutation(this.gitIndexService.stageAll());
        break;
      }
      case 'unstageAll': {
        await this.handleIndexMutation(this.gitIndexService.unstageAll());
        break;
      }
      case 'discardFiles': {
        await this.handleIndexMutation(this.gitIndexService.discardFiles(message.payload.paths, message.payload.includeUntracked));
        break;
      }
      case 'discardAllUnstaged': {
        await this.handleIndexMutation(this.gitIndexService.discardAllUnstaged());
        break;
      }
      case 'stashWithMessage': {
        const result = await this.gitStashService.stashWithMessage(
          message.payload.message,
          message.payload.paths
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'stashSelected': {
        const result = await this.gitStashService.stashSelected(
          message.payload.message,
          message.payload.paths,
          message.payload.addUntrackedFirst
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'getConflictState': {
        const result = await this.gitDiffService.getUncommittedSummary();
        if (result.success) {
          const { conflictFiles, conflictType } = result.value;
          this.postMessage({
            type: 'conflictState',
            payload: {
              inConflict: conflictFiles.length > 0,
              conflictType,
              conflictFiles: conflictFiles.map(f => f.path),
            },
          });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'openStagedDiff': {
        await this.openStagedDiffEditor(message.payload.filePath);
        break;
      }
    }
  }

  private async getHeadHash(): Promise<string> {
    const result = await this.gitLogService.getCommits({ maxCount: 1 });
    return result.success && result.value.commits.length > 0
      ? result.value.commits[0].hash
      : '';
  }

  /** Handle an index mutation (stage/unstage/discard) — only refreshes uncommitted data, not the full graph. */
  private async handleIndexMutation(resultPromise: Promise<Result<string, GitError>>): Promise<void> {
    const result = await resultPromise;
    if (result.success) {
      this.postMessage({ type: 'success', payload: { message: result.value } });
      await this.handleMessage({ type: 'getUncommittedChanges', payload: {} });
    } else {
      this.postMessage({ type: 'error', payload: { error: result.error } });
    }
  }

  private async openDiffEditor(hash: string, filePath: string, parentHash?: string, status?: FileChangeStatus) {
    if (hash === UNCOMMITTED_HASH) {
      const fileName = filePath.split('/').pop() ?? filePath;
      const absolutePath = path.join(this.currentRepoPath, filePath);

      if (status === 'untracked') {
        // Untracked file: empty left side, working tree file on right
        const leftUri = vscode.Uri.parse(`untitled:${fileName}`);
        const rightUri = vscode.Uri.file(absolutePath);
        const title = `${filePath} (Untracked)`;
        try {
          await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
        } catch {
          this.log.warn(`Diff editor failed for untracked file: ${filePath}`);
        }
      } else if (status === 'deleted') {
        // Deleted file: HEAD version on left, empty right side
        const headHash = await this.getHeadHash();
        if (!headHash) {
          this.log.warn(`Cannot resolve HEAD for diff: ${filePath}`);
          return;
        }
        const leftUri = vscode.Uri.from({ scheme: 'git-show', authority: headHash, path: `/${headHash.slice(0, 8)}: ${fileName}`, query: filePath });
        const rightUri = vscode.Uri.parse(`untitled:${fileName}`);
        const title = `${filePath} (Deleted)`;
        try {
          await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
        } catch {
          this.log.warn(`Diff editor failed for deleted file: ${filePath}`);
        }
      } else {
        // Tracked file (modified, added, renamed, copied): HEAD version on left, working tree on right
        const headHash = await this.getHeadHash();
        if (!headHash) {
          this.log.warn(`Cannot resolve HEAD for diff: ${filePath}`);
          return;
        }
        const leftUri = vscode.Uri.from({ scheme: 'git-show', authority: headHash, path: `/${headHash.slice(0, 8)}: ${fileName}`, query: filePath });
        const rightUri = vscode.Uri.file(absolutePath);
        const title = `${filePath} (Working Tree)`;
        try {
          await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
        } catch {
          this.log.warn(`Diff editor failed for uncommitted file: ${filePath}`);
        }
      }
      return;
    }

    const parent = parentHash ?? `${hash}~1`;
    const fileName = filePath.split('/').pop() ?? filePath;
    const leftUri = vscode.Uri.from({ scheme: 'git-show', authority: parent, path: `/${parent.slice(0, 8)}: ${fileName}`, query: filePath });
    const rightUri = vscode.Uri.from({ scheme: 'git-show', authority: hash, path: `/${hash.slice(0, 8)}: ${fileName}`, query: filePath });

    const title = `${filePath} (${hash.slice(0, 7)})`;

    try {
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
    } catch {
      this.log.warn(`Diff editor failed, falling back to file view: ${filePath}`);
      await this.openFileAtRevision(hash, filePath);
    }
  }

  private async openStagedDiffEditor(filePath: string) {
    const fileName = filePath.split('/').pop() ?? filePath;
    const headHash = await this.getHeadHash();
    if (!headHash) {
      this.log.warn(`Cannot resolve HEAD for staged diff: ${filePath}`);
      return;
    }
    // Left: HEAD version, Right: staged (index) version.
    // The right-side URI uses the sentinel authority "staged" which the content
    // provider resolves via `git show :<path>` to return the index content.
    const leftUri = vscode.Uri.from({
      scheme: 'git-show',
      authority: headHash,
      path: `/${headHash.slice(0, 8)}: ${fileName}`,
      query: filePath,
    });
    const rightUri = vscode.Uri.from({
      scheme: 'git-show',
      authority: 'staged',
      path: `/Staged: ${fileName}`,
      query: filePath,
    });
    const title = `${filePath} (Staged)`;
    try {
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
    } catch {
      this.log.warn(`Staged diff editor failed: ${filePath}`);
    }
  }

  private async openFileAtRevision(hash: string, filePath: string) {
    // URI structure:
    //   authority = full hash (for content lookup)
    //   path = /{hashPrefix}: {filename} (for VS Code tab title display, like Git Graph)
    //   query = original file path (for actual git show lookup)
    const shortHash = hash.slice(0, 8);
    const fileName = filePath.split('/').pop() ?? filePath;
    const uri = vscode.Uri.from({
      scheme: 'git-show',
      authority: hash,
      path: `/${shortHash}: ${fileName}`,
      query: filePath,
    });

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch (err) {
      this.log.warn(`openFileAtRevision failed for ${filePath}@${hash.slice(0, 7)}: ${err}`);
      vscode.window.showWarningMessage(`Could not open ${filePath} at revision ${hash.slice(0, 7)}`);
    }
  }

  private async openCurrentFile(filePath: string) {
    const resolvedPath = this.resolveWorkspaceFilePath(filePath);
    if (!resolvedPath) return;

    const uri = vscode.Uri.file(resolvedPath);

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch {
      vscode.window.showWarningMessage(`Could not open ${filePath} — file may not exist`);
    }
  }

  private getWorkspacePath(): string | undefined {
    if (this.currentRepoPath) {
      return this.currentRepoPath;
    }
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath;
  }

  private resolveWorkspaceFilePath(filePath: string): string | undefined {
    const workspacePath = this.getWorkspacePath();
    if (!workspacePath) {
      return undefined;
    }

    const resolvedPath = path.resolve(workspacePath, filePath);
    const relativePath = path.relative(workspacePath, resolvedPath);
    const isOutsideWorkspace = !relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath);
    if (isOutsideWorkspace) {
      return undefined;
    }

    return resolvedPath;
  }

  private async getOperationInProgressError(): Promise<GitError | null> {
    const rebaseState = this.gitRebaseService.getRebaseState();
    if (rebaseState.success && rebaseState.value.state === 'in-progress') {
      return new GitError('Another git operation is already in progress (rebase). Finish it before starting this action.', 'OPERATION_IN_PROGRESS');
    }

    const cherryPickState = this.gitCherryPickService.getCherryPickState();
    if (cherryPickState.success && cherryPickState.value === 'in-progress') {
      return new GitError('Another git operation is already in progress (cherry-pick). Finish it before starting this action.', 'OPERATION_IN_PROGRESS');
    }

    const revertState = await this.gitRevertService.getRevertState();
    if (revertState.success && revertState.value === 'in-progress') {
      return new GitError('Another git operation is already in progress (revert). Finish it before starting this action.', 'OPERATION_IN_PROGRESS');
    }

    const mergeHeadCheck = await this.gitLogService.verifyRef('MERGE_HEAD');
    if (mergeHeadCheck.success && mergeHeadCheck.value) {
      return new GitError('Another git operation is already in progress (merge). Finish it before starting this action.', 'OPERATION_IN_PROGRESS');
    }

    return null;
  }

  private postMessage(message: ResponseMessage) {
    this.panel?.webview.postMessage(message);
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'index.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src https://www.gravatar.com https://secure.gravatar.com https://avatars.githubusercontent.com;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Speedy Git</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getBatchSize(): number {
    return this.getSettingsHandler?.().batchCommitSize
      ?? vscode.workspace.getConfiguration('speedyGit').get<number>('batchCommitSize', 500);
  }

  dispose() {
    this.panel?.dispose();
    this.panel = undefined;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

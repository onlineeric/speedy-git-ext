import * as vscode from 'vscode';
import * as path from 'path';
import type { RequestMessage, ResponseMessage } from '../shared/messages.js';
import type { Commit, GraphFilters, RepoInfo, SubmoduleNavEntry, UserSettings } from '../shared/types.js';
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
import type { GitRepoDiscoveryService } from './services/GitRepoDiscoveryService.js';
import { GitError } from '../shared/errors.js';
import { GitHubAvatarService } from './services/GitHubAvatarService.js';

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
  /** Fingerprint of the last commit data sent to webview, used to skip no-op auto-refreshes */
  private lastCommitFingerprint = '';
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
    this.currentRepoPath = currentRepoPath;
    this.gitHubAvatarService = null;
    this.gitHubAvatarInitialized = false;
    this.lastCommitFingerprint = '';
  }

  /** Returns true if the webview panel is currently open */
  isPanelOpen(): boolean {
    return this.panel !== undefined;
  }

  /** Reload all data for the current active repo (use after a repo switch when panel is already open) */
  async reload() {
    await this.sendInitialData(undefined, true);
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
    await this.sendInitialData(undefined, false, true);
  }

  /** Push an updated repo list to the webview */
  sendRepoList(repos: RepoInfo[], activeRepoPath: string) {
    this.postMessage({ type: 'repoList', payload: { repos, activeRepoPath } });
  }

  sendSettingsData(settings: UserSettings) {
    this.postMessage({ type: 'settingsData', payload: { settings } });
  }

  async show() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'speedyGitGraph',
      'Speedy Git Graph',
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

    await this.sendInitialData(undefined, true);
  }

  private computeCommitFingerprint(commits: Commit[]): string {
    if (commits.length === 0) return '';
    return commits.map((c) => c.hash).join(',');
  }

  private async sendInitialData(filters?: Partial<GraphFilters>, includeStashes = false, isAutoRefresh = false) {
    this.isRefreshing = true;
    try {
      let effectiveFilters = filters ?? this.currentFilters;
      const settings = this.getSettingsHandler?.();
      if (settings) {
        this.sendSettingsData(settings);
      }

      // Check if the filtered branch still exists before fetching commits
      if (effectiveFilters.branch) {
        const branchResult = await this.gitLogService.getBranches();
        if (branchResult.success) {
          const branchExists = branchResult.value.some(
            (b) => b.name === effectiveFilters.branch || `${b.remote}/${b.name}` === effectiveFilters.branch
          );
          if (!branchExists) {
            const { branch: _, ...rest } = this.currentFilters;
            this.currentFilters = rest;
            effectiveFilters = this.currentFilters;
          }
        }
      }

      // Fetch commits directly so we can reuse them for avatar fetching
      if (effectiveFilters) {
        this.currentFilters = { ...this.currentFilters, ...effectiveFilters };
      }
      // Only show loading indicator for manual refresh / initial load (not auto-refresh)
      if (!isAutoRefresh) {
        this.postMessage({ type: 'loading', payload: { loading: true } });
      }
      const batchSize = this.getBatchSize();
      const commitsResult = await this.gitLogService.getCommits({ ...effectiveFilters, maxCount: batchSize });
      let fetchedCommits: Commit[] = [];
      if (commitsResult.success) {
        fetchedCommits = commitsResult.value.commits;

        // Skip sending commits if nothing changed during auto-refresh
        const fingerprint = this.computeCommitFingerprint(fetchedCommits);
        const commitsUnchanged = isAutoRefresh && fingerprint === this.lastCommitFingerprint;
        this.lastCommitFingerprint = fingerprint;

        if (!commitsUnchanged) {
          this.postMessage({
            type: 'commits',
            payload: {
              commits: fetchedCommits,
              totalLoadedWithoutFilter: commitsResult.value.totalLoadedWithoutFilter,
            },
          });
        }
      } else {
        this.postMessage({ type: 'error', payload: { error: commitsResult.error } });
      }
      if (!isAutoRefresh) {
        this.postMessage({ type: 'loading', payload: { loading: false } });
      }

      await this.handleMessage({ type: 'getBranches', payload: {} });
      await this.handleMessage({ type: 'getRemotes', payload: {} });
      await this.handleMessage({ type: 'getSubmodules', payload: {} });
      if (includeStashes) {
        await this.handleMessage({ type: 'getStashes', payload: {} });
      }
      const cherryPickStateResult = this.gitCherryPickService.getCherryPickState();
      if (cherryPickStateResult.success) {
        this.postMessage({ type: 'cherryPickState', payload: { state: cherryPickStateResult.value } });
      }

      const rebaseStateResult = this.gitRebaseService.getRebaseState();
      if (rebaseStateResult.success) {
        if (rebaseStateResult.value.state === 'in-progress') {
          const conflictResult = await this.gitRebaseService.getConflictInfo();
          this.postMessage({
            type: 'rebaseState',
            payload: {
              state: 'in-progress',
              conflictInfo: conflictResult.success ? conflictResult.value : rebaseStateResult.value.conflictInfo,
            },
          });
        } else {
          this.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
        }
      }

      const revertStateResult = await this.gitRevertService.getRevertState();
      if (revertStateResult.success) {
        this.postMessage({ type: 'revertState', payload: { state: revertStateResult.value } });
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
      case 'getCommits': {
        if (message.payload.filters) {
          this.currentFilters = { ...this.currentFilters, ...message.payload.filters };
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
          this.currentFilters = { ...this.currentFilters, ...message.payload.filters };
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
        await this.openDiffEditor(message.payload.hash, message.payload.filePath, message.payload.parentHash);
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
      case 'refresh': {
        if (message.payload.filters) {
          this.currentFilters = { ...this.currentFilters, ...message.payload.filters };
        }
        await this.sendInitialData(message.payload.filters, true);
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
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else if (result.error.code === 'BRANCH_NOT_FULLY_MERGED' && !message.payload.force) {
          this.postMessage({ type: 'deleteBranchNeedsForce', payload: { name: message.payload.name } });
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
          message.payload.force
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
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
          await this.sendInitialData(undefined, true);
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'popStash': {
        const result = await this.gitStashService.popStash(message.payload.index);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData(undefined, true);
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'dropStash': {
        const result = await this.gitStashService.dropStash(message.payload.index);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData(undefined, true);
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
          await this.sendInitialData(undefined, true);
        }
        break;
      }
      case 'backToParentRepo': {
        if (this.submoduleHandlers) {
          await this.submoduleHandlers.backToParentRepo();
          await this.sendInitialData(undefined, true);
        }
        break;
      }
      case 'updateSubmodule': {
        const result = await this.gitSubmoduleService.updateSubmodule(message.payload.submodulePath);
        if (result.success) {
          this.postMessage({ type: 'submoduleOperationResult', payload: { success: true } });
          await this.sendSubmodulesData();
          await this.sendInitialData(undefined, true);
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
          await this.sendSubmodulesData();
          await this.sendInitialData(undefined, true);
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

        // Reinitialize services and clear submodule stack for the new repo
        // (switchActiveRepo also calls discovery.setActiveRepo internally)
        this.onSwitchRepo?.(repoPath);

        // Send updated repo list immediately so the dropdown reflects the switch
        this.sendRepoList(discovery.getRepos(), discovery.getActiveRepoPath());
        if (currentGeneration !== this.fetchGeneration) {
          break;
        }
        await this.sendInitialData(undefined, true);
        break;
      }
    }
  }

  private async openDiffEditor(hash: string, filePath: string, parentHash?: string) {
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
  <title>Speedy Git Graph</title>
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

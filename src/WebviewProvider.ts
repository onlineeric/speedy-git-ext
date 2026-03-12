import * as vscode from 'vscode';
import * as path from 'path';
import type { RequestMessage, ResponseMessage } from '../shared/messages.js';
import type { GitLogService } from './services/GitLogService.js';
import type { GitDiffService } from './services/GitDiffService.js';
import type { GitBranchService } from './services/GitBranchService.js';
import type { GitRemoteService } from './services/GitRemoteService.js';
import type { GitTagService } from './services/GitTagService.js';
import type { GitStashService } from './services/GitStashService.js';
import type { GitHistoryService } from './services/GitHistoryService.js';
import type { GitCherryPickService } from './services/GitCherryPickService.js';
import type { GitRebaseService } from './services/GitRebaseService.js';
import type { GitRepoDiscoveryService } from './services/GitRepoDiscoveryService.js';
import type { RepoInfo } from '../shared/types.js';

export class WebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  /** Incremented on each repo switch to discard stale commit responses */
  private fetchGeneration = 0;

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
    private gitRebaseService: GitRebaseService,
    private readonly log: vscode.LogOutputChannel,
    private readonly gitRepoDiscoveryService?: GitRepoDiscoveryService
  ) {}

  /** Callback invoked when the user switches repos; updates services before commits are fetched */
  private onSwitchRepo: ((repoPath: string) => void) | undefined;

  /** Register the callback that reinitializes services for a new repo path */
  setSwitchRepoHandler(handler: (repoPath: string) => void) {
    this.onSwitchRepo = handler;
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
    gitRebaseService: GitRebaseService
  ) {
    this.gitLogService = gitLogService;
    this.gitDiffService = gitDiffService;
    this.gitBranchService = gitBranchService;
    this.gitRemoteService = gitRemoteService;
    this.gitTagService = gitTagService;
    this.gitStashService = gitStashService;
    this.gitHistoryService = gitHistoryService;
    this.gitCherryPickService = gitCherryPickService;
    this.gitRebaseService = gitRebaseService;
  }

  /** Returns true if the webview panel is currently open */
  isPanelOpen(): boolean {
    return this.panel !== undefined;
  }

  /** Reload all data for the current active repo (use after a repo switch when panel is already open) */
  async reload() {
    await this.sendInitialData(undefined, true);
  }

  /** Push an updated repo list to the webview */
  sendRepoList(repos: RepoInfo[], activeRepoPath: string) {
    this.postMessage({ type: 'repoList', payload: { repos, activeRepoPath } });
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

    this.panel.onDidDispose(() => {
      this.panel = undefined;
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

  private async sendInitialData(filters?: Partial<import('../shared/types.js').GraphFilters>, includeStashes = false) {
    await this.handleMessage({ type: 'getCommits', payload: { filters } });
    await this.handleMessage({ type: 'getBranches', payload: {} });
    await this.handleMessage({ type: 'getRemotes', payload: {} });
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
  }

  private async handleMessage(message: RequestMessage) {
    this.log.debug(`Received message: ${message.type}`);
    switch (message.type) {
      case 'getCommits': {
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
        const dirtyCheckCO = await this.gitBranchService.isDirtyWorkingTree();
        if (!dirtyCheckCO.success) {
          this.postMessage({ type: 'error', payload: { error: dirtyCheckCO.error } });
          break;
        }
        if (dirtyCheckCO.value) {
          this.postMessage({ type: 'checkoutNeedsStash', payload: { name: message.payload.name, pull: message.payload.pull } });
          break;
        }
        const checkoutResult = await this.gitBranchService.checkout(message.payload.name, message.payload.remote);
        if (!checkoutResult.success) {
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
      case 'fetch': {
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
      case 'refresh': {
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

        discovery.setActiveRepo(repoPath);

        // Reinitialize services so gitLogService points to the new repo
        this.onSwitchRepo?.(repoPath);

        // Send updated repo list immediately so the dropdown reflects the switch
        this.sendRepoList(discovery.getRepos(), discovery.getActiveRepoPath());

        // Load commits for new repo; discard if generation has advanced
        this.postMessage({ type: 'loading', payload: { loading: true } });
        const batchSize = this.getBatchSize();
        const result = await this.gitLogService.getCommits({ maxCount: batchSize });
        if (currentGeneration !== this.fetchGeneration) {
          this.postMessage({ type: 'loading', payload: { loading: false } });
          break; // stale — newer switch in flight
        }

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
    }
  }

  private async openDiffEditor(hash: string, filePath: string, parentHash?: string) {
    const workspacePath = this.getWorkspacePath();
    if (!workspacePath) return;

    // Validate path stays within repo
    const resolvedPath = path.resolve(workspacePath, filePath);
    if (!resolvedPath.startsWith(workspacePath)) return;

    const parent = parentHash ?? `${hash}~1`;
    const leftUri = vscode.Uri.parse(`git-show://${parent}/${filePath}?${parent}`);
    const rightUri = vscode.Uri.parse(`git-show://${hash}/${filePath}?${hash}`);

    const title = `${filePath} (${hash.slice(0, 7)})`;

    try {
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
    } catch {
      this.log.warn(`Diff editor failed, falling back to file view: ${filePath}`);
      await this.openFileAtRevision(hash, filePath);
    }
  }

  private async openFileAtRevision(hash: string, filePath: string) {
    const workspacePath = this.getWorkspacePath();
    if (!workspacePath) return;

    const resolvedPath = path.resolve(workspacePath, filePath);
    if (!resolvedPath.startsWith(workspacePath)) return;

    const uri = vscode.Uri.parse(`git-show://${hash}/${filePath}?${hash}`);

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch {
      // File might not exist at this revision
      vscode.window.showWarningMessage(`Could not open ${filePath} at revision ${hash.slice(0, 7)}`);
    }
  }

  private getWorkspacePath(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath;
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
    return vscode.workspace.getConfiguration('speedyGit').get<number>('batchCommitSize', 500);
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

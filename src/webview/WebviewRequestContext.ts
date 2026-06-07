import * as vscode from 'vscode';
import type { ResponseMessage } from '../../shared/messages.js';
import type { RepoInfo, UserSettings } from '../../shared/types.js';
import type { GitRepoDiscoveryService } from '../services/GitRepoDiscoveryService.js';
import type { EditorCommandService } from './EditorCommandService.js';
import type { GitServiceRegistry } from './GitServiceRegistry.js';
import type { OperationGuard } from './OperationGuard.js';
import type { PersistedUIStateStore } from './PersistedUIStateStore.js';
import type { RefreshCoordinator } from './RefreshCoordinator.js';
import type { RepoDataLoader, SubmoduleNavigationHandlers } from './RepoDataLoader.js';
import type { WebviewRuntime } from './WebviewRuntime.js';

export interface WebviewRequestContext {
  readonly log: vscode.LogOutputChannel;
  readonly extensionUri: vscode.Uri;
  readonly runtime: WebviewRuntime;
  readonly services: GitServiceRegistry;
  readonly dataLoader: RepoDataLoader;
  readonly refreshCoordinator: RefreshCoordinator;
  readonly editorCommands: EditorCommandService;
  readonly operationGuard: OperationGuard;
  readonly uiStateStore: PersistedUIStateStore;

  postMessage(message: ResponseMessage): void;
  getSettings(): UserSettings | undefined;
  getBatchSize(): number;
  getRepoDiscovery(): GitRepoDiscoveryService | undefined;
  getSubmoduleHandlers(): SubmoduleNavigationHandlers | undefined;
  onSwitchRepo(repoPath: string): void;
  onDisplayRepo(repoPath: string): void;
  sendRepoList(repos: RepoInfo[], activeRepoPath: string): void;
  sendSettingsData(settings: UserSettings): void;
}

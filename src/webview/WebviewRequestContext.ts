import * as vscode from 'vscode';
import type { ResponseMessage } from '../../shared/messages.js';
import type { SubmoduleNavEntry, UserSettings } from '../../shared/types.js';
import type { GitVersion } from '../../shared/gitVersion.js';
import type { GitRepoDiscoveryService } from '../services/GitRepoDiscoveryService.js';
import type { EditorCommandService } from './EditorCommandService.js';
import type { GitServiceRegistry } from './GitServiceRegistry.js';
import type { OperationGuard } from './OperationGuard.js';
import type { PersistedUIStateStore } from './PersistedUIStateStore.js';
import type { RefreshCoordinator } from './RefreshCoordinator.js';
import type { RepoDataLoader } from './RepoDataLoader.js';
import type { TelemetryService } from '../services/TelemetryService.js';
import type { GitHubAuthService } from '../services/GitHubAuthService.js';
import type { TrackedOperation } from '../../shared/telemetry.js';
import type { RepoIdentity } from '../utils/repoIdentity.js';
import type { WebviewRuntime } from './WebviewRuntime.js';

/**
 * Everything a handler is allowed to see.
 *
 * Handlers stay **tab-agnostic**: a handler never learns "which tab am I"
 * beyond what this context gives it, and anything cross-tab goes through a
 * method here (`openNewGraphTab`, `beginRepoActivity`) rather than through a
 * registry import. Services are resolved from `services` at REQUEST time — repo
 * switching, submodule navigation and now tab identity all depend on it.
 */
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
  readonly telemetry: TelemetryService;
  readonly avatarAuth: GitHubAuthService;
  /** Stable for the tab's lifetime; the key the activity registry uses. */
  readonly tabId: string;

  postMessage(message: ResponseMessage): void;
  /** Push the current avatar authorization + rate-limit state to the webview. */
  sendAvatarAuthState(): void;
  /** Drop the persisted avatar cache and everything queued for refresh. */
  clearAvatarCache(): Promise<void>;
  getSettings(): UserSettings | undefined;
  getBatchSize(): number;
  /** The installed git's version, read once and cached on the runtime. Never rejects: a failed or unparseable read is null. */
  getGitVersion(): Promise<GitVersion | null>;
  getRepoDiscovery(): GitRepoDiscoveryService | undefined;
  /** This tab's selected repository, before any submodule navigation. */
  getTopLevelRepoPath(): string;
  /** Resolved for the displayed repo; null when it is not a git repository. */
  getIdentity(): RepoIdentity | null;
  /**
   * Show another repository in THIS tab (submodule navigation). Answers the
   * navigation generation it began with, so a caller can tell whether a later
   * navigation overtook it before reloading.
   */
  setDisplayedRepo(repoPath: string): Promise<number>;
  /** Change this tab's selected repository; also moves the saved default. */
  setTopLevelRepo(repoPath: string): Promise<number>;
  /** Unwind one level of submodule navigation. */
  backToParentRepo(): Promise<void>;
  /** Record where a submodule navigation came from, so "back" can unwind it. */
  pushSubmoduleEntry(entry: SubmoduleNavEntry): void;
  /** Create another graph tab beside this one. */
  openNewGraphTab(): void;
  /**
   * Mirror a running operation to peer tabs on the same working tree. A notice
   * only — it gates nothing. Returns a no-op disposable when this tab has no
   * resolved identity.
   */
  beginRepoActivity(operation: TrackedOperation): { dispose(): void };
  /** Re-send THIS tab's repo list with its own selection. */
  sendRepoList(): void;
  sendSettingsData(settings: UserSettings): void;
  /** Persist that the running version's "What's new" dialog has been seen. */
  markWhatsNewShown(): Promise<void>;
}

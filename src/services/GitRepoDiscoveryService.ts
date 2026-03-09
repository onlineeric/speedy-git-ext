import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { RepoInfo } from '../../shared/types.js';

/**
 * Discovers git repositories in the workspace using the VSCode built-in Git Extension API
 * as the primary source, falling back to workspace folder scanning when unavailable.
 */
export class GitRepoDiscoveryService implements vscode.Disposable {
  private _repos: RepoInfo[] = [];
  private _activeRepoPath: string = '';
  private readonly _onDidChangeRepos = new vscode.EventEmitter<RepoInfo[]>();
  readonly onDidChangeRepos: vscode.Event<RepoInfo[]> = this._onDidChangeRepos.event;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly log: vscode.LogOutputChannel) {}

  async initialize(): Promise<void> {
    const gitApi = await this.getVscodeGitApi();
    if (gitApi) {
      this.log.info('GitRepoDiscoveryService: using vscode.git API');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this._repos = this.buildRepoList(gitApi.repositories.map((r: any) => r.rootUri.fsPath));
      this._activeRepoPath = this._repos[0]?.path ?? '';

      this._disposables.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        gitApi.onDidOpenRepository((repo: any) => {
          this.log.info(`GitRepoDiscoveryService: repo opened: ${repo.rootUri.fsPath}`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const paths = gitApi.repositories.map((r: any) => r.rootUri.fsPath);
          this._repos = this.buildRepoList(paths);
          if (!this._repos.find((r) => r.path === this._activeRepoPath)) {
            this._activeRepoPath = this._repos[0]?.path ?? '';
          }
          this._onDidChangeRepos.fire(this._repos);
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        gitApi.onDidCloseRepository((repo: any) => {
          this.log.info(`GitRepoDiscoveryService: repo closed: ${repo.rootUri.fsPath}`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const paths = gitApi.repositories.map((r: any) => r.rootUri.fsPath);
          this._repos = this.buildRepoList(paths);
          if (!this._repos.find((r) => r.path === this._activeRepoPath)) {
            const removedName = path.basename(this._activeRepoPath);
            this._activeRepoPath = this._repos[0]?.path ?? '';
            if (this._repos.length > 0) {
              vscode.window.showInformationMessage(
                `Speedy Git: Repository "${removedName}" was removed. Switched to "${this._repos[0].displayName}".`
              );
            }
          }
          this._onDidChangeRepos.fire(this._repos);
        })
      );
    } else {
      this.log.warn('GitRepoDiscoveryService: vscode.git unavailable, falling back to workspace scan');
      const paths = await this.scanWorkspaceFolders();
      this._repos = this.buildRepoList(paths);
      this._activeRepoPath = this._repos[0]?.path ?? '';
    }

    this.log.info(`GitRepoDiscoveryService: initialized with ${this._repos.length} repo(s); active: ${this._activeRepoPath}`);
  }

  getRepos(): RepoInfo[] {
    return this._repos;
  }

  getActiveRepoPath(): string {
    return this._activeRepoPath;
  }

  setActiveRepo(repoPath: string): void {
    if (!this._repos.find((r) => r.path === repoPath)) {
      this.log.warn(`GitRepoDiscoveryService: setActiveRepo called with unknown path: ${repoPath}`);
      return;
    }
    this._activeRepoPath = repoPath;
  }

  dispose(): void {
    this._onDidChangeRepos.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getVscodeGitApi(): Promise<any> {
    try {
      const ext = vscode.extensions.getExtension('vscode.git');
      if (!ext) return undefined;
      if (!ext.isActive) {
        await ext.activate();
      }
      return ext.exports.getAPI(1);
    } catch {
      return undefined;
    }
  }

  /** Scan workspace folders up to git.repositoryScanMaxDepth (default 1) for .git directories */
  private async scanWorkspaceFolders(): Promise<string[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const maxDepth = vscode.workspace.getConfiguration('git').get<number>('repositoryScanMaxDepth', 1);
    const found: string[] = [];

    for (const folder of workspaceFolders) {
      await this.scanForGitDirs(folder.uri.fsPath, 0, maxDepth, found);
    }

    return found;
  }

  private async scanForGitDirs(dirPath: string, currentDepth: number, maxDepth: number, found: string[]): Promise<void> {
    try {
      const gitDir = path.join(dirPath, '.git');
      if (fs.existsSync(gitDir)) {
        found.push(dirPath);
        return; // Don't recurse into git repos
      }

      if (currentDepth >= maxDepth) return;

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await this.scanForGitDirs(path.join(dirPath, entry.name), currentDepth + 1, maxDepth, found);
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  /** Build RepoInfo list with disambiguated displayNames */
  private buildRepoList(repoPaths: string[]): RepoInfo[] {
    const names = repoPaths.map((p) => path.basename(p));

    // Find duplicate names
    const nameCounts = new Map<string, number>();
    for (const name of names) {
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }

    // Find workspace root for relative path computation
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

    return repoPaths.map((repoPath) => {
      const name = path.basename(repoPath);
      let displayName = name;

      if ((nameCounts.get(name) ?? 0) > 1) {
        // Use relative path from the closest workspace folder
        const workspaceFolder = workspaceFolders.find((f) =>
          repoPath.startsWith(f.uri.fsPath)
        );
        if (workspaceFolder) {
          displayName = path.relative(workspaceFolder.uri.fsPath, repoPath);
        }
      }

      return { path: repoPath, name, displayName };
    });
  }
}

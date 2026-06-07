import * as path from 'path';
import * as vscode from 'vscode';
import { GitError, err, ok, type Result } from '../../shared/errors.js';
import type { FileChangeStatus } from '../../shared/types.js';
import { UNCOMMITTED_HASH } from '../../shared/types.js';
import type { GitServiceRegistry } from './GitServiceRegistry.js';
import type { WebviewRuntime } from './WebviewRuntime.js';

export class EditorCommandService {
  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly extensionUri: vscode.Uri,
    private readonly runtime: WebviewRuntime,
    private readonly services: GitServiceRegistry,
  ) {}

  async getHeadHash(): Promise<string> {
    const result = await this.services.current().gitLogService.getCommits({ maxCount: 1 });
    return result.success && result.value.commits.length > 0
      ? result.value.commits[0].hash
      : '';
  }

  async openDiffEditor(hash: string, filePath: string, parentHash?: string, status?: FileChangeStatus): Promise<void> {
    if (hash === UNCOMMITTED_HASH) {
      await this.openUncommittedDiff(filePath, status);
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

  async openStagedDiffEditor(filePath: string): Promise<void> {
    const fileName = filePath.split('/').pop() ?? filePath;
    const headHash = await this.getHeadHash();
    if (!headHash) {
      this.log.warn(`Cannot resolve HEAD for staged diff: ${filePath}`);
      return;
    }
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

  async openFileAtRevision(hash: string, filePath: string): Promise<void> {
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
    } catch (error) {
      this.log.warn(`openFileAtRevision failed for ${filePath}@${hash.slice(0, 7)}: ${error}`);
      vscode.window.showWarningMessage(`Could not open ${filePath} at revision ${hash.slice(0, 7)}`);
    }
  }

  async openCurrentFile(filePath: string): Promise<void> {
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

  async openCompareDiffEditor(payload: {
    filePath: string;
    aHash: string | null;
    bHash: string | null;
    status: FileChangeStatus;
    title: string;
  }): Promise<void> {
    void payload.status;
    const fileName = payload.filePath.split('/').pop() ?? payload.filePath;

    const buildUri = (hash: string | null): vscode.Uri => {
      if (hash === null) {
        return vscode.Uri.file(path.join(this.runtime.currentRepoPath, payload.filePath));
      }
      return vscode.Uri.from({
        scheme: 'git-show',
        authority: hash,
        path: `/${hash.slice(0, 8)}: ${fileName}`,
        query: payload.filePath,
      });
    };

    try {
      await vscode.commands.executeCommand('vscode.diff', buildUri(payload.aHash), buildUri(payload.bHash), payload.title);
    } catch {
      this.log.warn(`Compare diff editor failed for: ${payload.filePath}`);
    }
  }

  async openWorktreeFolder(worktreePath: string): Promise<void> {
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(worktreePath), {
      forceNewWindow: true,
    });
  }

  async revealWorktree(worktreePath: string): Promise<void> {
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(worktreePath));
  }

  async openSignatureHelp(): Promise<void> {
    const docUri = vscode.Uri.joinPath(this.extensionUri, 'docs', 'signing-verification.md');
    await vscode.commands.executeCommand('markdown.showPreview', docUri);
  }

  async findRemovableWorktree(worktreePath: string): Promise<Result<void>> {
    const list = await this.services.current().gitWorktreeService.listWorktrees();
    if (!list.success) return list;
    const normalize = (value: string) => path.resolve(value);
    const match = list.value.find((worktree) => normalize(worktree.path) === normalize(worktreePath));
    if (match?.isMain) {
      return err(new GitError('The main worktree cannot be removed.', 'VALIDATION_ERROR'));
    }
    if (match?.isCurrent) {
      return err(new GitError('You cannot remove the worktree you are currently in.', 'VALIDATION_ERROR'));
    }
    return ok(undefined);
  }

  getWorkspacePath(): string | undefined {
    if (this.runtime.currentRepoPath) {
      return this.runtime.currentRepoPath;
    }
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath;
  }

  private async openUncommittedDiff(filePath: string, status?: FileChangeStatus): Promise<void> {
    const fileName = filePath.split('/').pop() ?? filePath;
    const absolutePath = path.join(this.runtime.currentRepoPath, filePath);

    if (status === 'untracked') {
      const leftUri = vscode.Uri.parse(`untitled:${fileName}`);
      const rightUri = vscode.Uri.file(absolutePath);
      await this.tryOpenDiff(leftUri, rightUri, `${filePath} (Untracked)`, `Diff editor failed for untracked file: ${filePath}`);
      return;
    }

    const headHash = await this.getHeadHash();
    if (!headHash) {
      this.log.warn(`Cannot resolve HEAD for diff: ${filePath}`);
      return;
    }

    const leftUri = vscode.Uri.from({
      scheme: 'git-show',
      authority: headHash,
      path: `/${headHash.slice(0, 8)}: ${fileName}`,
      query: filePath,
    });

    if (status === 'deleted') {
      await this.tryOpenDiff(leftUri, vscode.Uri.parse(`untitled:${fileName}`), `${filePath} (Deleted)`, `Diff editor failed for deleted file: ${filePath}`);
      return;
    }

    await this.tryOpenDiff(leftUri, vscode.Uri.file(absolutePath), `${filePath} (Working Tree)`, `Diff editor failed for uncommitted file: ${filePath}`);
  }

  private async tryOpenDiff(leftUri: vscode.Uri, rightUri: vscode.Uri, title: string, warning: string): Promise<void> {
    try {
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
    } catch {
      this.log.warn(warning);
    }
  }

  private resolveWorkspaceFilePath(filePath: string): string | undefined {
    const workspacePath = this.getWorkspacePath();
    if (!workspacePath) return undefined;

    const resolvedPath = path.resolve(workspacePath, filePath);
    const relativePath = path.relative(workspacePath, resolvedPath);
    const isOutsideWorkspace = !relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath);
    if (isOutsideWorkspace) return undefined;

    return resolvedPath;
  }
}

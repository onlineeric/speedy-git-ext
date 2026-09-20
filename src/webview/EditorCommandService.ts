import * as path from 'path';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { GitError, err, ok, type Result } from '../../shared/errors.js';
import type { FileChangeStatus, WorktreeInfo } from '../../shared/types.js';
import { UNCOMMITTED_HASH } from '../../shared/types.js';
import { buildGitShowUriParts, STAGED_AUTHORITY, WORKTREE_AUTHORITY } from '../utils/gitShowUri.js';
import type { GitServiceRegistry } from './GitServiceRegistry.js';
import type { WebviewRuntime } from './WebviewRuntime.js';

export class EditorCommandService {
  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly extensionUri: vscode.Uri,
    private readonly runtime: WebviewRuntime,
    private readonly services: GitServiceRegistry,
  ) {}

  /**
   * The commit HEAD points at — the left-hand side of every uncommitted/staged diff.
   *
   * Must be `rev-parse HEAD`, not "newest commit in the graph walk": the walk is
   * ordered by commit date across every ref (and now across stash base commits too),
   * so its first row is only HEAD by coincidence. Empty string on an unborn branch,
   * which callers already treat as "cannot resolve HEAD".
   */
  async getHeadHash(): Promise<string> {
    const result = await this.services.current().gitLogService.getHeadCommitHash();
    return result.success ? result.value : '';
  }

  /**
   * A `git-show:` URI for the repository this tab currently DISPLAYS — which is
   * the repository the file belongs to.
   *
   * The repo travels inside the URI rather than being looked up when the
   * document is read, so the diff stays correct after this tab switches repo or
   * closes, and two repos holding the same file at the same hash stay distinct
   * documents.
   */
  private buildGitShowUri(revision: string, filePath: string, label: string, nonce?: string): vscode.Uri {
    return vscode.Uri.from({
      scheme: 'git-show',
      ...buildGitShowUriParts({
        repoPath: this.runtime.currentRepoPath,
        revision,
        filePath,
        label,
        ...(nonce ? { nonce } : {}),
      }),
    });
  }

  /**
   * The working-tree side of a *submodule* diff, routed through the `git-show`
   * content provider instead of a `file://` URI.
   *
   * A checked-out submodule is a directory, so `vscode.diff` cannot open it as a
   * text document at all — the diff either fails or shows nothing. The provider
   * answers the `worktree` sentinel with the submodule's current pointer line,
   * which is the same thing `git diff` renders for that side.
   *
   * VS Code caches virtual documents by URI, and this side's content moves on
   * its own (the pointer and git's `-dirty` suffix), so it carries a nonce
   * alongside the repository.
   */
  private buildWorktreeSubmoduleUri(filePath: string, fileName: string): vscode.Uri {
    return this.buildGitShowUri(WORKTREE_AUTHORITY, filePath, `Working Tree: ${fileName}`, randomUUID());
  }

  async openDiffEditor(hash: string, filePath: string, parentHash?: string, status?: FileChangeStatus, isSubmodule?: boolean): Promise<void> {
    if (hash === UNCOMMITTED_HASH) {
      await this.openUncommittedDiff(filePath, status, isSubmodule);
      return;
    }

    const parent = parentHash ?? `${hash}~1`;
    const fileName = filePath.split('/').pop() ?? filePath;
    const leftUri = this.buildGitShowUri(parent, filePath, `${parent.slice(0, 8)}: ${fileName}`);
    const rightUri = this.buildGitShowUri(hash, filePath, `${hash.slice(0, 8)}: ${fileName}`);
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
    const leftUri = this.buildGitShowUri(headHash, filePath, `${headHash.slice(0, 8)}: ${fileName}`);
    const rightUri = this.buildGitShowUri(STAGED_AUTHORITY, filePath, `Staged: ${fileName}`);
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
    const uri = this.buildGitShowUri(hash, filePath, `${shortHash}: ${fileName}`);

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch (error) {
      this.log.warn(`openFileAtRevision failed for ${filePath}@${hash.slice(0, 7)}: ${error}`);
      vscode.window.showWarningMessage(`Could not open ${filePath} at revision ${hash.slice(0, 7)}`);
    }
  }

  /**
   * Opens the real file on disk, resolved against this tab's own workspace path —
   * so it needs no repository marker of its own, unlike every `git-show:` URI
   * above.
   */
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
    isSubmodule?: boolean;
  }): Promise<void> {
    void payload.status;
    const fileName = payload.filePath.split('/').pop() ?? payload.filePath;

    const buildUri = (hash: string | null): vscode.Uri => {
      if (hash === null) {
        // Working-tree slot. A submodule has no file to point at here — see
        // `buildWorktreeSubmoduleUri`.
        return payload.isSubmodule
          ? this.buildWorktreeSubmoduleUri(payload.filePath, fileName)
          : vscode.Uri.file(path.join(this.runtime.currentRepoPath, payload.filePath));
      }
      return this.buildGitShowUri(hash, payload.filePath, `${hash.slice(0, 8)}: ${fileName}`);
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

  /**
   * Guard a removal, answering with the worktree list the check was made against —
   * `resolveBaseDir` needs the same list, and returning it keeps the removal to one
   * `git worktree list` instead of two.
   */
  async findRemovableWorktree(worktreePath: string): Promise<Result<WorktreeInfo[]>> {
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
    return ok(list.value);
  }

  getWorkspacePath(): string | undefined {
    if (this.runtime.currentRepoPath) {
      return this.runtime.currentRepoPath;
    }
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath;
  }

  private async openUncommittedDiff(filePath: string, status?: FileChangeStatus, isSubmodule?: boolean): Promise<void> {
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

    const leftUri = this.buildGitShowUri(headHash, filePath, `${headHash.slice(0, 8)}: ${fileName}`);

    if (status === 'deleted') {
      await this.tryOpenDiff(leftUri, vscode.Uri.parse(`untitled:${fileName}`), `${filePath} (Deleted)`, `Diff editor failed for deleted file: ${filePath}`);
      return;
    }

    const rightUri = isSubmodule ? this.buildWorktreeSubmoduleUri(filePath, fileName) : vscode.Uri.file(absolutePath);
    await this.tryOpenDiff(leftUri, rightUri, `${filePath} (Working Tree)`, `Diff editor failed for uncommitted file: ${filePath}`);
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

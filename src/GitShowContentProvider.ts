import * as vscode from 'vscode';
import type { GitDiffService } from './services/GitDiffService.js';
import { parseGitShowUriParts, STAGED_AUTHORITY, WORKTREE_AUTHORITY } from './utils/gitShowUri.js';

/**
 * Provides file content at a specific git revision for VS Code's diff editor.
 *
 * The repository comes from the URI's own fragment, resolved through
 * `resolveDiffService`. There is deliberately no fallback to a "current"
 * service: that fallback is what made an open diff silently start reading a
 * different repository once the graph that opened it switched repo or closed.
 */
export class GitShowContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly resolveDiffService: (repoPath: string) => GitDiffService) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const parts = parseGitShowUriParts(uri);
    if (!parts) {
      throw new Error(
        `Invalid git-show URI: missing ${!uri.authority ? 'hash' : !uri.query ? 'file path' : 'repository'} (uri: ${uri.toString()})`,
      );
    }

    const { revision, filePath, repoPath } = parts;
    const gitDiffService = this.resolveDiffService(repoPath);

    // Working-tree side of a *submodule* diff — authority is the sentinel "worktree".
    // Ordinary files use a plain file:// URI for this side; a submodule cannot, because
    // its working-tree form is a directory, which `vscode.diff` has no way to open.
    if (revision === WORKTREE_AUTHORITY) {
      const worktreeResult = await gitDiffService.getWorkingTreeSubmoduleContent(filePath);
      if (!worktreeResult.success) {
        if (worktreeResult.error.code === 'COMMAND_FAILED') {
          return '';
        }
        throw new Error(`Failed to read submodule ${filePath}: ${worktreeResult.error.message}`);
      }
      return worktreeResult.value;
    }

    // Staged (index) version — authority is the sentinel "staged" instead of a commit hash.
    // Uses `git show :<path>` to retrieve the exact content that would be committed.
    if (revision === STAGED_AUTHORITY) {
      const stagedResult = await gitDiffService.getStagedFileContent(filePath);
      if (!stagedResult.success) {
        if (stagedResult.error.code === 'COMMAND_FAILED') {
          return '';
        }
        throw new Error(`Failed to read staged ${filePath}: ${stagedResult.error.message}`);
      }
      return stagedResult.value;
    }

    const result = await gitDiffService.getCommitFile(revision, filePath);
    if (!result.success) {
      // Return empty for "file not found at revision" — expected in diff views
      // (e.g., left side of a newly added file, right side of a deleted file)
      if (result.error.code === 'COMMAND_FAILED') {
        return '';
      }
      throw new Error(`Failed to read ${filePath} at ${revision.slice(0, 7)}: ${result.error.message}`);
    }

    return result.value;
  }
}

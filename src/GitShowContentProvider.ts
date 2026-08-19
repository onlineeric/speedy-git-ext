import * as vscode from 'vscode';
import type { GitDiffService } from './services/GitDiffService.js';

/** Authority sentinels standing in for a revision that has no commit hash. */
const STAGED_AUTHORITY = 'staged';
const WORKTREE_AUTHORITY = 'worktree';

/**
 * Provides file content at a specific git revision for VS Code's diff editor.
 * Handles URIs with the scheme: git-show://COMMIT_HASH/path/to/file?COMMIT_HASH
 */
export class GitShowContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly getService: () => GitDiffService) {}

  private get gitDiffService(): GitDiffService {
    return this.getService();
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const hash = uri.authority;
    // File path is stored in the query parameter; path contains human-readable tab title
    const filePath = uri.query;

    if (!hash || !filePath) {
      throw new Error(`Invalid git-show URI: missing ${!hash ? 'hash' : 'file path'} (uri: ${uri.toString()})`);
    }

    // Working-tree side of a *submodule* diff — authority is the sentinel "worktree".
    // Ordinary files use a plain file:// URI for this side; a submodule cannot, because
    // its working-tree form is a directory, which `vscode.diff` has no way to open.
    if (hash === WORKTREE_AUTHORITY) {
      const worktreeResult = await this.gitDiffService.getWorkingTreeSubmoduleContent(filePath);
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
    if (hash === STAGED_AUTHORITY) {
      const stagedResult = await this.gitDiffService.getStagedFileContent(filePath);
      if (!stagedResult.success) {
        if (stagedResult.error.code === 'COMMAND_FAILED') {
          return '';
        }
        throw new Error(`Failed to read staged ${filePath}: ${stagedResult.error.message}`);
      }
      return stagedResult.value;
    }

    const result = await this.gitDiffService.getCommitFile(hash, filePath);
    if (!result.success) {
      // Return empty for "file not found at revision" — expected in diff views
      // (e.g., left side of a newly added file, right side of a deleted file)
      if (result.error.code === 'COMMAND_FAILED') {
        return '';
      }
      throw new Error(`Failed to read ${filePath} at ${hash.slice(0, 7)}: ${result.error.message}`);
    }

    return result.value;
  }
}

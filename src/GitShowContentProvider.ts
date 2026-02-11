import * as vscode from 'vscode';
import type { GitDiffService } from './services/GitDiffService.js';

/**
 * Provides file content at a specific git revision for VS Code's diff editor.
 * Handles URIs with the scheme: git-show://COMMIT_HASH/path/to/file?COMMIT_HASH
 */
export class GitShowContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly gitDiffService: GitDiffService) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const hash = uri.authority;
    const filePath = uri.path.slice(1); // Remove leading '/'

    if (!hash || !filePath) {
      throw new Error(`Invalid git-show URI: missing ${!hash ? 'hash' : 'file path'}`);
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

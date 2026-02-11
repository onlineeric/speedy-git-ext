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
      return '';
    }

    const result = await this.gitDiffService.getCommitFile(hash, filePath);
    if (!result.success) {
      return '';
    }

    return result.value;
  }
}

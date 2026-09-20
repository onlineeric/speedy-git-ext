import type { LogOutputChannel } from 'vscode';
import { GitBranchService } from '../services/GitBranchService.js';
import { GitCherryPickService } from '../services/GitCherryPickService.js';
import { GitCommitService } from '../services/GitCommitService.js';
import { GitDiffService } from '../services/GitDiffService.js';
import { GitHistoryService } from '../services/GitHistoryService.js';
import { GitIndexService } from '../services/GitIndexService.js';
import { GitLogService } from '../services/GitLogService.js';
import { GitRebaseService } from '../services/GitRebaseService.js';
import { GitRemoteService } from '../services/GitRemoteService.js';
import { GitRevertService } from '../services/GitRevertService.js';
import { GitSignatureService } from '../services/GitSignatureService.js';
import { GitStashService } from '../services/GitStashService.js';
import { GitSubmoduleService } from '../services/GitSubmoduleService.js';
import { GitTagService } from '../services/GitTagService.js';
import { GitWorktreeService } from '../services/GitWorktreeService.js';
import type { GitServiceSet } from './GitServiceRegistry.js';

/**
 * The whole repo-bound service set, built in one place.
 *
 * Adding a service used to mean editing a 15-line construction block, a
 * 15-argument constructor and a 15-argument update method that had to stay in
 * the same order. Now it is one line, here.
 */
export function createGitServices(repoPath: string, log: LogOutputChannel): GitServiceSet {
  return {
    gitLogService: new GitLogService(repoPath, log),
    gitDiffService: new GitDiffService(repoPath, log),
    gitBranchService: new GitBranchService(repoPath, log),
    gitRemoteService: new GitRemoteService(repoPath, log),
    gitTagService: new GitTagService(repoPath, log),
    gitStashService: new GitStashService(repoPath, log),
    gitHistoryService: new GitHistoryService(repoPath, log),
    gitCherryPickService: new GitCherryPickService(repoPath, log),
    gitRevertService: new GitRevertService(repoPath, log),
    gitRebaseService: new GitRebaseService(repoPath, log),
    gitSignatureService: new GitSignatureService(repoPath, log),
    gitSubmoduleService: new GitSubmoduleService(repoPath, log),
    gitWorktreeService: new GitWorktreeService(repoPath, log),
    gitIndexService: new GitIndexService(repoPath, log),
    gitCommitService: new GitCommitService(repoPath, log),
  };
}

import type { GitBranchService } from '../services/GitBranchService.js';
import type { GitCherryPickService } from '../services/GitCherryPickService.js';
import type { GitDiffService } from '../services/GitDiffService.js';
import type { GitHistoryService } from '../services/GitHistoryService.js';
import type { GitIndexService } from '../services/GitIndexService.js';
import type { GitLogService } from '../services/GitLogService.js';
import type { GitRebaseService } from '../services/GitRebaseService.js';
import type { GitRemoteService } from '../services/GitRemoteService.js';
import type { GitRevertService } from '../services/GitRevertService.js';
import type { GitSignatureService } from '../services/GitSignatureService.js';
import type { GitStashService } from '../services/GitStashService.js';
import type { GitSubmoduleService } from '../services/GitSubmoduleService.js';
import type { GitTagService } from '../services/GitTagService.js';
import type { GitWorktreeService } from '../services/GitWorktreeService.js';

export interface GitServiceSet {
  gitLogService: GitLogService;
  gitDiffService: GitDiffService;
  gitBranchService: GitBranchService;
  gitRemoteService: GitRemoteService;
  gitTagService: GitTagService;
  gitStashService: GitStashService;
  gitHistoryService: GitHistoryService;
  gitCherryPickService: GitCherryPickService;
  gitRevertService: GitRevertService;
  gitRebaseService: GitRebaseService;
  gitSignatureService: GitSignatureService;
  gitSubmoduleService: GitSubmoduleService;
  gitWorktreeService: GitWorktreeService;
  gitIndexService: GitIndexService;
}

export class GitServiceRegistry {
  constructor(private services: GitServiceSet) {}

  current(): GitServiceSet {
    return this.services;
  }

  update(services: GitServiceSet): void {
    this.services = services;
  }
}

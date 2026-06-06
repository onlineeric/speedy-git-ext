import type { PushForceMode, ResetMode, RevertMode, WorktreeBranchMode } from '@shared/types';

export interface PushCommandOptions {
  remote: string;
  branch: string;
  setUpstream: boolean;
  forceMode: PushForceMode;
}

export interface MergeCommandOptions {
  branch: string;
  noCommit: boolean;
  noFastForward: boolean;
  squash?: boolean;
}

export interface RebaseCommandOptions {
  targetRef: string;
  ignoreDate: boolean;
}

export interface CherryPickCommandOptions {
  hashes: string[];
  appendSourceRef: boolean;
  noCommit: boolean;
  mainlineParent?: number;
}

export interface ResetCommandOptions {
  hash: string;
  mode: ResetMode;
}

export interface RevertCommandOptions {
  hash: string;
  mode: RevertMode;
  mainlineParent?: number;
}

export interface DropCommitCommandOptions {
  hash: string;
}

export interface CheckoutCommandOptions {
  branch: string;
  pull: boolean;
}

export interface FastForwardLocalBranchCommandOptions {
  remote: string;
  branch: string;
  setUpstream?: boolean;
}

export interface TagCommandOptions {
  name: string;
  hash: string;
  message?: string;
}

export function buildPushCommand(options: PushCommandOptions): string {
  const parts = ['git push'];
  if (options.setUpstream) parts.push('-u');
  if (options.forceMode === 'force-with-lease') parts.push('--force-with-lease');
  else if (options.forceMode === 'force') parts.push('--force');
  parts.push(options.remote);
  parts.push(options.branch);
  return parts.join(' ');
}

export function buildFastForwardLocalBranchCommand(options: FastForwardLocalBranchCommandOptions): string {
  const fetchCmd = `git fetch ${options.remote} ${options.branch}:${options.branch}`;
  if (options.setUpstream) {
    return `${fetchCmd} && git branch --set-upstream-to=${options.remote}/${options.branch} ${options.branch}`;
  }
  return fetchCmd;
}

export function buildMergeCommand(options: MergeCommandOptions): string {
  const parts = ['git merge'];
  if (options.squash) parts.push('--squash');
  if (options.noCommit) {
    parts.push('--no-commit', '--no-ff');
  } else if (options.noFastForward) {
    parts.push('--no-ff');
  }
  parts.push(options.branch);
  return parts.join(' ');
}

export function buildRebaseCommand(options: RebaseCommandOptions): string {
  const parts = ['git rebase'];
  if (options.ignoreDate) parts.push('--ignore-date');
  parts.push(options.targetRef);
  return parts.join(' ');
}

export function buildCherryPickCommand(options: CherryPickCommandOptions): string {
  const parts = ['git cherry-pick'];
  if (options.mainlineParent !== undefined) {
    parts.push('-m', String(options.mainlineParent));
  }
  if (options.appendSourceRef && !options.noCommit) {
    parts.push('-x');
  }
  if (options.noCommit) {
    parts.push('--no-commit');
  }
  parts.push(...options.hashes);
  return parts.join(' ');
}

export function buildResetCommand(options: ResetCommandOptions): string {
  return `git reset --${options.mode} ${options.hash}`;
}

export function buildRevertCommand(options: RevertCommandOptions): string {
  const parts = ['git revert'];
  if (options.mainlineParent !== undefined) {
    parts.push('-m', String(options.mainlineParent));
  }
  if (options.mode === 'commit') {
    parts.push('--no-edit');
  } else if (options.mode === 'no-commit') {
    parts.push('--no-commit');
  }
  // mode === 'edit-message' emits the native form with no extra flag.
  parts.push(options.hash);
  return parts.join(' ');
}

export function buildDropCommitCommand(options: DropCommitCommandOptions): string {
  return `git rebase -i ${options.hash}~1  # drop ${options.hash}`;
}

export function buildCheckoutCommand(options: CheckoutCommandOptions): string {
  const parts = ['git checkout', options.branch];
  if (options.pull) parts.push('&& git pull');
  return parts.join(' ');
}

export interface DeleteBranchCommandOptions {
  name: string;
  force?: boolean;
}

export interface DeleteRemoteBranchCommandOptions {
  remote: string;
  name: string;
}

export interface DeleteTagCommandOptions {
  name: string;
}

export interface DropStashCommandOptions {
  stashIndex: number;
}

export interface StashAndCheckoutCommandOptions {
  branch: string;
  pull: boolean;
}

export interface RenameBranchCommandOptions {
  oldName: string;
  newName: string;
}

export function buildDeleteBranchCommand(options: DeleteBranchCommandOptions): string {
  return `git branch ${options.force ? '-D' : '-d'} ${options.name}`;
}

export interface DeleteBranchWithRemoteCommandOptions {
  name: string;
  force?: boolean;
  remote: string;
  remoteBranchName: string;
}

export function buildDeleteBranchWithRemoteCommand(options: DeleteBranchWithRemoteCommandOptions): string {
  const localCmd = buildDeleteBranchCommand({ name: options.name, force: options.force });
  const remoteCmd = buildDeleteRemoteBranchCommand({ remote: options.remote, name: options.remoteBranchName });
  return `${localCmd} && ${remoteCmd}`;
}

export function buildDeleteRemoteBranchCommand(options: DeleteRemoteBranchCommandOptions): string {
  return `git push ${options.remote} --delete ${options.name}`;
}

export function buildDeleteTagCommand(options: DeleteTagCommandOptions): string {
  return `git tag -d ${options.name}`;
}

export function buildDropStashCommand(options: DropStashCommandOptions): string {
  return `git stash drop stash@{${options.stashIndex}}`;
}

export function buildStashAndCheckoutCommand(options: StashAndCheckoutCommandOptions): string {
  const parts = ['git stash && git checkout', options.branch];
  if (options.pull) parts.push('&& git pull');
  return parts.join(' ');
}

export function buildRenameBranchCommand(options: RenameBranchCommandOptions): string {
  return `git branch -m ${options.oldName} ${options.newName}`;
}

export interface CreateBranchCommandOptions {
  name: string;
  startPoint: string;
  checkout: boolean;
}

export function buildCreateBranchCommand(options: CreateBranchCommandOptions): string {
  const { name, startPoint, checkout } = options;
  if (checkout) {
    return `git branch ${name} ${startPoint} && git checkout ${name}`;
  }
  return `git branch ${name} ${startPoint}`;
}

function quoteMessage(message: string): string {
  return `"${message.replace(/"/g, '\\"')}"`;
}

export function buildTagCommand(options: TagCommandOptions): string {
  const parts = ['git tag'];
  if (options.message) {
    parts.push('-a', options.name, '-m', quoteMessage(options.message), options.hash);
  } else {
    parts.push(options.name, options.hash);
  }
  return parts.join(' ');
}

export function buildDiscardFilesCommand(paths: string[]): string {
  return `git checkout -- ${paths.join(' ')}`;
}

export function buildDiscardAllUnstagedCommand(): string {
  return 'git checkout -- . && git clean -fd';
}

export interface StashWithMessageCommandOptions {
  message?: string;
}

export function buildStashWithMessageCommand(options: StashWithMessageCommandOptions): string {
  const parts = ['git stash push --include-untracked'];
  if (options.message) {
    parts.push('-m', quoteMessage(options.message));
  }
  return parts.join(' ');
}

/**
 * Wraps a path in double quotes when it contains whitespace or shell-significant
 * characters; returns it as-is otherwise so simple paths stay readable.
 */
function quotePath(path: string): string {
  if (/[\s"'$`\\]/.test(path)) {
    return `"${path.replace(/"/g, '\\"')}"`;
  }
  return path;
}

function joinPaths(paths: string[]): string {
  return paths.map(quotePath).join(' ');
}

export function buildSelectiveStageCommand(paths: string[]): string {
  return `git add -- ${joinPaths(paths)}`;
}

export function buildSelectiveUnstageCommand(paths: string[]): string {
  return `git reset HEAD -- ${joinPaths(paths)}`;
}

export interface SelectiveDiscardCommandOptions {
  trackedPaths: string[];
  untrackedPaths: string[];
}

/**
 * Mirrors the backend GitIndexService.discardFiles behavior:
 *   - tracked-only          → `git checkout -- <paths>`
 *   - tracked + untracked   → `git checkout -- <tracked> && git clean -fd -- <untracked>`
 *   - untracked-only        → `git clean -fd -- <paths>`
 */
export function buildSelectiveDiscardCommand(options: SelectiveDiscardCommandOptions): string {
  const { trackedPaths, untrackedPaths } = options;
  const hasTracked = trackedPaths.length > 0;
  const hasUntracked = untrackedPaths.length > 0;

  const checkoutCmd = hasTracked ? `git checkout -- ${joinPaths(trackedPaths)}` : '';
  const cleanCmd = hasUntracked ? `git clean -fd -- ${joinPaths(untrackedPaths)}` : '';

  if (hasTracked && hasUntracked) return `${checkoutCmd} && ${cleanCmd}`;
  if (hasTracked) return checkoutCmd;
  return cleanCmd;
}

export interface SelectiveStashCommandOptions {
  paths: string[];
  message: string;
  hasUntracked: boolean;
}

export function buildSelectiveStashCommand(options: SelectiveStashCommandOptions): string {
  const { paths, message, hasUntracked } = options;
  const pathsStr = joinPaths(paths);
  const stashCmd = `git stash push -m ${quoteMessage(message)} -- ${pathsStr}`;
  if (hasUntracked) {
    return `git add -- ${pathsStr} && ${stashCmd}`;
  }
  return stashCmd;
}

export interface AddWorktreeCommandOptions {
  path: string;
  ref: string;
  branchMode: WorktreeBranchMode;
  newBranchName?: string;
  force?: boolean;
}

export function buildAddWorktreeCommand(options: AddWorktreeCommandOptions): string {
  const parts = ['git worktree add'];
  if (options.force) parts.push('--force');
  if (options.branchMode === 'new') {
    parts.push('-b', options.newBranchName ?? '', quotePath(options.path), options.ref);
  } else if (options.branchMode === 'detached') {
    parts.push('--detach', quotePath(options.path), options.ref);
  } else {
    parts.push(quotePath(options.path), options.ref);
  }
  return parts.join(' ');
}

export interface RemoveWorktreeCommandOptions {
  path: string;
  force?: boolean;
}

export function buildRemoveWorktreeCommand(options: RemoveWorktreeCommandOptions): string {
  const parts = ['git worktree remove'];
  if (options.force) parts.push('--force');
  parts.push(quotePath(options.path));
  return parts.join(' ');
}

export function buildPruneWorktreeCommand(): string {
  return 'git worktree prune';
}

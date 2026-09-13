import * as fs from 'fs';
import * as path from 'path';
import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import type { GitVersion } from '../../shared/gitVersion.js';
import { buildRebaseArgs } from '../../shared/rebaseCommand.js';
import { buildRebaseEditorMessages, buildRebaseTodoLines } from '../../shared/rebaseTodo.js';
import type { InteractiveRebaseConfig, RebaseConflictInfo, RebaseEntry, RebaseState } from '../../shared/types.js';
import { validateHash, validateRefName } from '../utils/gitValidation.js';
import { isConflictStderr, trimCommitMessage } from '../utils/gitParsers.js';
import {
  createEditorScriptDir,
  removeEditorScriptDir,
  toShellPath,
  writeEditorFile,
  writeEditorScript,
} from './gitEditorScripts.js';

const REBASE_CONFLICT_MESSAGE =
  'Rebase paused due to conflict. Resolve conflicts in the Source Control panel, then continue.';

/**
 * What to say when a paused rebase has nothing to resolve: `git rebase -i`
 * stops on a commit whose changes are already in the new base.
 */
export const REBASE_STOPPED_ON_EMPTY_COMMIT_MESSAGE =
  'Rebase paused — git stopped at a commit that became empty. Continue or abort.';

/**
 * `%H\x1f%h\x1f%s\x1f%B` records, NUL-terminated by `-z`.
 *
 * `-z` is what makes `%B` readable at all: the raw message is multi-line, so a
 * newline-delimited stream cannot say where one commit ends and the next
 * begins. Fields inside a record stay unit-separated.
 */
const REBASE_ENTRY_FORMAT = '--format=%H\x1f%h\x1f%s\x1f%B';

function parseRebaseEntryRecords(stdout: string): RebaseEntry[] {
  const records = stdout.split('\0').filter((record) => record.length > 0);
  return records.map((record) => {
    // The message is last, so any `\x1f` it happens to contain rejoins into it
    // rather than shifting the fields before it.
    const [hash, abbreviatedHash, subject, ...messageParts] = record.split('\x1f');
    return {
      hash: hash.trim(),
      abbreviatedHash: abbreviatedHash.trim(),
      subject: subject.trim(),
      message: trimCommitMessage(messageParts.join('\x1f')),
      action: 'pick',
    };
  });
}

export interface RebaseOptions {
  ignoreDate?: boolean;
  /** Apply `fixup!`/`squash!`/`amend!` commits; the command form is chosen by `gitVersion`. */
  autosquash?: boolean;
  gitVersion?: GitVersion | null;
}

export class GitRebaseService {
  private executor: GitExecutor;
  private readonly rebaseMergeDir: string;
  private readonly rebaseApplyDir: string;
  private activeTmpDir: string | null = null;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
    this.rebaseMergeDir = path.join(workspacePath, '.git', 'rebase-merge');
    this.rebaseApplyDir = path.join(workspacePath, '.git', 'rebase-apply');
  }

  getRebaseState(): Result<{ state: RebaseState; conflictInfo?: RebaseConflictInfo }> {
    const inProgress = fs.existsSync(this.rebaseMergeDir) || fs.existsSync(this.rebaseApplyDir);
    if (!inProgress) {
      return ok({ state: 'idle' });
    }

    try {
      const conflictInfo = this.readConflictInfo();
      if (!conflictInfo.success) {
        return ok({ state: 'in-progress' });
      }
      return ok({ state: 'in-progress', conflictInfo: conflictInfo.value });
    } catch {
      return ok({ state: 'in-progress' });
    }
  }

  private readConflictInfo(): Result<RebaseConflictInfo> {
    const stoppedShaPath = path.join(this.rebaseMergeDir, 'stopped-sha');
    try {
      const conflictCommitHash = fs.readFileSync(stoppedShaPath, 'utf-8').trim();
      return ok({ conflictedFiles: [], conflictCommitHash, conflictCommitMessage: '', stoppedOnEmptyCommit: false });
    } catch {
      return err(new GitError('No stopped-sha file found', 'COMMAND_FAILED'));
    }
  }

  async getRebaseCommits(baseHash: string): Promise<Result<RebaseEntry[]>> {
    const hashCheck = validateHash(baseHash);
    if (!hashCheck.success) return hashCheck;

    const result = await this.executor.execute({
      args: ['log', '--reverse', '--ancestry-path', '-z', REBASE_ENTRY_FORMAT, `${baseHash}..HEAD`, '--'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;

    return ok(parseRebaseEntryRecords(result.value.stdout));
  }

  /**
   * The commits `git rebase <upstream>` would replay, oldest first.
   *
   * Separate from `getRebaseCommits`, whose `--ancestry-path` returns nothing
   * when the upstream is on another branch, and which accepts only a hash while
   * the badge menu rebases onto a ref name. The walk mirrors how git builds its
   * todo list: merges are left out because a plain rebase drops them,
   * `--cherry-pick --right-only` over the symmetric range drops commits whose
   * patch is already upstream (so a `fixup!` whose target git skips is not
   * counted as applied), and `--topo-order` gives git's order, which autosquash
   * matching ("earlier commits only") depends on.
   */
  async getRebaseRangeCommits(upstream: string): Promise<Result<RebaseEntry[]>> {
    const refCheck = validateRefName(upstream);
    if (!refCheck.success) return refCheck;

    const result = await this.executor.execute({
      args: [
        'log', '--reverse', '--topo-order', '--no-merges', '--right-only', '--cherry-pick', '-z', REBASE_ENTRY_FORMAT,
        `${upstream}...HEAD`, '--',
      ],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;

    return ok(parseRebaseEntryRecords(result.value.stdout));
  }

  async rebase(targetRef: string, options: RebaseOptions = {}): Promise<Result<string>> {
    const refCheck = validateRefName(targetRef);
    if (!refCheck.success) return refCheck;
    // A new rebase must never continue with an earlier interactive rebase's
    // message editor: the `-i --autosquash` form opens the editor for squash
    // groups, and leftover message files would be written into them.
    this.cleanupActiveTmpDir();

    const { args, needsNoOpSequenceEditor } = buildRebaseArgs({
      targetRef,
      ignoreDate: options.ignoreDate ?? false,
      autosquash: options.autosquash ?? false,
      gitVersion: options.gitVersion ?? null,
    });

    this.log.info(`Rebase: git ${args.join(' ')}`);
    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
      // `true` exits 0 without touching the file, so git's own autosquashed
      // todo list runs as prepared.
      env: needsNoOpSequenceEditor ? { GIT_SEQUENCE_EDITOR: 'true' } : undefined,
    });

    if (!result.success) {
      const stderr = result.error.stderr ?? '';
      if (this.isRebaseConflict(stderr)) {
        return err(new GitError(REBASE_CONFLICT_MESSAGE, 'REBASE_CONFLICT'));
      }
      return result;
    }

    return ok('Rebase completed successfully.');
  }

  async interactiveRebase(config: InteractiveRebaseConfig): Promise<Result<string>> {
    const hashCheck = validateHash(config.baseHash);
    if (!hashCheck.success) return hashCheck;
    this.cleanupActiveTmpDir();

    const tmpDir = createEditorScriptDir('speedy-rebase');
    const env = this.writeTempScripts(tmpDir, config);

    this.log.info(`Interactive rebase from: ${config.baseHash}`);
    const result = await this.executor.execute({
      args: ['rebase', '-i', config.baseHash],
      cwd: this.workspacePath,
      env,
    });

    if (!result.success) {
      const stderr = result.error.stderr ?? '';
      if (this.isRebaseConflict(stderr)) {
        this.activeTmpDir = tmpDir;
        return err(new GitError(REBASE_CONFLICT_MESSAGE, 'REBASE_CONFLICT'));
      }
      removeEditorScriptDir(tmpDir);
      return result;
    }

    removeEditorScriptDir(tmpDir);
    return ok('Interactive rebase completed successfully.');
  }

  async abortRebase(): Promise<Result<string>> {
    this.log.info('Abort rebase');
    const result = await this.executor.execute({
      args: ['rebase', '--abort'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    this.cleanupActiveTmpDir();
    return ok('Rebase aborted.');
  }

  async continueRebase(): Promise<Result<string>> {
    this.log.info('Continue rebase');
    // A paused interactive rebase still needs its own message editor for the
    // reword/squash steps ahead; without one, `GitExecutor`'s default no-op editor
    // accepts each prepared message unchanged.
    const editorEnv = this.activeTmpDir
      ? { GIT_EDITOR: toShellPath(path.join(this.activeTmpDir, 'editor.sh')) }
      : undefined;
    const result = await this.executor.execute({
      args: ['rebase', '--continue'],
      cwd: this.workspacePath,
      env: editorEnv,
    });
    if (!result.success) {
      const stderr = result.error.stderr ?? '';
      if (this.isRebaseConflict(stderr)) {
        return err(new GitError(
          'Rebase paused due to conflict on the next commit. Resolve conflicts and continue again.',
          'REBASE_CONFLICT'
        ));
      }
      return result;
    }
    this.cleanupActiveTmpDir();
    return ok('Rebase continued successfully.');
  }

  async getConflictInfo(): Promise<Result<RebaseConflictInfo>> {
    let conflictCommitHash = '';
    // Try rebase-merge first (interactive rebase)
    const stoppedShaPath = path.join(this.rebaseMergeDir, 'stopped-sha');
    try { conflictCommitHash = fs.readFileSync(stoppedShaPath, 'utf-8').trim(); } catch { /* try rebase-apply */ }
    // Fallback: rebase-apply (standard rebase, git >= 2.25)
    if (!conflictCommitHash) {
      const originalCommitPath = path.join(this.rebaseApplyDir, 'original-commit');
      try { conflictCommitHash = fs.readFileSync(originalCommitPath, 'utf-8').trim(); } catch { /* unavailable */ }
    }

    const [statusResult, logResult] = await Promise.all([
      this.executor.execute({ args: ['status', '--short'], cwd: this.workspacePath }),
      conflictCommitHash
        ? this.executor.execute({ args: ['log', '--format=%s', '-1', conflictCommitHash], cwd: this.workspacePath })
        : Promise.resolve(null),
    ]);

    const conflictedFiles: string[] = [];
    let hasTrackedChanges = false;
    if (statusResult.success) {
      for (const line of statusResult.value.stdout.split('\n')) {
        if (line.length === 0) continue;
        const code = line.substring(0, 2);
        if (/^(UU|AA|DD|AU|UA|DU|UD)/.test(code)) {
          conflictedFiles.push(line.substring(3).trim());
        }
        if (code !== '??' && code !== '!!') hasTrackedChanges = true;
      }
    }

    const conflictCommitMessage = logResult?.success ? logResult.value.stdout.trim() : '';
    // Nothing conflicted and nothing left in the index or worktree: git stopped
    // because the commit became empty, not because anything needs resolving.
    // Only claimed when status was actually read. A clean tree alone is not
    // enough: git also pauses cleanly at an `edit` line or when a reword's
    // `commit-msg` hook rejects, and both leave `rebase-merge/amend` behind,
    // which an empty-commit stop never writes.
    const stoppedOnEmptyCommit =
      statusResult.success &&
      !hasTrackedChanges &&
      fs.existsSync(this.rebaseMergeDir) &&
      !fs.existsSync(path.join(this.rebaseMergeDir, 'amend'));

    return ok({ conflictedFiles, conflictCommitHash, conflictCommitMessage, stoppedOnEmptyCommit });
  }

  /** Write the todo list, editor messages and both editor scripts; returns the environment to run git with. */
  private writeTempScripts(tmpDir: string, config: InteractiveRebaseConfig): Record<string, string> {
    const todoPath = writeEditorFile(tmpDir, 'todo.txt', buildRebaseTodoLines(config.entries).join('\n') + '\n');

    // Sequence editor: copy our todo.txt over the file git passes.
    const sequenceEditor = writeEditorScript(tmpDir, 'sequence-editor.sh', ['cp "$SPEEDY_TODO_FILE" "$1"']);

    // One message file per editor call, numbered in the order git makes the calls.
    buildRebaseEditorMessages(config.entries, config.squashMessages).forEach((message, index) => {
      writeEditorFile(tmpDir, `message-${index}.txt`, message);
    });
    const counterPath = writeEditorFile(tmpDir, 'counter.txt', '0');

    // Editor: copy message-N.txt over $1, then advance the counter.
    const messageEditor = writeEditorScript(tmpDir, 'editor.sh', [
      'COUNTER=$(cat "$SPEEDY_COUNTER_FILE")',
      'MSG_FILE="${SPEEDY_REBASE_DIR}/message-${COUNTER}.txt"',
      'if [ -f "$MSG_FILE" ]; then',
      '  cp "$MSG_FILE" "$1"',
      'fi',
      'echo $((COUNTER + 1)) > "$SPEEDY_COUNTER_FILE"',
    ]);

    return {
      GIT_SEQUENCE_EDITOR: sequenceEditor,
      GIT_EDITOR: messageEditor,
      SPEEDY_TODO_FILE: todoPath,
      SPEEDY_REBASE_DIR: toShellPath(tmpDir),
      SPEEDY_COUNTER_FILE: counterPath,
    };
  }

  private cleanupActiveTmpDir(): void {
    if (this.activeTmpDir) {
      removeEditorScriptDir(this.activeTmpDir);
      this.activeTmpDir = null;
    }
  }

  private isRebaseConflict(stderr: string): boolean {
    return fs.existsSync(this.rebaseMergeDir) || fs.existsSync(this.rebaseApplyDir) || isConflictStderr(stderr);
  }
}

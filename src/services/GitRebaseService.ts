import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import type { InteractiveRebaseConfig, RebaseConflictInfo, RebaseEntry, RebaseState } from '../../shared/types.js';
import { validateHash } from '../utils/gitValidation.js';
import { isConflictStderr } from '../utils/gitParsers.js';

export class GitRebaseService {
  private executor: GitExecutor;
  private readonly rebaseMergeDir: string;
  private readonly rebaseApplyDir: string;

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
      return ok({ conflictedFiles: [], conflictCommitHash, conflictCommitMessage: '' });
    } catch {
      return err(new GitError('No stopped-sha file found', 'COMMAND_FAILED'));
    }
  }

  async isDirtyWorkingTree(): Promise<Result<boolean>> {
    const result = await this.executor.execute({
      args: ['status', '--porcelain'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(result.value.stdout.trim().length > 0);
  }

  async getRebaseCommits(baseHash: string): Promise<Result<RebaseEntry[]>> {
    const hashCheck = validateHash(baseHash);
    if (!hashCheck.success) return hashCheck;

    const result = await this.executor.execute({
      args: ['log', '--reverse', '--ancestry-path', '--format=%H\x1f%h\x1f%s', `${baseHash}..HEAD`, '--'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;

    const lines = result.value.stdout.trim().split('\n').filter(Boolean);
    const entries: RebaseEntry[] = lines.map((line) => {
      const [hash, abbreviatedHash, ...subjectParts] = line.split('\x1f');
      return {
        hash: hash.trim(),
        abbreviatedHash: abbreviatedHash.trim(),
        subject: subjectParts.join('\x1f').trim(),
        action: 'pick',
      };
    });

    return ok(entries);
  }

  async rebase(targetRef: string, ignoreDate = false): Promise<Result<string>> {
    if (!targetRef || targetRef.startsWith('-')) {
      return err(new GitError(`Invalid targetRef: ${targetRef}`, 'VALIDATION_ERROR'));
    }

    this.log.info(`Rebase onto: ${targetRef}${ignoreDate ? ' (--ignore-date)' : ''}`);
    const args = ['rebase', targetRef];
    if (ignoreDate) args.push('--ignore-date');
    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
    });

    if (!result.success) {
      const stderr = result.error.stderr ?? '';
      if (this.isRebaseConflict(stderr)) {
        return err(new GitError(
          'Rebase paused due to conflict. Resolve conflicts in the Source Control panel, then continue.',
          'REBASE_CONFLICT'
        ));
      }
      return result;
    }

    return ok('Rebase completed successfully.');
  }

  async interactiveRebase(config: InteractiveRebaseConfig): Promise<Result<string>> {
    const hashCheck = validateHash(config.baseHash);
    if (!hashCheck.success) return hashCheck;

    const tmpDir = path.join(os.tmpdir(), `speedy-rebase-${crypto.randomUUID()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      this.writeTempScripts(tmpDir, config);

      const sequenceEditor = path.join(tmpDir, 'sequence-editor.sh');
      const messageEditor = path.join(tmpDir, 'editor.sh');

      this.log.info(`Interactive rebase from: ${config.baseHash}`);
      const result = await this.executor.execute({
        args: ['rebase', '-i', config.baseHash],
        cwd: this.workspacePath,
        env: {
          GIT_SEQUENCE_EDITOR: sequenceEditor,
          GIT_EDITOR: messageEditor,
        },
      });

      if (!result.success) {
        const stderr = result.error.stderr ?? '';
        if (this.isRebaseConflict(stderr)) {
          return err(new GitError(
            'Rebase paused due to conflict. Resolve conflicts in the Source Control panel, then continue.',
            'REBASE_CONFLICT'
          ));
        }
        return result;
      }

      return ok('Interactive rebase completed successfully.');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  async abortRebase(): Promise<Result<string>> {
    this.log.info('Abort rebase');
    const result = await this.executor.execute({
      args: ['rebase', '--abort'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok('Rebase aborted.');
  }

  async continueRebase(): Promise<Result<string>> {
    this.log.info('Continue rebase');
    const result = await this.executor.execute({
      args: ['rebase', '--continue'],
      cwd: this.workspacePath,
      env: { GIT_EDITOR: 'true' },
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
    return ok('Rebase continued successfully.');
  }

  async getConflictInfo(): Promise<Result<RebaseConflictInfo>> {
    const stoppedShaPath = path.join(this.rebaseMergeDir, 'stopped-sha');
    let conflictCommitHash = '';
    try {
      conflictCommitHash = fs.readFileSync(stoppedShaPath, 'utf-8').trim();
    } catch { /* file absent — rebase stopped on unknown commit */ }

    const [statusResult, logResult] = await Promise.all([
      this.executor.execute({ args: ['status', '--short'], cwd: this.workspacePath }),
      conflictCommitHash
        ? this.executor.execute({ args: ['log', '--format=%s', '-1', conflictCommitHash], cwd: this.workspacePath })
        : Promise.resolve(null),
    ]);

    const conflictedFiles: string[] = [];
    if (statusResult.success) {
      for (const line of statusResult.value.stdout.split('\n')) {
        const code = line.substring(0, 2);
        if (/^(UU|AA|DD|AU|UA|DU|UD)/.test(code)) {
          conflictedFiles.push(line.substring(3).trim());
        }
      }
    }

    const conflictCommitMessage = logResult?.success ? logResult.value.stdout.trim() : '';

    return ok({ conflictedFiles, conflictCommitHash, conflictCommitMessage });
  }

  private writeTempScripts(tmpDir: string, config: InteractiveRebaseConfig): void {
    // Build todo sequence
    const todoLines = config.entries.map((entry) => `${entry.action} ${entry.hash} ${entry.subject}`);
    const todoPath = path.join(tmpDir, 'todo.txt');
    fs.writeFileSync(todoPath, todoLines.join('\n') + '\n', 'utf-8');

    // Sequence editor: copy our todo.txt to the file git passes
    const seqEditor = `#!/bin/sh\ncp "${todoPath}" "$1"\n`;
    const seqEditorPath = path.join(tmpDir, 'sequence-editor.sh');
    fs.writeFileSync(seqEditorPath, seqEditor, { mode: 0o755 });

    // Write message files (reword entries + squash group messages)
    let msgIndex = 0;
    for (const entry of config.entries) {
      if (entry.action === 'reword' && entry.rewordMessage) {
        const msgPath = path.join(tmpDir, `message-${msgIndex}.txt`);
        fs.writeFileSync(msgPath, entry.rewordMessage, 'utf-8');
        msgIndex++;
      }
    }
    for (const sqMsg of config.squashMessages) {
      const msgPath = path.join(tmpDir, `message-${msgIndex}.txt`);
      fs.writeFileSync(msgPath, sqMsg.combinedMessage, 'utf-8');
      msgIndex++;
    }

    // Counter file for editor
    const counterPath = path.join(tmpDir, 'counter.txt');
    fs.writeFileSync(counterPath, '0', 'utf-8');

    // Editor script: reads message-N.txt → $1, increments counter
    const editorScript = [
      '#!/bin/sh',
      `COUNTER=$(cat "${counterPath}")`,
      `MSG_FILE="${tmpDir}/message-$COUNTER.txt"`,
      'if [ -f "$MSG_FILE" ]; then',
      '  cp "$MSG_FILE" "$1"',
      'fi',
      `echo $((COUNTER + 1)) > "${counterPath}"`,
    ].join('\n') + '\n';
    const editorPath = path.join(tmpDir, 'editor.sh');
    fs.writeFileSync(editorPath, editorScript, { mode: 0o755 });
  }

  private isRebaseConflict(stderr: string): boolean {
    return fs.existsSync(this.rebaseMergeDir) || fs.existsSync(this.rebaseApplyDir) || isConflictStderr(stderr);
  }
}

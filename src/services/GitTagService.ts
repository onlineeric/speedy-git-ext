import type { LogOutputChannel } from 'vscode';
import type { TagMetadata } from '../../shared/types.js';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';
import { parseTagMetadata } from '../utils/gitParsers.js';
import { validateRefName, validateHash, validateTagName } from '../utils/gitValidation.js';

export class GitTagService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async createTag(name: string, hash: string, message?: string): Promise<Result<string>> {
    this.log.info(`Create tag: ${name} at ${hash}${message ? ' (annotated)' : ''}`);
    const nameCheck = validateTagName(name);
    if (!nameCheck.success) return nameCheck;
    const tagName = nameCheck.value;
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;

    const args = ['tag'];
    if (message) {
      args.push('-a', '-m', message);
    }
    args.push(tagName, hash);

    const result = await this.executor.execute({ args, cwd: this.workspacePath });
    if (!result.success) return result;
    return ok(`Created tag '${tagName}'`);
  }

  async deleteTag(name: string): Promise<Result<string>> {
    this.log.info(`Delete tag: ${name}`);
    const nameCheck = validateTagName(name);
    if (!nameCheck.success) return nameCheck;
    const tagName = nameCheck.value;

    const result = await this.executor.execute({
      args: ['tag', '-d', tagName],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(`Deleted tag '${tagName}'`);
  }

  async pushTag(name: string, remote?: string, force?: boolean): Promise<Result<string>> {
    this.log.info(`Push tag: ${name} to ${remote ?? 'origin'}${force ? ' (force)' : ''}`);
    const nameCheck = validateTagName(name);
    if (!nameCheck.success) return nameCheck;
    const tagName = nameCheck.value;
    if (remote) {
      const remoteCheck = validateRefName(remote);
      if (!remoteCheck.success) return remoteCheck;
    }

    const result = await this.executor.execute({
      args: ['push', remote ?? 'origin', ...(force ? ['--force'] : []), `refs/tags/${tagName}`],
      cwd: this.workspacePath,
      timeout: 60000,
    });
    if (!result.success) return result;
    return ok(`Pushed tag '${tagName}'`);
  }

  /**
   * Delete a tag from the remote (`git push <remote> --delete <name>`). A missing
   * remote tag is a benign no-op (`ok`), so deleting a local-only tag with the
   * "also delete from remote" option doesn't surface an error (FR-013). The forced
   * `LC_ALL=C` locale keeps git's stderr English so the substring match is stable.
   */
  async deleteRemoteTag(remote: string, name: string): Promise<Result<string>> {
    this.log.info(`Delete remote tag: ${name} from ${remote}`);
    const remoteCheck = validateRefName(remote);
    if (!remoteCheck.success) return remoteCheck;
    const nameCheck = validateTagName(name);
    if (!nameCheck.success) return nameCheck;
    const tagName = nameCheck.value;

    const result = await this.executor.execute({
      args: ['push', remote, '--delete', tagName],
      cwd: this.workspacePath,
      timeout: 60000,
      env: { LC_ALL: 'C' },
    });
    if (!result.success) {
      if (result.error.message.toLowerCase().includes('remote ref does not exist')) {
        return ok(`Remote tag '${tagName}' did not exist on ${remote}`);
      }
      return result;
    }
    return ok(`Deleted remote tag '${tagName}' from ${remote}`);
  }

  /**
   * Read annotation metadata for every tag in one local `for-each-ref` (no network).
   * Fields are NUL-delimited so full annotation messages can carry line breaks.
   */
  async getTagMetadata(): Promise<Result<TagMetadata[]>> {
    const result = await this.executor.execute({
      args: [
        'for-each-ref',
        '--format=%(refname:short)%00%(objecttype)%00%(contents)%00%(taggername)%00%(taggerdate:unix)%00',
        'refs/tags',
      ],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(parseTagMetadata(result.value.stdout));
  }
}

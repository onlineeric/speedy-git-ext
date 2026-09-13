import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * One mechanism for "git will open an editor here; supply this text instead".
 *
 * Git runs `GIT_EDITOR` / `GIT_SEQUENCE_EDITOR` through the shell with the file
 * to edit as `$1`. Every script is a fixed `#!/bin/sh` body; the paths it needs
 * reach it through `SPEEDY_*` environment variables rather than being written
 * into the script, so a temp path containing quotes or `$` can never be
 * interpreted as shell.
 */

/** Convert Windows backslash paths to forward slashes for Git's shell. */
export function toShellPath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** A fresh private directory under the OS temp dir for one operation's scripts and message files. */
export function createEditorScriptDir(prefix: string): string {
  const dir = path.join(os.tmpdir(), `${prefix}-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function removeEditorScriptDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/** Write an executable `#!/bin/sh` script; returns its shell-form path, ready for an `*_EDITOR` variable. */
export function writeEditorScript(dir: string, name: string, bodyLines: readonly string[]): string {
  const scriptPath = path.join(dir, name);
  fs.writeFileSync(scriptPath, ['#!/bin/sh', ...bodyLines].join('\n') + '\n', { mode: 0o755 });
  return toShellPath(scriptPath);
}

/** Write a plain text file; returns its shell-form path. */
export function writeEditorFile(dir: string, name: string, content: string): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return toShellPath(filePath);
}

/**
 * An editor that keeps the first line git prepared and replaces everything
 * below it with `message`.
 *
 * Built for `git commit --fixup=amend:` / `--fixup=reword:`, which refuse `-m`
 * and `-F` and prefill `amend! <subject>`, a blank line, then the target's
 * message. That first line is what autosquash matches on, so it must survive;
 * the rest becomes the target's new message when the `amend!` commit is squashed.
 *
 * Returns the environment to run git with.
 */
export function prepareMessageReplacingEditor(dir: string, message: string): Record<string, string> {
  const messagePath = writeEditorFile(dir, 'message.txt', message);
  const editedPath = toShellPath(path.join(dir, 'edited.txt'));
  const editor = writeEditorScript(dir, 'replace-message-editor.sh', [
    '{ head -n 1 "$1"; echo; cat "$SPEEDY_MESSAGE_FILE"; } > "$SPEEDY_EDITED_FILE" && cp "$SPEEDY_EDITED_FILE" "$1"',
  ]);
  return {
    GIT_EDITOR: editor,
    SPEEDY_MESSAGE_FILE: messagePath,
    SPEEDY_EDITED_FILE: editedPath,
  };
}

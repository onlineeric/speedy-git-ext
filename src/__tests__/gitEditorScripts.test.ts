import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, writeFileSync: vi.fn(), mkdirSync: vi.fn(), rmSync: vi.fn() };
});

import * as fs from 'fs';
import { prepareMessageReplacingEditor, toShellPath, writeEditorScript } from '../services/gitEditorScripts.js';

describe('gitEditorScripts', () => {
  beforeEach(() => vi.mocked(fs.writeFileSync).mockReset());

  it('converts Windows paths to shell form', () => {
    expect(toShellPath('C:\\Users\\me\\tmp')).toBe('C:/Users/me/tmp');
  });

  it('writes an executable #!/bin/sh script', () => {
    writeEditorScript('/tmp/d', 'x.sh', ['echo hi']);
    const [, content, options] = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(content).toBe('#!/bin/sh\necho hi\n');
    expect(options).toEqual({ mode: 0o755 });
  });

  it('message-replacing editor keeps the first line and reads every path from the environment', () => {
    const env = prepareMessageReplacingEditor('/tmp/d', 'New subject\n\nBody with "quotes" and $dollars');
    const calls = vi.mocked(fs.writeFileSync).mock.calls;
    const messageWrite = calls.find(([file]) => String(file).endsWith('message.txt'));
    const scriptWrite = calls.find(([file]) => String(file).endsWith('.sh'));

    expect(messageWrite?.[1]).toBe('New subject\n\nBody with "quotes" and $dollars');
    // The message never reaches the script body; only env-var references do.
    expect(String(scriptWrite?.[1])).not.toContain('/tmp/d');
    expect(String(scriptWrite?.[1])).toContain('head -n 1 "$1"');
    expect(env).toEqual({
      GIT_EDITOR: expect.stringMatching(/replace-message-editor\.sh$/),
      SPEEDY_MESSAGE_FILE: expect.stringMatching(/message\.txt$/),
      SPEEDY_EDITED_FILE: expect.stringMatching(/edited\.txt$/),
    });
  });
});

import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitExecutor } from '../services/GitExecutor.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

describe('GitExecutor abort handling', () => {
  it('short-circuits when abortSignal is already aborted before execute is called', async () => {
    const executor = new GitExecutor(mockLog);
    const controller = new AbortController();
    controller.abort();

    const result = await executor.execute({
      args: ['version'],
      cwd: '/',
      abortSignal: controller.signal,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CANCELLED');
      expect(result.error.command).toBe('git version');
    }
  });

  it('returns CANCELLED when abort fires while a git command is running', async () => {
    const executor = new GitExecutor(mockLog);
    const controller = new AbortController();

    // Use this repo's workspace as cwd so `cat-file --batch` doesn't fail with
    // NOT_A_REPOSITORY before abort fires. The command reads from stdin and
    // blocks indefinitely, giving the abort path time to win.
    const promise = executor.execute({
      args: ['cat-file', '--batch'],
      cwd: process.cwd(),
      abortSignal: controller.signal,
    });

    // Give spawn time to start, then abort.
    await new Promise(resolve => setTimeout(resolve, 50));
    controller.abort();

    const result = await promise;
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CANCELLED');
    }
  });
});

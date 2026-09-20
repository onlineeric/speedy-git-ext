import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { createGitServices } from '../webview/createGitServices.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

/** Every member of the set, so a service added without a line here fails the test. */
const EXPECTED_MEMBERS = [
  'gitLogService', 'gitDiffService', 'gitBranchService', 'gitRemoteService', 'gitTagService',
  'gitStashService', 'gitHistoryService', 'gitCherryPickService', 'gitRevertService',
  'gitRebaseService', 'gitSignatureService', 'gitSubmoduleService', 'gitWorktreeService',
  'gitIndexService', 'gitCommitService',
];

describe('createGitServices', () => {
  it('creates every member of the set', () => {
    const services = createGitServices('/repos/a', mockLog);
    expect(Object.keys(services).sort()).toEqual([...EXPECTED_MEMBERS].sort());
    for (const member of EXPECTED_MEMBERS) {
      expect(services[member as keyof typeof services]).toBeDefined();
    }
  });

  it('binds every service to the given repository path', () => {
    const services = createGitServices('/repos/a', mockLog);
    for (const member of EXPECTED_MEMBERS) {
      const service = services[member as keyof typeof services] as unknown as Record<string, unknown>;
      expect(service.workspacePath, `${member} is not bound to the repo path`).toBe('/repos/a');
    }
  });

  it('creates independent sets for two repositories', () => {
    const a = createGitServices('/repos/a', mockLog);
    const b = createGitServices('/repos/b', mockLog);
    expect(a.gitLogService).not.toBe(b.gitLogService);
  });
});

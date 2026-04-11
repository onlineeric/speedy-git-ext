import { describe, it, expect } from 'vitest';
import {
  buildSelectiveStashCommand,
  buildSelectiveDiscardCommand,
  buildSelectiveStageCommand,
  buildSelectiveUnstageCommand,
} from '../gitCommandBuilder';
import { buildDefaultStashMessage } from '../stashMessage';

describe('buildSelectiveStashCommand', () => {
  it('no untracked → single `git stash push` form (FR-028b)', () => {
    expect(
      buildSelectiveStashCommand({
        paths: ['a.ts', 'b.ts'],
        message: 'WIP',
        hasUntracked: false,
      }),
    ).toBe('git stash push -m "WIP" -- a.ts b.ts');
  });

  it('with untracked → `&&`-joined add-then-stash form on single line (FR-028a)', () => {
    expect(
      buildSelectiveStashCommand({
        paths: ['a.ts', 'new.txt'],
        message: 'WIP',
        hasUntracked: true,
      }),
    ).toBe('git add -- a.ts new.txt && git stash push -m "WIP" -- a.ts new.txt');
  });

  it('quotes paths containing spaces', () => {
    expect(
      buildSelectiveStashCommand({
        paths: ['src/file with space.ts', 'normal.ts'],
        message: 'WIP',
        hasUntracked: false,
      }),
    ).toBe('git stash push -m "WIP" -- "src/file with space.ts" normal.ts');
  });

  it('escapes embedded double quotes in the stash message', () => {
    expect(
      buildSelectiveStashCommand({
        paths: ['a.ts'],
        message: 'say "hi"',
        hasUntracked: false,
      }),
    ).toBe('git stash push -m "say \\"hi\\"" -- a.ts');
  });

  it('empty-message auto-generated form (caller passed the default) still uses quoted -m', () => {
    const defaultMessage = buildDefaultStashMessage(1, 'dev');
    expect(
      buildSelectiveStashCommand({
        paths: ['a.ts'],
        message: defaultMessage,
        hasUntracked: false,
      }),
    ).toBe(`git stash push -m "${defaultMessage}" -- a.ts`);
  });
});

describe('buildSelectiveDiscardCommand', () => {
  it('tracked only → `git checkout --`', () => {
    expect(
      buildSelectiveDiscardCommand({ trackedPaths: ['a.ts', 'b.ts'], untrackedPaths: [] }),
    ).toBe('git checkout -- a.ts b.ts');
  });

  it('tracked + untracked → `&&`-joined checkout then clean', () => {
    expect(
      buildSelectiveDiscardCommand({ trackedPaths: ['a.ts'], untrackedPaths: ['new.txt'] }),
    ).toBe('git checkout -- a.ts && git clean -fd -- new.txt');
  });

  it('untracked only → `git clean -fd --`', () => {
    expect(
      buildSelectiveDiscardCommand({ trackedPaths: [], untrackedPaths: ['new.txt', 'junk.log'] }),
    ).toBe('git clean -fd -- new.txt junk.log');
  });

  it('quotes paths with spaces in either set', () => {
    expect(
      buildSelectiveDiscardCommand({
        trackedPaths: ['src/with space.ts'],
        untrackedPaths: ['new file.txt'],
      }),
    ).toBe('git checkout -- "src/with space.ts" && git clean -fd -- "new file.txt"');
  });
});

describe('buildSelectiveStageCommand / buildSelectiveUnstageCommand', () => {
  it('stage: `git add --`', () => {
    expect(buildSelectiveStageCommand(['a.ts', 'b.ts'])).toBe('git add -- a.ts b.ts');
  });
  it('unstage: `git reset HEAD --`', () => {
    expect(buildSelectiveUnstageCommand(['a.ts'])).toBe('git reset HEAD -- a.ts');
  });
});

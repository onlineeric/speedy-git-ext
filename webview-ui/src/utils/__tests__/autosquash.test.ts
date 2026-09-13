import { describe, expect, it } from 'vitest';
import type { RebaseEntry } from '@shared/types';
import {
  amendReplacementMessage,
  applyAutosquash,
  findAutosquashLinks,
  parseAutosquashSubject,
  revertAutosquash,
} from '../autosquash';

function entry(hash: string, subject: string, message = subject): RebaseEntry {
  return { hash: hash.padEnd(40, '0'), abbreviatedHash: hash, subject, message, action: 'pick' };
}

const actionsOf = (entries: RebaseEntry[]) => entries.map((e) => `${e.action} ${e.abbreviatedHash}`);

/**
 * Captured from git 2.43: `git rebase -i --autosquash` over exactly these commits
 * produced the todo list asserted below (with `fixup -C` for amend!).
 */
const GIT_FIXTURE = [
  entry('1bf6fa2', 'A subject'),
  entry('070c68f', 'B subject'),
  entry('7a40e3a', 'Dup'),
  entry('676fe93', 'Dup'),
  entry('e774394', 'C long subject'),
  entry('5eaf01b', 'fixup! A subject'),
  entry('6e3c07f', 'squash! B subject'),
  entry('089b79e', 'amend! A subject', 'amend! A subject\n\nFirst replacement'),
  entry('9a9b4a1', 'fixup! fixup! B subject'),
  entry('c76a40c', 'fixup! Dup'),
  entry('21a3a2e', 'squash! C long'),
  entry('4e2a3de', 'fixup! 1bf6fa2'),
  entry('a48fd8e', 'fixup! Missing'),
  entry('f2afb9f', 'amend! fixup! A subject', 'amend! fixup! A subject\n\nLast replacement\n\nBody'),
];

describe('parseAutosquashSubject', () => {
  it('reads the outermost kind and skips nested prefixes', () => {
    expect(parseAutosquashSubject('amend! fixup!  squash! X y')).toEqual({ kind: 'amend', targetText: 'X y' });
    expect(parseAutosquashSubject('squash! B')).toEqual({ kind: 'squash', targetText: 'B' });
  });

  it('ignores ordinary subjects and prefixes without the space', () => {
    expect(parseAutosquashSubject('fixup!B')).toBeNull();
    expect(parseAutosquashSubject('Fix fixup! B')).toBeNull();
  });
});

describe('findAutosquashLinks + applyAutosquash — git parity', () => {
  it("reproduces git's own autosquash plan", () => {
    const { links, unmatched, ambiguousSubjects } = findAutosquashLinks(GIT_FIXTURE);
    const result = applyAutosquash(GIT_FIXTURE, links);

    expect(actionsOf(result)).toEqual([
      'reword 1bf6fa2',
      'fixup 5eaf01b',
      'fixup 089b79e',
      'fixup 4e2a3de',
      'fixup f2afb9f',
      'pick 070c68f',
      'squash 6e3c07f',
      'fixup 9a9b4a1',
      'pick 7a40e3a',
      'fixup c76a40c',
      'pick 676fe93',
      'pick e774394',
      'squash 21a3a2e',
      'pick a48fd8e',
    ]);
    // The last amend! for a target wins, body only.
    expect(result[0].rewordMessage).toBe('Last replacement\n\nBody');
    expect(unmatched).toEqual(['a48fd8e'.padEnd(40, '0')]);
    expect(ambiguousSubjects).toEqual(['Dup']);
  });

  it('matches a subject prefix and a hash prefix', () => {
    const entries = [entry('abc1234', 'Long subject here'), entry('def5678', 'squash! Long sub'), entry('0001111', 'fixup! abc12')];
    const { links } = findAutosquashLinks(entries);
    expect(links.map((l) => [l.kind, l.targetHash.slice(0, 7)])).toEqual([['squash', 'abc1234'], ['fixup', 'abc1234']]);
  });

  it('only looks earlier in the list', () => {
    const entries = [entry('aaaaaaa', 'fixup! Later'), entry('bbbbbbb', 'Later')];
    expect(findAutosquashLinks(entries)).toMatchObject({ links: [], unmatched: ['aaaaaaa'.padEnd(40, '0')] });
  });

  it('flags a subject-prefix match that fits more than one commit', () => {
    const entries = [entry('aaaaaaa', 'Refactor one'), entry('bbbbbbb', 'Refactor two'), entry('ccccccc', 'fixup! Refactor')];
    const { links, ambiguousSubjects } = findAutosquashLinks(entries);
    expect(links[0].targetHash.slice(0, 7)).toBe('aaaaaaa');
    expect(ambiguousSubjects).toEqual(['Refactor']);
  });

  it('leaves the target alone for an amend! with no body', () => {
    const entries = [entry('aaaaaaa', 'A'), entry('bbbbbbb', 'amend! A', 'amend! A')];
    const result = applyAutosquash(entries, findAutosquashLinks(entries).links);
    expect(actionsOf(result)).toEqual(['pick aaaaaaa', 'fixup bbbbbbb']);
  });

  it('takes the reword message from a --fixup=reword: commit body', () => {
    const entries = [entry('aaaaaaa', 'A'), entry('bbbbbbb', 'amend! A', 'amend! A\n\nA new\n\nBody')];
    const result = applyAutosquash(entries, findAutosquashLinks(entries).links);
    expect(result[0]).toMatchObject({ action: 'reword', rewordMessage: 'A new\n\nBody' });
  });
});

describe('amendReplacementMessage', () => {
  it('drops the title line and the blank lines after it', () => {
    expect(amendReplacementMessage('amend! X\n\n\nNew\n\n  indented')).toBe('New\n\n  indented');
    expect(amendReplacementMessage('amend! X')).toBe('');
  });
});

describe('revertAutosquash', () => {
  it('round-trips back to the original list', () => {
    const { links } = findAutosquashLinks(GIT_FIXTURE);
    const applied = applyAutosquash(GIT_FIXTURE, links);
    expect(revertAutosquash(applied, GIT_FIXTURE, links)).toEqual(
      GIT_FIXTURE.map((e) => ({ ...e, rewordMessage: undefined })),
    );
  });

  it('keeps unrelated manual edits and order', () => {
    const entries = [entry('aaaaaaa', 'A'), entry('bbbbbbb', 'B'), entry('ccccccc', 'C'), entry('ddddddd', 'fixup! A')];
    const { links } = findAutosquashLinks(entries);
    const applied = applyAutosquash(entries, links);
    // User swaps B and C, drops C, and changes the fixup to squash.
    const edited = [applied[0], { ...applied[1], action: 'squash' as const }, { ...applied[3], action: 'drop' as const }, applied[2]];

    expect(actionsOf(revertAutosquash(edited, entries, links))).toEqual([
      'pick aaaaaaa',
      'drop ccccccc',
      'pick bbbbbbb',
      'pick ddddddd',
    ]);
  });
});

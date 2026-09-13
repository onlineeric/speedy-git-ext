import { describe, expect, it } from 'vitest';
import { buildRebaseEditorMessages, buildRebaseTodoLines } from '../../shared/rebaseTodo.js';
import type { RebaseAction, RebaseEntry } from '../../shared/types.js';

function entry(id: string, action: RebaseAction, extra: Partial<RebaseEntry> = {}): RebaseEntry {
  return { hash: id.repeat(40), abbreviatedHash: id.repeat(7), subject: `${id} subject`, message: `${id} message`, action, ...extra };
}

describe('buildRebaseTodoLines', () => {
  it('formats "<action> <hash> <subject>" per entry', () => {
    expect(buildRebaseTodoLines([entry('a', 'reword'), entry('b', 'fixup')])).toEqual([
      `reword ${'a'.repeat(40)} a subject`,
      `fixup ${'b'.repeat(40)} b subject`,
    ]);
  });

  it('keeps subjects with # and unicode verbatim', () => {
    expect(buildRebaseTodoLines([entry('c', 'pick', { subject: '#123 修正 — ✓' })])).toEqual([
      `pick ${'c'.repeat(40)} #123 修正 — ✓`,
    ]);
  });
});

describe('buildRebaseEditorMessages', () => {
  it('asks for a squash group before a later reword', () => {
    const entries = [entry('a', 'pick'), entry('b', 'squash'), entry('c', 'reword', { rewordMessage: 'C new' }), entry('d', 'fixup')];
    const squash = [{ groupLeadHash: 'a'.repeat(40), combinedMessage: 'A+B' }];
    expect(buildRebaseEditorMessages(entries, squash)).toEqual(['A+B', 'C new']);
  });

  it('asks for a reword lead before its own squash group', () => {
    const entries = [entry('a', 'reword', { rewordMessage: 'A new' }), entry('b', 'squash')];
    const squash = [{ groupLeadHash: 'a'.repeat(40), combinedMessage: 'A new + B' }];
    expect(buildRebaseEditorMessages(entries, squash)).toEqual(['A new', 'A new + B']);
  });

  it('never asks for a fixup-only group, and skips drops', () => {
    const entries = [entry('a', 'pick'), entry('x', 'drop'), entry('b', 'fixup'), entry('c', 'pick')];
    expect(buildRebaseEditorMessages(entries, [])).toEqual([]);
  });

  it('keeps a slot for a reword with no edited message', () => {
    expect(buildRebaseEditorMessages([entry('a', 'reword'), entry('b', 'reword', { rewordMessage: 'B' })], [])).toEqual(['a message', 'B']);
  });
});

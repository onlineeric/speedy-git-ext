import { describe, expect, it } from 'vitest';
import type { RebaseEntry } from '@shared/types';
import { buildSquashMessages } from '../rebaseSquashMessages';

function entry(hash: string, subject: string, body: string, action: RebaseEntry['action'] = 'pick'): RebaseEntry {
  return {
    hash,
    abbreviatedHash: hash.slice(0, 7),
    subject,
    message: body ? `${subject}\n\n${body}` : subject,
    action,
  };
}

describe('buildSquashMessages', () => {
  it('combines the full message of every commit in the group, bodies included', () => {
    const groups = buildSquashMessages([
      entry('aaa1111', 'Add the widget', 'Why the widget exists.'),
      entry('bbb2222', 'Fix the widget', 'Co-authored-by: Someone <someone@example.com>', 'squash'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].groupLeadHash).toBe('aaa1111');
    expect(groups[0].combinedMessage).toBe(
      'Add the widget\n\nWhy the widget exists.\n\nFix the widget\n\nCo-authored-by: Someone <someone@example.com>'
    );
  });

  it('produces no group for a lone commit — it keeps the message it has', () => {
    expect(buildSquashMessages([entry('aaa1111', 'Add the widget', 'Body.')])).toEqual([]);
  });

  it('uses the typed reword text for a reword lead, not the original message', () => {
    const lead = { ...entry('aaa1111', 'Add the widget', 'Original body.', 'reword'), rewordMessage: 'Reworded\n\nNew body.' };
    const groups = buildSquashMessages([lead, entry('bbb2222', 'Fix it', 'Second body.', 'squash')]);

    expect(groups[0].combinedMessage).toBe('Reworded\n\nNew body.\n\nFix it\n\nSecond body.');
  });

  it('drops fixup and dropped entries from the combined message', () => {
    const groups = buildSquashMessages([
      entry('aaa1111', 'Lead', 'Lead body.'),
      entry('bbb2222', 'Fixup', 'Fixup body.', 'fixup'),
      entry('ccc3333', 'Dropped', 'Dropped body.', 'drop'),
      entry('ddd4444', 'Squashed', 'Squashed body.', 'squash'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].combinedMessage).toBe('Lead\n\nLead body.\n\nSquashed\n\nSquashed body.');
  });

  it('starts a new group at each pick', () => {
    const groups = buildSquashMessages([
      entry('aaa1111', 'First lead', 'A.'),
      entry('bbb2222', 'First squash', 'B.', 'squash'),
      entry('ccc3333', 'Second lead', 'C.'),
      entry('ddd4444', 'Second squash', 'D.', 'squash'),
    ]);

    expect(groups.map((g) => g.groupLeadHash)).toEqual(['aaa1111', 'ccc3333']);
  });
});

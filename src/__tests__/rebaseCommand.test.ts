import { describe, expect, it } from 'vitest';
import { buildRebaseArgs } from '../../shared/rebaseCommand.js';

describe('buildRebaseArgs', () => {
  it('leaves the plain rebase unchanged when autosquash is off, whatever the version', () => {
    for (const gitVersion of [null, [2, 30, 0], [2, 44, 0]] as const) {
      expect(buildRebaseArgs({ targetRef: 'main', ignoreDate: false, autosquash: false, gitVersion }))
        .toEqual({ args: ['rebase', 'main'], needsNoOpSequenceEditor: false });
    }
    expect(buildRebaseArgs({ targetRef: 'main', ignoreDate: true, autosquash: false, gitVersion: null }).args)
      .toEqual(['rebase', '--ignore-date', 'main']);
  });

  it('uses the command a user would type on git 2.44+', () => {
    expect(buildRebaseArgs({ targetRef: 'origin/main', ignoreDate: true, autosquash: true, gitVersion: [2, 44, 0] }))
      .toEqual({ args: ['rebase', '--autosquash', '--ignore-date', 'origin/main'], needsNoOpSequenceEditor: false });
  });

  it('uses the -i form with --empty=drop below 2.44', () => {
    expect(buildRebaseArgs({ targetRef: 'main', ignoreDate: false, autosquash: true, gitVersion: [2, 43, 0] }))
      .toEqual({ args: ['rebase', '-i', '--autosquash', '--empty=drop', 'main'], needsNoOpSequenceEditor: true });
  });

  it('uses the universal -i form when the version is unknown', () => {
    expect(buildRebaseArgs({ targetRef: 'main', ignoreDate: false, autosquash: true, gitVersion: null }).needsNoOpSequenceEditor)
      .toBe(true);
  });
});

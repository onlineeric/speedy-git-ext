import { describe, expect, it } from 'vitest';
import {
  describeGitTimeoutDraft,
  gitTimeoutDraftToSave,
  isGitTimeoutDraftChanged,
  toGitTimeoutDraft,
} from '../gitTimeoutDraft';

describe('gitTimeoutDraft', () => {
  it('starts from the saved value', () => {
    expect(toGitTimeoutDraft(60)).toBe('60');
    expect(toGitTimeoutDraft(0)).toBe('0');
  });

  it('counts as changed only when the applied limit would differ', () => {
    expect(isGitTimeoutDraftChanged('60', 60)).toBe(false);
    expect(isGitTimeoutDraftChanged('060', 60)).toBe(false);
    expect(isGitTimeoutDraftChanged('', 60)).toBe(false);
    expect(isGitTimeoutDraftChanged('', 120)).toBe(true);
    expect(isGitTimeoutDraftChanged('5', 15)).toBe(false);
    expect(isGitTimeoutDraftChanged('0', 60)).toBe(true);
  });

  it('saves an emptied box as a reset, and anything else normalized', () => {
    expect(gitTimeoutDraftToSave('  ')).toBeNull();
    expect(gitTimeoutDraftToSave('5')).toBe(15);
    expect(gitTimeoutDraftToSave('0')).toBe(0);
    expect(gitTimeoutDraftToSave('300')).toBe(300);
  });

  it('explains every value that does not simply mean "this many seconds"', () => {
    expect(describeGitTimeoutDraft('')).toContain('default, 60 seconds');
    expect(describeGitTimeoutDraft('0')).toContain('No timeout');
    expect(describeGitTimeoutDraft('5')).toContain('uses 15 seconds');
    expect(describeGitTimeoutDraft('-3')).toContain('Not a valid number');
    expect(describeGitTimeoutDraft('15')).toBeUndefined();
    expect(describeGitTimeoutDraft('600')).toBeUndefined();
  });
});

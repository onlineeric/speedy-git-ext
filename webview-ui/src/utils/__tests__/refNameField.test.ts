import { describe, expect, it } from 'vitest';
import { validateGitBranchName } from '@shared/gitRefValidation';
import { applyNamePrefill, deriveRefNameField } from '../refNameField';

describe('deriveRefNameField', () => {
  it('shows no error for an empty field', () => {
    expect(deriveRefNameField('', validateGitBranchName)).toEqual({ error: undefined, valid: false });
  });

  it('shows the error once the user has typed', () => {
    const state = deriveRefNameField('bad..name', validateGitBranchName);
    expect(state.valid).toBe(false);
    expect(state.error).toBeTruthy();
  });

  it('hides the error while the field still holds its prefill', () => {
    expect(deriveRefNameField('feature/', validateGitBranchName, 'feature/')).toEqual({
      error: undefined,
      valid: false,
    });
  });

  it('shows the error as soon as the prefill is edited', () => {
    expect(deriveRefNameField('feature//', validateGitBranchName, 'feature/').error).toBeTruthy();
  });

  it('stays quiet when the prefill is cleared', () => {
    expect(deriveRefNameField('', validateGitBranchName, 'feature/').error).toBeUndefined();
  });
});

describe('applyNamePrefill', () => {
  it('fills an untouched field', () => {
    expect(applyNamePrefill({ value: '', pristine: '' }, 'feature/')).toEqual({
      value: 'feature/',
      pristine: 'feature/',
    });
  });

  it('replaces a stale prefill the user has not edited', () => {
    expect(applyNamePrefill({ value: 'old/', pristine: 'old/' }, 'new/')).toEqual({
      value: 'new/',
      pristine: 'new/',
    });
  });

  it('never overwrites what the user typed', () => {
    const field = { value: 'my-branch', pristine: '' };
    expect(applyNamePrefill(field, 'feature/')).toBe(field);
  });
});

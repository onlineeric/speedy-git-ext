import { describe, expect, it } from 'vitest';
import { describeForcePushFailure } from '../amendMessages';

describe('describeForcePushFailure', () => {
  it('always says the amend itself succeeded', () => {
    expect(describeForcePushFailure('anything')).toContain('amended locally');
  });

  it('translates a lease rejection into what happened and what to do', () => {
    const message = describeForcePushFailure(
      ' ! [rejected]        main -> main (stale info)\nerror: failed to push some refs'
    );

    expect(message).not.toContain('stale info');
    expect(message).toContain('moved since your last fetch');
    expect(message).toContain('Fetch');
  });

  it('passes any other git error through as-is', () => {
    const message = describeForcePushFailure('fatal: could not read Username for https://example.com');
    expect(message).toContain('fatal: could not read Username for https://example.com');
  });

  it('still reads correctly when git said nothing', () => {
    expect(describeForcePushFailure('   ')).toBe(
      'The commit was amended locally, but the force push was rejected.'
    );
  });
});

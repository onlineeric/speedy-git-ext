import { describe, expect, it } from 'vitest';
import { describeAmendBadgeBlock, describeForcePushFailure } from '../amendMessages';

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

describe('describeAmendBadgeBlock', () => {
  it('names which branch would actually move, and which would not', () => {
    const message = describeAmendBadgeBlock('feature', 'main');
    expect(message).toContain('would move main, not feature');
  });

  it('points at somewhere the amend can still be run from', () => {
    // The item is disabled on this badge, but the operation is available on the
    // same row — a refusal that stopped at "no" would send the user hunting for
    // something already in front of them.
    expect(describeAmendBadgeBlock('feature', 'main')).toContain("main's badge or the commit row");
  });

  it('says HEAD moves alone when no branch is checked out', () => {
    const message = describeAmendBadgeBlock('feature', undefined);
    expect(message).toContain('No branch is checked out');
    expect(message).toContain('commit row');
  });
});

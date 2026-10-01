import { describe, expect, it } from 'vitest';
import { formatAuthorIdentity } from '../authorIdentity';

describe('formatAuthorIdentity', () => {
  it('combines name and email the way git prints them', () => {
    expect(formatAuthorIdentity('Jane Doe', 'jane@example.com')).toBe('Jane Doe <jane@example.com>');
  });

  it('falls back to the name alone when the email is empty', () => {
    expect(formatAuthorIdentity('Jane Doe', '')).toBe('Jane Doe');
  });
});

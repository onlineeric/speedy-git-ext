import { describe, it, expect } from 'vitest';
import {
  buildWorktreeLeafSegments,
  buildWorktreeSegments,
  isInsideBaseDir,
  sanitizeWorktreeSegment,
} from '../services/worktreeLeafName.js';

describe('sanitizeWorktreeSegment', () => {
  it('keeps the historical allowlist and collapses runs of replacements', () => {
    expect(sanitizeWorktreeSegment('feature')).toBe('feature');
    expect(sanitizeWorktreeSegment('my.branch_v1-2')).toBe('my.branch_v1-2');
    expect(sanitizeWorktreeSegment('feat: add spaces')).toBe('feat-add-spaces');
  });

  it('trims leading and trailing separators and dots', () => {
    expect(sanitizeWorktreeSegment('--feature--')).toBe('feature');
    expect(sanitizeWorktreeSegment('.hidden.')).toBe('hidden');
  });

  it('never returns a path separator', () => {
    expect(sanitizeWorktreeSegment('a/b')).toBe('a-b');
    expect(sanitizeWorktreeSegment('a\\b')).toBe('a-b');
  });
});

describe('buildWorktreeSegments', () => {
  it('splits a hierarchical ref into one segment per level', () => {
    expect(buildWorktreeSegments('feat/branch1')).toEqual(['feat', 'branch1']);
    expect(buildWorktreeSegments('a/b/c')).toEqual(['a', 'b', 'c']);
  });

  it('returns a single segment for a flat ref', () => {
    expect(buildWorktreeSegments('feature')).toEqual(['feature']);
  });

  it('splits on a Windows-style separator too, so one cannot survive as a literal', () => {
    expect(buildWorktreeSegments('feat\\branch1')).toEqual(['feat', 'branch1']);
  });

  it('drops empty, `.` and `..` segments rather than sanitizing them into `-`', () => {
    expect(buildWorktreeSegments('feat//branch1')).toEqual(['feat', 'branch1']);
    expect(buildWorktreeSegments('/feat/branch1/')).toEqual(['feat', 'branch1']);
    expect(buildWorktreeSegments('feat/../../etc')).toEqual(['feat', 'etc']);
    expect(buildWorktreeSegments('./feat/./branch1')).toEqual(['feat', 'branch1']);
  });

  it('falls back to `worktree` when nothing survives', () => {
    expect(buildWorktreeSegments('')).toEqual(['worktree']);
    expect(buildWorktreeSegments('///')).toEqual(['worktree']);
    expect(buildWorktreeSegments('...')).toEqual(['worktree']);
    expect(buildWorktreeSegments('!!!')).toEqual(['worktree']);
    expect(buildWorktreeSegments('功能')).toEqual(['worktree']);
  });
});

describe('buildWorktreeLeafSegments', () => {
  it('keeps segments separate under the nested style', () => {
    expect(buildWorktreeLeafSegments('feat/branch1', 'nested')).toEqual(['feat', 'branch1']);
  });

  it('joins them with `-` under the flat style, matching the historical leaf name', () => {
    expect(buildWorktreeLeafSegments('feat/branch1', 'flat')).toEqual(['feat-branch1']);
    expect(buildWorktreeLeafSegments('feature/login', 'flat')).toEqual(['feature-login']);
    expect(buildWorktreeLeafSegments('exp/20260826-test', 'flat')).toEqual(['exp-20260826-test']);
    expect(buildWorktreeLeafSegments('feature', 'flat')).toEqual(['feature']);
  });
});

describe('isInsideBaseDir', () => {
  it('accepts a direct child and a deeper descendant', () => {
    expect(isInsideBaseDir('/base', '/base/child')).toBe(true);
    expect(isInsideBaseDir('/base', '/base/a/b/c')).toBe(true);
  });

  it('rejects the base dir itself', () => {
    expect(isInsideBaseDir('/base', '/base')).toBe(false);
    expect(isInsideBaseDir('/base', '/base/')).toBe(false);
  });

  it('rejects a sibling that merely shares the prefix', () => {
    expect(isInsideBaseDir('/base', '/base-other')).toBe(false);
    expect(isInsideBaseDir('/base', '/base-other/child')).toBe(false);
  });

  it('rejects a path that escapes upward', () => {
    expect(isInsideBaseDir('/base', '/base/../elsewhere')).toBe(false);
    expect(isInsideBaseDir('/base', '/elsewhere')).toBe(false);
  });

  it('compares case-insensitively only on Windows', () => {
    const expected = process.platform === 'win32';
    expect(isInsideBaseDir('/Base', '/base/child')).toBe(expected);
  });
});

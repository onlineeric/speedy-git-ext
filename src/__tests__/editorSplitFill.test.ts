import { describe, expect, it } from 'vitest';
import {
  isGraphWebviewViewType,
  pickSplitFillGroup,
  type EditorGroupSnapshot,
} from '../utils/editorSplitFill.js';

function group(
  viewColumn: number,
  tabCount: number,
  activeWebviewViewType: string | null = null,
): EditorGroupSnapshot {
  return { viewColumn, tabCount, activeWebviewViewType };
}

const graphGroup = group(1, 1, 'mainThreadWebview-speedyGit');

describe('isGraphWebviewViewType', () => {
  it('accepts the namespaced viewType VS Code reports for a panel tab', () => {
    expect(isGraphWebviewViewType('mainThreadWebview-speedyGit')).toBe(true);
  });

  it('accepts the bare viewType, in case the namespacing ever goes away', () => {
    expect(isGraphWebviewViewType('speedyGit')).toBe(true);
  });

  it('rejects another extension’s webview and a missing viewType', () => {
    expect(isGraphWebviewViewType('mainThreadWebview-someOtherGit')).toBe(false);
    expect(isGraphWebviewViewType(null)).toBe(false);
    expect(isGraphWebviewViewType(undefined)).toBe(false);
  });
});

describe('pickSplitFillGroup', () => {
  it('picks the empty group a graph’s split just opened', () => {
    const opened = [group(2, 0)];

    expect(pickSplitFillGroup(opened, graphGroup)).toBe(opened[0]);
  });

  it('ignores a split of any other editor, which duplicates rather than emptying', () => {
    expect(pickSplitFillGroup([group(2, 1)], graphGroup)).toBeNull();
  });

  it('ignores a group opened while the user was not on a graph', () => {
    expect(pickSplitFillGroup([group(2, 0)], group(1, 1, null))).toBeNull();
    expect(pickSplitFillGroup([group(2, 0)], group(1, 1, 'mainThreadWebview-markdown'))).toBeNull();
  });

  it('ignores the change when no group was active to split from', () => {
    expect(pickSplitFillGroup([group(2, 0)], undefined)).toBeNull();
  });

  it('never fills the graph’s own group', () => {
    expect(pickSplitFillGroup([group(1, 0)], graphGroup)).toBeNull();
  });
});

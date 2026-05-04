import { describe, it, expect } from 'vitest';
import type { FileChange } from '@shared/types';
import {
  buildFileTree,
  getDescendantFilePaths,
  type FileTreeNode,
} from '../fileTreeBuilder';

function fc(path: string, status: FileChange['status'] = 'modified'): FileChange {
  return { path, status };
}

describe('buildFileTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildFileTree([])).toEqual([]);
  });

  it('returns flat files at the root level', () => {
    const tree = buildFileTree([fc('a.ts'), fc('b.ts')]);
    expect(tree).toHaveLength(2);
    expect(tree.every((n) => !n.isFolder)).toBe(true);
    expect(tree.map((n) => n.name)).toEqual(['a.ts', 'b.ts']);
  });

  it('groups files into folders', () => {
    const tree = buildFileTree([
      fc('src/a.ts'),
      fc('src/b.ts'),
      fc('README.md'),
    ]);
    // folders first, then files; alphabetical within each group
    expect(tree).toHaveLength(2);
    expect(tree[0].isFolder).toBe(true);
    expect(tree[0].name).toBe('src');
    expect(tree[0].children).toHaveLength(2);
    expect(tree[1].name).toBe('README.md');
  });

  it('compacts single-child folders into one node', () => {
    const tree = buildFileTree([fc('src/components/ui/Button.tsx')]);
    expect(tree).toHaveLength(1);
    // src/ -> components/ -> ui/ has only one child path, so name should be compacted
    expect(tree[0].name).toBe('src/components/ui');
    expect(tree[0].isFolder).toBe(true);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].name).toBe('Button.tsx');
  });

  it('does not compact a folder if it has multiple children', () => {
    const tree = buildFileTree([
      fc('src/a.ts'),
      fc('src/b.ts'),
    ]);
    expect(tree[0].name).toBe('src');
  });

  it('marks children depth correctly', () => {
    const tree = buildFileTree([
      fc('src/a.ts'),
      fc('src/sub/b.ts'),
    ]);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children![0].depth).toBe(1); // src/sub folder
    expect(tree[0].children![1].depth).toBe(1); // src/a.ts file
  });

  it('preserves the original FileChange in fileChange prop on file nodes', () => {
    const change = fc('src/foo.ts', 'added');
    const tree = buildFileTree([change]);
    const folder = tree[0];
    const file = folder.children![0];
    expect(file.fileChange).toBe(change);
    expect(file.fileChange?.status).toBe('added');
  });

  it('sorts folders before files within a folder', () => {
    const tree = buildFileTree([
      fc('src/zfile.ts'),
      fc('src/aaa/inside.ts'),
    ]);
    const srcChildren = tree[0].children!;
    expect(srcChildren[0].isFolder).toBe(true);
    expect(srcChildren[1].isFolder).toBe(false);
  });
});

describe('getDescendantFilePaths', () => {
  it('returns empty array for a folder with no files', () => {
    const folder: FileTreeNode = {
      id: 'empty',
      name: 'empty',
      isFolder: true,
      depth: 0,
      children: [],
    };
    expect(getDescendantFilePaths(folder)).toEqual([]);
  });

  it('returns the file path for a leaf file node', () => {
    const tree = buildFileTree([fc('a.ts')]);
    expect(getDescendantFilePaths(tree[0])).toEqual(['a.ts']);
  });

  it('collects all descendant file paths from a nested folder', () => {
    const tree = buildFileTree([
      fc('src/a.ts'),
      fc('src/sub/b.ts'),
      fc('src/sub/c.ts'),
    ]);
    const allPaths = getDescendantFilePaths(tree[0]);
    expect(allPaths.sort()).toEqual(['src/a.ts', 'src/sub/b.ts', 'src/sub/c.ts']);
  });
});

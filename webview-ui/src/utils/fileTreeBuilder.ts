import type { FileChange } from '@shared/types';

export interface FileTreeNode {
  id: string;
  name: string;
  isFolder: boolean;
  depth: number;
  children?: FileTreeNode[];
  fileChange?: FileChange;
}

/**
 * Builds a hierarchical file tree from a flat array of FileChange objects.
 * Applies folder compaction: single-child intermediate folders are merged
 * into one node (e.g., `src/components/ui/` as a single folder node).
 * Sorts folders first (alphabetical), then files (alphabetical).
 */
export function buildFileTree(files: FileChange[]): FileTreeNode[] {
  const root: Map<string, IntermediateNode> = new Map();

  for (const file of files) {
    const segments = file.path.split('/');
    let currentLevel = root;

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (!currentLevel.has(segment)) {
        currentLevel.set(segment, { children: new Map(), files: [] });
      }
      currentLevel = currentLevel.get(segment)!.children;
    }

    const fileName = segments[segments.length - 1];
    if (!currentLevel.has(fileName)) {
      currentLevel.set(fileName, { children: new Map(), files: [] });
    }
    currentLevel.get(fileName)!.files.push(file);
  }

  return buildNodes(root, 0);
}

interface IntermediateNode {
  children: Map<string, IntermediateNode>;
  files: FileChange[];
}

function buildNodes(level: Map<string, IntermediateNode>, depth: number): FileTreeNode[] {
  const folders: FileTreeNode[] = [];
  const fileNodes: FileTreeNode[] = [];

  for (const [name, node] of level) {
    const isFile = node.files.length > 0 && node.children.size === 0;

    if (isFile) {
      for (const file of node.files) {
        fileNodes.push({
          id: file.path,
          name,
          isFolder: false,
          depth,
          fileChange: file,
        });
      }
    } else if (node.children.size > 0) {
      const compacted = compactFolder(name, node, depth);
      folders.push(compacted);
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  fileNodes.sort((a, b) => a.name.localeCompare(b.name));

  return [...folders, ...fileNodes];
}

/**
 * Compacts single-child intermediate folders into one node.
 * e.g., src/ -> components/ -> ui/ with only a child folder buttons/
 * becomes a single node "src/components/ui/buttons/"
 */
function compactFolder(name: string, node: IntermediateNode, depth: number): FileTreeNode {
  let compactedName = name;
  let current = node;

  // Compact while: single child folder, no direct files
  while (
    current.children.size === 1 &&
    current.files.length === 0
  ) {
    const [childName, childNode] = current.children.entries().next().value!;
    // Only compact if the child is also a folder (has children or no files)
    if (childNode.files.length > 0 && childNode.children.size === 0) {
      break; // Child is a file, stop compacting
    }
    compactedName += '/' + childName;
    current = childNode;
  }

  const children = buildNodes(current.children, depth + 1);

  // Add any files directly in this folder
  for (const file of current.files) {
    const fileName = file.path.split('/').pop() || file.path;
    children.push({
      id: file.path,
      name: fileName,
      isFolder: false,
      depth: depth + 1,
      fileChange: file,
    });
  }

  // Sort children: folders first, then files
  children.sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    id: compactedName,
    name: compactedName,
    isFolder: true,
    depth,
    children,
  };
}

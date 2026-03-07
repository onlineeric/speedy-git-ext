/**
 * File tree state management and file content generation for the test repo generator.
 * Handles per-branch file inventories and generates realistic source-code content.
 */

import { type GeneratorConfig, type SeededRandom } from './config.js';

// ---------------------------------------------------------------------------
// FileTree — per-branch file inventory
// ---------------------------------------------------------------------------

/** Maps file path → content version (starts at 1, increments on each modify) */
export type FileTree = Map<string, number>;

/** Minimum files on a branch before deletion is allowed */
export const MIN_TREE_SIZE = 5;

// ---------------------------------------------------------------------------
// FileTreeState — manages all branch file trees
// ---------------------------------------------------------------------------

export class FileTreeState {
  private trees = new Map<string, FileTree>();

  getTree(branch: string): FileTree {
    let tree = this.trees.get(branch);
    if (!tree) {
      tree = new Map();
      this.trees.set(branch, tree);
    }
    return tree;
  }

  addOrModify(branch: string, path: string, version: number): void {
    this.getTree(branch).set(path, version);
  }

  remove(branch: string, path: string): void {
    this.getTree(branch).delete(path);
  }

  clearTree(branch: string): void {
    this.trees.set(branch, new Map());
  }

  /** Deep-copy source tree into target (branch creation) */
  fork(sourceBranch: string, targetBranch: string): void {
    this.trees.set(targetBranch, new Map(this.getTree(sourceBranch)));
  }

  /** Union: higher content version wins (merge resolution) */
  merge(sourceBranch: string, targetBranch: string): void {
    const src = this.getTree(sourceBranch);
    const tgt = this.getTree(targetBranch);
    for (const [path, ver] of src) {
      const existing = tgt.get(path);
      if (existing === undefined || existing < ver) {
        tgt.set(path, ver);
      }
    }
  }

  pickExisting(branch: string, rng: SeededRandom): string | undefined {
    const tree = this.getTree(branch);
    if (tree.size === 0) return undefined;
    return rng.pick([...tree.keys()]);
  }

  /** Only picks if tree has at least MIN_TREE_SIZE files */
  pickForDeletion(branch: string, rng: SeededRandom): string | undefined {
    const tree = this.getTree(branch);
    if (tree.size < MIN_TREE_SIZE) return undefined;
    return rng.pick([...tree.keys()]);
  }
}

// ---------------------------------------------------------------------------
// CommitFileOp — planned file operations for a single commit
// ---------------------------------------------------------------------------

export type CommitFileOp =
  | { action: 'add';    path: string }
  | { action: 'modify'; path: string }
  | { action: 'delete'; path: string };

// ---------------------------------------------------------------------------
// Path generation helpers
// ---------------------------------------------------------------------------

const FOLDER_POOL: readonly string[] = [
  'src/services/', 'src/components/', 'src/utils/', 'src/hooks/',
  'src/middleware/', 'src/contexts/', 'lib/helpers/', 'lib/utils/',
  'docs/guides/', 'docs/api/', 'tests/unit/', 'tests/integration/',
];

const FILE_STEMS: readonly string[] = [
  'index', 'utils', 'helpers', 'constants', 'types', 'service',
  'controller', 'middleware', 'config', 'handler', 'validator',
  'transformer', 'logger', 'factory', 'adapter', 'provider',
  'context', 'hook', 'store', 'reducer',
];

/** Extensions with cumulative weights (out of 100) for weighted random pick */
const FILE_EXTENSIONS: Array<{ ext: string; cumWeight: number }> = [
  { ext: '.ts',   cumWeight: 35 },
  { ext: '.js',   cumWeight: 50 },
  { ext: '.css',  cumWeight: 60 },
  { ext: '.html', cumWeight: 65 },
  { ext: '.json', cumWeight: 75 },
  { ext: '.md',   cumWeight: 85 },
];

function pickExtension(rng: SeededRandom): string {
  const r = rng.int(1, 100);
  for (const { ext, cumWeight } of FILE_EXTENSIONS) {
    if (r <= cumWeight) return ext;
  }
  return '.ts';
}

function generateNewPath(tree: FileTree, rng: SeededRandom): string {
  const folder = rng.pick(FOLDER_POOL);
  const stem = rng.pick(FILE_STEMS);
  const ext = pickExtension(rng);
  let path = `${folder}${stem}${ext}`;
  let suffix = 2;
  while (tree.has(path)) {
    path = `${folder}${stem}${suffix}${ext}`;
    suffix++;
  }
  return path;
}

// ---------------------------------------------------------------------------
// planCommitOps — decide file operations for a commit
// ---------------------------------------------------------------------------

export function planCommitOps(
  branch: string,
  fileState: FileTreeState,
  rng: SeededRandom,
  config: Pick<GeneratorConfig, 'minFilesPerCommit' | 'maxFilesPerCommit'>,
  mode: 'normal' | 'merge' | 'squash' | 'orphan',
): CommitFileOp[] {
  const tree = fileState.getTree(branch);
  const ops: CommitFileOp[] = [];

  if (mode === 'orphan' || mode === 'squash' || mode === 'merge') {
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i++) {
      ops.push({ action: 'add', path: generateNewPath(tree, rng) });
    }
    return ops;
  }

  // Normal commit: pick 1-maxFilesPerCommit ops
  const fileCount = rng.int(config.minFilesPerCommit, config.maxFilesPerCommit);
  for (let i = 0; i < fileCount; i++) {
    if (tree.size < 3) {
      ops.push({ action: 'add', path: generateNewPath(tree, rng) });
      continue;
    }
    const roll = rng.next();
    if (roll < 0.5) {
      ops.push({ action: 'add', path: generateNewPath(tree, rng) });
    } else if (roll < 0.9) {
      const existing = fileState.pickExisting(branch, rng);
      ops.push(existing
        ? { action: 'modify', path: existing }
        : { action: 'add',   path: generateNewPath(tree, rng) });
    } else {
      const toDelete = fileState.pickForDeletion(branch, rng);
      ops.push(toDelete
        ? { action: 'delete', path: toDelete }
        : { action: 'add',   path: generateNewPath(tree, rng) });
    }
  }
  return ops;
}

// ---------------------------------------------------------------------------
// generateFileContent — dispatch to per-type generator
// ---------------------------------------------------------------------------

export function generateFileContent(
  path: string,
  targetLines: number,
  version: number,
  rng: SeededRandom,
): string {
  const dotIdx = path.lastIndexOf('.');
  const ext = dotIdx >= 0 ? path.substring(dotIdx) : '.ts';
  const baseName = path
    .substring(path.lastIndexOf('/') + 1)
    .replace(/\.\w+$/, '')
    .replace(/\d+$/, '');

  switch (ext) {
    case '.ts':   return generateTsContent(baseName, targetLines, version, rng);
    case '.js':   return generateJsContent(baseName, targetLines, version, rng);
    case '.css':  return generateCssContent(baseName, targetLines, version, rng);
    case '.html': return generateHtmlContent(baseName, targetLines, version, rng);
    case '.json': return generateJsonContent(baseName, targetLines, version, rng);
    case '.md':   return generateMdContent(baseName, targetLines, version, rng);
    default:      return generateTsContent(baseName, targetLines, version, rng);
  }
}

// ---------------------------------------------------------------------------
// Per-type content generators — pad to targetLines using Array.join('\n')
// ---------------------------------------------------------------------------

function generateTsContent(name: string, targetLines: number, version: number, rng: SeededRandom): string {
  const cls = name.charAt(0).toUpperCase() + name.slice(1);
  const lines: string[] = [
    `import { Logger } from '../utils/logger';`,
    ``,
    `export interface ${cls}Options {`,
    `  timeout: number;`,
    `  retries: number;`,
    `  verbose: boolean;`,
    `}`,
    ``,
    `export class ${cls} {`,
    `  private logger = new Logger('${cls}');`,
    `  private config: ${cls}Options;`,
    `  private isReady = false;`,
    ``,
    `  constructor(config: ${cls}Options) {`,
    `    this.config = config;`,
    `  }`,
    ``,
    `  async initialize(): Promise<void> {`,
    `    this.logger.info('Initializing ${cls} v${version}');`,
    `    this.isReady = true;`,
    `  }`,
    ``,
    `  async process(input: string): Promise<string> {`,
    `    if (!this.isReady) throw new Error('${cls} not initialized');`,
    `    return input.trim().toLowerCase();`,
    `  }`,
    ``,
    `  dispose(): void {`,
    `    this.isReady = false;`,
    `    this.logger.info('Disposed ${cls}');`,
    `  }`,
    `}`,
    ``,
  ];
  let idx = version;
  while (lines.length < targetLines) {
    const steps = rng.int(1, 4);
    lines.push(
      `  private helper${idx}(x: string): string {`,
      `    const base = x + '_${name}_${idx}';`,
      ...Array.from({ length: steps }, (_, i) => `    const s${i} = base.slice(${i});`),
      `    return base;`,
      `  }`,
      ``,
    );
    idx++;
  }
  return lines.join('\n');
}

function generateJsContent(name: string, targetLines: number, version: number, rng: SeededRandom): string {
  const cls = name.charAt(0).toUpperCase() + name.slice(1);
  const lines: string[] = [
    `'use strict';`,
    ``,
    `const { createLogger } = require('./logger');`,
    `const logger = createLogger('${name}');`,
    ``,
    `function create${cls}(options) {`,
    `  const state = { initialized: false, version: ${version} };`,
    `  return {`,
    `    init()    { state.initialized = true; logger.info('${name} ready'); },`,
    `    process(data) {`,
    `      if (!state.initialized) throw new Error('Not ready');`,
    `      return data;`,
    `    },`,
    `    dispose() { state.initialized = false; },`,
    `  };`,
    `}`,
    ``,
    `module.exports = { create${cls} };`,
    ``,
  ];
  let idx = version;
  while (lines.length < targetLines) {
    const steps = rng.int(1, 3);
    lines.push(
      `function helper${idx}(input) {`,
      ...Array.from({ length: steps }, (_, i) => `  const v${i} = input + '_${idx}_${i}';`),
      `  return input;`,
      `}`,
      ``,
    );
    idx++;
  }
  return lines.join('\n');
}

function generateCssContent(name: string, targetLines: number, version: number, rng: SeededRandom): string {
  const lines: string[] = [`/* ${name} styles v${version} */`, ``];
  let idx = 1;
  while (lines.length < targetLines) {
    lines.push(
      `.${name}-block-${idx} {`,
      `  display: flex;`,
      `  padding: ${rng.int(4, 24)}px;`,
      `  margin: ${rng.int(0, 16)}px;`,
      `  color: #${rng.int(100000, 999999)};`,
      `  background: #${rng.int(100000, 999999)};`,
      `  border-radius: ${rng.int(0, 8)}px;`,
      `}`,
      ``,
    );
    idx++;
  }
  return lines.join('\n');
}

function generateHtmlContent(name: string, targetLines: number, version: number, rng: SeededRandom): string {
  const lines: string[] = [
    `<!DOCTYPE html>`,
    `<html lang="en">`,
    `<head>`,
    `  <meta charset="UTF-8">`,
    `  <title>${name} v${version}</title>`,
    `  <link rel="stylesheet" href="./${name}.css">`,
    `</head>`,
    `<body>`,
    `  <div id="app">`,
    `    <header class="${name}-header"><h1>${name}</h1></header>`,
    `    <main class="${name}-main">`,
  ];
  let idx = 1;
  while (lines.length < targetLines - 5) {
    lines.push(
      `      <section class="${name}-section-${idx}">`,
      `        <h2>Section ${idx}</h2>`,
      `        <p>${name} content block ${idx} (v${version}, id=${rng.int(1000, 9999)})</p>`,
      `        <ul><li>Item A</li><li>Item B</li></ul>`,
      `      </section>`,
    );
    idx++;
  }
  lines.push(`    </main>`, `  </div>`, `  <script src="./${name}.js"></script>`, `</body>`, `</html>`, ``);
  return lines.join('\n');
}

function generateMdContent(name: string, targetLines: number, version: number, rng: SeededRandom): string {
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  const lines: string[] = [
    `# ${title}`,
    ``,
    `> Version ${version}`,
    ``,
    `## Overview`,
    ``,
    `The \`${name}\` module provides core functionality.`,
    ``,
  ];
  let idx = 1;
  while (lines.length < targetLines) {
    const methodCount = rng.int(2, 5);
    lines.push(
      `## Section ${idx}`,
      ``,
      `Description for section ${idx} of ${name} (v${version}).`,
      ``,
      '```typescript',
      `import { ${title} } from './${name}';`,
      '```',
      ``,
      `### API`,
      ``,
      ...Array.from({ length: methodCount }, (_, i) => `- \`method${idx}_${i}()\` — operation ${i + 1}`),
      ``,
    );
    idx++;
  }
  return lines.join('\n');
}

function generateJsonContent(name: string, targetLines: number, version: number, rng: SeededRandom): string {
  const targetKeys = Math.max(5, targetLines - 4);
  const keys: string[] = [];
  let idx = 1;
  while (keys.length < targetKeys) {
    const val = idx % 3 === 0
      ? `{ "enabled": true, "value": ${rng.int(1, 1000)} }`
      : idx % 3 === 1
        ? `"${name}_value_${idx}"`
        : String(rng.int(0, 9999));
    keys.push(`  "key_${idx}": ${val}`);
    idx++;
  }
  return `{\n  "name": "${name}",\n  "version": ${version},\n${keys.join(',\n')}\n}\n`;
}

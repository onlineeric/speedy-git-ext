/**
 * Test repo generator entry point.
 * Streams commits to git fast-import via spawn with backpressure-aware flushing.
 *
 * Usage: pnpm generate-test-repo
 */

import { spawn, execSync } from 'node:child_process';
import { type Writable } from 'node:stream';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { DEFAULT_CONFIG, SeededRandom, type GeneratorConfig } from './config.js';
import { FileTreeState, planCommitOps, generateFileContent } from './content.js';
import { BranchState, TopologyCycle, executeTopologyEvent, type GeneratorCtx } from './topology.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTHORS = [
  { name: 'Alice Chen',    email: 'alice@example.com'   },
  { name: 'Bob Martinez',  email: 'bob@example.com'     },
  { name: 'Carol Johnson', email: 'carol@example.com'   },
  { name: 'David Kim',     email: 'david@example.com'   },
  { name: 'Eva Muller',    email: 'eva@example.com'     },
] as const;

const MESSAGE_TEMPLATES = [
  'Add unit tests for {module}', 'Refactor {module} to use dependency injection',
  'Fix edge case in {module} when input is empty', 'Implement {feature} endpoint',
  'Update {module} documentation', 'Optimize {feature} query performance',
  'Add validation for {module} input', 'Remove deprecated {feature} code',
  'Migrate {module} to new API', 'Fix race condition in {feature} handler',
  'Add caching layer for {module}', 'Improve error messages in {feature}',
  'Extract {module} helper functions', 'Add integration tests for {feature}',
  'Fix memory leak in {module}',
] as const;

const MODULES  = ['auth', 'user', 'dashboard', 'api', 'db', 'cache', 'router', 'middleware', 'logger', 'config', 'session'] as const;
const FEATURES = ['login', 'signup', 'profile', 'settings', 'search', 'notifications', 'export', 'import', 'analytics', 'billing'] as const;

/** Flush internal buffer to the Writable when it exceeds this size (prevents OOM via backpressure) */
const FLUSH_THRESHOLD_BYTES = 4 * 1024 * 1024; // 4 MB

// ---------------------------------------------------------------------------
// FastImportStreamBuilder — accumulates fast-import protocol data, flushes on demand
// ---------------------------------------------------------------------------

type StreamFileOp =
  | { type: 'M'; blobMark: number; path: string }
  | { type: 'D'; path: string };

class FastImportStreamBuilder {
  private buffer: string[] = [];
  private bufferBytes = 0;

  private write(s: string): void {
    this.buffer.push(s);
    this.bufferBytes += s.length;
  }

  private writeData(content: string): void {
    const data = content.endsWith('\n') ? content : content + '\n';
    this.write(`data ${Buffer.byteLength(data, 'utf-8')}\n`);
    this.write(data);
  }

  writeBlob(mark: number, content: string): void {
    this.write('blob\n');
    this.write(`mark :${mark}\n`);
    this.writeData(content);
  }

  writeCommit(opts: {
    mark: number;
    branch: string;
    parentMarks: number[];
    authorName: string;
    authorEmail: string;
    authorTs: number;
    message: string;
    fileOps: StreamFileOp[];
    isOrphan?: boolean;
  }): void {
    this.write(`commit refs/heads/${opts.branch}\n`);
    this.write(`mark :${opts.mark}\n`);
    this.write(`author ${opts.authorName} <${opts.authorEmail}> ${opts.authorTs} +0000\n`);
    this.write(`committer ${opts.authorName} <${opts.authorEmail}> ${opts.authorTs} +0000\n`);
    this.writeData(opts.message);
    if (opts.parentMarks.length > 0) {
      this.write(`from :${opts.parentMarks[0]}\n`);
      for (let i = 1; i < opts.parentMarks.length; i++) {
        this.write(`merge :${opts.parentMarks[i]}\n`);
      }
    }
    if (opts.isOrphan) {
      this.write('deleteall\n');
    }
    for (const op of opts.fileOps) {
      if (op.type === 'D') {
        this.write(`D ${op.path}\n`);
      } else {
        this.write(`M 100644 :${op.blobMark} ${op.path}\n`);
      }
    }
    this.write('\n');
  }

  writeTag(name: string, commitMark: number, taggerName: string, taggerEmail: string, ts: number): void {
    this.write(`tag ${name}\n`);
    this.write(`from :${commitMark}\n`);
    this.write(`tagger ${taggerName} <${taggerEmail}> ${ts} +0000\n`);
    this.writeData(`Release ${name}`);
    this.write('\n');
  }

  writeReset(branch: string, mark: number): void {
    this.write(`reset refs/heads/${branch}\n`);
    this.write(`from :${mark}\n`);
    this.write('\n');
  }

  needsFlush(): boolean {
    return this.bufferBytes >= FLUSH_THRESHOLD_BYTES;
  }

  /** Drain buffer to the writable; awaits drain if pipe is full (backpressure) */
  async flushTo(out: Writable): Promise<void> {
    if (this.buffer.length === 0) return;
    const data = this.buffer.join('');
    this.buffer = [];
    this.bufferBytes = 0;
    if (!out.write(data)) {
      await new Promise<void>(resolve => out.once('drain', resolve));
    }
  }
}

// ---------------------------------------------------------------------------
// GeneratorContext — orchestration state + low-level commit operations
// ---------------------------------------------------------------------------

class GeneratorContext implements GeneratorCtx {
  readonly config: GeneratorConfig;
  readonly rng: SeededRandom;
  readonly branchState: BranchState;
  readonly fileTreeState: FileTreeState;

  private readonly builder: FastImportStreamBuilder;
  private readonly stdin: Writable;
  private markCounter = 0;
  private globalTs: number;
  private readonly tsStep: number;
  private readonly endTs: number;
  private seqCounters = new Map<string, number>();

  constructor(config: GeneratorConfig, builder: FastImportStreamBuilder, stdin: Writable) {
    this.config = config;
    this.rng = new SeededRandom(config.seed);
    this.branchState = new BranchState();
    this.fileTreeState = new FileTreeState();
    this.builder = builder;
    this.stdin = stdin;

    this.endTs = config.lastCommitTs === 0
      ? Math.floor(Date.now() / 1000)
      : config.lastCommitTs;
    this.globalTs = config.firstCommitTs;
    this.tsStep = Math.max(1, Math.floor((this.endTs - config.firstCommitTs) / config.totalCommits));
  }

  private nextMark(): number {
    return ++this.markCounter;
  }

  private nextTimestamp(): number {
    const jitter = this.rng.int(
      -Math.floor(this.tsStep * 0.1),
      Math.floor(this.tsStep * 0.1),
    );
    this.globalTs = Math.min(this.endTs, this.globalTs + this.tsStep + jitter);
    return this.globalTs;
  }

  private nextSeq(branch: string): number {
    const n = (this.seqCounters.get(branch) ?? 0) + 1;
    this.seqCounters.set(branch, n);
    return n;
  }

  private pickAuthor() {
    return this.rng.pick(AUTHORS);
  }

  private generateMessage(branch: string): string {
    const template = this.rng.pick(MESSAGE_TEMPLATES);
    const module  = this.rng.pick(MODULES);
    const feature = this.rng.pick(FEATURES);
    return `${branch}-${this.nextSeq(branch)}: ${template.replace('{module}', module).replace('{feature}', feature)}`;
  }

  private buildStreamFileOps(branch: string, mode: 'normal' | 'merge' | 'squash' | 'orphan'): StreamFileOp[] {
    const ops = planCommitOps(branch, this.fileTreeState, this.rng, this.config, mode);
    const streamOps: StreamFileOp[] = [];

    for (const op of ops) {
      if (op.action === 'add') {
        const version = 1;
        const targetLines = this.rng.int(this.config.minFileContentLines, this.config.maxFileContentLines);
        const content = generateFileContent(op.path, targetLines, version, this.rng);
        const blobMark = this.nextMark();
        this.builder.writeBlob(blobMark, content);
        this.fileTreeState.addOrModify(branch, op.path, version);
        streamOps.push({ type: 'M', blobMark, path: op.path });
      } else if (op.action === 'modify') {
        const currentVer = this.fileTreeState.getTree(branch).get(op.path) ?? 1;
        const newVer = currentVer + 1;
        const targetLines = this.rng.int(this.config.minFileContentLines, this.config.maxFileContentLines);
        const content = generateFileContent(op.path, targetLines, newVer, this.rng);
        const blobMark = this.nextMark();
        this.builder.writeBlob(blobMark, content);
        this.fileTreeState.addOrModify(branch, op.path, newVer);
        streamOps.push({ type: 'M', blobMark, path: op.path });
      } else {
        this.fileTreeState.remove(branch, op.path);
        streamOps.push({ type: 'D', path: op.path });
      }
    }
    return streamOps;
  }

  addSimpleCommit(branch: string, message?: string): number {
    const ts = this.nextTimestamp();
    const author = this.pickAuthor();
    const msg = message ?? this.generateMessage(branch);
    const fileOps = this.buildStreamFileOps(branch, 'normal');
    const parentMark = this.branchState.getTip(branch);
    const parentMarks = parentMark !== undefined ? [parentMark] : [];
    const mark = this.nextMark();
    this.builder.writeCommit({
      mark, branch, parentMarks,
      authorName: author.name, authorEmail: author.email,
      authorTs: ts, message: msg, fileOps,
    });
    this.branchState.setTip(branch, mark);
    return mark;
  }

  addMergeCommit(target: string, sources: string[], message: string): number {
    const ts = this.nextTimestamp();
    const author = this.pickAuthor();
    const fileOps = this.buildStreamFileOps(target, 'merge');
    const parentMark = this.branchState.getTip(target);
    const mergeMarks = sources
      .map(s => this.branchState.getTip(s))
      .filter((m): m is number => m !== undefined);
    const parentMarks = parentMark !== undefined ? [parentMark, ...mergeMarks] : mergeMarks;
    const mark = this.nextMark();
    this.builder.writeCommit({
      mark, branch: target, parentMarks,
      authorName: author.name, authorEmail: author.email,
      authorTs: ts, message, fileOps,
    });
    this.branchState.setTip(target, mark);
    return mark;
  }

  addOrphanCommit(branch: string, message: string): number {
    const ts = this.nextTimestamp();
    const author = this.pickAuthor();
    this.fileTreeState.clearTree(branch);
    const fileOps = this.buildStreamFileOps(branch, 'orphan');
    const mark = this.nextMark();
    this.builder.writeCommit({
      mark, branch, parentMarks: [],
      authorName: author.name, authorEmail: author.email,
      authorTs: ts, message, fileOps, isOrphan: true,
    });
    this.branchState.setTip(branch, mark);
    return mark;
  }

  fastForwardBranch(branch: string, sourceBranch: string): void {
    const sourceMark = this.branchState.getTip(sourceBranch);
    if (sourceMark === undefined) return;
    this.builder.writeReset(branch, sourceMark);
    this.branchState.setTip(branch, sourceMark);
    this.fileTreeState.fork(sourceBranch, branch);
  }

  mergeDevIntoMain(): void {
    if (this.branchState.getTip('dev') === undefined) return;
    this.fileTreeState.merge('dev', 'main');
    this.addMergeCommit('main', ['dev'], 'Periodic merge: dev into main');
  }

  closeBranchIntoTarget(branchName: string): void {
    const target = this.rng.next() < 0.7 ? 'dev' : 'main';
    this.fileTreeState.merge(branchName, target);
    this.addMergeCommit(target, [branchName], `Merge ${branchName} into ${target}`);
    this.branchState.closeBranch(branchName);
  }

  /** Lightweight merge commit (no file ops) — records ancestry; used for periodic dev syncs */
  addSyncMerge(target: string, source: string): number {
    const ts = this.nextTimestamp();
    const author = this.pickAuthor();
    const sourceMark = this.branchState.getTip(source);
    if (sourceMark === undefined) return 0;
    const parentMark = this.branchState.getTip(target);
    const parentMarks = parentMark !== undefined ? [parentMark, sourceMark] : [sourceMark];
    const mark = this.nextMark();
    this.builder.writeCommit({
      mark, branch: target, parentMarks,
      authorName: author.name, authorEmail: author.email,
      authorTs: ts, message: `Sync ${source} into ${target}`, fileOps: [],
    });
    this.branchState.setTip(target, mark);
    this.fileTreeState.merge(source, target);
    return mark;
  }

  async flushIfNeeded(): Promise<void> {
    if (this.builder.needsFlush()) {
      await this.builder.flushTo(this.stdin);
    }
  }

  async finalFlush(): Promise<void> {
    await this.builder.flushTo(this.stdin);
  }
}

// ---------------------------------------------------------------------------
// Orchestration loop (integrates TopologyCycle per T012)
// ---------------------------------------------------------------------------

/** Every SYNC_INTERVAL loop iterations, sync all pool branches into dev (ensures ≥15% merge commits) */
const BRANCH_SYNC_INTERVAL = 50;

async function runOrchestration(ctx: GeneratorContext, cycle: TopologyCycle): Promise<void> {
  const { config, rng, branchState } = ctx;

  // Bootstrap: initial commits on main, fork dev, open initial working branches
  for (let i = 0, n = rng.int(20, 30); i < n; i++) ctx.addSimpleCommit('main', `Initial repo setup (file ${i + 1})`);
  ctx.fastForwardBranch('dev', 'main');
  ctx.addSimpleCommit('dev', 'Initialize dev branch');

  const openFromDev = (): void => {
    const name = branchState.generateWorkingBranchName(rng);
    const parentMark = branchState.getTip('dev');
    if (parentMark !== undefined) {
      branchState.openBranch(name, 'dev', parentMark);
      ctx.fileTreeState.fork('dev', name);
    }
  };
  for (let i = 0; i < config.minOpenBranches; i++) openFromDev();

  let totalEmitted = 0;
  let syncLoopCounter = 0;
  const progressInterval = Math.max(1, Math.floor(config.totalCommits * config.progressIntervalPct / 100));

  while (totalEmitted < config.totalCommits) {
    // Manage pool size
    if (branchState.poolSize() < config.minOpenBranches) {
      openFromDev();
    } else if (branchState.poolSize() > config.maxOpenBranches) {
      const [toClose] = branchState.pickBranchesToClose(1, rng);
      if (toClose) ctx.closeBranchIntoTarget(toClose.name);
    } else {
      const roll = rng.next();
      if (roll < 0.05 && branchState.poolSize() < config.maxOpenBranches) {
        openFromDev();
      } else if (roll < 0.08 && branchState.poolSize() > config.minOpenBranches) {
        const [toClose] = branchState.pickBranchesToClose(1, rng);
        if (toClose) ctx.closeBranchIntoTarget(toClose.name);
      }
    }

    // Pick working branch and execute topology event
    const workingBranch = branchState.pickWorkingBranch(rng);
    if (!workingBranch) {
      ctx.addSimpleCommit('dev');
      totalEmitted++;
    } else {
      const topologyType = cycle.next();
      const delta = executeTopologyEvent(topologyType, ctx, workingBranch.name);
      totalEmitted += delta;
    }

    // Periodic dev→main merge
    if (totalEmitted > 0 && totalEmitted % config.devToMainMergeInterval === 0) {
      ctx.mergeDevIntoMain();
    }

    // Periodic sync: all pool branches → dev (ensures ≥15% merge commit rate)
    syncLoopCounter++;
    if (syncLoopCounter >= BRANCH_SYNC_INTERVAL) {
      syncLoopCounter = 0;
      for (const branchName of branchState.allOpenNames()) {
        if (ctx.addSyncMerge('dev', branchName) !== 0) {
          totalEmitted++;
        }
      }
    }

    // Flush buffer to stdin to prevent OOM (backpressure-aware)
    await ctx.flushIfNeeded();

    // Progress report
    if (totalEmitted % progressInterval === 0) {
      const pct = Math.min(100, Math.floor(totalEmitted * 100 / config.totalCommits));
      process.stdout.write(`\rGenerating commits... ${pct}% (${totalEmitted}/${config.totalCommits})`);
    }
  }

  process.stdout.write(`\rGenerating commits... 100% (${totalEmitted}/${config.totalCommits})\n`);

  // Finalize: close remaining working branches, final dev→main merge
  for (const name of branchState.allOpenNames()) {
    ctx.closeBranchIntoTarget(name);
  }
  ctx.mergeDevIntoMain();

  // Final flush
  await ctx.finalFlush();
}

// ---------------------------------------------------------------------------
// main() — setup, spawn git fast-import, orchestrate, print summary
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = { ...DEFAULT_CONFIG };
  if (config.lastCommitTs === 0) {
    config.lastCommitTs = Math.floor(Date.now() / 1000);
  }

  const testRepoDir = resolve(__dirname, '../test-repo');

  console.log('Generating deterministic test repo...');
  console.log(`Target: ${testRepoDir}`);

  if (existsSync(testRepoDir)) {
    console.log('Removing existing test-repo/...');
    rmSync(testRepoDir, { recursive: true, force: true });
  }
  mkdirSync(testRepoDir, { recursive: true });
  execSync('git init', { cwd: testRepoDir, stdio: 'pipe' });

  const child = spawn('git', ['fast-import', '--quiet'], {
    cwd: testRepoDir,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const startMs = Date.now();
  const stdin = child.stdin as Writable;
  const builder = new FastImportStreamBuilder();
  const ctx = new GeneratorContext(config, builder, stdin);
  const cycle = new TopologyCycle(config, ctx.rng);

  // Capture any fast-import stderr for debugging
  const stderrLines: string[] = [];
  child.stderr?.on('data', (d: Buffer) => stderrLines.push(d.toString()));

  console.log('Building fast-import stream...');
  await runOrchestration(ctx, cycle);
  stdin.end();

  await new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git fast-import exited with code ${code}\n${stderrLines.join('')}`));
    });
  });

  // Delete all branch refs except main and dev (closed branches still have refs after fast-import)
  execSync(
    "git for-each-ref --format='%(refname:short)' refs/heads/ | grep -vE '^(main|dev)$' | xargs -r git branch -D",
    { cwd: testRepoDir, stdio: 'pipe', shell: true },
  );
  execSync('git checkout main', { cwd: testRepoDir, stdio: 'pipe' });

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  const commitCount = execSync('git rev-list --all --count', { cwd: testRepoDir, encoding: 'utf-8' }).trim();
  const branchCount = execSync('git branch | wc -l',         { cwd: testRepoDir, encoding: 'utf-8' }).trim();
  const tagCount    = execSync('git tag | wc -l',            { cwd: testRepoDir, encoding: 'utf-8' }).trim();

  console.log(`\n=== Test Repo Summary ===\n  Commits:  ${commitCount}\n  Branches: ${branchCount}\n  Tags:     ${tagCount}\n  Time:     ${elapsedSec}s\n  Location: ${testRepoDir}`);
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});

/**
 * Deterministic large test repo generator for Speedy Git Extension.
 * Uses git fast-import to create 15000+ commits with complex topology in seconds.
 *
 * Usage: pnpm generate-test-repo
 */

import { execSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// SeededRandom — LCG-based deterministic PRNG
// ---------------------------------------------------------------------------

class SeededRandom {
  private state: number;

  constructor(seed: number = 42) {
    this.state = seed;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    // LCG parameters from Numerical Recipes
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0x100000000;
  }

  /** Returns an integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Pick a random element from an array */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
}

// ---------------------------------------------------------------------------
// FastImportStreamBuilder — builds the text stream for git fast-import
// ---------------------------------------------------------------------------

class FastImportStreamBuilder {
  private buf: string[] = [];
  private markCounter = 0;

  private nextMark(): number {
    return ++this.markCounter;
  }

  private writeln(line: string): void {
    this.buf.push(line + "\n");
  }

  /**
   * Write a data block with exact byte count.
   * git fast-import reads exactly N bytes after "data N\n".
   */
  private writeData(content: string): void {
    const normalized = content.endsWith("\n") ? content : content + "\n";
    this.buf.push(`data ${Buffer.byteLength(normalized, "utf-8")}\n`);
    this.buf.push(normalized);
  }

  blob(content: string): number {
    const mark = this.nextMark();
    this.writeln("blob");
    this.writeln(`mark :${mark}`);
    this.writeData(content);
    return mark;
  }

  commit(opts: {
    ref: string;
    mark?: boolean;
    authorName: string;
    authorEmail: string;
    timestamp: number;
    message: string;
    from?: number;
    merges?: number[];
    deleteAll?: boolean;
    fileOps?: Array<{ path: string; blobMark: number }>;
  }): number {
    const mark = opts.mark !== false ? this.nextMark() : 0;
    this.writeln(`commit ${opts.ref}`);
    if (mark) this.writeln(`mark :${mark}`);
    this.writeln(
      `author ${opts.authorName} <${opts.authorEmail}> ${opts.timestamp} +0000`,
    );
    this.writeln(
      `committer ${opts.authorName} <${opts.authorEmail}> ${opts.timestamp} +0000`,
    );
    this.writeData(opts.message);
    if (opts.from !== undefined) {
      this.writeln(`from :${opts.from}`);
    }
    if (opts.merges) {
      for (const m of opts.merges) {
        this.writeln(`merge :${m}`);
      }
    }
    if (opts.deleteAll) {
      this.writeln("deleteall");
    }
    if (opts.fileOps) {
      for (const op of opts.fileOps) {
        this.writeln(`M 100644 :${op.blobMark} ${op.path}`);
      }
    }
    this.writeln("");
    return mark;
  }

  tag(opts: {
    name: string;
    fromMark: number;
    taggerName: string;
    taggerEmail: string;
    timestamp: number;
    message: string;
  }): void {
    this.writeln(`tag ${opts.name}`);
    this.writeln(`from :${opts.fromMark}`);
    this.writeln(
      `tagger ${opts.taggerName} <${opts.taggerEmail}> ${opts.timestamp} +0000`,
    );
    this.writeData(opts.message);
    this.writeln("");
  }

  reset(ref: string, mark: number): void {
    this.writeln(`reset ${ref}`);
    this.writeln(`from :${mark}`);
    this.writeln("");
  }

  build(): string {
    return this.buf.join("");
  }
}

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

interface Author {
  name: string;
  email: string;
}

const AUTHORS: readonly Author[] = [
  { name: "Alice Chen", email: "alice@example.com" },
  { name: "Bob Martinez", email: "bob@example.com" },
  { name: "Carol Johnson", email: "carol@example.com" },
  { name: "David Kim", email: "david@example.com" },
  { name: "Eva Muller", email: "eva@example.com" },
];

// ---------------------------------------------------------------------------
// Commit message templates
// ---------------------------------------------------------------------------

const MESSAGE_TEMPLATES = [
  "Add unit tests for {module}",
  "Refactor {module} to use dependency injection",
  "Fix edge case in {module} when input is empty",
  "Implement {feature} endpoint",
  "Update {module} documentation",
  "Optimize {feature} query performance",
  "Add validation for {module} input",
  "Remove deprecated {feature} code",
  "Migrate {module} to new API",
  "Fix race condition in {feature} handler",
  "Add caching layer for {module}",
  "Improve error messages in {feature}",
  "Extract {module} helper functions",
  "Add integration tests for {feature}",
  "Fix memory leak in {module}",
  "Update {feature} configuration",
  "Add logging to {module}",
  "Refactor {feature} state management",
  "Fix null pointer in {module}",
  "Add retry logic for {feature}",
] as const;

const MODULES = [
  "auth",
  "user",
  "dashboard",
  "api",
  "db",
  "cache",
  "router",
  "middleware",
  "logger",
  "config",
  "session",
  "parser",
  "renderer",
  "validator",
  "scheduler",
] as const;

const FEATURES = [
  "login",
  "signup",
  "profile",
  "settings",
  "search",
  "notifications",
  "export",
  "import",
  "analytics",
  "permissions",
  "billing",
  "reports",
] as const;

// ---------------------------------------------------------------------------
// GeneratorContext — mutable state across phases
// ---------------------------------------------------------------------------

class GeneratorContext {
  readonly stream: FastImportStreamBuilder;
  readonly rng: SeededRandom;

  /** branch name → latest commit mark */
  private tips = new Map<string, number>();
  private timestamp = 1700000000;
  private commitCount = 0;
  private seqCounters = new Map<string, number>();

  constructor() {
    this.stream = new FastImportStreamBuilder();
    this.rng = new SeededRandom(42);
  }

  private nextTimestamp(): number {
    this.timestamp += 60;
    return this.timestamp;
  }

  private nextSeq(branch: string): number {
    const current = this.seqCounters.get(branch) ?? 0;
    const next = current + 1;
    this.seqCounters.set(branch, next);
    return next;
  }

  private branchAbbrev(branch: string): string {
    const abbrevs: Record<string, string> = {
      main: "main",
      dev: "dev",
      "feature/auth": "auth",
      "feature/ui": "ui",
      "feature/api": "api",
      "feature/dashboard": "dash",
      "bugfix/login": "login",
      "bugfix/perf": "perf",
      "feature/i18n": "i18n",
      "orphan-docs": "orphan",
    };
    return abbrevs[branch] ?? branch.replace(/[/]/g, "-");
  }

  private pickAuthor(): Author {
    return this.rng.pick(AUTHORS);
  }

  generateMessage(prefix: string): string {
    const template = this.rng.pick(MESSAGE_TEMPLATES);
    const module = this.rng.pick(MODULES);
    const feature = this.rng.pick(FEATURES);
    return `${prefix}: ${template.replace("{module}", module).replace("{feature}", feature)}`;
  }

  getTip(branch: string): number | undefined {
    return this.tips.get(branch);
  }

  getCommitCount(): number {
    return this.commitCount;
  }

  addCommit(
    branch: string,
    phase: number,
    message?: string,
    author?: Author,
  ): number {
    const ts = this.nextTimestamp();
    const a = author ?? this.pickAuthor();
    const seq = this.nextSeq(branch);
    const abbrev = this.branchAbbrev(branch);
    const prefix = `P${phase}-${abbrev}-${seq}`;
    const msg = message ?? this.generateMessage(prefix);
    const finalMsg = message ? `${prefix}: ${message}` : msg;

    const blobMark = this.stream.blob(
      `${branch} commit ${seq} at ${ts}\n${finalMsg}\n`,
    );

    const from = this.tips.get(branch);
    const commitMark = this.stream.commit({
      ref: `refs/heads/${branch}`,
      authorName: a.name,
      authorEmail: a.email,
      timestamp: ts,
      message: finalMsg,
      from,
      fileOps: [{ path: `${abbrev}/file-${seq}.txt`, blobMark }],
    });

    this.tips.set(branch, commitMark);
    this.commitCount++;
    return commitMark;
  }

  addMergeCommit(
    target: string,
    sources: string[],
    phase: number,
    message: string,
    author?: Author,
  ): number {
    const ts = this.nextTimestamp();
    const a = author ?? this.pickAuthor();
    const seq = this.nextSeq(target);
    const abbrev = this.branchAbbrev(target);
    const prefix = `P${phase}-${abbrev}-${seq}`;
    const finalMsg = `${prefix}: ${message}`;

    const blobMark = this.stream.blob(`Merge into ${target} at ${ts}\n`);

    const from = this.tips.get(target);
    const mergeMarks = sources
      .map((s) => this.tips.get(s))
      .filter((m): m is number => m !== undefined);

    const commitMark = this.stream.commit({
      ref: `refs/heads/${target}`,
      authorName: a.name,
      authorEmail: a.email,
      timestamp: ts,
      message: finalMsg,
      from,
      merges: mergeMarks,
      fileOps: [{ path: `${abbrev}/merge-${seq}.txt`, blobMark }],
    });

    this.tips.set(target, commitMark);
    this.commitCount++;
    return commitMark;
  }

  addSquashMerge(
    target: string,
    phase: number,
    message: string,
    author?: Author,
  ): number {
    const ts = this.nextTimestamp();
    const a = author ?? this.pickAuthor();
    const seq = this.nextSeq(target);
    const abbrev = this.branchAbbrev(target);
    const prefix = `P${phase}-${abbrev}-${seq}`;
    const finalMsg = `${prefix}: ${message}`;

    const blobMark = this.stream.blob(`Squash merge into ${target}\n`);

    const from = this.tips.get(target);
    const commitMark = this.stream.commit({
      ref: `refs/heads/${target}`,
      authorName: a.name,
      authorEmail: a.email,
      timestamp: ts,
      message: finalMsg,
      from,
      fileOps: [{ path: `${abbrev}/squash-${seq}.txt`, blobMark }],
    });

    this.tips.set(target, commitMark);
    this.commitCount++;
    return commitMark;
  }

  fastForward(target: string, source: string): void {
    const sourceTip = this.tips.get(source);
    if (sourceTip === undefined) {
      throw new Error(`fastForward: source branch "${source}" has no tip`);
    }
    this.stream.reset(`refs/heads/${target}`, sourceTip);
    this.tips.set(target, sourceTip);
  }

  addTag(name: string, branch: string, phase: number): void {
    const tip = this.tips.get(branch);
    if (tip === undefined) {
      throw new Error(`addTag: branch "${branch}" has no tip`);
    }
    const a = this.pickAuthor();
    this.stream.tag({
      name,
      fromMark: tip,
      taggerName: a.name,
      taggerEmail: a.email,
      timestamp: this.timestamp,
      message: `Release ${name}`,
    });
  }

  /**
   * Create an orphan branch (no parent for the first commit).
   * Subsequent commits on this branch use normal addCommit.
   */
  addOrphanCommit(branch: string, phase: number, message: string): number {
    const ts = this.nextTimestamp();
    const a = this.pickAuthor();
    const seq = this.nextSeq(branch);
    const abbrev = this.branchAbbrev(branch);
    const prefix = `P${phase}-${abbrev}-${seq}`;
    const finalMsg = `${prefix}: ${message}`;

    const blobMark = this.stream.blob(
      `${branch} orphan commit ${seq} at ${ts}\n`,
    );

    const commitMark = this.stream.commit({
      ref: `refs/heads/${branch}`,
      authorName: a.name,
      authorEmail: a.email,
      timestamp: ts,
      message: finalMsg,
      deleteAll: true,
      fileOps: [{ path: `${abbrev}/file-${seq}.txt`, blobMark }],
    });

    this.tips.set(branch, commitMark);
    this.commitCount++;
    return commitMark;
  }
}

// ---------------------------------------------------------------------------
// Phase functions
// ---------------------------------------------------------------------------

function phase1Bootstrap(ctx: GeneratorContext): void {
  // Linear history on main (5 commits)
  for (let i = 0; i < 5; i++) {
    ctx.addCommit("main", 1);
  }
  ctx.addTag("v0.1.0", "main", 1);
}

function phase2DevEarlyFeatures(ctx: GeneratorContext): void {
  // Create dev from main
  ctx.fastForward("dev", "main");
  for (let i = 0; i < 3; i++) {
    ctx.addCommit("dev", 2);
  }

  // Create feature/auth from dev
  ctx.fastForward("feature/auth", "dev");
  for (let i = 0; i < 3; i++) {
    ctx.addCommit("feature/auth", 2);
  }

  // Create feature/ui from dev
  ctx.fastForward("feature/ui", "dev");
  for (let i = 0; i < 3; i++) {
    ctx.addCommit("feature/ui", 2);
  }

  // Interleave: grow main, dev, and feature branches
  for (let i = 0; i < 5; i++) {
    ctx.addCommit("main", 2);
    ctx.addCommit("dev", 2);
    ctx.addCommit("feature/auth", 2);
    ctx.addCommit("feature/ui", 2);
  }

  // Multi-merge pattern: merge auth→dev, commit on dev, merge ui→dev
  ctx.addMergeCommit("dev", ["feature/auth"], 2, "Merge feature/auth into dev");
  ctx.addCommit("dev", 2);
  ctx.addCommit("dev", 2);
  ctx.addMergeCommit("dev", ["feature/ui"], 2, "Merge feature/ui into dev");

  // Backward merge: dev→main
  ctx.addMergeCommit("main", ["dev"], 2, "Merge dev into main");

  // More work after merge then backward merge
  for (let i = 0; i < 3; i++) {
    ctx.addCommit("main", 2);
    ctx.addCommit("dev", 2);
  }
  ctx.addMergeCommit("dev", ["main"], 2, "Backward merge main into dev");

  // Another round
  for (let i = 0; i < 3; i++) {
    ctx.addCommit("dev", 2);
  }
  ctx.addMergeCommit("main", ["dev"], 2, "Merge dev into main (round 2)");

  ctx.addTag("v0.2.0", "main", 2);
}

function phase3ParallelExplosion(ctx: GeneratorContext): void {
  // Create 5 more branches
  ctx.fastForward("feature/api", "dev");
  ctx.fastForward("feature/dashboard", "main");
  ctx.fastForward("bugfix/login", "dev");
  ctx.fastForward("bugfix/perf", "main");
  ctx.fastForward("feature/i18n", "dev");

  const allBranches = [
    "main",
    "dev",
    "feature/auth",
    "feature/ui",
    "feature/api",
    "feature/dashboard",
    "bugfix/login",
    "bugfix/perf",
    "feature/i18n",
  ];

  // All 9 branches active with interleaved commits + cross-merges
  for (let round = 0; round < 10; round++) {
    for (const branch of allBranches) {
      ctx.addCommit(branch, 3);
    }
    // Cross-branch merge every 3 rounds
    if (round > 0 && round % 3 === 0) {
      const src = ctx.rng.pick(allBranches);
      let tgt = ctx.rng.pick(allBranches);
      while (tgt === src) tgt = ctx.rng.pick(allBranches);
      ctx.addMergeCommit(tgt, [src], 3, `Cross-merge ${src} into ${tgt}`);
    }
  }

  // Criss-cross pattern: auth↔api
  ctx.addMergeCommit(
    "feature/auth",
    ["feature/api"],
    3,
    "Criss-cross merge api into auth",
  );
  ctx.addMergeCommit(
    "feature/api",
    ["feature/auth"],
    3,
    "Criss-cross merge auth into api",
  );

  // Merge bugfix branches back
  ctx.addMergeCommit("dev", ["bugfix/login"], 3, "Merge bugfix/login into dev");
  ctx.addMergeCommit(
    "main",
    ["bugfix/perf"],
    3,
    "Merge bugfix/perf into main",
  );

  ctx.addTag("v0.3.0", "main", 3);

  // A few more parallel commits
  for (const branch of allBranches) {
    ctx.addCommit(branch, 3);
    ctx.addCommit(branch, 3);
  }

  ctx.addMergeCommit("dev", ["feature/api"], 3, "Merge feature/api into dev");
  ctx.addMergeCommit(
    "dev",
    ["feature/dashboard"],
    3,
    "Merge feature/dashboard into dev",
  );
  ctx.addMergeCommit("main", ["dev"], 3, "Merge dev into main (phase 3 end)");

  ctx.addTag("v0.3.1", "main", 3);
}

function phase4OctopusComplex(ctx: GeneratorContext): void {
  // Grow branches for octopus sources
  const octoBranches = [
    "feature/api",
    "bugfix/login",
    "feature/i18n",
    "feature/ui",
  ];
  for (const branch of octoBranches) {
    ctx.fastForward(branch, "dev");
  }

  for (let i = 0; i < 5; i++) {
    for (const branch of octoBranches) {
      ctx.addCommit(branch, 4);
    }
    ctx.addCommit("main", 4);
    ctx.addCommit("dev", 4);
  }

  // Octopus merge 1: 3 parents
  ctx.addMergeCommit(
    "dev",
    ["feature/api", "bugfix/login", "feature/i18n"],
    4,
    "Octopus merge api+login+i18n into dev",
  );

  // A few more commits
  for (let i = 0; i < 3; i++) {
    ctx.addCommit("dev", 4);
    ctx.addCommit("feature/ui", 4);
    ctx.addCommit("main", 4);
  }

  // Octopus merge 2: 4 parents
  ctx.addMergeCommit(
    "main",
    ["dev", "feature/ui", "feature/dashboard", "feature/auth"],
    4,
    "Octopus merge dev+ui+dashboard+auth into main",
  );

  // Complex crossing topology
  for (let i = 0; i < 3; i++) {
    ctx.addCommit("feature/auth", 4);
    ctx.addCommit("feature/dashboard", 4);
    ctx.addCommit("main", 4);
  }
  ctx.addMergeCommit(
    "feature/dashboard",
    ["feature/auth"],
    4,
    "Cross merge auth into dashboard",
  );
  ctx.addMergeCommit(
    "feature/auth",
    ["main"],
    4,
    "Cross merge main into auth",
  );
  ctx.addMergeCommit(
    "main",
    ["feature/dashboard"],
    4,
    "Merge dashboard into main",
  );

  ctx.addTag("v0.4.0", "main", 4);
}

function phase5ReleaseCycle(ctx: GeneratorContext): void {
  // Rebase-style: linear commits re-parented onto main
  ctx.fastForward("dev", "main");

  for (let i = 0; i < 5; i++) {
    ctx.addCommit("dev", 5);
    ctx.addCommit("main", 5);
  }

  // Simulate rebase: fast-forward feature branch onto dev tip
  ctx.fastForward("feature/auth", "dev");
  for (let i = 0; i < 5; i++) {
    ctx.addCommit("feature/auth", 5);
  }

  // Squash merge simulation
  ctx.addSquashMerge("dev", 5, "Squash merge feature/auth (rebase-style)");

  for (let i = 0; i < 3; i++) {
    ctx.addCommit("dev", 5);
    ctx.addCommit("main", 5);
  }

  ctx.addMergeCommit("main", ["dev"], 5, "Release merge dev into main");
  ctx.addTag("v1.0.0-rc1", "main", 5);

  // RC2 cycle
  for (let i = 0; i < 3; i++) {
    ctx.addCommit("dev", 5);
  }

  ctx.fastForward("bugfix/login", "main");
  for (let i = 0; i < 3; i++) {
    ctx.addCommit("bugfix/login", 5);
  }
  ctx.addSquashMerge("main", 5, "Squash merge bugfix/login hotfix");
  ctx.addTag("v1.0.0-rc2", "main", 5);

  // Final release
  ctx.addMergeCommit("main", ["dev"], 5, "Final release merge");
  ctx.addTag("v1.0.0", "main", 5);
}

function phase6BulkParallel(ctx: GeneratorContext): void {
  ctx.fastForward("dev", "main");

  // Long-running parallel lanes with periodic merge points (3 blocks)
  for (let block = 0; block < 3; block++) {
    for (let i = 0; i < 5; i++) {
      ctx.addCommit("main", 6);
      ctx.addCommit("dev", 6);
    }
    ctx.addMergeCommit(
      "main",
      ["dev"],
      6,
      `Periodic merge dev into main (block ${block + 1})`,
    );
    ctx.fastForward("dev", "main");
  }

  ctx.addTag("v1.1.0", "main", 6);

  // Another parallel segment
  for (let i = 0; i < 3; i++) {
    ctx.addCommit("main", 6);
    ctx.addCommit("dev", 6);
  }

  ctx.addMergeCommit("main", ["dev"], 6, "Final parallel merge for v1.2.0");
  ctx.addTag("v1.2.0", "main", 6);
}

function phase7OrphanFinal(ctx: GeneratorContext): void {
  // Orphan branch with disconnected history
  ctx.addOrphanCommit("orphan-docs", 7, "Initialize documentation (orphan)");
  for (let i = 0; i < 4; i++) {
    ctx.addCommit("orphan-docs", 7);
  }

  // Fast-forward scenario: create a branch, add commits, FF main to it
  ctx.fastForward("feature/i18n", "main");
  for (let i = 0; i < 3; i++) {
    ctx.addCommit("feature/i18n", 7);
  }
  ctx.fastForward("main", "feature/i18n");

  ctx.addMergeCommit("main", ["dev"], 7, "Final merge for v2.0.0");
  ctx.addTag("v2.0.0", "main", 7);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const testRepoDir = resolve(import.meta.dirname ?? __dirname, "../test-repo");

  console.log("Generating deterministic test repo...");
  console.log(`Target: ${testRepoDir}`);

  // Clean existing
  if (existsSync(testRepoDir)) {
    console.log("Removing existing test-repo/...");
    rmSync(testRepoDir, { recursive: true, force: true });
  }
  mkdirSync(testRepoDir, { recursive: true });

  // Git init
  execSync("git init", { cwd: testRepoDir, stdio: "pipe" });

  // Build fast-import stream
  console.log("Building fast-import stream...");
  const ctx = new GeneratorContext();

  phase1Bootstrap(ctx);
  console.log(`  Phase 1 done: ${ctx.getCommitCount()} commits`);

  phase2DevEarlyFeatures(ctx);
  console.log(`  Phase 2 done: ${ctx.getCommitCount()} commits`);

  phase3ParallelExplosion(ctx);
  console.log(`  Phase 3 done: ${ctx.getCommitCount()} commits`);

  phase4OctopusComplex(ctx);
  console.log(`  Phase 4 done: ${ctx.getCommitCount()} commits`);

  phase5ReleaseCycle(ctx);
  console.log(`  Phase 5 done: ${ctx.getCommitCount()} commits`);

  phase6BulkParallel(ctx);
  console.log(`  Phase 6 done: ${ctx.getCommitCount()} commits`);

  phase7OrphanFinal(ctx);
  console.log(`  Phase 7 done: ${ctx.getCommitCount()} commits`);

  const stream = ctx.stream.build();
  console.log(
    `Fast-import stream: ${(Buffer.byteLength(stream) / 1024 / 1024).toFixed(1)} MB`,
  );

  // Pipe to git fast-import
  console.log("Running git fast-import...");
  execSync("git fast-import --quiet", {
    cwd: testRepoDir,
    input: stream,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 100 * 1024 * 1024,
  });

  // Checkout main
  execSync("git checkout main", { cwd: testRepoDir, stdio: "pipe" });

  // Print summary
  const commitCount = execSync("git rev-list --all --count", {
    cwd: testRepoDir,
    encoding: "utf-8",
  }).trim();
  const branchCount = execSync("git branch | wc -l", {
    cwd: testRepoDir,
    encoding: "utf-8",
  }).trim();
  const tagCount = execSync("git tag | wc -l", {
    cwd: testRepoDir,
    encoding: "utf-8",
  }).trim();

  console.log("\n=== Test Repo Summary ===");
  console.log(`  Commits:  ${commitCount}`);
  console.log(`  Branches: ${branchCount}`);
  console.log(`  Tags:     ${tagCount}`);
  console.log(`  Location: ${testRepoDir}`);
  console.log("");
}

main();

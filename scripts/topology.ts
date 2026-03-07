/**
 * Branch state management, topology cycle, and topology event dispatch.
 * Handles the dynamic branch pool, all 10 commit topology types, and their scheduling.
 */

import { type GeneratorConfig, type SeededRandom } from './config.js';
import { type FileTreeState } from './content.js';

// ---------------------------------------------------------------------------
// Branch name generation pools
// ---------------------------------------------------------------------------

const BRANCH_TYPES = ['feature', 'fix', 'chore', 'refactor'] as const;

const ADJECTIVES: readonly string[] = [
  'lazy', 'bright', 'swift', 'dark', 'golden', 'wild', 'fierce', 'calm',
  'rapid', 'silent', 'bold', 'clever', 'eager', 'fancy', 'gentle',
  'happy', 'icy', 'jolly', 'keen', 'lively', 'merry', 'noble', 'odd',
  'proud', 'quiet', 'rusty', 'sharp', 'tiny', 'vast', 'warm',
];

const NOUNS: readonly string[] = [
  'dragon', 'token', 'eagle', 'river', 'stone', 'falcon', 'maple', 'tiger',
  'beacon', 'bridge', 'cloud', 'delta', 'ember', 'forge', 'grove',
  'harbor', 'island', 'jungle', 'kernel', 'ledger', 'mirror', 'nexus',
  'orbit', 'portal', 'quartz', 'relay', 'signal', 'tunnel', 'vector', 'wave',
];

/** Generates a unique `<type>/<adj>-<noun>[-N]` branch name */
export function generateBranchName(usedNames: Set<string>, rng: SeededRandom): string {
  const type = rng.pick(BRANCH_TYPES);
  const adj  = rng.pick(ADJECTIVES);
  const noun = rng.pick(NOUNS);
  const base = `${type}/${adj}-${noun}`;
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }
  let n = 2;
  while (usedNames.has(`${base}-${n}`)) n++;
  const name = `${base}-${n}`;
  usedNames.add(name);
  return name;
}

// ---------------------------------------------------------------------------
// BranchRecord — one open working branch in the pool
// ---------------------------------------------------------------------------

export interface BranchRecord {
  name: string;
  tip: number;
  parentBranch: string;
  commitCount: number;
}

// ---------------------------------------------------------------------------
// BranchState — manages the open-branch pool and all branch tips
// ---------------------------------------------------------------------------

export class BranchState {
  /** Working branch pool (excludes main + dev) */
  private pool = new Map<string, BranchRecord>();
  /** All branch tips: working + main + dev + orphan islands */
  private tips = new Map<string, number>();
  /** All ever-used names for deduplication */
  private usedNames = new Set<string>();

  getTip(branch: string): number | undefined {
    return this.tips.get(branch);
  }

  setTip(branch: string, mark: number): void {
    this.tips.set(branch, mark);
    if (this.pool.has(branch)) {
      this.pool.get(branch)!.tip = mark;
      this.pool.get(branch)!.commitCount++;
    }
  }

  openBranch(name: string, parentBranch: string, parentMark: number): void {
    this.usedNames.add(name);
    this.tips.set(name, parentMark);
    this.pool.set(name, { name, tip: parentMark, parentBranch, commitCount: 0 });
  }

  /** Removes from pool; tip remains for ref resolution */
  closeBranch(name: string): BranchRecord {
    const rec = this.pool.get(name);
    if (!rec) throw new Error(`closeBranch: "${name}" not in pool`);
    this.pool.delete(name);
    return rec;
  }

  pickWorkingBranch(rng: SeededRandom): BranchRecord | undefined {
    if (this.pool.size === 0) return undefined;
    return rng.pick([...this.pool.values()]);
  }

  pickBranchesToClose(count: number, rng: SeededRandom): BranchRecord[] {
    const candidates = [...this.pool.values()];
    rng.shuffle(candidates);
    return candidates.slice(0, count);
  }

  generateWorkingBranchName(rng: SeededRandom): string {
    return generateBranchName(this.usedNames, rng);
  }

  generateOrphanBranchName(rng: SeededRandom): string {
    const adj  = rng.pick(ADJECTIVES);
    const noun = rng.pick(NOUNS);
    const base = `orphan/${adj}-${noun}`;
    if (!this.usedNames.has(base)) {
      this.usedNames.add(base);
      return base;
    }
    let n = 2;
    while (this.usedNames.has(`${base}-${n}`)) n++;
    const name = `${base}-${n}`;
    this.usedNames.add(name);
    return name;
  }

  getUsedNames(): Set<string> {
    return this.usedNames;
  }

  poolSize(): number {
    return this.pool.size;
  }

  allOpenNames(): string[] {
    return [...this.pool.keys()];
  }

  allPoolBranches(): BranchRecord[] {
    return [...this.pool.values()];
  }
}

// ---------------------------------------------------------------------------
// TopologyType — all 10 commit topology types from FR-010
// ---------------------------------------------------------------------------

export type TopologyType =
  | 'simple'           // #1 — single parent, no merge
  | 'two-parent-merge' // #2 — regular merge commit
  | 'fast-forward'     // #3 — simulated: single-parent with [fast-forward] message
  | 'squash-merge'     // #4 — single-parent with [squash] message
  | 'octopus-merge'    // #5 — 3+ parents
  | 'criss-cross'      // #6 — A←B then B←A (emits 2 commits)
  | 'rebase-linear'    // #7 — fast-forward branch then 2-5 sequential commits
  | 'orphan-start'     // #8 — commit with no parent (deleteall)
  | 'cherry-pick'      // #9 — message includes [cherry-pick from <branch>]
  | 'branch-fork';     // #10 — new branch created from existing commit

export const ALL_TOPOLOGY_TYPES: readonly TopologyType[] = [
  'simple', 'two-parent-merge', 'fast-forward', 'squash-merge',
  'octopus-merge', 'criss-cross', 'rebase-linear', 'orphan-start',
  'cherry-pick', 'branch-fork',
];

// ---------------------------------------------------------------------------
// TopologyCycle — schedules all 10 types within every cycle window
// ---------------------------------------------------------------------------

export class TopologyCycle {
  private cycleLength: number;
  private events: Map<number, TopologyType>;
  private position: number;

  constructor(
    private readonly config: Pick<GeneratorConfig, 'minCycleLength' | 'maxCycleLength'>,
    private readonly rng: SeededRandom,
  ) {
    this.cycleLength = 0;
    this.events = new Map();
    this.position = 0;
    this.reset();
  }

  /** Returns the topology type for the current position, then advances */
  next(): TopologyType {
    const type = this.events.get(this.position) ?? 'simple';
    this.position++;
    if (this.position >= this.cycleLength) {
      this.reset();
    }
    return type;
  }

  private reset(): void {
    this.cycleLength = this.rng.int(this.config.minCycleLength, this.config.maxCycleLength);
    const positions = Array.from({ length: this.cycleLength }, (_, i) => i);
    this.rng.shuffle(positions);
    const slots = positions.slice(0, ALL_TOPOLOGY_TYPES.length);
    const types = [...ALL_TOPOLOGY_TYPES] as TopologyType[];
    this.rng.shuffle(types);
    this.events = new Map(slots.map((pos, i) => [pos, types[i]]));
    this.position = 0;
  }
}

// ---------------------------------------------------------------------------
// GeneratorCtx interface — what executeTopologyEvent needs from main.ts context
// ---------------------------------------------------------------------------

export interface GeneratorCtx {
  readonly config: GeneratorConfig;
  readonly rng: SeededRandom;
  readonly branchState: BranchState;
  readonly fileTreeState: FileTreeState;
  addSimpleCommit(branch: string, message?: string): number;
  addMergeCommit(target: string, sources: string[], message: string): number;
  addOrphanCommit(branch: string, message: string): number;
  fastForwardBranch(branch: string, sourceBranch: string): void;
}

// ---------------------------------------------------------------------------
// executeTopologyEvent — dispatch all 10 topology cases
// Returns commitsDelta: the number of git commits emitted
// ---------------------------------------------------------------------------

export function executeTopologyEvent(
  type: TopologyType,
  ctx: GeneratorCtx,
  targetBranch: string,
): number {
  const { rng, branchState, config } = ctx;
  const poolBranches = branchState.allPoolBranches();
  const others = poolBranches.filter(b => b.name !== targetBranch);

  switch (type) {
    case 'simple': {
      ctx.addSimpleCommit(targetBranch);
      return 1;
    }

    case 'two-parent-merge': {
      if (others.length === 0) {
        ctx.addSimpleCommit(targetBranch);
        return 1;
      }
      const src = rng.pick(others);
      ctx.fileTreeState.merge(src.name, targetBranch);
      ctx.addMergeCommit(targetBranch, [src.name], `Merge ${src.name} into ${targetBranch}`);
      return 1;
    }

    case 'fast-forward': {
      ctx.addSimpleCommit(targetBranch, `[fast-forward] Apply changes`);
      return 1;
    }

    case 'squash-merge': {
      if (others.length === 0) {
        ctx.addSimpleCommit(targetBranch);
        return 1;
      }
      const src = rng.pick(others);
      ctx.addSimpleCommit(targetBranch, `[squash] ${src.name} into ${targetBranch}`);
      return 1;
    }

    case 'octopus-merge': {
      if (others.length < 2) {
        ctx.addSimpleCommit(targetBranch);
        return 1;
      }
      const count = Math.min(rng.int(2, 4), others.length);
      const shuffled = [...others];
      rng.shuffle(shuffled);
      const sources = shuffled.slice(0, count);
      for (const s of sources) ctx.fileTreeState.merge(s.name, targetBranch);
      const names = sources.map(s => s.name);
      ctx.addMergeCommit(targetBranch, names, `Octopus merge ${names.join('+')} into ${targetBranch}`);
      return 1;
    }

    case 'criss-cross': {
      if (others.length === 0) {
        ctx.addSimpleCommit(targetBranch);
        return 1;
      }
      const src = rng.pick(others);
      // A←B
      ctx.fileTreeState.merge(src.name, targetBranch);
      ctx.addMergeCommit(targetBranch, [src.name], `[criss-cross] Merge ${src.name} into ${targetBranch}`);
      // B←A
      ctx.fileTreeState.merge(targetBranch, src.name);
      ctx.addMergeCommit(src.name, [targetBranch], `[criss-cross] Merge ${targetBranch} into ${src.name}`);
      return 2;
    }

    case 'rebase-linear': {
      // Simulate rebase: fast-forward to a base branch, then add sequential commits
      const baseBranch = others.length > 0 ? rng.pick(others).name : 'main';
      ctx.fastForwardBranch(targetBranch, baseBranch);
      const commitCount = rng.int(2, 5);
      for (let i = 0; i < commitCount; i++) {
        ctx.addSimpleCommit(targetBranch, `[rebase] Apply patch ${i + 1}`);
      }
      return commitCount;
    }

    case 'orphan-start': {
      const orphanBranch = branchState.generateOrphanBranchName(rng);
      ctx.addOrphanCommit(orphanBranch, `Initialize orphan branch`);
      const extra = rng.int(1, 3);
      for (let i = 0; i < extra; i++) {
        ctx.addSimpleCommit(orphanBranch, `Continue on orphan branch`);
      }
      return 1 + extra;
    }

    case 'cherry-pick': {
      const srcName = others.length > 0 ? rng.pick(others).name : 'main';
      ctx.addSimpleCommit(targetBranch, `[cherry-pick from ${srcName}] Apply commit`);
      return 1;
    }

    case 'branch-fork': {
      if (branchState.poolSize() >= config.maxOpenBranches) {
        // Pool is full — emit simple commit instead (FR-007 takes precedence)
        ctx.addSimpleCommit(targetBranch);
        return 1;
      }
      const parentMark = branchState.getTip(targetBranch);
      if (parentMark === undefined) {
        ctx.addSimpleCommit(targetBranch);
        return 1;
      }
      const newBranch = branchState.generateWorkingBranchName(rng);
      branchState.openBranch(newBranch, targetBranch, parentMark);
      ctx.fileTreeState.fork(targetBranch, newBranch);
      ctx.addSimpleCommit(newBranch, `[branch-fork] Fork from ${targetBranch}`);
      return 1;
    }
  }
}

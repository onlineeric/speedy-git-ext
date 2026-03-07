/**
 * Generator configuration and seeded PRNG for the test repo generator.
 * All numeric parameters are centralized here (FR-013).
 * Edit DEFAULT_CONFIG to change generation parameters without touching other modules.
 */

// ---------------------------------------------------------------------------
// GeneratorConfig — single source of truth for all numeric parameters
// ---------------------------------------------------------------------------

export interface GeneratorConfig {
  /** Total commits to generate */
  totalCommits: number;

  /** PRNG seed for deterministic output */
  seed: number;

  /** Unix timestamp (UTC) for the first commit */
  firstCommitTs: number;

  /**
   * Unix timestamp for the final commit.
   * Defaults to 0 = current time at startup.
   * Set explicitly for fully reproducible runs.
   */
  lastCommitTs: number;

  /** Minimum open working branches (excludes main + dev) */
  minOpenBranches: number;

  /** Maximum open working branches (excludes main + dev) */
  maxOpenBranches: number;

  /** Minimum files touched per commit */
  minFilesPerCommit: number;

  /** Maximum files touched per commit */
  maxFilesPerCommit: number;

  /** Minimum lines modified per file per commit (FR-012) */
  minLinesPerModification: number;

  /** Maximum lines modified per file per commit (FR-012) */
  maxLinesPerModification: number;

  /** Minimum generated file content lines (FR-003) */
  minFileContentLines: number;

  /** Maximum generated file content lines (FR-003) */
  maxFileContentLines: number;

  /** Minimum commits per topology cycle window */
  minCycleLength: number;

  /** Maximum commits per topology cycle window */
  maxCycleLength: number;

  /** How often (in total emitted commits) dev is merged into main (FR-009a) */
  devToMainMergeInterval: number;

  /** Print progress every N percent of totalCommits */
  progressIntervalPct: number;
}

export const DEFAULT_CONFIG: GeneratorConfig = {
  totalCommits: 20000,
  seed: 42,
  firstCommitTs: 1514764800, // 2018-01-01 00:00:00 UTC
  lastCommitTs: 0,           // sentinel: main() replaces with Math.floor(Date.now()/1000)
  minOpenBranches: 2,
  maxOpenBranches: 12,
  minFilesPerCommit: 1,
  maxFilesPerCommit: 30,
  minLinesPerModification: 1,
  maxLinesPerModification: 200,
  minFileContentLines: 300,
  maxFileContentLines: 2000,
  minCycleLength: 100,
  maxCycleLength: 250,
  devToMainMergeInterval: 1000,
  progressIntervalPct: 1,
};

// ---------------------------------------------------------------------------
// SeededRandom — LCG-based deterministic PRNG (never use Math.random() elsewhere)
// ---------------------------------------------------------------------------

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0x100000000;
  }

  /** Returns an integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Returns a random element from an array */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Fisher-Yates in-place shuffle; returns the array */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

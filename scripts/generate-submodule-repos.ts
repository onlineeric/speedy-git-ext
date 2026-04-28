/**
 * Generates 2 simple sub-repos and wires them into test-repo as submodules.
 *
 * Output layout (relative to project root):
 *   test-repo-submodules/repo-a/   — standalone repo, ~200 commits, main + dev + 2 work branches
 *   test-repo-submodules/repo-b/   — standalone repo, ~200 commits, main + dev + 1 work branch
 *   test-repo/.gitmodules          — registers both submodules
 *   test-repo/submodules/repo-a    — gitlink
 *   test-repo/submodules/repo-b    — gitlink
 *
 * Several commits are added on test-repo's current branch (dev) that bump the
 * submodule pointers, so the parent history shows submodule changes.
 *
 * Usage: pnpm generate-submodule-repos
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { SeededRandom } from './config.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, '..');
const TEST_REPO = join(ROOT, 'test-repo');
const SUBMODULE_SOURCES = join(ROOT, 'test-repo-submodules');

const AUTHORS = [
  { name: 'Alice Chen',    email: 'alice@example.com'   },
  { name: 'Bob Martinez',  email: 'bob@example.com'     },
  { name: 'Carol Johnson', email: 'carol@example.com'   },
] as const;

const TS_START = 1577836800; // 2020-01-01 UTC
const TS_STEP = 3600;        // 1 hour between commits

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function commitEnv(author: { name: string; email: string }, ts: number): NodeJS.ProcessEnv {
  return {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_AUTHOR_DATE: `${ts} +0000`,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
    GIT_COMMITTER_DATE: `${ts} +0000`,
  };
}

function git(args: string[], cwd: string, env?: NodeJS.ProcessEnv): string {
  const r: SpawnSyncReturns<string> = spawnSync('git', args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: 'utf-8',
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}\nstderr: ${r.stderr}`);
  }
  return (r.stdout ?? '').trim();
}

function gitTry(args: string[], cwd: string, env?: NodeJS.ProcessEnv): boolean {
  const r = spawnSync('git', args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: 'utf-8',
  });
  return r.status === 0;
}

function makeContent(rng: SeededRandom, lineCount: number, tag: string): string {
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(`// [${tag}] line ${i + 1}: rand=${rng.int(0, 999999)}`);
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Sub-repo generator
// ---------------------------------------------------------------------------

interface SubRepoConfig {
  name: string;
  outPath: string;
  seed: number;
  totalCommits: number;
  workBranches: string[];
}

/** Each branch writes only to its own dedicated file → merges never conflict. */
function fileForBranch(branch: string): string {
  if (branch === 'main') return 'src/core.js';
  if (branch === 'dev')  return 'src/dev.js';
  return `src/${branch}.js`;
}

function generateSubRepo(cfg: SubRepoConfig): void {
  const rng = new SeededRandom(cfg.seed);
  let ts = TS_START + cfg.seed * 100;

  if (existsSync(cfg.outPath)) rmSync(cfg.outPath, { recursive: true, force: true });
  mkdirSync(join(cfg.outPath, 'src'), { recursive: true });

  git(['init', '-b', 'main', '-q'], cfg.outPath);

  // Initial commit on main
  writeFileSync(join(cfg.outPath, 'README.md'), `# ${cfg.name}\n\nTest submodule repo.\n`);
  writeFileSync(join(cfg.outPath, 'src/core.js'), makeContent(rng, 30, 'main:init'));
  git(['add', '.'], cfg.outPath);
  git(['commit', '-m', 'Initial commit', '-q'], cfg.outPath, commitEnv(AUTHORS[0], ts));
  ts += TS_STEP;

  // Branch dev from main
  git(['checkout', '-b', 'dev', '-q'], cfg.outPath);
  writeFileSync(join(cfg.outPath, 'src/dev.js'), makeContent(rng, 20, 'dev:init'));
  git(['add', '.'], cfg.outPath);
  git(['commit', '-m', 'Initialize dev branch', '-q'], cfg.outPath, commitEnv(AUTHORS[0], ts));
  ts += TS_STEP;

  // Work branches off dev
  for (const wb of cfg.workBranches) {
    git(['checkout', '-b', wb, 'dev', '-q'], cfg.outPath);
    writeFileSync(join(cfg.outPath, `src/${wb}.js`), makeContent(rng, 15, `${wb}:init`));
    git(['add', '.'], cfg.outPath);
    git(['commit', '-m', `Initialize ${wb} branch`, '-q'], cfg.outPath, commitEnv(rng.pick(AUTHORS), ts));
    ts += TS_STEP;
  }

  let emitted = 1 + 1 + cfg.workBranches.length;
  let seq = 0;

  while (emitted < cfg.totalCommits) {
    // Pick branch (weighted: dev most active, then work branches, then main)
    const r = rng.next();
    let branch: string;
    if (r < 0.10) branch = 'main';
    else if (r < 0.45) branch = 'dev';
    else branch = cfg.workBranches.length > 0 ? rng.pick(cfg.workBranches) : 'dev';

    git(['checkout', branch, '-q'], cfg.outPath);
    writeFileSync(
      join(cfg.outPath, fileForBranch(branch)),
      makeContent(rng, rng.int(20, 80), `${branch}:${++seq}`),
    );
    git(['add', '.'], cfg.outPath);
    git(
      ['commit', '-m', `${branch}: commit ${seq}`, '-q'],
      cfg.outPath,
      commitEnv(rng.pick(AUTHORS), ts),
    );
    ts += TS_STEP;
    emitted++;

    // Occasional: merge a work branch → dev
    if (rng.next() < 0.06 && cfg.workBranches.length > 0 && emitted < cfg.totalCommits) {
      const src = rng.pick(cfg.workBranches);
      git(['checkout', 'dev', '-q'], cfg.outPath);
      const ok = gitTry(
        ['merge', '--no-ff', '-m', `Merge ${src} into dev`, src, '-q'],
        cfg.outPath,
        commitEnv(rng.pick(AUTHORS), ts),
      );
      if (ok) {
        ts += TS_STEP;
        emitted++;
      } else {
        gitTry(['merge', '--abort'], cfg.outPath);
      }
    }

    // Occasional: merge dev → main
    if (rng.next() < 0.02 && emitted < cfg.totalCommits) {
      git(['checkout', 'main', '-q'], cfg.outPath);
      const ok = gitTry(
        ['merge', '--no-ff', '-m', 'Merge dev into main', 'dev', '-q'],
        cfg.outPath,
        commitEnv(rng.pick(AUTHORS), ts),
      );
      if (ok) {
        ts += TS_STEP;
        emitted++;
      } else {
        gitTry(['merge', '--abort'], cfg.outPath);
      }
    }
  }

  // Final dev → main merge to give a clean tip
  git(['checkout', 'main', '-q'], cfg.outPath);
  gitTry(
    ['merge', '--no-ff', '-m', 'Final merge of dev into main', 'dev', '-q'],
    cfg.outPath,
    commitEnv(AUTHORS[0], ts),
  );
}

// ---------------------------------------------------------------------------
// Wire submodules into test-repo
// ---------------------------------------------------------------------------

function wireSubmodulesIntoTestRepo(subRepos: SubRepoConfig[]): void {
  if (!existsSync(TEST_REPO)) {
    throw new Error(`test-repo not found at ${TEST_REPO}. Run \`pnpm generate-test-repo\` first.`);
  }

  // Clean up any prior submodule wiring (idempotent re-run support)
  if (existsSync(join(TEST_REPO, '.gitmodules'))) {
    gitTry(['submodule', 'deinit', '--all', '-f'], TEST_REPO);
    gitTry(['rm', '-rf', '--', 'submodules'], TEST_REPO);
    rmSync(join(TEST_REPO, '.gitmodules'), { force: true });
    rmSync(join(TEST_REPO, 'submodules'), { recursive: true, force: true });
    rmSync(join(TEST_REPO, '.git/modules'), { recursive: true, force: true });
  }

  const rng = new SeededRandom(7777);
  let ts = Math.floor(Date.now() / 1000) - 86400 * 30;

  // Add each submodule (absolute local path; protocol.file.allow needed on modern git)
  for (const sr of subRepos) {
    const targetPath = `submodules/${sr.name}`;
    git(
      ['-c', 'protocol.file.allow=always', 'submodule', 'add', '--', sr.outPath, targetPath],
      TEST_REPO,
    );
  }

  git(['add', '.gitmodules', 'submodules'], TEST_REPO);
  git(
    ['commit', '-m', 'Add submodules: repo-a and repo-b', '-q'],
    TEST_REPO,
    commitEnv(rng.pick(AUTHORS), ts),
  );
  ts += 3600;

  // A few commits that bump submodule pointers (alternating between dev and main of each sub-repo)
  const bumpPlan: Array<{ subRepo: SubRepoConfig; branch: string }> = [
    { subRepo: subRepos[0], branch: 'dev' },
    { subRepo: subRepos[1], branch: 'dev' },
    { subRepo: subRepos[0], branch: 'main' },
    { subRepo: subRepos[1], branch: 'main' },
    { subRepo: subRepos[0], branch: 'dev' },
  ];

  for (const { subRepo, branch } of bumpPlan) {
    const submPath = join(TEST_REPO, 'submodules', subRepo.name);
    git(['checkout', branch, '-q'], submPath);

    git(['add', `submodules/${subRepo.name}`], TEST_REPO);
    const status = git(['status', '--porcelain'], TEST_REPO);
    if (!status) continue;

    git(
      ['commit', '-m', `Bump ${subRepo.name} to ${branch}`, '-q'],
      TEST_REPO,
      commitEnv(rng.pick(AUTHORS), ts),
    );
    ts += 3600;
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const SUB_REPOS: SubRepoConfig[] = [
  {
    name: 'repo-a',
    outPath: join(SUBMODULE_SOURCES, 'repo-a'),
    seed: 101,
    totalCommits: 200,
    workBranches: ['feature-auth', 'bugfix-login'],
  },
  {
    name: 'repo-b',
    outPath: join(SUBMODULE_SOURCES, 'repo-b'),
    seed: 202,
    totalCommits: 200,
    workBranches: ['feature-api'],
  },
];

function main(): void {
  console.log('=== Generating submodule source repos ===');
  if (!existsSync(SUBMODULE_SOURCES)) mkdirSync(SUBMODULE_SOURCES, { recursive: true });

  for (const sr of SUB_REPOS) {
    console.log(`\n[${sr.name}] seed=${sr.seed}, target=${sr.totalCommits} commits`);
    const start = Date.now();
    generateSubRepo(sr);
    const commitCount = git(['rev-list', '--all', '--count'], sr.outPath);
    const branchList  = git(['branch'], sr.outPath);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  commits: ${commitCount}, elapsed: ${elapsed}s`);
    console.log(`  branches:\n${branchList.split('\n').map(l => '    ' + l).join('\n')}`);
  }

  console.log('\n=== Wiring submodules into test-repo ===');
  wireSubmodulesIntoTestRepo(SUB_REPOS);

  console.log('\nLatest test-repo commits:');
  console.log(
    git(['log', '--oneline', '-10'], TEST_REPO).split('\n').map(l => '  ' + l).join('\n'),
  );
  console.log('\nSubmodule status:');
  console.log(
    git(['submodule', 'status'], TEST_REPO).split('\n').map(l => '  ' + l).join('\n'),
  );
  console.log('\nDone.');
}

main();

import * as path from 'path';
import { isSubmoduleOf, pathsEqual, sharesObjectStore, type RepoIdentity } from './repoIdentity.js';

/**
 * Every "which tab(s)?" answer, as pure functions over snapshots — no VS Code
 * objects, so each rule is testable on its own.
 */
export interface TabSnapshot {
  id: string;
  /** The tab's selected repository, BEFORE any submodule navigation. */
  topLevelRepoPath: string;
  /** What the tab currently displays — a submodule when it has navigated into one. */
  displayedRepoPath: string;
  /** Resolved for `displayedRepoPath`; null when the path is not a git repo. */
  identity: RepoIdentity | null;
  /** Monotonic counter, bumped whenever the tab becomes the active editor. */
  lastActiveSeq: number;
}

function mostRecentlyActive(tabs: TabSnapshot[]): TabSnapshot | null {
  // The counter is monotonic, so there is never a tie to break — which is what
  // makes "reveal any remaining graph" structurally unnecessary.
  return tabs.reduce<TabSnapshot | null>(
    (best, tab) => (best === null || tab.lastActiveSeq > best.lastActiveSeq ? tab : best),
    null,
  );
}

/** Ordinary Open: the most recently active tab, or null when none is open. */
export function pickReturnTarget(tabs: TabSnapshot[]): TabSnapshot | null {
  return mostRecentlyActive(tabs);
}

/**
 * SCM "Open in Speedy Git": the most recently active tab whose TOP-LEVEL repo
 * is this one.
 *
 * Matches on `topLevelRepoPath`, not on what is displayed: a tab currently
 * showing a submodule of X is still "a graph for X", and revealing it must not
 * retarget it.
 */
export function pickRepoTarget(tabs: TabSnapshot[], repoPath: string): TabSnapshot | null {
  return mostRecentlyActive(tabs.filter((tab) => pathsEqual(tab.topLevelRepoPath, repoPath)));
}

/**
 * Which tabs a change in `changed` must wake.
 *
 * A tab qualifies when it shares the changed repo's object store (the same repo,
 * or a sibling linked worktree — refs and objects are shared), or when it shows
 * a PARENT of the changed repo, whose gitlink status just moved.
 *
 * Deliberately not the reverse: a parent's own commit does not change the
 * submodule's history, so a submodule tab is not woken by parent activity. A
 * tab with a null identity is never woken by routing; it still refreshes on
 * manual refresh and on the `vscode.git` event for its own path.
 */
export function tabsAffectedByChange(tabs: TabSnapshot[], changed: RepoIdentity): TabSnapshot[] {
  return tabs.filter(
    (tab) =>
      tab.identity !== null
      && (sharesObjectStore(tab.identity, changed) || isSubmoduleOf(tab.identity, changed)),
  );
}

/**
 * Which tabs must show "another view is busy" while `origin` runs an operation.
 *
 * The same WORKING TREE, not the same object store: a linked worktree has its
 * own checkout, so an operation there is not this tab's operation.
 */
export function peersSharingWorkingTree(tabs: TabSnapshot[], origin: TabSnapshot): TabSnapshot[] {
  if (!origin.identity) return [];
  const originGitDir = origin.identity.gitDir;
  return tabs.filter(
    (tab) => tab.id !== origin.id && tab.identity !== null && pathsEqual(tab.identity.gitDir, originGitDir),
  );
}

/**
 * The editor tab's title: the displayed repository's own folder name.
 *
 * Deliberately the basename rather than `RepoInfo.displayName`, which becomes a
 * relative path for same-named repos — the product decision is short titles,
 * with identical titles accepted. A submodule displayed as `dev › sub-mod1`
 * therefore titles as `sub-mod1` for free, since its path ends in the submodule
 * directory.
 */
export function panelTitleFor(displayedRepoPath: string): string {
  if (!displayedRepoPath) return 'Speedy Git';
  return path.basename(displayedRepoPath.replace(/[\\/]+$/, '')) || 'Speedy Git';
}

/**
 * The installed git's version, and which version-dependent features it has.
 *
 * Two opposite defaults live here on purpose, one per function, so a caller
 * cannot pick up the wrong one by accident:
 *
 * - **Gating UI fails open** (`supportsGitFeature`): an unknown version enables
 *   everything and git's own error is shown if it refuses. A parsing gap must
 *   never lock users out of a feature their git actually has.
 * - **Choosing a command picks the universal form** (`usesNonInteractiveAutosquash`):
 *   an unknown version takes the form that works on every git.
 */

/** `[major, minor, patch]`. */
export type GitVersion = readonly [number, number, number];

/** What the backend read, and what it parses to. `raw` is null when the lookup failed. */
export interface GitVersionInfo {
  raw: string | null;
  version: GitVersion | null;
}

/** The first git version that has each feature this extension depends on. */
export const GIT_FEATURE_VERSIONS = {
  /** `--fixup=amend:` / `--fixup=reword:` (and `fixup -C` in the todo list). */
  fixupAmendReword: [2, 32, 0],
  /** `git rebase --autosquash` without `-i`; older git silently ignores it. */
  nonInteractiveAutosquash: [2, 44, 0],
} as const satisfies Record<string, GitVersion>;

export type GitFeature = keyof typeof GIT_FEATURE_VERSIONS;

/**
 * Parse `git --version` output, with or without the `git version ` lead-in.
 * Accepts vendor suffixes such as `2.39.3 (Apple Git-145)` and `2.45.1.windows.1`.
 * Returns null for anything it cannot read.
 */
export function parseGitVersion(raw: string): GitVersion | null {
  const text = raw.trim().replace(/^git version\s+/i, '');
  const parts = text.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!parts) return null;
  return [Number(parts[1]), Number(parts[2]), parts[3] === undefined ? 0 : Number(parts[3])];
}

export function formatGitVersion(version: GitVersion): string {
  return version.join('.');
}

/** A feature's minimum as people write it, e.g. `2.32`. */
export function formatGitFeatureMinimum(feature: GitFeature): string {
  const [major, minor, patch] = GIT_FEATURE_VERSIONS[feature];
  return patch === 0 ? `${major}.${minor}` : `${major}.${minor}.${patch}`;
}

export function isGitVersionAtLeast(version: GitVersion, minimum: GitVersion): boolean {
  for (let i = 0; i < 3; i++) {
    if (version[i] !== minimum[i]) return version[i] > minimum[i];
  }
  return true;
}

/** Whether UI depending on `feature` should be enabled. Unknown version → true (fail open). */
export function supportsGitFeature(version: GitVersion | null, feature: GitFeature): boolean {
  return version === null || isGitVersionAtLeast(version, GIT_FEATURE_VERSIONS[feature]);
}

/**
 * Whether `git rebase --autosquash <base>` (no `-i`) actually autosquashes.
 * Unknown version → false, so the `-i` form that works everywhere is chosen.
 */
export function usesNonInteractiveAutosquash(version: GitVersion | null): boolean {
  return version !== null && isGitVersionAtLeast(version, GIT_FEATURE_VERSIONS.nonInteractiveAutosquash);
}

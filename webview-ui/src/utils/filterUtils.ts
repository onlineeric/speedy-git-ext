import type { Commit, Branch } from '@shared/types';
import type { GraphTopology } from './graphTopology';
import type { DisplayRef } from '../types/displayRefs';
import { getColor, getLaneColorStyle, DEFAULT_GRAPH_PALETTE } from './colorUtils';

/**
 * Represents a combined branch badge in the filter panel.
 * Merges local and remote refs that share a branch name into one badge.
 */
export interface BranchBadge {
  /** Unique key for React rendering */
  key: string;
  /** The primary display name (local branch name, or remote name if remote-only) */
  primaryName: string;
  /** All raw filter names this badge represents (for removal) */
  allNames: string[];
  /** Whether this badge has a local branch */
  hasLocal: boolean;
  /** Remote names (e.g. ["origin/main"]) */
  remoteNames: string[];
}

/**
 * Look up the lane color style for a branch name by finding a commit that
 * carries that ref, then resolving via topology → colorIndex → palette.
 */
export function getBranchLaneColorStyle(
  branchName: string,
  mergedCommits: Commit[],
  topology: GraphTopology,
  graphColors: string[],
): React.CSSProperties | undefined {
  // Strip remote prefix for matching against commit refs
  const slashIdx = branchName.indexOf('/');
  const isRemote = slashIdx > 0;
  const shortName = isRemote ? branchName.slice(slashIdx + 1) : branchName;
  const remotePart = isRemote ? branchName.slice(0, slashIdx) : undefined;

  // Find the commit that has this branch as a ref
  for (const commit of mergedCommits) {
    for (const ref of commit.refs) {
      const matches = isRemote
        ? ref.type === 'remote' && ref.name === shortName && ref.remote === remotePart
        : (ref.type === 'branch' || ref.type === 'head') && ref.name === branchName;

      if (matches) {
        const node = topology.nodes.get(commit.hash);
        if (node) {
          const palette = graphColors.length > 0 ? graphColors : DEFAULT_GRAPH_PALETTE;
          const hexColor = getColor(node.colorIndex, palette);
          return getLaneColorStyle(hexColor);
        }
      }
    }
  }

  return undefined;
}

/**
 * Combine local and remote branch names from the filter list into merged badges.
 * E.g. if filters contain both "main" and "origin/main", produce one merged badge.
 */
export function combineBranchRefs(filterBranches: string[], allBranches: Branch[]): BranchBadge[] {
  const localNames = new Set<string>();
  const remoteNames = new Set<string>();

  // Classify each filter entry as local or remote
  for (const name of filterBranches) {
    const isRemote = allBranches.some((b) => b.remote && `${b.remote}/${b.name}` === name);
    if (isRemote) {
      remoteNames.add(name);
    } else {
      localNames.add(name);
    }
  }

  const badges: BranchBadge[] = [];
  const consumedRemotes = new Set<string>();

  // For each local branch, find matching remotes
  for (const local of localNames) {
    const matchingRemotes = [...remoteNames].filter((r) => {
      const slashIdx = r.indexOf('/');
      return slashIdx > 0 && r.slice(slashIdx + 1) === local;
    });

    const allNames = [local, ...matchingRemotes];
    for (const r of matchingRemotes) consumedRemotes.add(r);

    badges.push({
      key: `local-${local}`,
      primaryName: local,
      allNames,
      hasLocal: true,
      remoteNames: matchingRemotes,
    });
  }

  // Remaining remote-only branches
  for (const remote of remoteNames) {
    if (!consumedRemotes.has(remote)) {
      badges.push({
        key: `remote-${remote}`,
        primaryName: remote,
        allNames: [remote],
        hasLocal: false,
        remoteNames: [remote],
      });
    }
  }

  return badges;
}

/**
 * Convert a BranchBadge into a DisplayRef for rendering with RefLabel.
 */
export function toDisplayRef(badge: BranchBadge): DisplayRef {
  if (badge.hasLocal && badge.remoteNames.length > 0) {
    return {
      type: 'merged-branch',
      localName: badge.primaryName,
      remoteNames: badge.remoteNames,
    };
  }
  if (badge.hasLocal) {
    return {
      type: 'local-branch',
      localName: badge.primaryName,
    };
  }
  return {
    type: 'remote-branch',
    remoteName: badge.primaryName,
  };
}

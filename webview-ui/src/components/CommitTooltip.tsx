import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
} from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { Branch, Commit, RefInfo } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { displayRefKey, mergeRefs } from '../utils/mergeRefs';
import { RefLabel } from './RefLabel';
import { HeadIcon } from './icons';
import { parseExternalRefs } from '../utils/externalRefParser';
import { DEFAULT_GRAPH_PALETTE, getColor, getLaneColorStyle } from '../utils/colorUtils';
import { isReachableFromHead } from '../utils/commitReachability';

interface CommitTooltipProps {
  commit: Commit | undefined;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function CommitTooltip({ commit, onMouseEnter, onMouseLeave }: CommitTooltipProps) {
  const hoveredCommitHash = useGraphStore((s) => s.hoveredCommitHash);
  const tooltipAnchorRect = useGraphStore((s) => s.tooltipAnchorRect);
  const topology = useGraphStore((s) => s.topology);
  const graphColors = useGraphStore((s) => s.userSettings.graphColors);

  const isOpen = hoveredCommitHash !== null && commit !== undefined;
  const palette = graphColors.length > 0 ? graphColors : DEFAULT_GRAPH_PALETTE;

  const virtualAnchor = useMemo(() => {
    if (!tooltipAnchorRect) return undefined;
    return {
      getBoundingClientRect: () => tooltipAnchorRect,
    };
  }, [tooltipAnchorRect]);

  const connectorColor = useMemo(() => {
    if (!commit) return 'var(--vscode-editorHoverWidget-border,var(--vscode-widget-border))';
    const node = topology.nodes.get(commit.hash);
    if (!node) return 'var(--vscode-editorHoverWidget-border,var(--vscode-widget-border))';
    return getColor(node.colorIndex, palette);
  }, [commit, palette, topology]);

  if (!isOpen || !commit || !virtualAnchor) return null;

  return (
    <Popover.Root open>
      <Popover.Anchor virtualRef={{ current: virtualAnchor as HTMLElement }} />
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="center"
          sideOffset={8}
          collisionPadding={8}
          avoidCollisions
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 rounded border border-[var(--vscode-editorHoverWidget-border,var(--vscode-widget-border))] bg-[var(--vscode-editorHoverWidget-background,var(--vscode-editor-background))] text-[var(--vscode-editorHoverWidget-foreground,var(--vscode-editor-foreground))] max-w-[min(800px,80vw)] max-h-[min(600px,80vh)] overflow-y-auto p-3 shadow-lg"
        >
          <Popover.Arrow
            width={14}
            height={8}
            className="drop-shadow-[0_0_0.5px_rgba(0,0,0,0.35)]"
            style={{ fill: connectorColor }}
          />
          <TooltipContent commit={commit} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Convert a list of branch name strings (from `git branch -a --contains`)
 * into RefInfo[] suitable for mergeRefs().
 *
 * Local branches are plain names (e.g., "main").
 * Remote branches are "origin/name" format (remotes/ prefix already stripped by backend).
 */
function branchNamesToRefInfos(branches: string[], knownBranches: Branch[]): RefInfo[] {
  const knownRemoteKeys = new Set(
    knownBranches
      .filter((branch) => branch.remote)
      .map((branch) => `${branch.remote}/${branch.name}`)
  );

  return branches.map((qualifiedName) => {
    if (knownRemoteKeys.has(qualifiedName)) {
      const slashIdx = qualifiedName.indexOf('/');
      return {
        type: 'remote' as const,
        remote: qualifiedName.slice(0, slashIdx),
        name: qualifiedName.slice(slashIdx + 1),
      };
    }

    return { type: 'branch' as const, name: qualifiedName };
  });
}

function TooltipContent({ commit }: { commit: Commit }) {
  const isHead = useMemo(() => commit.refs.some((r) => r.type === 'head'), [commit.refs]);

  return (
    <div className="flex flex-col gap-2 text-xs">
      {/* Header: short hash */}
      <div className="font-mono font-semibold text-[var(--vscode-textLink-foreground)]">
        {commit.abbreviatedHash}
      </div>

      {/* References section: containing branches (async) + tags/stashes/HEAD (immediate) */}
      <ReferencesSection
        hash={commit.hash}
        isHead={isHead}
      />

      {/* Worktree section */}
      <WorktreeSection hash={commit.hash} />

      {/* External links section */}
      <ExternalLinksSection subject={commit.subject} />
    </div>
  );
}

function parseGitHubOwnerRepo(fetchUrl: string): { owner: string; repo: string } | null {
  const sshMatch = fetchUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
  const httpsMatch = fetchUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  return null;
}

interface ReferencesSectionProps {
  hash: string;
  isHead: boolean;
}

function ReferencesSection({ hash, isHead }: ReferencesSectionProps) {
  const containingResult = useGraphStore((s) => s.containingBranchesCache.get(hash));
  const knownBranches = useGraphStore((s) => s.branches);
  const mergedCommits = useGraphStore((s) => s.mergedCommits);
  const topology = useGraphStore((s) => s.topology);
  const graphColors = useGraphStore((s) => s.userSettings.graphColors);
  const directBranchRefs = useGraphStore((s) => {
    const commit = s.mergedCommits.find((candidate) => candidate.hash === hash);
    if (!commit) return [];

    return commit.refs.filter(
      (ref) =>
        ref.type === 'branch' ||
        ref.type === 'remote' ||
        (ref.type === 'head' && ref.name !== 'HEAD')
    );
  });

  useEffect(() => {
    if (containingResult === undefined) {
      useGraphStore.getState().setContainingBranches(hash, { branches: [], status: 'loading' });
      rpcClient.getContainingBranches(hash);
    }
  }, [hash, containingResult]);

  const headCommit = useMemo(
    () => mergedCommits.find((commit) => commit.refs.some((ref) => ref.type === 'head')),
    [mergedCommits]
  );

  // Convert containing branches to display refs
  const branchDisplayRefs = useMemo(() => {
    if (containingResult?.status === 'loaded' && containingResult.branches.length > 0) {
      const refInfos = branchNamesToRefInfos(containingResult.branches, knownBranches);
      return mergeRefs(refInfos).displayRefs;
    }

    if (containingResult?.status === 'error' && directBranchRefs.length > 0) {
      return mergeRefs(directBranchRefs).displayRefs;
    }

    return [];
  }, [containingResult, directBranchRefs, knownBranches]);

  const headContainsCommit = headCommit
    ? headCommit.hash === hash || isReachableFromHead(hash, headCommit.hash, mergedCommits)
    : false;
  const showHead = isHead || headContainsCommit;
  const palette = graphColors.length > 0 ? graphColors : DEFAULT_GRAPH_PALETTE;

  const branchStyleByQualifiedName = useMemo(() => {
    const map = new Map<string, CSSProperties>();

    for (const branch of knownBranches) {
      const qualifiedName = branch.remote ? `${branch.remote}/${branch.name}` : branch.name;
      const node = topology.nodes.get(branch.hash);
      if (!node) continue;

      map.set(qualifiedName, getLaneColorStyle(getColor(node.colorIndex, palette)));
    }

    return map;
  }, [knownBranches, palette, topology]);

  const headStyle = useMemo(() => {
    if (!headCommit) return undefined;
    const node = topology.nodes.get(headCommit.hash);
    if (!node) return undefined;
    return getLaneColorStyle(getColor(node.colorIndex, palette));
  }, [headCommit, palette, topology]);

  const { tagDisplayRefs, stashDisplayRefs, styleByRefKey } = useMemo(() => {
    const nextStyleByRefKey = new Map<string, CSSProperties>();
    const nextTagDisplayRefs: ReturnType<typeof mergeRefs>['displayRefs'] = [];
    const nextStashDisplayRefs: ReturnType<typeof mergeRefs>['displayRefs'] = [];
    const seen = new Set<string>();

    for (const commit of mergedCommits) {
      if (!isReachableFromHead(hash, commit.hash, mergedCommits)) {
        continue;
      }

      const node = topology.nodes.get(commit.hash);
      const laneStyle = node
        ? getLaneColorStyle(getColor(node.colorIndex, palette))
        : undefined;

      for (const ref of commit.refs) {
        if (ref.type !== 'tag' && ref.type !== 'stash') {
          continue;
        }

        const displayRef =
          ref.type === 'tag'
            ? ({ type: 'tag', tagName: ref.name } as const)
            : ({ type: 'stash', stashRef: ref.name } as const);
        const key = displayRefKey(displayRef);
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        if (ref.type === 'tag') {
          nextTagDisplayRefs.push(displayRef);
        } else {
          nextStashDisplayRefs.push(displayRef);
        }

        if (laneStyle) {
          nextStyleByRefKey.set(key, laneStyle);
        }
      }
    }

    return {
      tagDisplayRefs: nextTagDisplayRefs,
      stashDisplayRefs: nextStashDisplayRefs,
      styleByRefKey: nextStyleByRefKey,
    };
  }, [hash, mergedCommits, palette, topology]);

  const getDisplayRefStyle = (displayRef: ReturnType<typeof mergeRefs>['displayRefs'][number]): CSSProperties | undefined => {
    switch (displayRef.type) {
      case 'local-branch':
        return branchStyleByQualifiedName.get(displayRef.localName);
      case 'remote-branch':
        return branchStyleByQualifiedName.get(displayRef.remoteName);
      case 'merged-branch':
        return (
          branchStyleByQualifiedName.get(displayRef.localName) ??
          branchStyleByQualifiedName.get(displayRef.remoteNames[0])
        );
      case 'tag':
        return styleByRefKey.get(displayRefKey(displayRef));
      case 'stash':
        return styleByRefKey.get(displayRefKey(displayRef));
    }
  };

  const hasAnyRefs = showHead || tagDisplayRefs.length > 0 || stashDisplayRefs.length > 0 || branchDisplayRefs.length > 0;
  const isLoading = !containingResult || containingResult.status === 'loading';
  const isError = containingResult?.status === 'error';

  // Show section if we have any refs, or still loading/error
  if (!hasAnyRefs && !isLoading && !isError) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold text-[var(--vscode-descriptionForeground)]">References</div>
      <div className="flex flex-col">
        {showHead && (
          <ReferenceSubsection label="HEAD">
            <span
              className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs"
              style={headStyle}
            >
              <HeadIcon className="flex-shrink-0" />
              HEAD
            </span>
          </ReferenceSubsection>
        )}
        {branchDisplayRefs.length > 0 && (
          <ReferenceSubsection label="Branches" separated={showHead}>
            {branchDisplayRefs.map((displayRef) => (
              <RefLabel
                key={displayRefKey(displayRef)}
                displayRef={displayRef}
                laneColorStyle={getDisplayRefStyle(displayRef)}
              />
            ))}
          </ReferenceSubsection>
        )}
        {tagDisplayRefs.length > 0 && (
          <ReferenceSubsection label="Tags" separated={showHead || branchDisplayRefs.length > 0}>
            {tagDisplayRefs.map((displayRef) => (
              <RefLabel
                key={displayRefKey(displayRef)}
                displayRef={displayRef}
                laneColorStyle={getDisplayRefStyle(displayRef)}
              />
            ))}
          </ReferenceSubsection>
        )}
        {stashDisplayRefs.length > 0 && (
          <ReferenceSubsection
            label="Stashes"
            separated={showHead || branchDisplayRefs.length > 0 || tagDisplayRefs.length > 0}
          >
            {stashDisplayRefs.map((displayRef) => (
              <RefLabel
                key={displayRefKey(displayRef)}
                displayRef={displayRef}
                laneColorStyle={getDisplayRefStyle(displayRef)}
              />
            ))}
          </ReferenceSubsection>
        )}
      </div>
      {isLoading && (
        <span className="text-[var(--vscode-descriptionForeground)]">Loading branches...</span>
      )}
      {isError && (
        <span className="text-[var(--vscode-descriptionForeground)]">Branch info unavailable</span>
      )}
    </div>
  );
}

function ReferenceSubsection({
  label,
  separated = false,
  children,
}: {
  label: string;
  separated?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${separated ? 'border-t border-[var(--vscode-widget-border)] pt-2 mt-2' : ''}`}>
      <div className="text-[var(--vscode-descriptionForeground)]">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function ExternalLinksSection({ subject }: { subject: string }) {
  const remotes = useGraphStore((s) => s.remotes);

  const externalRefs = useMemo(() => {
    const ownerRepo =
      remotes
        .map((remote) => parseGitHubOwnerRepo(remote.fetchUrl))
        .find((candidate) => candidate !== null) ?? null;
    return parseExternalRefs(subject, ownerRepo);
  }, [subject, remotes]);

  if (externalRefs.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold text-[var(--vscode-descriptionForeground)]">External Links</div>
      <div className="flex flex-wrap gap-1.5">
        {externalRefs.map((ref) =>
          ref.url ? (
            <button
              key={ref.label}
              type="button"
              className="text-[var(--vscode-textLink-foreground)] hover:underline cursor-pointer"
              onClick={() => rpcClient.openExternal(ref.url!)}
            >
              {ref.label}
            </button>
          ) : (
            <span key={ref.label} className="text-[var(--vscode-descriptionForeground)]">
              {ref.label}
            </span>
          )
        )}
      </div>
    </div>
  );
}

function WorktreeSection({ hash }: { hash: string }) {
  const worktreeInfo = useGraphStore((s) => s.worktreeByHead.get(hash));

  if (!worktreeInfo) return null;

  const label = worktreeInfo.isMain ? 'Primary Workspace' : 'Worktree';

  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold text-[var(--vscode-descriptionForeground)]">{label}</div>
      <div className="font-mono text-[var(--vscode-descriptionForeground)] break-all">
        {worktreeInfo.path}
      </div>
    </div>
  );
}

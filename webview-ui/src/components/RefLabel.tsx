import { forwardRef, type ReactNode } from 'react';
import type { WorktreeInfo } from '@shared/types';
import type { DisplayRef } from '../types/displayRefs';
import { getRefStyle } from '../utils/refStyle';
import { worktreeBadgeBorderColor } from '../utils/worktreeBadgeStyle';
import { BranchIcon, TagIcon, WorktreeIcon } from './icons';

interface RefLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  displayRef: DisplayRef;
  laneColorStyle?: React.CSSProperties;
  worktree?: WorktreeInfo;
}

/** Renders a single ref badge with an icon and label text. */
export const RefLabel = forwardRef<HTMLSpanElement, RefLabelProps>(
  function RefLabel({ displayRef, laneColorStyle, worktree, className, style, ...rest }, ref) {
    const layoutStyle = getRefStyle(displayRef.type);
    const label = getRefLabel(displayRef);
    const title = getRefTitle(displayRef, worktree);
    const icon = getRefIcon(displayRef);
    const showWorktreeIcon = !!worktree && (displayRef.type === 'local-branch' || displayRef.type === 'merged-branch');

    const fallbackColor = !laneColorStyle ? ' border-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]' : '';
    const badgeStyle = laneColorStyle ? { ...style, ...laneColorStyle } : style;
    const worktreeBadgeStyle = showWorktreeIcon
      ? { ...badgeStyle, borderColor: worktreeBadgeBorderColor(badgeStyle?.borderColor) }
      : badgeStyle;
    const borderClass = showWorktreeIcon ? 'border' : layoutStyle;

    return (
      <span
        ref={ref}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded ${borderClass}${fallbackColor}${className ? ` ${className}` : ''}`}
        title={title}
        {...rest}
        style={worktreeBadgeStyle}
      >
        {icon}
        {label}
        {showWorktreeIcon && <WorktreeIcon className="ml-0.5 h-3 w-3 shrink-0" />}
      </span>
    );
  }
);

function getRefLabel(displayRef: DisplayRef): string {
  switch (displayRef.type) {
    case 'local-branch':
      return displayRef.localName;
    case 'remote-branch':
      return displayRef.remoteName;
    case 'merged-branch': {
      const remoteHosts = displayRef.remoteNames.map((r) => {
        const slashIdx = r.indexOf('/');
        return slashIdx >= 0 ? r.slice(0, slashIdx) : r;
      });
      return `${displayRef.localName} \u21c4 ${remoteHosts.join(', ')}`;
    }
    case 'tag':
      return displayRef.tagName;
    case 'stash':
      return displayRef.stashRef;
  }
}

function getRefTitle(displayRef: DisplayRef, worktree?: WorktreeInfo): string {
  let title: string;
  switch (displayRef.type) {
    case 'local-branch':
      title = displayRef.localName;
      break;
    case 'remote-branch':
      title = displayRef.remoteName;
      break;
    case 'merged-branch':
      title = `${displayRef.localName} \u21c4 ${displayRef.remoteNames.join(', ')}`;
      break;
    case 'tag':
      title = displayRef.tagName;
      break;
    case 'stash':
      title = displayRef.stashRef;
      break;
  }

  return worktree ? `${title}\nWorktree: ${worktree.path}` : title;
}

function getRefIcon(displayRef: DisplayRef): ReactNode {
  switch (displayRef.type) {
    case 'local-branch':
    case 'remote-branch':
    case 'merged-branch':
      return <BranchIcon />;
    case 'tag':
      return <TagIcon />;
    case 'stash':
      return null;
  }
}

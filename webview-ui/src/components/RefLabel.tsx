import type { ReactNode } from 'react';
import type { DisplayRef } from '../types/displayRefs';
import { getRefStyle } from '../utils/refStyle';
import { BranchIcon, TagIcon } from './icons';

interface RefLabelProps {
  displayRef: DisplayRef;
}

/** Renders a single ref badge with an icon and label text. */
export function RefLabel({ displayRef }: RefLabelProps) {
  const style = getRefStyle(displayRef.type);
  const label = getRefLabel(displayRef);
  const title = getRefTitle(displayRef);
  const icon = getRefIcon(displayRef);

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded ${style}`}
      title={title}
    >
      {icon}
      {label}
    </span>
  );
}

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

function getRefTitle(displayRef: DisplayRef): string {
  switch (displayRef.type) {
    case 'local-branch':
      return displayRef.localName;
    case 'remote-branch':
      return displayRef.remoteName;
    case 'merged-branch':
      return `${displayRef.localName} \u21c4 ${displayRef.remoteNames.join(', ')}`;
    case 'tag':
      return displayRef.tagName;
    case 'stash':
      return displayRef.stashRef;
  }
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

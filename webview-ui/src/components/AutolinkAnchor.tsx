import type { ReactNode } from 'react';
import type { UiAction, UiSurface } from '@shared/telemetry';
import { rpcClient } from '../rpc/rpcClient';
import type { AutolinkSource } from '../utils/autolinks';
import { trackUiInteraction } from '../utils/telemetry';

/** The places a commit message is rendered with its autolinks. */
export type AutolinkSurface = Extract<UiSurface, 'commitRow' | 'commitDetails' | 'commitTooltip'>;

const OPEN_AUTOLINK_ACTIONS: Record<AutolinkSource, UiAction> = {
  custom: 'openAutolinkCustom',
  github: 'openAutolinkGitHub',
  gitlab: 'openAutolinkGitLab',
};

interface AutolinkAnchorProps {
  url: string;
  source: AutolinkSource;
  surface: AutolinkSurface;
  children: ReactNode;
}

/**
 * One autolinked reference. Opens through the backend (the webview cannot
 * navigate itself), and swallows the click so a link inside a commit row opens
 * the link without also selecting the row. The URL is the tooltip, so a reader
 * can see where a link goes before following it.
 */
export function AutolinkAnchor({ url, source, surface, children }: AutolinkAnchorProps) {
  return (
    <a
      href={url}
      title={url}
      className="cursor-pointer text-[var(--vscode-textLink-foreground)] underline-offset-2 hover:underline hover:text-[var(--vscode-textLink-activeForeground)]"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        trackUiInteraction(surface, OPEN_AUTOLINK_ACTIONS[source]);
        rpcClient.openExternal(url);
      }}
    >
      {children}
    </a>
  );
}

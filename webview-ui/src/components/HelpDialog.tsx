import * as Dialog from '@radix-ui/react-dialog';
import type { UiAction } from '@shared/telemetry';
import { rpcClient } from '../rpc/rpcClient';
import { trackUiInteraction } from '../utils/telemetry';
import { HELP_LINKS, ISSUES_URL, formatVersionLabel, getExtensionVersion } from '../utils/helpLinks';
import { dialogContentClassName, dialogContentStyle } from './dialogStyles';
import { CopyIcon } from './icons';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const linkRowClass =
  'w-full text-left px-3 py-2 rounded border border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)] focus:outline-none focus:border-[var(--vscode-focusBorder)]';

/**
 * "Help & Feedback" dialog reached from the toolbar Help button.
 *
 * Its purpose is to route every question, suggestion and bug report to one
 * place — GitHub Issues — so the URL is shown verbatim (and copyable) as well as
 * being clickable. Links open in the user's browser through the `openExternal`
 * RPC; the webview cannot navigate itself.
 */
export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const versionLabel = formatVersionLabel(getExtensionVersion());

  const handleOpenLink = (url: string, telemetryAction: UiAction) => {
    trackUiInteraction('helpDialog', telemetryAction);
    rpcClient.openExternal(url);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className={dialogContentClassName} style={dialogContentStyle}>
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Help &amp; Feedback
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            Got a question, a suggestion, a feature request, or found a bug? Please open an issue on
            GitHub — that is where everything is tracked and answered.
          </Dialog.Description>

          <div className="mt-3 flex items-center gap-2 rounded bg-[var(--vscode-textCodeBlock-background)] px-3 py-2">
            <code className="flex-1 select-all break-all text-xs text-[var(--vscode-foreground)]">
              {ISSUES_URL}
            </code>
            <button
              type="button"
              onClick={() => rpcClient.copyToClipboard(ISSUES_URL)}
              className="p-1 rounded text-[var(--vscode-icon-foreground)] opacity-70 hover:opacity-100 hover:bg-[var(--vscode-toolbar-hoverBackground)] focus:outline-none"
              title="Copy link"
              aria-label="Copy issues link"
            >
              <CopyIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {HELP_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                className={linkRowClass}
                onClick={() => handleOpenLink(link.url, link.telemetryAction)}
              >
                <span className="block text-sm text-[var(--vscode-textLink-foreground)]">
                  {link.label}
                </span>
                <span className="block text-xs text-[var(--vscode-descriptionForeground)]">
                  {link.description}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 text-xs text-[var(--vscode-descriptionForeground)]">
            <p>
              When reporting a bug, including the version below, your OS, and the steps to reproduce
              makes it much faster to fix.
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">{versionLabel}</span>
            <Dialog.Close className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]">
              Close
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

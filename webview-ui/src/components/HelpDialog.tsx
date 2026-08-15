import * as Dialog from '@radix-ui/react-dialog';
import { rpcClient } from '../rpc/rpcClient';
import { useCopyFeedback } from '../hooks/useCopyFeedback';
import { trackUiInteraction } from '../utils/telemetry';
import { HELP_LINKS, ISSUES_URL, VERSION_LABEL, type HelpLinkAction } from '../utils/helpLinks';
import {
  buttonSecondaryClassName,
  dialogContentClassName,
  dialogContentStyle,
  dialogOverlayClassName,
  dialogSectionLabelClassName,
} from './dialogStyles';
import { CopiedIcon, CopyIcon } from './icons';
import { RefBadgeLegend } from './RefBadgeLegend';

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
  const { copied, copy } = useCopyFeedback();

  const handleOpenLink = (url: string, telemetryAction: HelpLinkAction) => {
    trackUiInteraction('helpDialog', telemetryAction);
    rpcClient.openExternal(url);
  };

  const handleCopyIssuesUrl = () => {
    trackUiInteraction('helpDialog', 'helpCopyIssuesUrl');
    copy(ISSUES_URL);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClassName} />
        <Dialog.Content
          className={`${dialogContentClassName} flex max-h-[80vh] flex-col`}
          style={dialogContentStyle}
        >
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Help &amp; Feedback
          </Dialog.Title>

          {/* Only the body scrolls, so the version and Close stay reachable however long it grows. */}
          <div className="mt-4 flex-1 overflow-y-auto">
            <RefBadgeLegend />

            <h3 className={`${dialogSectionLabelClassName} mt-6`}>Help &amp; Feedback</h3>
            <Dialog.Description className="text-sm text-[var(--vscode-descriptionForeground)]">
              Got a question, a suggestion, a feature request, or found a bug? Please open an issue
              on GitHub — that is where everything is tracked and answered.
            </Dialog.Description>

            <div className="mt-3 flex items-center gap-2 rounded bg-[var(--vscode-textCodeBlock-background)] px-3 py-2">
              <code className="flex-1 select-all break-all text-xs text-[var(--vscode-foreground)]">
                {ISSUES_URL}
              </code>
              <button
                type="button"
                onClick={handleCopyIssuesUrl}
                className="p-1 rounded text-[var(--vscode-icon-foreground)] opacity-70 hover:opacity-100 hover:bg-[var(--vscode-toolbar-hoverBackground)] focus:outline-none focus:ring-1 focus:ring-[var(--vscode-focusBorder)]"
                title={copied ? 'Copied!' : 'Copy link'}
                aria-label="Copy issues link"
              >
                {copied ? (
                  <CopiedIcon className="w-3.5 h-3.5" />
                ) : (
                  <CopyIcon className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {HELP_LINKS.map((link) => (
                <button
                  key={link.telemetryAction}
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

            <p className="mt-4 text-xs text-[var(--vscode-descriptionForeground)]">
              When reporting a bug, including the version below, your OS, your IDE
              (VSCode / Cursor / etc), and the steps to reproduce makes it much faster to fix.
            </p>
          </div>

          <div className="mt-4 flex shrink-0 items-center justify-between">
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">
              {VERSION_LABEL}
            </span>
            <Dialog.Close className={buttonSecondaryClassName}>Close</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

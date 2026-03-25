import { useState, useCallback } from 'react';

interface CommandPreviewProps {
  command: string;
}

export function CommandPreview({ command }: CommandPreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in restricted contexts; silently ignore
    }
  }, [command]);

  return (
    <div className="space-y-1">
      <label className="text-sm text-[var(--vscode-descriptionForeground)]">Command preview:</label>
      <div className="flex items-center gap-1">
        <input
          type="text"
          readOnly
          value={command}
          className="flex-1 px-2 py-1 text-sm font-mono rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] select-all overflow-x-auto"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="px-2 py-1 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] whitespace-nowrap"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

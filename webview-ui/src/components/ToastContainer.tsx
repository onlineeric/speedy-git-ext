import { useState, useEffect } from 'react';
import { useGraphStore } from '../stores/graphStore';

type ToastType = 'error' | 'success';

function Toast({
  type,
  message,
  onDismiss,
}: {
  type: ToastType;
  message: string;
  onDismiss: () => void;
}) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (type !== 'success') return;
    const timer = setTimeout(() => setExiting(true), 2700);
    return () => clearTimeout(timer);
  }, [type]);

  const borderColor =
    type === 'error'
      ? 'border-l-[var(--vscode-errorForeground)]'
      : 'border-l-[var(--vscode-terminal-ansiGreen)]';

  const icon = type === 'error' ? '⚠' : '✓';

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-start gap-2 px-3 py-2 rounded border-l-4 ${borderColor} bg-[var(--vscode-notifications-background)] shadow-lg min-w-[240px] max-w-[360px] ${exiting ? 'animate-toast-out' : 'animate-toast-in'}`}
      onAnimationEnd={() => {
        if (exiting) onDismiss();
      }}
    >
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span className="flex-1 text-sm text-[var(--vscode-notifications-foreground)]">
        {message}
      </span>
      <button
        className="shrink-0 ml-1 px-1 hover:opacity-70 cursor-pointer text-[var(--vscode-notifications-foreground)]"
        onClick={onDismiss}
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer() {
  const error = useGraphStore((s) => s.error);
  const successMessage = useGraphStore((s) => s.successMessage);

  if (!error && !successMessage) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {error && (
        <Toast
          type="error"
          message={error}
          onDismiss={() => useGraphStore.getState().setError(undefined)}
        />
      )}
      {successMessage && (
        <Toast
          type="success"
          message={successMessage}
          onDismiss={() => useGraphStore.getState().setSuccessMessage(undefined)}
        />
      )}
    </div>
  );
}

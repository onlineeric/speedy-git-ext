import { useCallback, useEffect, useRef, useState } from 'react';
import { rpcClient } from '../rpc/rpcClient';

/** How long the "copied" affordance stays lit after a successful copy. */
const COPIED_FEEDBACK_MS = 500;

/**
 * Copy-to-clipboard with a short "copied" flash.
 *
 * The clipboard write happens in the extension host (`copyToClipboard` RPC), so
 * nothing on screen changes on its own — every copy affordance needs its own
 * feedback. This owns that state once so the buttons only pick an icon.
 */
export function useCopyFeedback() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Cancel a pending reset so unmounting mid-flash doesn't set state afterwards.
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = useCallback((text: string) => {
    rpcClient.copyToClipboard(text);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }, []);

  return { copied, copy };
}

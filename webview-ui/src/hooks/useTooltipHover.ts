import { useCallback, useRef } from 'react';
import { useGraphStore } from '../stores/graphStore';

const SHOW_DELAY = 200;
const DISMISS_DELAY = 150;

export function useTooltipHover() {
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const onNodeMouseEnter = useCallback((hash: string, anchorRect: DOMRect) => {
    clearTimers();
    showTimerRef.current = setTimeout(() => {
      showTimerRef.current = null;
      useGraphStore.getState().setHoveredCommit(hash, anchorRect);
    }, SHOW_DELAY);
  }, [clearTimers]);

  const onNodeMouseLeave = useCallback(() => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      useGraphStore.getState().setHoveredCommit(null, null);
    }, DISMISS_DELAY);
  }, []);

  const onTooltipMouseEnter = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const onTooltipMouseLeave = useCallback(() => {
    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      useGraphStore.getState().setHoveredCommit(null, null);
    }, DISMISS_DELAY);
  }, []);

  const dismissImmediate = useCallback(() => {
    clearTimers();
    useGraphStore.getState().setHoveredCommit(null, null);
  }, [clearTimers]);

  return {
    onNodeMouseEnter,
    onNodeMouseLeave,
    onTooltipMouseEnter,
    onTooltipMouseLeave,
    dismissImmediate,
  };
}

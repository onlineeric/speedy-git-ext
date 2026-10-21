import { useCallback, useEffect, useState } from 'react';
import { rpcClient } from '../rpc/rpcClient';
import { applyNamePrefill, type PrefilledName } from '../utils/refNameField';

/**
 * A new-branch name field prefilled with VS Code's `git.branchPrefix`.
 *
 * The prefix is re-read on every open, so a changed setting applies without a
 * reload. A `derivedName` (a worktree mirroring an existing ref's name) wins over
 * the prefix: prefixing it would rename the branch it mirrors.
 *
 * `reset` returns the field to its prefill, for a dialog that stays mounted
 * while closed.
 */
export function usePrefilledBranchName(open: boolean, derivedName = '') {
  const [field, setField] = useState<PrefilledName>({ value: derivedName, pristine: derivedName });

  useEffect(() => {
    if (!open || derivedName) return;
    let cancelled = false;
    void rpcClient.getBranchPrefix().then((prefix) => {
      if (!cancelled) setField((current) => applyNamePrefill(current, prefix));
    });
    return () => {
      cancelled = true;
    };
  }, [open, derivedName]);

  const setName = useCallback((value: string) => {
    setField((current) => ({ ...current, value }));
  }, []);

  const reset = useCallback(() => {
    setField((current) => ({ ...current, value: current.pristine }));
  }, []);

  return { name: field.value, pristineName: field.pristine, setName, reset };
}

import { useEffect } from 'react';
import type { GitVersionInfo } from '@shared/gitVersion';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';

/**
 * The installed git's version, fetched on first use and kept for the session.
 * `undefined` while loading — treat it like an unknown version, which fails open.
 */
export function useGitVersion(): GitVersionInfo | undefined {
  const gitVersion = useGraphStore((s) => s.gitVersion);
  useEffect(() => {
    rpcClient.requestGitVersion();
  }, []);
  return gitVersion;
}

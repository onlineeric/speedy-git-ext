import type { RemoteInfo } from '@shared/types';

/** The hosting providers whose `#12` references we can link with confidence. */
export type RemoteProvider = 'github' | 'gitlab';

/** A repository on a supported host, as `#12`-style references resolve against it. */
export interface RemoteAutolinkTarget {
  provider: RemoteProvider;
  /** `https://github.com` / `https://gitlab.com` — the web host, whatever protocol the remote uses. */
  webBaseUrl: string;
  /** `owner/repo`, or on GitLab `group/subgroup/project`. */
  repoPath: string;
}

/**
 * Hostnames, exactly, that we know to be each provider. A self-hosted GitHub
 * Enterprise or GitLab instance is deliberately absent: nothing in its hostname
 * says which product it runs, and a guessed link is worse than none.
 * `ssh.github.com` and `altssh.gitlab.com` are each provider's SSH-over-443 hosts.
 */
const PROVIDER_HOSTS: Readonly<Record<string, { provider: RemoteProvider; webBaseUrl: string }>> = {
  'github.com': { provider: 'github', webBaseUrl: 'https://github.com' },
  'www.github.com': { provider: 'github', webBaseUrl: 'https://github.com' },
  'ssh.github.com': { provider: 'github', webBaseUrl: 'https://github.com' },
  'gitlab.com': { provider: 'gitlab', webBaseUrl: 'https://gitlab.com' },
  'www.gitlab.com': { provider: 'gitlab', webBaseUrl: 'https://gitlab.com' },
  'altssh.gitlab.com': { provider: 'gitlab', webBaseUrl: 'https://gitlab.com' },
};

/**
 * Split a git remote URL into host and repository path.
 *
 * Git accepts two shapes: a real URL (`https://`, `ssh://`, `git://`), which the
 * platform `URL` parser handles, and scp-like `[user@]host:path`, which is not a
 * URL at all. A local path has neither a scheme nor a `host:` and yields null.
 */
function splitRemoteUrl(remoteUrl: string): { host: string; path: string } | null {
  const trimmed = remoteUrl.trim();

  if (trimmed.includes('://')) {
    try {
      const url = new URL(trimmed);
      return { host: url.hostname.toLowerCase(), path: decodeURIComponent(url.pathname) };
    } catch {
      return null;
    }
  }

  const colon = trimmed.indexOf(':');
  // No colon, or one too early to follow a host (a Windows drive letter `C:`).
  if (colon < 2) return null;
  const hostPart = trimmed.slice(0, colon);
  if (hostPart.includes('/')) return null;
  const host = hostPart.slice(hostPart.lastIndexOf('@') + 1).toLowerCase();
  return { host, path: trimmed.slice(colon + 1) };
}

/** `/owner/repo.git/` → `['owner', 'repo']`. */
function repoPathSegments(path: string): string[] {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  const last = segments.length - 1;
  if (last >= 0 && segments[last].endsWith('.git')) {
    segments[last] = segments[last].slice(0, -'.git'.length);
  }
  return segments.filter((segment) => segment.length > 0);
}

/** Read one remote URL as a supported repository, or null when it is anything else. */
export function parseRemoteAutolinkTarget(remoteUrl: string): RemoteAutolinkTarget | null {
  const parts = splitRemoteUrl(remoteUrl);
  if (!parts) return null;

  const host = PROVIDER_HOSTS[parts.host];
  if (!host) return null;

  const segments = repoPathSegments(parts.path);
  // GitHub is always exactly owner/repo. GitLab nests groups, so it needs at
  // least a namespace and a project.
  const shapeMatches = host.provider === 'github' ? segments.length === 2 : segments.length >= 2;
  if (!shapeMatches) return null;

  return { provider: host.provider, webBaseUrl: host.webBaseUrl, repoPath: segments.join('/') };
}

/**
 * The remote a bare `#12` refers to, or null when that is not clear.
 *
 * The only remote is unambiguous. With several, `upstream` wins: by convention
 * it is the original repository of a fork, where the referenced issues and pull
 * requests live. Failing that, `origin`. Any other set of remotes has no
 * obvious answer, so nothing is linked — and the chosen remote is never swapped
 * for another one that happens to be on a supported host, because that would be
 * a guess about which repository the message meant.
 */
export function resolveRemoteAutolinkTarget(remotes: readonly RemoteInfo[]): RemoteAutolinkTarget | null {
  const remote = remotes.length === 1
    ? remotes[0]
    : remotes.find((candidate) => candidate.name === 'upstream')
      ?? remotes.find((candidate) => candidate.name === 'origin');
  if (!remote) return null;
  return parseRemoteAutolinkTarget(remote.fetchUrl);
}

/**
 * Join a parent repo absolute path with a submodule's relative path. The webview is a sandboxed
 * browser bundle and cannot import Node's `path` module, so we detect the parent's native
 * separator (backslash on Windows, forward on Unix) and use it consistently — git always emits
 * forward-slash relative paths for submodules, so the relative segment is converted to match.
 */
export function joinRepoPath(parent: string, sub: string): string {
  const useBackslash = parent.includes('\\') && !parent.includes('/');
  const sep = useBackslash ? '\\' : '/';
  const cleanParent = parent.replace(/[\\/]+$/, '');
  const cleanSub = sub
    .replace(/^[\\/]+/, '')
    .replace(/[\\/]+/g, sep);
  return `${cleanParent}${sep}${cleanSub}`;
}

import { useGraphStore } from '../stores/graphStore';

export function RepoSelector() {
  const repos = useGraphStore((s) => s.repos);
  const activeRepoPath = useGraphStore((s) => s.activeRepoPath);
  const setActiveRepo = useGraphStore((s) => s.setActiveRepo);

  if (repos.length <= 1) return null;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveRepo(e.target.value);
  };

  return (
    <select
      value={activeRepoPath}
      onChange={handleChange}
      className="px-2 py-1 text-sm rounded focus:outline-none"
      style={{
        background: 'var(--vscode-dropdown-background)',
        color: 'var(--vscode-dropdown-foreground)',
        border: '1px solid var(--vscode-dropdown-border)',
      }}
      aria-label="Select repository"
    >
      {repos.map((repo) => (
        <option key={repo.path} value={repo.path}>
          {repo.displayName}
        </option>
      ))}
    </select>
  );
}

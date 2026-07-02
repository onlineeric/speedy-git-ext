export interface GitRefNameValidation {
  valid: boolean;
  message?: string;
}

const INVALID_REF_CHARS = new Set(['~', '^', ':', '?', '*', '[', '\\']);

/**
 * Validates a git ref name against `git check-ref-format` rules.
 * `label` is used in error messages (e.g. "Tag name", "Branch name").
 */
export function validateGitRefName(rawName: string, label: string): GitRefNameValidation {
  const name = rawName.trim();

  if (!name) return invalid(`${label} is required`);
  if (name.startsWith('-')) return invalid(`${label} cannot start with -`);
  if (name === '@') return invalid(`${label} cannot be @`);
  if (name.startsWith('/') || name.endsWith('/') || name.includes('//')) {
    return invalid(`${label} cannot start, end, or contain empty slash segments`);
  }
  if (name.endsWith('.')) return invalid(`${label} cannot end with .`);
  if (name.includes('..')) return invalid(`${label} cannot contain ..`);
  if (name.includes('@{')) return invalid(`${label} cannot contain @{`);

  for (const char of name) {
    const code = char.charCodeAt(0);
    if (code <= 32 || code === 127) {
      return invalid(`${label} cannot contain spaces or control characters`);
    }
    if (INVALID_REF_CHARS.has(char)) {
      return invalid(`${label} cannot contain ${char}`);
    }
  }

  for (const component of name.split('/')) {
    if (component.startsWith('.')) {
      return invalid(`${label} components cannot start with .`);
    }
    if (component.endsWith('.lock')) {
      return invalid(`${label} components cannot end with .lock`);
    }
  }

  return { valid: true };
}

export function validateGitTagName(rawName: string): GitRefNameValidation {
  return validateGitRefName(rawName, 'Tag name');
}

export function validateGitBranchName(rawName: string): GitRefNameValidation {
  const result = validateGitRefName(rawName, 'Branch name');
  if (!result.valid) return result;
  // `git branch HEAD` is refused by git itself; a stray refs/heads/HEAD makes
  // every subsequent ref lookup ambiguous.
  if (rawName.trim() === 'HEAD') return invalid('Branch name cannot be HEAD');
  return result;
}

/** Remote names are embedded in refspecs (refs/remotes/<name>/…), so the same refname rules apply. */
export function validateGitRemoteName(rawName: string): GitRefNameValidation {
  return validateGitRefName(rawName, 'Remote name');
}

function invalid(message: string): GitRefNameValidation {
  return { valid: false, message };
}

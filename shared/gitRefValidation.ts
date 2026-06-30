export interface GitRefNameValidation {
  valid: boolean;
  message?: string;
}

const INVALID_REF_CHARS = new Set(['~', '^', ':', '?', '*', '[', '\\']);

export function validateGitTagName(rawName: string): GitRefNameValidation {
  const name = rawName.trim();

  if (!name) return invalid('Tag name is required');
  if (name.startsWith('-')) return invalid('Tag name cannot start with -');
  if (name === '@') return invalid('Tag name cannot be @');
  if (name.startsWith('/') || name.endsWith('/') || name.includes('//')) {
    return invalid('Tag name cannot start, end, or contain empty slash segments');
  }
  if (name.endsWith('.')) return invalid('Tag name cannot end with .');
  if (name.includes('..')) return invalid('Tag name cannot contain ..');
  if (name.includes('@{')) return invalid('Tag name cannot contain @{');

  for (const char of name) {
    const code = char.charCodeAt(0);
    if (code <= 32 || code === 127) {
      return invalid('Tag name cannot contain spaces or control characters');
    }
    if (INVALID_REF_CHARS.has(char)) {
      return invalid(`Tag name cannot contain ${char}`);
    }
  }

  for (const component of name.split('/')) {
    if (component.startsWith('.')) {
      return invalid('Tag name components cannot start with .');
    }
    if (component.endsWith('.lock')) {
      return invalid('Tag name components cannot end with .lock');
    }
  }

  return { valid: true };
}

function invalid(message: string): GitRefNameValidation {
  return { valid: false, message };
}

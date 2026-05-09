import type { SlotValue } from '@shared/types';

/**
 * Structural equality for two `SlotValue`s — used by FR-021 ("A == B disable")
 * and the recently-used dedup logic. Hash equality is case-insensitive (git is
 * hex-case-insensitive); expression equality compares trimmed text.
 *
 * 042-compare-refs.
 */
export function slotsEqual(a: SlotValue | null, b: SlotValue | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case 'workingTree':
    case 'head':
    case 'emptyTree':
      return true;
    case 'branch':
      return a.name === (b as Extract<SlotValue, { kind: 'branch' }>).name
        && (a.remote ?? null) === ((b as Extract<SlotValue, { kind: 'branch' }>).remote ?? null);
    case 'tag':
      return a.name === (b as Extract<SlotValue, { kind: 'tag' }>).name;
    case 'commit':
      return a.hash.toLowerCase() === (b as Extract<SlotValue, { kind: 'commit' }>).hash.toLowerCase();
    case 'expression':
      return a.text.trim() === (b as Extract<SlotValue, { kind: 'expression' }>).text.trim();
  }
}

/** Human-readable label for a slot value (used by chips, recents, error messages). */
export function slotLabel(value: SlotValue): string {
  switch (value.kind) {
    case 'workingTree': return 'Working Tree';
    case 'head': return 'HEAD';
    case 'emptyTree': return 'Empty Tree';
    case 'branch': return value.remote ? `${value.remote}/${value.name}` : value.name;
    case 'tag': return value.name;
    case 'commit': return value.hash.slice(0, 7);
    case 'expression': return value.text;
  }
}

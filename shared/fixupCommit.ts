/**
 * `git commit --fixup` / `--squash` argument building, shared by the backend
 * that runs the command and the dialog that previews it, so the two can never
 * describe different commands.
 */

export type FixupCommitKind = 'fixup' | 'squash' | 'amend' | 'reword';

export interface FixupCommitArgsOptions {
  kind: FixupCommitKind;
  /** Always the full hash — never a subject or another identifier. */
  targetHash: string;
  /** `-a`. Ignored for `reword`, which git refuses to combine with `-a`. */
  includeAllTracked: boolean;
  /** Squash only: the `-m` text. amend/reword take their message through git's editor instead. */
  message?: string;
}

/**
 * amend and reword refuse `-m` and `-F`; git takes their message only through
 * the editor, which the backend scripts.
 */
export function fixupKindUsesEditorMessage(kind: FixupCommitKind): boolean {
  return kind === 'amend' || kind === 'reword';
}

/** Whether git accepts `-a` for this kind. `--fixup=reword:` refuses it and ignores the index. */
export function fixupKindAcceptsAllTracked(kind: FixupCommitKind): boolean {
  return kind !== 'reword';
}

export function buildFixupCommitArgs(options: FixupCommitArgsOptions): string[] {
  const { kind, targetHash, includeAllTracked, message } = options;
  const args = ['commit'];
  if (includeAllTracked && fixupKindAcceptsAllTracked(kind)) args.push('-a');

  switch (kind) {
    case 'fixup':
      args.push(`--fixup=${targetHash}`);
      break;
    case 'squash':
      args.push(`--squash=${targetHash}`);
      if (message !== undefined) args.push('-m', message);
      break;
    case 'amend':
      args.push(`--fixup=amend:${targetHash}`);
      break;
    case 'reword':
      args.push(`--fixup=reword:${targetHash}`);
      break;
  }
  return args;
}

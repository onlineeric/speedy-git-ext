import { useMemo } from 'react';
import type { RebaseRangeCommit } from '@shared/types';
import type { AutosquashAnalysis } from '../utils/autosquash';
import { dialogWarningClassName } from './dialogStyles';

interface AutosquashWarningsProps {
  /** The commits the analysis ran over, to name unmatched commits by subject. */
  entries: readonly RebaseRangeCommit[];
  analysis: AutosquashAnalysis;
}

/** The two things autosquash can get wrong, stated the same way in both rebase dialogs. */
export function AutosquashWarnings({ entries, analysis }: AutosquashWarningsProps) {
  const subjectByHash = useMemo(() => new Map(entries.map((entry) => [entry.hash, entry.subject])), [entries]);
  return (
    <>
      {analysis.unmatched.map((hash) => (
        <p key={`unmatched:${hash}`} className={dialogWarningClassName}>
          <span className="font-mono">{subjectByHash.get(hash) ?? hash}</span> won&apos;t be applied: its target is
          not among the rebased commits. Rebase from an earlier commit to include it.
        </p>
      ))}
      {analysis.ambiguousSubjects.map((subject) => (
        <p key={`ambiguous:${subject}`} className={dialogWarningClassName}>
          More than one commit matches <span className="font-mono">{subject}</span>. Autosquash matches by subject
          and may pick the wrong one.
        </p>
      ))}
    </>
  );
}

import type { CommitPhase } from '../hooks/useCommitHookWait';
import { buttonSecondaryClassName, dialogNoteClassName } from './dialogStyles';

/** Names the wait once it has gone on long enough to be the repository's hooks. */
export function CommitHookWaitNotice({ phase }: { phase: CommitPhase }) {
  if (phase !== 'waitingOnHooks') return null;
  return (
    <p className={dialogNoteClassName}>
      Waiting on this repository&apos;s commit hooks. They can take a while; cancelling
      stops the wait, not the hooks themselves.
    </p>
  );
}

interface CommitCancelButtonProps {
  phase: CommitPhase;
  /** Ends our wait on the running commit; the hook process keeps going. */
  onCancelWait: () => void;
  /** Closes the dialog; disabled while the commit runs. */
  onCancel: () => void;
}

/** "Cancel" while idle, "Cancel wait" once the hooks are named, disabled in between. */
export function CommitCancelButton({ phase, onCancelWait, onCancel }: CommitCancelButtonProps) {
  if (phase === 'waitingOnHooks') {
    return (
      <button type="button" onClick={onCancelWait} className={buttonSecondaryClassName}>
        Cancel wait
      </button>
    );
  }
  return (
    <button type="button" onClick={onCancel} disabled={phase !== 'idle'} className={buttonSecondaryClassName}>
      Cancel
    </button>
  );
}

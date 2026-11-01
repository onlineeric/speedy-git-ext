import { DEFAULT_USER_SETTINGS, MIN_GIT_TIMEOUT_SECONDS } from '@shared/types';
import { useSettingDraft } from '../hooks/useSettingDraft';
import { useRegisterSettingDraft } from '../hooks/useSettingDraftRegistry';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import {
  describeGitTimeoutDraft,
  gitTimeoutDraftToSave,
  isGitTimeoutDraftChanged,
  toGitTimeoutDraft,
} from '../utils/gitTimeoutDraft';
import { dialogHintClassName, dialogSectionLabelClassName, settingNumberInputClassName } from './dialogStyles';

/**
 * The Git tab of the Settings dialog: how Speedy Git runs git itself.
 * Edits `speedyGit.*` settings, so VS Code's Settings page shows the same values.
 */
export function GitSettingsSection() {
  return (
    <div className="space-y-4">
      <section>
        <div className={dialogSectionLabelClassName}>Git commands</div>
        <GitTimeoutField />
      </section>
    </div>
  );
}

/** `speedyGit.git.timeoutSeconds` — a text-edited setting, so it holds a draft until Save. */
function GitTimeoutField() {
  const saved = useGraphStore((state) => state.userSettings.gitTimeoutSeconds);
  const { draft, setDraft, isDirty, discard } = useSettingDraft(saved, toGitTimeoutDraft, isGitTimeoutDraftChanged);
  const note = describeGitTimeoutDraft(draft);

  useRegisterSettingDraft({
    id: 'gitTimeoutSeconds',
    label: 'Git command timeout',
    isDirty,
    save: () => rpcClient.setGitTimeoutSeconds(gitTimeoutDraftToSave(draft)),
    discard,
  });

  return (
    <div className="min-w-0">
      <label className="flex items-center justify-between gap-2 text-sm">
        <span>Git command timeout</span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--vscode-descriptionForeground)]">
          <input
            type="number"
            min={0}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={String(DEFAULT_USER_SETTINGS.gitTimeoutSeconds)}
            className={`w-20 ${settingNumberInputClassName}`}
            aria-label="Git command timeout in seconds"
            aria-describedby="git-timeout-hint"
          />
          <span>seconds</span>
        </span>
      </label>
      <p id="git-timeout-hint" className={`${dialogHintClassName} mt-1`}>
        How long any git command may run before Speedy Git stops it — loading the graph, push, pull, fetch, commit
        hooks and everything else. Default {DEFAULT_USER_SETTINGS.gitTimeoutSeconds}, minimum{' '}
        {MIN_GIT_TIMEOUT_SECONDS}. Enter <strong>0 for no timeout</strong>: a command that stalls then keeps running
        until you reload the window.
      </p>
      {/* Always rendered, so the dialog does not change height as the note comes and goes. */}
      <p className={`${dialogHintClassName} mt-1 min-h-[1rem]`} role="status">
        {note}
      </p>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { AUTOLINK_NUMBER_PLACEHOLDER, type CustomAutolinkErrors } from '@shared/autolinks';
import { useSettingDraft } from '../hooks/useSettingDraft';
import { useRegisterSettingDraft } from '../hooks/useSettingDraftRegistry';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import {
  createDraftRow,
  isDraftChanged,
  prepareCustomAutolinksSave,
  toDraftRows,
  type CustomAutolinkDraftRow,
} from '../utils/customAutolinkDraft';
import type { SettingSaveOutcome } from '../utils/settingDrafts';
import { resolveRemoteAutolinkTarget } from '../utils/remoteAutolinkTarget';
import { trackUiInteraction } from '../utils/telemetry';
import { buttonSecondaryClassName, dialogSectionLabelClassName } from './dialogStyles';
import { FieldError } from './FieldError';
import { CloseIcon } from './icons';

const inputClassName =
  'w-full rounded border bg-[var(--vscode-input-background)] px-1.5 py-1 text-xs text-[var(--vscode-input-foreground)] focus:border-[var(--vscode-focusBorder)] focus:outline-none';
const validBorderClassName = 'border-[var(--vscode-input-border)]';
const invalidBorderClassName = 'border-[var(--vscode-inputValidation-errorBorder)]';
const NO_ERRORS: ReadonlyMap<number, CustomAutolinkErrors> = new Map();

const hintClassName = 'text-[11px] leading-4 text-[var(--vscode-descriptionForeground)]';

/**
 * The AutoLinks tab of the Settings dialog: the GitHub/GitLab switch, then the
 * custom autolinks editor as its own section below. Both are VS Code settings
 * (`speedyGit.autolinks.*`); this edits them, so the two stay one setting.
 */
export function AutolinkSettingsSection() {
  return (
    <div className="space-y-4">
      <section>
        <div className={dialogSectionLabelClassName}>Autolinks</div>
        <p className="mb-3 text-xs text-[var(--vscode-descriptionForeground)]">
          Turn references in commit messages into links, in the commit list, the details panel and the tooltip.
        </p>
        <RemoteAutolinksToggle />
      </section>
      <section className="border-t border-[var(--vscode-panel-border)] pt-4">
        <div className={dialogSectionLabelClassName}>Custom autolinks</div>
        <CustomAutolinksEditor />
      </section>
    </div>
  );
}

function RemoteAutolinksToggle() {
  const enabled = useGraphStore((state) => state.userSettings.remoteAutolinksEnabled);
  const remotes = useGraphStore((state) => state.remotes);
  const target = useMemo(() => resolveRemoteAutolinkTarget(remotes), [remotes]);

  const handleChange = (next: boolean) => {
    trackUiInteraction('autolinkSettings', next ? 'remoteAutolinksEnable' : 'remoteAutolinksDisable');
    rpcClient.setRemoteAutolinksEnabled(next);
  };

  return (
    <div className="min-w-0">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => handleChange(event.target.checked)}
          className="h-3.5 w-3.5"
        />
        <span>GitHub and GitLab references</span>
      </label>
      <p className={`${hintClassName} mt-1`}>
        <code>#123</code> and <code>GH-123</code> on GitHub, <code>#123</code> and <code>!123</code> on GitLab,
        and <code>owner/repo#123</code> on either link to the repository’s issue or pull request.
      </p>
      <p className={`${hintClassName} mt-1`}>
        {target
          ? <>This repository: <span className="text-[var(--vscode-foreground)]">{new URL(target.webBaseUrl).host}/{target.repoPath}</span></>
          : 'Not linked here: the only remote, or else upstream, or else origin, must be on github.com or gitlab.com, so a link never points to the wrong place.'}
      </p>
    </div>
  );
}

function CustomAutolinksEditor() {
  const saved = useGraphStore((state) => state.userSettings.customAutolinks);
  const { draft: rows, setDraft: setRows, isDirty, discard } = useSettingDraft(saved, toDraftRows, isDraftChanged);
  // Errors are held with the saved list they were found against. A new saved
  // list replaces the draft or is kept out by it; either way those errors
  // described a list that is gone, so they stop showing.
  const [errorState, setErrorState] = useState(() => ({ saved, errors: NO_ERRORS }));
  const errors = errorState.saved === saved ? errorState.errors : NO_ERRORS;
  const setErrors = (update: (current: ReadonlyMap<number, CustomAutolinkErrors>) => ReadonlyMap<number, CustomAutolinkErrors>) =>
    setErrorState((current) => ({ saved, errors: update(current.saved === saved ? current.errors : NO_ERRORS) }));

  const updateRow = (id: number, field: 'prefix' | 'url', value: string) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, entry: { ...row.entry, [field]: value } } : row)));
    // The message described the old text; the next Save re-checks it.
    setErrors((current) => {
      const rowErrors = current.get(id);
      if (!rowErrors?.[field]) return current;
      const next = new Map(current);
      next.set(id, { ...rowErrors, [field]: undefined });
      return next;
    });
  };

  const removeRow = (id: number) => {
    setRows((current) => current.filter((row) => row.id !== id));
  };

  const save = async (): Promise<SettingSaveOutcome> => {
    const result = prepareCustomAutolinksSave(rows);
    if (!result.ok) {
      setErrors(() => result.errors);
      return { ok: false, reason: 'invalid' };
    }
    setErrors(() => NO_ERRORS);
    trackUiInteraction('autolinkSettings', 'customAutolinksSave');
    const reply = await rpcClient.setCustomAutolinks(result.autolinks);
    return reply.ok ? { ok: true } : { ok: false, reason: 'failed', message: reply.message };
  };

  useRegisterSettingDraft({
    id: 'customAutolinks',
    label: 'Custom autolinks',
    isDirty,
    save,
    discard: () => {
      discard();
      setErrors(() => NO_ERRORS);
    },
  });

  return (
    <div className="min-w-0">
      <p className={`${hintClassName} mb-2`}>
        For trackers such as Jira. Prefix <code>ABCD-</code> with URL{' '}
        <code>https://jira.example.com/browse/ABCD-{AUTOLINK_NUMBER_PLACEHOLDER}</code> links{' '}
        <code>ABCD-123</code>; <code>{AUTOLINK_NUMBER_PLACEHOLDER}</code> is where the number goes.
      </p>

      {rows.length > 0 && (
        <div className="mb-2 space-y-2">
          {rows.map((row) => (
            <CustomAutolinkRow
              key={row.id}
              row={row}
              errors={errors.get(row.id)}
              onChange={updateRow}
              onRemove={removeRow}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRows((current) => [...current, createDraftRow()])}
          className={`${buttonSecondaryClassName} text-xs`}
        >
          Add autolink
        </button>
      </div>
    </div>
  );
}

function CustomAutolinkRow({
  row,
  errors,
  onChange,
  onRemove,
}: {
  row: CustomAutolinkDraftRow;
  errors: CustomAutolinkErrors | undefined;
  onChange: (id: number, field: 'prefix' | 'url', value: string) => void;
  onRemove: (id: number) => void;
}) {
  const prefixErrorId = `autolink-${row.id}-prefix-error`;
  const urlErrorId = `autolink-${row.id}-url-error`;

  return (
    <div className="flex items-start gap-1.5">
      <div className="w-24 shrink-0">
        <input
          type="text"
          value={row.entry.prefix}
          onChange={(event) => onChange(row.id, 'prefix', event.target.value)}
          placeholder="ABCD-"
          aria-label="Autolink prefix"
          aria-invalid={errors?.prefix ? true : undefined}
          aria-describedby={errors?.prefix ? prefixErrorId : undefined}
          className={`${inputClassName} ${errors?.prefix ? invalidBorderClassName : validBorderClassName}`}
        />
        <FieldError id={prefixErrorId} message={errors?.prefix} />
      </div>
      <div className="min-w-0 flex-1">
        <input
          type="text"
          value={row.entry.url}
          onChange={(event) => onChange(row.id, 'url', event.target.value)}
          placeholder={`https://jira.example.com/browse/ABCD-${AUTOLINK_NUMBER_PLACEHOLDER}`}
          aria-label="Autolink URL"
          aria-invalid={errors?.url ? true : undefined}
          aria-describedby={errors?.url ? urlErrorId : undefined}
          className={`${inputClassName} ${errors?.url ? invalidBorderClassName : validBorderClassName}`}
        />
        <FieldError id={urlErrorId} message={errors?.url} />
      </div>
      <button
        type="button"
        onClick={() => onRemove(row.id)}
        className={`${buttonSecondaryClassName} shrink-0`}
        title="Remove this autolink"
        aria-label="Remove this autolink"
      >
        <CloseIcon className="h-3 w-3" />
      </button>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { AUTOLINK_NUMBER_PLACEHOLDER, type CustomAutolink, type CustomAutolinkErrors } from '@shared/autolinks';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import {
  createDraftRow,
  isDraftChanged,
  prepareCustomAutolinksSave,
  toDraftRows,
  type CustomAutolinkDraftRow,
} from '../utils/customAutolinkDraft';
import { resolveRemoteAutolinkTarget } from '../utils/remoteAutolinkTarget';
import { trackUiInteraction } from '../utils/telemetry';
import { buttonSecondaryClassName, dialogSectionLabelClassName } from './dialogStyles';
import { FieldError } from './FieldError';
import { CloseIcon } from './icons';

const inputClassName =
  'w-full rounded border bg-[var(--vscode-input-background)] px-1.5 py-1 text-xs text-[var(--vscode-input-foreground)] focus:border-[var(--vscode-focusBorder)] focus:outline-none';
const validBorderClassName = 'border-[var(--vscode-input-border)]';
const invalidBorderClassName = 'border-[var(--vscode-inputValidation-errorBorder)]';
const hintClassName = 'text-[11px] leading-4 text-[var(--vscode-descriptionForeground)]';

/**
 * Autolinks section of the View settings dialog: the GitHub/GitLab switch and
 * the custom autolinks editor. Both are VS Code settings
 * (`speedyGit.autolinks.*`); this edits them, so the two stay one setting.
 */
export function AutolinkSettingsSection() {
  return (
    <section>
      <div className={dialogSectionLabelClassName}>Autolinks</div>
      <p className="mb-3 text-xs text-[var(--vscode-descriptionForeground)]">
        Turn references in commit messages into links, in the commit list, the details panel and the tooltip.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        <RemoteAutolinksToggle />
        <CustomAutolinksEditor />
      </div>
    </section>
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
          : 'Not linked here: no remote on github.com or gitlab.com was found, so a link might point to the wrong place.'}
      </p>
    </div>
  );
}

function CustomAutolinksEditor() {
  const saved = useGraphStore((state) => state.userSettings.customAutolinks);
  const [rows, setRows] = useState<CustomAutolinkDraftRow[]>(() => toDraftRows(saved));
  const [errors, setErrors] = useState<Map<number, CustomAutolinkErrors>>(() => new Map());
  const lastSaved = useRef<readonly CustomAutolink[]>(saved);

  // The list can also change from VS Code's settings, or echo back after Save.
  // Follow it unless the user has edits here that it would overwrite.
  useEffect(() => {
    const previous = lastSaved.current;
    lastSaved.current = saved;
    if (previous === saved) return;
    setRows((current) =>
      isDraftChanged(current, previous) && isDraftChanged(current, saved) ? current : toDraftRows(saved),
    );
    setErrors(new Map());
  }, [saved]);

  const changed = isDraftChanged(rows, saved);

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

  const handleSave = () => {
    const result = prepareCustomAutolinksSave(rows);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors(new Map());
    trackUiInteraction('autolinkSettings', 'customAutolinksSave');
    rpcClient.setCustomAutolinks(result.autolinks);
  };

  return (
    <div className="min-w-0">
      <div className="text-sm">Custom autolinks</div>
      <p className={`${hintClassName} mt-1 mb-2`}>
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
        <button
          type="button"
          onClick={handleSave}
          disabled={!changed}
          className={`${buttonSecondaryClassName} text-xs`}
          title={changed ? 'Save these autolinks to your VS Code settings' : 'No changes to save'}
        >
          Save autolinks
        </button>
        {changed && <span className={hintClassName}>Unsaved changes</span>}
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

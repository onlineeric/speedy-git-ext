import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { ConfirmDialog } from './ConfirmDialog';

interface RemoteManagementDialogProps {
  open: boolean;
  onClose: () => void;
}

type Mode = 'view' | 'add' | 'edit';

const inputClass =
  'w-full px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:border-[var(--vscode-focusBorder)]';

const buttonPrimaryClass =
  'px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]';

const buttonSecondaryClass =
  'px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]';

export function RemoteManagementDialog({ open, onClose }: RemoteManagementDialogProps) {
  const { remotes, branches } = useGraphStore();

  const [mode, setMode] = useState<Mode>('view');
  const [editingRemoteName, setEditingRemoteName] = useState<string | undefined>(undefined);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetName, setDeleteTargetName] = useState<string | undefined>(undefined);

  const [inputName, setInputName] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [urlError, setUrlError] = useState<string | undefined>(undefined);

  const resetForm = () => {
    setInputName('');
    setInputUrl('');
    setNameError(undefined);
    setUrlError(undefined);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setMode('view');
      resetForm();
      setEditingRemoteName(undefined);
      onClose();
    }
  };

  const handleAddClick = () => {
    resetForm();
    setMode('add');
  };

  const handleEditClick = (name: string, currentUrl: string) => {
    resetForm();
    setInputUrl(currentUrl);
    setEditingRemoteName(name);
    setMode('edit');
  };

  const handleRemoveClick = (name: string) => {
    setDeleteTargetName(name);
    setDeleteConfirmOpen(true);
  };

  const handleCancelForm = () => {
    setMode('view');
    resetForm();
    setEditingRemoteName(undefined);
  };

  const validateAdd = (): boolean => {
    let valid = true;
    const trimmedName = inputName.trim();
    const trimmedUrl = inputUrl.trim();

    if (!trimmedName) {
      setNameError('Name is required');
      valid = false;
    } else if (trimmedName.includes(' ')) {
      setNameError('Name cannot contain spaces');
      valid = false;
    } else if (trimmedName.startsWith('-')) {
      setNameError('Name cannot start with -');
      valid = false;
    } else if (remotes.some((r) => r.name === trimmedName)) {
      setNameError('A remote with this name already exists');
      valid = false;
    } else {
      setNameError(undefined);
    }

    if (!trimmedUrl) {
      setUrlError('URL is required');
      valid = false;
    } else {
      setUrlError(undefined);
    }

    return valid;
  };

  const validateEdit = (): boolean => {
    const trimmedUrl = inputUrl.trim();
    if (!trimmedUrl) {
      setUrlError('URL is required');
      return false;
    }
    setUrlError(undefined);
    return true;
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAdd()) return;
    rpcClient.addRemote(inputName.trim(), inputUrl.trim());
    setMode('view');
    resetForm();
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEdit() || !editingRemoteName) return;
    rpcClient.editRemote(editingRemoteName, inputUrl.trim());
    setMode('view');
    resetForm();
    setEditingRemoteName(undefined);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTargetName) return;
    rpcClient.removeRemote(deleteTargetName);
    setDeleteConfirmOpen(false);
    setDeleteTargetName(undefined);
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setDeleteTargetName(undefined);
  };

  const deleteTargetHasTrackingBranches =
    deleteTargetName !== undefined &&
    branches.some((b) => b.remote === deleteTargetName);

  const deleteDescription = deleteTargetHasTrackingBranches
    ? `Local branches tracking '${deleteTargetName}' will lose their upstream. Remove remote '${deleteTargetName}'?`
    : `Are you sure you want to remove remote '${deleteTargetName}'?`;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-lg p-6 rounded-lg shadow-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] z-50">
            <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)] mb-4">
              Manage Remotes
            </Dialog.Title>

            {/* Remote list */}
            {remotes.length === 0 ? (
              <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
                No remotes configured.
              </p>
            ) : (
              <div className="mb-4 border border-[var(--vscode-panel-border)] rounded divide-y divide-[var(--vscode-panel-border)]">
                {remotes.map((remote) => {
                  const isEditing = mode === 'edit' && editingRemoteName === remote.name;
                  return (
                    <div key={remote.name} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--vscode-foreground)] truncate">
                          {remote.name}
                        </span>
                        {!isEditing && mode === 'view' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              className={buttonSecondaryClass}
                              onClick={() => handleEditClick(remote.name, remote.fetchUrl)}
                            >
                              Edit
                            </button>
                            <button
                              className="px-3 py-1.5 text-sm rounded text-[var(--vscode-errorForeground)] bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
                              onClick={() => handleRemoveClick(remote.name)}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>

                      {!isEditing && (
                        <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5 truncate">
                          {remote.fetchUrl}
                        </p>
                      )}

                      {isEditing && (
                        <form onSubmit={handleEditSubmit} className="mt-2 space-y-2">
                          <div>
                            <label className="block text-xs text-[var(--vscode-descriptionForeground)] mb-1">
                              URL
                            </label>
                            <input
                              type="text"
                              value={inputUrl}
                              onChange={(e) => {
                                setInputUrl(e.target.value);
                                setUrlError(undefined);
                              }}
                              autoFocus
                              className={inputClass}
                            />
                            {urlError && (
                              <p className="mt-1 text-xs text-[var(--vscode-errorForeground)]">{urlError}</p>
                            )}
                          </div>
                          <div className="flex justify-end gap-2">
                            <button type="button" className={buttonSecondaryClass} onClick={handleCancelForm}>
                              Cancel
                            </button>
                            <button type="submit" className={buttonPrimaryClass}>
                              Save
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add remote form */}
            {mode === 'add' && (
              <form onSubmit={handleAddSubmit} className="mb-4 border border-[var(--vscode-panel-border)] rounded p-3 space-y-2">
                <p className="text-sm font-medium text-[var(--vscode-foreground)]">Add Remote</p>
                <div>
                  <label className="block text-xs text-[var(--vscode-descriptionForeground)] mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={inputName}
                    onChange={(e) => {
                      setInputName(e.target.value);
                      setNameError(undefined);
                    }}
                    placeholder="origin"
                    autoFocus
                    className={inputClass}
                  />
                  {nameError && (
                    <p className="mt-1 text-xs text-[var(--vscode-errorForeground)]">{nameError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-[var(--vscode-descriptionForeground)] mb-1">
                    URL
                  </label>
                  <input
                    type="text"
                    value={inputUrl}
                    onChange={(e) => {
                      setInputUrl(e.target.value);
                      setUrlError(undefined);
                    }}
                    placeholder="https://github.com/user/repo.git"
                    className={inputClass}
                  />
                  {urlError && (
                    <p className="mt-1 text-xs text-[var(--vscode-errorForeground)]">{urlError}</p>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className={buttonSecondaryClass} onClick={handleCancelForm}>
                    Cancel
                  </button>
                  <button type="submit" className={buttonPrimaryClass}>
                    Add
                  </button>
                </div>
              </form>
            )}

            {/* Footer buttons */}
            <div className="flex items-center justify-between">
              {mode === 'view' && (
                <button className={buttonSecondaryClass} onClick={handleAddClick}>
                  Add Remote...
                </button>
              )}
              {mode !== 'view' && <div />}
              <Dialog.Close className={buttonSecondaryClass}>
                Close
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        title="Remove Remote"
        description={deleteDescription}
        confirmLabel="Remove"
        variant={deleteTargetHasTrackingBranches ? 'warning' : 'danger'}
      />
    </>
  );
}

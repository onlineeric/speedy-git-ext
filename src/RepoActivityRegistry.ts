import * as vscode from 'vscode';
import type { TrackedOperation } from '../shared/telemetry.js';

/**
 * Which working trees currently have a git operation running, and which tab
 * started it.
 *
 * This is a **coarse mirror, not a lock**. Peers are told so they can show a
 * notice; nothing here refuses, queues or serialises anything. Colliding
 * operations remain git's to refuse — `index.lock` and the existing
 * `OperationGuard` already report them clearly, and adding a second gate would
 * be a lock by another name.
 *
 * The key is the per-working-tree git dir, which is precisely "the same
 * checkout": a linked worktree has its own git dir, so an operation there
 * correctly does not mark a tab on the main repo busy, while a second tab on
 * the same checkout does.
 */
export class RepoActivityRegistry implements vscode.Disposable {
  private readonly owners = new Map<string, string[]>();
  private readonly _onDidChange = new vscode.EventEmitter<{ workingTreeKey: string }>();
  readonly onDidChange = this._onDidChange.event;

  /**
   * Record that `tabId` started `operation` on this working tree. Dispose the
   * returned token when the operation finishes — callers do that in a `finally`,
   * so a throwing handler and a closed tab both release.
   */
  begin(workingTreeKey: string, tabId: string, operation: TrackedOperation): vscode.Disposable {
    if (!workingTreeKey) return new vscode.Disposable(() => {});
    void operation;

    const owners = this.owners.get(workingTreeKey) ?? [];
    owners.push(tabId);
    this.owners.set(workingTreeKey, owners);
    this._onDidChange.fire({ workingTreeKey });

    let released = false;
    return new vscode.Disposable(() => {
      if (released) return;
      released = true;
      this.release(workingTreeKey, tabId);
    });
  }

  /** Whether anyone *other than* `exceptTabId` is running an operation here. */
  isBusy(workingTreeKey: string, exceptTabId: string): boolean {
    const owners = this.owners.get(workingTreeKey);
    if (!owners) return false;
    return owners.some((owner) => owner !== exceptTabId);
  }

  private release(workingTreeKey: string, tabId: string): void {
    const owners = this.owners.get(workingTreeKey);
    if (!owners) return;
    // Nested/concurrent operations from one tab are counted, not booleaned, so
    // remove exactly one entry rather than every entry for this tab.
    const index = owners.indexOf(tabId);
    if (index === -1) return;
    owners.splice(index, 1);
    if (owners.length === 0) this.owners.delete(workingTreeKey);
    this._onDidChange.fire({ workingTreeKey });
  }

  dispose(): void {
    this.owners.clear();
    this._onDidChange.dispose();
  }
}

import * as vscode from 'vscode';
import type { ResponseMessage } from '../shared/messages.js';
import { GraphTab } from './webview/GraphTab.js';
import type { TabSnapshot } from './utils/graphTabRouting.js';

/**
 * The set of open graph tabs and their most-recently-active order.
 *
 * The order is a monotonic counter read at snapshot time rather than a list
 * that has to be repaired on close — so there is never a tie to break, and
 * removing a tab needs no bookkeeping beyond dropping the entry.
 */
export class GraphTabRegistry implements vscode.Disposable {
  private readonly tabs = new Map<string, GraphTab>();
  private readonly activeSeq = new Map<string, number>();
  private nextSeq = 1;

  /** Creating a tab makes it the MRU target immediately, before it is focused. */
  add(tab: GraphTab): void {
    this.tabs.set(tab.id, tab);
    this.activeSeq.set(tab.id, this.nextSeq++);
  }

  get(id: string): GraphTab | undefined {
    return this.tabs.get(id);
  }

  remove(id: string): void {
    this.tabs.delete(id);
    this.activeSeq.delete(id);
  }

  /**
   * Fed from the panel's `active` state — focused, not merely visible. A tab
   * visible in a split group is not the return target.
   */
  markActivated(id: string): void {
    if (!this.tabs.has(id)) return;
    this.activeSeq.set(id, this.nextSeq++);
  }

  count(): number {
    return this.tabs.size;
  }

  all(): GraphTab[] {
    return [...this.tabs.values()];
  }

  snapshots(): TabSnapshot[] {
    return this.all().map((tab) => tab.snapshot(this.activeSeq.get(tab.id) ?? 0));
  }

  broadcast(message: ResponseMessage): void {
    for (const tab of this.tabs.values()) tab.postMessage(message);
  }

  reloadAll(): void {
    for (const tab of this.tabs.values()) {
      void tab.reload();
    }
  }

  dispose(): void {
    for (const tab of this.tabs.values()) tab.dispose();
    this.tabs.clear();
    this.activeSeq.clear();
  }
}

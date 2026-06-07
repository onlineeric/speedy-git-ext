import * as vscode from 'vscode';
import type { GraphFilters } from '../../shared/types.js';
import type { RepoDataLoader } from './RepoDataLoader.js';

export class RefreshCoordinator {
  private isRefreshing = false;
  private pendingRefresh = false;
  private deferredRefresh = false;
  private isPanelVisible = false;

  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly dataLoader: RepoDataLoader,
  ) {}

  setPanelVisible(visible: boolean): void {
    this.isPanelVisible = visible;
    if (this.isPanelVisible && this.deferredRefresh) {
      this.deferredRefresh = false;
      void this.triggerAutoRefresh();
    }
  }

  async reload(filters?: Partial<GraphFilters>): Promise<void> {
    await this.runRefresh(() => this.dataLoader.sendInitialData(filters));
  }

  async triggerAutoRefresh(): Promise<void> {
    if (!this.isPanelVisible) {
      this.log.info('Auto-refresh deferred (panel hidden)');
      this.deferredRefresh = true;
      return;
    }
    if (this.isRefreshing) {
      this.log.info('Auto-refresh queued (already refreshing)');
      this.pendingRefresh = true;
      return;
    }
    this.log.info('Auto-refresh triggered');
    await this.runRefresh(() => this.dataLoader.sendInitialData(undefined, true));
  }

  private async runRefresh(run: () => Promise<void>): Promise<void> {
    this.isRefreshing = true;
    try {
      await run();
    } finally {
      this.isRefreshing = false;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.triggerAutoRefresh();
      }
    }
  }
}

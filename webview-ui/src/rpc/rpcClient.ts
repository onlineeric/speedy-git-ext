import type { RequestMessage, ResponseMessage } from '@shared/messages';
import { useGraphStore } from '../stores/graphStore';

declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

class RpcClient {
  private vscode: ReturnType<typeof acquireVsCodeApi> | undefined;
  private initialized = false;

  private messageHandler = (event: MessageEvent) => {
    const message = event.data as ResponseMessage;
    this.handleMessage(message);
  };

  initialize() {
    // Prevent duplicate initialization
    if (this.initialized) return;
    this.initialized = true;

    if (typeof acquireVsCodeApi !== 'undefined') {
      this.vscode = acquireVsCodeApi();
    }

    window.addEventListener('message', this.messageHandler);
  }

  dispose() {
    window.removeEventListener('message', this.messageHandler);
    this.initialized = false;
  }

  private handleMessage(message: ResponseMessage) {
    const store = useGraphStore.getState();

    switch (message.type) {
      case 'commits':
        store.setCommits(message.payload.commits);
        break;
      case 'branches':
        store.setBranches(message.payload.branches);
        break;
      case 'loading':
        store.setLoading(message.payload.loading);
        break;
      case 'error':
        store.setError(message.payload.error.message);
        break;
    }
  }

  send(message: RequestMessage) {
    this.vscode?.postMessage(message);
  }

  getCommits(filters?: Partial<{ branch?: string; author?: string; maxCount: number }>) {
    this.send({ type: 'getCommits', payload: { filters } });
  }

  getBranches() {
    this.send({ type: 'getBranches', payload: {} });
  }

  refresh() {
    this.send({ type: 'refresh', payload: {} });
  }
}

export const rpcClient = new RpcClient();

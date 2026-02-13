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
      case 'commitDetails':
        store.setCommitDetails(message.payload.details);
        break;
      case 'loading':
        store.setLoading(message.payload.loading);
        break;
      case 'error':
        store.setError(message.payload.error.message);
        break;
      case 'success':
        store.setSuccessMessage(message.payload.message);
        break;
      case 'remotes':
        store.setRemotes(message.payload.remotes);
        break;
      case 'stashes':
        store.setStashes(message.payload.stashes);
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

  getCommitDetails(hash: string) {
    this.send({ type: 'getCommitDetails', payload: { hash } });
  }

  checkoutBranch(name: string, remote?: string) {
    this.send({ type: 'checkoutBranch', payload: { name, remote } });
  }

  fetch(remote?: string, prune?: boolean, filters?: Partial<{ branch?: string; author?: string; maxCount: number }>) {
    this.send({ type: 'fetch', payload: { remote, prune, filters } });
  }

  copyToClipboard(text: string) {
    this.send({ type: 'copyToClipboard', payload: { text } });
  }

  openDiff(hash: string, filePath: string, parentHash?: string) {
    this.send({ type: 'openDiff', payload: { hash, filePath, parentHash } });
  }

  openFile(hash: string, filePath: string) {
    this.send({ type: 'openFile', payload: { hash, filePath } });
  }

  refresh(filters?: Partial<{ branch?: string; author?: string; maxCount: number }>) {
    this.send({ type: 'refresh', payload: { filters } });
  }

  // Branch ops
  createBranch(name: string, startPoint?: string) {
    this.send({ type: 'createBranch', payload: { name, startPoint } });
  }

  renameBranch(oldName: string, newName: string) {
    this.send({ type: 'renameBranch', payload: { oldName, newName } });
  }

  deleteBranch(name: string, force?: boolean) {
    this.send({ type: 'deleteBranch', payload: { name, force } });
  }

  deleteRemoteBranch(remote: string, name: string) {
    this.send({ type: 'deleteRemoteBranch', payload: { remote, name } });
  }

  mergeBranch(branch: string, noFastForward?: boolean, squash?: boolean) {
    this.send({ type: 'mergeBranch', payload: { branch, noFastForward, squash } });
  }

  // Remote ops
  push(remote?: string, branch?: string, setUpstream?: boolean, force?: boolean) {
    this.send({ type: 'push', payload: { remote, branch, setUpstream, force } });
  }

  pull(remote?: string, branch?: string, rebase?: boolean) {
    this.send({ type: 'pull', payload: { remote, branch, rebase } });
  }

  getRemotes() {
    this.send({ type: 'getRemotes', payload: {} });
  }

  addRemote(name: string, url: string) {
    this.send({ type: 'addRemote', payload: { name, url } });
  }

  removeRemote(name: string) {
    this.send({ type: 'removeRemote', payload: { name } });
  }

  editRemote(name: string, newUrl: string) {
    this.send({ type: 'editRemote', payload: { name, newUrl } });
  }

  // Tag ops
  createTag(name: string, hash: string, message?: string) {
    this.send({ type: 'createTag', payload: { name, hash, message } });
  }

  deleteTag(name: string) {
    this.send({ type: 'deleteTag', payload: { name } });
  }

  pushTag(name: string, remote?: string) {
    this.send({ type: 'pushTag', payload: { name, remote } });
  }

  // Stash ops
  getStashes() {
    this.send({ type: 'getStashes', payload: {} });
  }

  applyStash(index: number) {
    this.send({ type: 'applyStash', payload: { index } });
  }

  popStash(index: number) {
    this.send({ type: 'popStash', payload: { index } });
  }

  dropStash(index: number) {
    this.send({ type: 'dropStash', payload: { index } });
  }
}

export const rpcClient = new RpcClient();

import * as vscode from 'vscode';
import { buildWhatsNewPayload, isExactVersion, shouldRecordWhatsNew, type WhatsNewPayload } from '../../shared/whatsNew.js';

/**
 * Version of the "What's new" *entry* the user last dismissed — which, for a
 * patch release showing its series' notes, is older than the running version. Kept in
 * `globalState` rather than workspace state: the dialog is about the extension,
 * not about a repository, so opening a second folder must not show it again.
 */
const LAST_SHOWN_KEY = 'speedyGit.whatsNewVersion';

/**
 * Owns the one fact the webview cannot work out for itself: which entry the
 * user last dismissed.
 *
 * The webview owns the content, so this store deliberately knows nothing about
 * what the dialog says — including which versions have entries. It hands over
 * the stored entry version; the webview resolves the running version to its
 * entry and stays silent if that entry was already seen or there is none.
 */
export class WhatsNewStore {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  /** The running extension's version, or an empty string if the manifest is unreadable. */
  get currentVersion(): string {
    const version: unknown = this.context.extension?.packageJSON?.version;
    return typeof version === 'string' ? version : '';
  }

  private get isDevelopment(): boolean {
    return this.context.extensionMode === vscode.ExtensionMode.Development;
  }

  /** What to offer the webview; it decides whether there is anything unseen to show. */
  payload(): WhatsNewPayload {
    return buildWhatsNewPayload({
      currentVersion: this.currentVersion,
      storedVersion: this.context.globalState.get<string>(LAST_SHOWN_KEY),
      isDevelopment: this.isDevelopment,
    });
  }

  /**
   * Record that the entry for `entryVersion` has been seen. Called when the user closes
   * it — never when it is merely sent — so a webview that reloads before the
   * user got to read it shows the dialog again.
   *
   * Debug launches deliberately record nothing; see `shouldRecordWhatsNew`.
   */
  async markShown(entryVersion: string): Promise<void> {
    if (!shouldRecordWhatsNew(this.isDevelopment)) {
      this.log.info("What's new dialog dismissed in development — not recorded");
      return;
    }

    if (!isExactVersion(entryVersion)) {
      this.log.warn("What's new dismissal ignored — not an exact version");
      return;
    }

    await this.context.globalState.update(LAST_SHOWN_KEY, entryVersion);
    this.log.info(`What's new dialog dismissed for v${entryVersion}`);
  }
}

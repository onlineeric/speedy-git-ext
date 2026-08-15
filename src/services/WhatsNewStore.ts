import * as vscode from 'vscode';
import { decideWhatsNew, shouldRecordWhatsNew, type WhatsNewDecision } from '../../shared/whatsNew.js';

/**
 * Version whose "What's new" dialog the user last dismissed. Kept in
 * `globalState` rather than workspace state: the dialog is about the extension,
 * not about a repository, so opening a second folder must not show it again.
 */
const LAST_SHOWN_KEY = 'speedyGit.whatsNewVersion';

/**
 * Owns the one fact the webview cannot work out for itself: whether this run is
 * the first on this version.
 *
 * The webview already knows the version (injected at build time) and owns the
 * content, so this store deliberately knows nothing about what the dialog says —
 * including whether any content exists for a version. It reports "this run
 * qualifies"; the webview stays silent if it has nothing to show.
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

  decide(): WhatsNewDecision {
    return decideWhatsNew({
      currentVersion: this.currentVersion,
      lastShownVersion: this.context.globalState.get<string>(LAST_SHOWN_KEY),
      isDevelopment: this.isDevelopment,
    });
  }

  /**
   * Record that this version's dialog has been seen. Called when the user closes
   * it — never when it is merely sent — so a webview that reloads before the
   * user got to read it shows the dialog again.
   *
   * Debug launches deliberately record nothing; see `shouldRecordWhatsNew`.
   */
  async markShown(): Promise<void> {
    if (!shouldRecordWhatsNew(this.isDevelopment)) {
      this.log.info("What's new dialog dismissed in development — not recorded");
      return;
    }

    const version = this.currentVersion;
    if (!version) return;

    await this.context.globalState.update(LAST_SHOWN_KEY, version);
    this.log.info(`What's new dialog dismissed for v${version}`);
  }
}

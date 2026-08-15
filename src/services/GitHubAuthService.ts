import * as vscode from 'vscode';

const OPT_IN_KEY = 'speedyGit.avatarAuthOptIn.v1';

/**
 * `repo` grants read access to private repositories. Avatar lookups hit
 * `GET /repos/{owner}/{repo}/commits/{sha}`, which 404s on a private repo
 * without it — so without this scope avatars would silently never appear in
 * exactly the repositories most teams work in.
 */
const GITHUB_SCOPES = ['repo'];

export type AuthRequestResult = 'granted' | 'declined' | 'failed';

/**
 * Why the authorization state changed.
 *
 * `granted` is the one and only case where the user just gained a better budget
 * and private-repo access, so it is the one case worth re-opening cached
 * "no account" answers for. Restoring an existing session at startup, or an
 * unrelated GitHub session event, is `refreshed` — the answers already in the
 * cache were obtained under exactly the same authorization and must be left
 * alone, or every window reload would re-spend the API budget on all of them.
 *
 * `granted` and `revoked` are exactly the cases where the opt-in flipped, so
 * they are also exactly the cases where a tracked rate limit stops describing
 * the identity we now use. That is reported here, by the only writer of the
 * opt-in, rather than left for each consumer to spot by diffing a copy of it.
 */
export type AvatarAuthChange = 'granted' | 'revoked' | 'refreshed';

/**
 * Owns whether Speedy Git may use a GitHub session for avatar lookups.
 *
 * The opt-in is explicit and persisted: a session that merely happens to exist
 * (granted to some other extension, or to us in an earlier session) is never
 * used until the user presses "Allow avatar lookup". That is what makes
 * "Remove token" meaningful — otherwise the next silent lookup would quietly
 * undo it.
 */
export class GitHubAuthService {
  /**
   * The live session, or null when we hold none. One nullable object rather than
   * a token field beside a label field: the two are only ever set and cleared
   * together, and splitting them invites a path that updates one of them.
   */
  private session: { token: string; accountLabel: string } | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
    private readonly onStateChanged: (change: AvatarAuthChange) => void,
  ) {
    // A session revoked from VS Code's Accounts menu must not leave us holding
    // a dead token; drop it and fall back to unauthenticated lookups.
    this.context.subscriptions.push(
      vscode.authentication.onDidChangeSessions((event) => {
        if (event.provider.id !== 'github' || !this.isOptedIn()) return;
        void this.refreshSilently();
      }),
    );
  }

  isOptedIn(): boolean {
    return this.context.globalState.get<boolean>(OPT_IN_KEY, false);
  }

  get accountLabel(): string | null {
    return this.session?.accountLabel ?? null;
  }

  /** The token to authenticate lookups with, or null to go unauthenticated. */
  getToken(): string | null {
    return this.isOptedIn() ? this.session?.token ?? null : null;
  }

  /**
   * Restore an existing session at startup, but only when the user already
   * opted in. Silent: never prompts, and failure just means unauthenticated.
   */
  async initialize(): Promise<void> {
    if (!this.isOptedIn()) return;
    await this.refreshSilently();
  }

  private async refreshSilently(): Promise<void> {
    try {
      const session = await vscode.authentication.getSession('github', GITHUB_SCOPES, { silent: true });
      this.session = session
        ? { token: session.accessToken, accountLabel: session.account.label }
        : null;

      if (!session) {
        // The grant is gone (revoked in the Accounts menu). Clear the opt-in so
        // the UI offers Allow again instead of claiming to be connected.
        this.log.info('GitHub avatar session no longer available; reverting to unauthenticated lookups');
        await this.context.globalState.update(OPT_IN_KEY, false);
        // Only reached while opted in — both callers check — so this is a flip.
        this.onStateChanged('revoked');
        return;
      }
    } catch (error) {
      this.session = null;
      this.log.debug(`GitHub avatar session unavailable: ${String(error)}`);
    }
    this.onStateChanged('refreshed');
  }

  /** "Allow avatar lookup": prompt for a session and record the opt-in. */
  async requestAuthorization(): Promise<AuthRequestResult> {
    try {
      const session = await vscode.authentication.getSession('github', GITHUB_SCOPES, { createIfNone: true });
      if (!session) return 'declined';

      this.session = { token: session.accessToken, accountLabel: session.account.label };
      await this.context.globalState.update(OPT_IN_KEY, true);
      this.log.info('GitHub avatar lookups authorized');
      this.onStateChanged('granted');
      return 'granted';
    } catch (error) {
      // VS Code rejects the promise when the user dismisses the consent prompt,
      // which is a decline rather than a fault worth reporting as an error.
      const message = String(error);
      if (/cancel/i.test(message)) {
        this.log.debug('GitHub avatar authorization cancelled by the user');
        return 'declined';
      }
      this.log.warn(`GitHub avatar authorization failed: ${message}`);
      return 'failed';
    }
  }

  /**
   * "Remove token": stop using the session. VS Code exposes no API for an
   * extension to revoke its own grant, so the session itself stays in the
   * Accounts menu — we clear the opt-in and drop the token, which is what
   * actually governs whether Speedy Git authenticates.
   */
  async removeAuthorization(): Promise<void> {
    const wasOptedIn = this.isOptedIn();
    this.session = null;
    await this.context.globalState.update(OPT_IN_KEY, false);
    this.log.info('GitHub avatar authorization removed; using unauthenticated lookups');
    this.onStateChanged(wasOptedIn ? 'revoked' : 'refreshed');
  }
}

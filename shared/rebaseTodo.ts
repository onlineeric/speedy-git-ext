import type { RebaseEntry, SquashGroupMessage } from './types.js';

/**
 * The interactive rebase's todo list and editor messages, stated once for the
 * backend that hands them to git and the dialog that previews them.
 */

/** `"<action> <hash> <subject>"`, one line per entry, exactly as git receives them. */
export function buildRebaseTodoLines(entries: readonly RebaseEntry[]): string[] {
  return entries.map((entry) => `${entry.action} ${entry.hash} ${entry.subject}`);
}

/**
 * The messages git will ask the editor for, in the order it asks.
 *
 * Git walks the todo list top to bottom and opens the editor once at each
 * `reword`, and once at the **end** of each group that contains a `squash`
 * (a fixup-only group never opens it). The order therefore has to be derived
 * from the list itself: writing every reword first and every squash group after
 * hands a squash group's message to a later reword whenever the group comes
 * first — the exact plan autosquash produces.
 */
export function buildRebaseEditorMessages(
  entries: readonly RebaseEntry[],
  squashMessages: readonly SquashGroupMessage[],
): string[] {
  const squashMessageByLead = new Map(squashMessages.map((group) => [group.groupLeadHash, group.combinedMessage]));
  const messages: string[] = [];
  let groupLeadHash: string | null = null;
  let groupHasSquash = false;

  const closeGroup = () => {
    const combined = groupLeadHash !== null && groupHasSquash ? squashMessageByLead.get(groupLeadHash) : undefined;
    if (combined !== undefined) messages.push(combined);
  };

  for (const entry of entries) {
    if (entry.action === 'drop') continue;

    if (entry.action === 'pick' || entry.action === 'reword') {
      closeGroup();
      groupLeadHash = entry.hash;
      groupHasSquash = false;
      // Every reword occupies a slot, message or not: skipping one would shift
      // each later message onto the wrong editor call.
      if (entry.action === 'reword') messages.push(entry.rewordMessage || entry.message);
    } else if (entry.action === 'squash') {
      groupHasSquash = true;
    }
  }
  closeGroup();

  return messages;
}

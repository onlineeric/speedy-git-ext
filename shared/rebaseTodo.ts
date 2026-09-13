import type { RebaseEntry, SquashGroupMessage } from './types.js';

/**
 * The interactive rebase's todo list and editor messages, stated once for the
 * backend that hands them to git and the dialog that previews them.
 */

/** `"<action> <hash> <subject>"`, one line per entry, exactly as git receives them. */
export function buildRebaseTodoLines(entries: readonly RebaseEntry[]): string[] {
  return entries.map((entry) => `${entry.action} ${entry.hash} ${entry.subject}`);
}

/** A `pick`/`reword` and the `squash`/`fixup` rows that merge into it, as list indices. */
export interface RebaseEntryGroup {
  leadIndex: number;
  memberIndices: number[];
}

/**
 * Git's grouping rule, stated once: a `pick`/`reword` opens a group, and each
 * `squash`/`fixup` joins the nearest group above it. A `drop` belongs to no
 * group and does not break one; a `squash`/`fixup` with no lead above it
 * joins nothing. Every lead yields a group, members or not.
 */
export function groupRebaseEntries(entries: readonly RebaseEntry[]): RebaseEntryGroup[] {
  const groups: RebaseEntryGroup[] = [];
  entries.forEach((entry, index) => {
    if (entry.action === 'pick' || entry.action === 'reword') {
      groups.push({ leadIndex: index, memberIndices: [] });
    } else if (entry.action === 'squash' || entry.action === 'fixup') {
      groups[groups.length - 1]?.memberIndices.push(index);
    }
  });
  return groups;
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

  for (const { leadIndex, memberIndices } of groupRebaseEntries(entries)) {
    const lead = entries[leadIndex];
    // Every reword occupies a slot, message or not: skipping one would shift
    // each later message onto the wrong editor call.
    if (lead.action === 'reword') messages.push(lead.rewordMessage || lead.message);

    const hasSquash = memberIndices.some((index) => entries[index].action === 'squash');
    const combined = hasSquash ? squashMessageByLead.get(lead.hash) : undefined;
    if (combined !== undefined) messages.push(combined);
  }

  return messages;
}

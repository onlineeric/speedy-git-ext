import type { RebaseEntry, SquashGroupMessage } from '@shared/types';

/**
 * The combined message git will write for each squash group in a rebase plan.
 *
 * A group is a lead entry (`pick` or `reword`) plus every `squash` that follows
 * it; `fixup` contributes nothing by definition, and `drop` is not there at all.
 * Only groups with more than one message are returned — a lone commit keeps the
 * message it already has, so there is nothing to combine.
 *
 * Every contribution is the commit's **complete** message, not its subject.
 * Whatever comes out of here is written verbatim as the resulting commit's whole
 * message, so joining subjects would silently discard every body and trailer in
 * the group.
 */
export function buildSquashMessages(entries: RebaseEntry[]): SquashGroupMessage[] {
  const groups: SquashGroupMessage[] = [];
  let currentLeadHash: string | null = null;
  let currentMessages: string[] = [];

  for (const entry of entries) {
    if (entry.action === 'drop') continue;

    if (entry.action === 'pick' || entry.action === 'reword') {
      if (currentLeadHash && currentMessages.length > 1) {
        groups.push({ groupLeadHash: currentLeadHash, combinedMessage: currentMessages.join('\n\n') });
      }
      currentLeadHash = entry.hash;
      currentMessages = [entry.action === 'reword' && entry.rewordMessage ? entry.rewordMessage : entry.message];
    } else if (entry.action === 'squash') {
      currentMessages.push(entry.message);
    }
    // fixup: silently discard
  }

  if (currentLeadHash && currentMessages.length > 1) {
    groups.push({ groupLeadHash: currentLeadHash, combinedMessage: currentMessages.join('\n\n') });
  }

  return groups;
}

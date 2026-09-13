import type { RebaseEntry, SquashGroupMessage } from '@shared/types';
import { groupRebaseEntries } from '@shared/rebaseTodo';

/**
 * What a `squash` entry adds to its group's message.
 *
 * Git comments out the title paragraph of a squashed `squash!` / `fixup!` /
 * `amend!` commit, because that line only told autosquash where to go; the
 * blank lines after it then fall away in cleanup. Keeping it would put
 * `squash! <subject>` into the final message.
 */
function squashContribution(message: string): string {
  if (!/^(squash|fixup|amend)!/.test(message)) return message;
  const bodyStart = message.search(/\n[ \t]*\n/);
  return bodyStart < 0 ? '' : message.slice(bodyStart).replace(/^(?:[ \t]*\n)+/, '');
}

/**
 * The combined message git will write for each squash group in a rebase plan.
 *
 * A group is a lead entry (`pick` or `reword`) plus every `squash` that follows
 * it; `fixup` contributes nothing by definition, and `drop` is not there at all.
 * Every group containing a `squash` is returned — git opens its editor for each
 * one — while a group of only a lead and fixups keeps its message unasked.
 *
 * Every contribution is the commit's **complete** message, not its subject.
 * Whatever comes out of here is written verbatim as the resulting commit's whole
 * message, so joining subjects would silently discard every body and trailer in
 * the group.
 */
export function buildSquashMessages(entries: RebaseEntry[]): SquashGroupMessage[] {
  const groups: SquashGroupMessage[] = [];

  for (const { leadIndex, memberIndices } of groupRebaseEntries(entries)) {
    const squashes = memberIndices.map((index) => entries[index]).filter((entry) => entry.action === 'squash');
    // Keyed on the squash rather than on how many messages survive: git opens
    // its editor for every such group, even when a `squash!` contributes
    // nothing but its title. fixup members contribute nothing.
    if (squashes.length === 0) continue;

    const lead = entries[leadIndex];
    const leadMessage = lead.action === 'reword' && lead.rewordMessage ? lead.rewordMessage : lead.message;
    const contributions = squashes.map((entry) => squashContribution(entry.message)).filter(Boolean);
    groups.push({ groupLeadHash: lead.hash, combinedMessage: [leadMessage, ...contributions].join('\n\n') });
  }

  return groups;
}

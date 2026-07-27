import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  menuGroupLabelClass,
  menuGroupRuleClass,
  menuGroupSeparatorClass,
  menuSeparatorClass,
} from './menuStyles';

interface MenuGroupSeparatorProps {
  /**
   * Name of the group that follows, centred on the rule. Omit for a plain
   * divider — the first group of a menu never carries one, since the menu's
   * own context already names the object being acted on.
   */
  label?: string;
}

/**
 * Divider between context-menu groups, optionally naming the group below it.
 *
 * Menus in the graph mix items that act on different objects (a commit, the
 * branch whose badge sits on it, its remote, its worktree), so the groups are
 * organised by object and the label says which one. Radix's `Separator` is
 * already non-focusable and skipped by arrow-key navigation, so labelling it
 * costs nothing in keyboard behaviour; the rules are decorative and the name
 * rides on the separator itself for screen readers.
 */
export function MenuGroupSeparator({ label }: MenuGroupSeparatorProps) {
  if (!label) {
    return <ContextMenu.Separator className={menuSeparatorClass} />;
  }

  return (
    <ContextMenu.Separator className={menuGroupSeparatorClass} aria-label={label}>
      <span className={menuGroupRuleClass} aria-hidden />
      <span className={menuGroupLabelClass}>{label}</span>
      <span className={menuGroupRuleClass} aria-hidden />
    </ContextMenu.Separator>
  );
}

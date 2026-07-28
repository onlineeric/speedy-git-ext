import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  menuGroupLabelClass,
  menuGroupNameClass,
  menuGroupRuleClass,
  menuGroupSeparatorClass,
  menuSeparatorClass,
} from './menuStyles';

interface MenuGroupSeparatorProps {
  /** Name of the group that follows, centred on the rule. Omit for a plain divider. */
  label?: string;
  /**
   * A git ref name to append to the label, e.g. `Branch` + `my-feature`. Kept
   * separate from `label` so it can be rendered in its original case while the
   * caption stays uppercased, and so it truncates instead of widening the menu.
   */
  name?: string;
}

/**
 * Divider between context-menu groups, optionally naming the group below it.
 *
 * Menus in the graph mix items that act on different objects (a commit, the
 * branch whose badge sits on it, its remote, its worktree), so the groups are
 * organised by object and the label says which one — including *which* branch
 * or tag, when the menu was opened from a badge. Radix's `Separator` is already
 * non-focusable and skipped by arrow-key navigation, so labelling it costs
 * nothing in keyboard behaviour; the rules are decorative and the name rides on
 * the separator itself for screen readers.
 */
export function MenuGroupSeparator({ label, name }: MenuGroupSeparatorProps) {
  if (!label) {
    return <ContextMenu.Separator className={menuSeparatorClass} />;
  }

  return (
    <ContextMenu.Separator
      className={menuGroupSeparatorClass}
      aria-label={name ? `${label} ${name}` : label}
    >
      <span className={menuGroupRuleClass} aria-hidden />
      <span className={menuGroupLabelClass} title={name}>
        {label}
        {name && <span className={menuGroupNameClass}>{name}</span>}
      </span>
      <span className={menuGroupRuleClass} aria-hidden />
    </ContextMenu.Separator>
  );
}

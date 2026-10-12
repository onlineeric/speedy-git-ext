import type { ReactNode } from 'react';
import { AutolinkAnchor, type AutolinkSurface } from '../components/AutolinkAnchor';
import { HighlightedText } from '../components/HighlightedText';
import { splitAutolinkSegments, type AutolinkRule } from './autolinks';
import type { SearchTerm } from './searchQuery';

const INLINE_CODE_CLASSES = 'font-mono rounded px-1 bg-[var(--vscode-textCodeBlock-background)]';

interface InlineCodeSegment {
  text: string;
  isCode: boolean;
}

/**
 * Parses text containing backtick-delimited inline code into segments.
 * Unpaired backticks are treated as literal characters.
 * Empty backtick pairs (``) are rendered as two literal backtick characters.
 */
export function parseInlineCode(text: string): InlineCodeSegment[] {
  const segments: InlineCodeSegment[] = [];
  let current = '';
  let i = 0;

  while (i < text.length) {
    if (text[i] === '`') {
      const nextBacktick = text.indexOf('`', i + 1);
      if (nextBacktick === -1) {
        // Unpaired backtick — treat as literal
        current += '`';
        i++;
      } else {
        const inner = text.slice(i + 1, nextBacktick);
        if (inner.length === 0) {
          // Empty backtick pair — render as two literal backticks
          current += '``';
          i = nextBacktick + 1;
        } else {
          // Valid inline code pair
          if (current) {
            segments.push({ text: current, isCode: false });
            current = '';
          }
          segments.push({ text: inner, isCode: true });
          i = nextBacktick + 1;
        }
      }
    } else {
      current += text[i];
      i++;
    }
  }

  if (current) {
    segments.push({ text: current, isCode: false });
  }

  return segments;
}

/** Autolinks to apply to a rendered message, and where it is rendered (for telemetry). */
export interface AutolinkRenderOptions {
  rules: readonly AutolinkRule[];
  surface: AutolinkSurface;
}

/**
 * Renders a text string with backtick-delimited inline code styled as `<code>` elements,
 * and — when `terms` are given — a box around each search match inside it, and —
 * when `autolinks` are given — each reference outside inline code as a link.
 * Returns the original string unchanged when there is no backtick pair, match or link.
 *
 * Note that matching runs against the raw subject (backticks included) while
 * highlighting runs against the parsed segments (backticks stripped), so a term
 * spanning a backtick boundary matches the row but highlights nothing. Rare, and
 * the row highlight stays authoritative. The same holds for a term spanning the
 * edge of a link.
 *
 * Code is never linked: `#12` inside backticks is code someone quoted, which is
 * also how GitHub and GitLab treat it.
 */
export function renderInlineCode(
  text: string,
  terms?: readonly SearchTerm[],
  autolinks?: AutolinkRenderOptions,
): ReactNode {
  if (!text.includes('`')) {
    // No backticks: with no query and no link the cell keeps its single text node.
    return renderLinkedText(text, terms, autolinks);
  }

  const segments = parseInlineCode(text);

  if (segments.length === 1 && !segments[0].isCode) {
    return renderLinkedText(segments[0].text, terms, autolinks);
  }

  return segments.map((segment, index) =>
    segment.isCode ? (
      <code key={index} className={INLINE_CODE_CLASSES}>
        {renderHighlighted(segment.text, terms)}
      </code>
    ) : (
      <span key={index}>{renderLinkedText(segment.text, terms, autolinks)}</span>
    )
  );
}

function renderHighlighted(text: string, terms: readonly SearchTerm[] | undefined): ReactNode {
  return terms && terms.length > 0 ? <HighlightedText text={text} terms={terms} /> : text;
}

/** Plain (non-code) text with its autolinks, each run search-highlighted. */
function renderLinkedText(
  text: string,
  terms: readonly SearchTerm[] | undefined,
  autolinks: AutolinkRenderOptions | undefined,
): ReactNode {
  const segments = autolinks ? splitAutolinkSegments(text, autolinks.rules) : undefined;
  if (!autolinks || !segments || (segments.length === 1 && !segments[0].link)) {
    return renderHighlighted(text, terms);
  }

  return segments.map((segment, index) =>
    segment.link ? (
      <AutolinkAnchor key={index} url={segment.link.url} source={segment.link.source} surface={autolinks.surface}>
        {renderHighlighted(segment.text, terms)}
      </AutolinkAnchor>
    ) : (
      <span key={index}>{renderHighlighted(segment.text, terms)}</span>
    )
  );
}

/**
 * Reusable component for wrapping static known text in inline code style.
 * Used in MergeDialog labels for git flags like --squash, --no-commit, --no-ff.
 */
export function InlineCode({ children }: { children: ReactNode }) {
  return <code className={INLINE_CODE_CLASSES}>{children}</code>;
}

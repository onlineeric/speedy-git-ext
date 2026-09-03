import type { ReactNode } from 'react';
import { SEARCH_MATCH_STYLE } from '../components/HighlightedText';
import { buildHighlightSegments } from './searchHighlight';
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

/**
 * Renders a text string with backtick-delimited inline code styled as `<code>` elements,
 * and — when `terms` are given — a box around each search match inside it.
 * Returns the original string unchanged when there is neither a backtick pair nor a match.
 *
 * Note that matching runs against the raw subject (backticks included) while
 * highlighting runs against the parsed segments (backticks stripped), so a term
 * spanning a backtick boundary matches the row but highlights nothing. Rare, and
 * the row highlight stays authoritative.
 */
export function renderInlineCode(text: string, terms?: readonly SearchTerm[]): ReactNode {
  const hasTerms = !!terms && terms.length > 0;
  if (!text.includes('`')) {
    if (!hasTerms) {
      return text;
    }
    const segments = buildHighlightSegments(text, terms);
    // Fast path preserved: no match means the cell keeps its single text node.
    if (segments.length === 1 && !segments[0].matched) {
      return text;
    }
    return renderHighlighted(segments, 'h');
  }

  const segments = parseInlineCode(text);

  // If parsing produced a single non-code segment, return plain string
  if (segments.length === 1 && !segments[0].isCode && !hasTerms) {
    return segments[0].text;
  }

  return segments.map((segment, index) => {
    const body = hasTerms ? renderHighlighted(buildHighlightSegments(segment.text, terms), `h${index}`) : segment.text;
    return segment.isCode ? (
      <code key={index} className={INLINE_CODE_CLASSES}>
        {body}
      </code>
    ) : (
      <span key={index}>{body}</span>
    );
  });
}

/**
 * Match boxes over one already-parsed run of text. Wrapped in a single span for the
 * same reason `HighlightedText` is: loose segments become separate flex items under
 * a `gap`-bearing parent, which opens a visible space around every highlight.
 */
function renderHighlighted(segments: ReturnType<typeof buildHighlightSegments>, keyPrefix: string): ReactNode {
  if (segments.length === 1 && !segments[0].matched) {
    return segments[0].text;
  }
  return (
    <span>
      {segments.map((segment, index) =>
        segment.matched ? (
          <span key={`${keyPrefix}-${index}`} style={SEARCH_MATCH_STYLE}>{segment.text}</span>
        ) : (
          <span key={`${keyPrefix}-${index}`}>{segment.text}</span>
        )
      )}
    </span>
  );
}

/**
 * Reusable component for wrapping static known text in inline code style.
 * Used in MergeDialog labels for git flags like --squash, --no-commit, --no-ff.
 */
export function InlineCode({ children }: { children: ReactNode }) {
  return <code className={INLINE_CODE_CLASSES}>{children}</code>;
}

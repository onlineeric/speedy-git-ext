import type { ReactNode } from 'react';
import { HighlightedText } from '../components/HighlightedText';
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
    // No backticks and no query: the cell keeps its single text node.
    return hasTerms ? <HighlightedText text={text} terms={terms} /> : text;
  }

  const segments = parseInlineCode(text);

  // If parsing produced a single non-code segment, return plain string
  if (segments.length === 1 && !segments[0].isCode && !hasTerms) {
    return segments[0].text;
  }

  return segments.map((segment, index) => {
    const body = hasTerms ? <HighlightedText text={segment.text} terms={terms} /> : segment.text;
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
 * Reusable component for wrapping static known text in inline code style.
 * Used in MergeDialog labels for git flags like --squash, --no-commit, --no-ff.
 */
export function InlineCode({ children }: { children: ReactNode }) {
  return <code className={INLINE_CODE_CLASSES}>{children}</code>;
}

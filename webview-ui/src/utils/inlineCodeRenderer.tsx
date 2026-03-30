import type { ReactNode } from 'react';

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
 * Renders a text string with backtick-delimited inline code styled as `<code>` elements.
 * Returns the original string unchanged if no backtick pairs are found.
 */
export function renderInlineCode(text: string): ReactNode {
  if (!text.includes('`')) {
    return text;
  }

  const segments = parseInlineCode(text);

  // If parsing produced a single non-code segment, return plain string
  if (segments.length === 1 && !segments[0].isCode) {
    return segments[0].text;
  }

  return segments.map((segment, index) =>
    segment.isCode ? (
      <code key={index} className={INLINE_CODE_CLASSES}>
        {segment.text}
      </code>
    ) : (
      <span key={index}>{segment.text}</span>
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

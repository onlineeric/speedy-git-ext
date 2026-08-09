import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as themeColors from '../themeColors';
import { tint } from '../themeColors';

const WEBVIEW_SRC = join(__dirname, '..', '..');

/**
 * A hardcoded color is allowed only where a theme token cannot serve — a color
 * that has to contrast against a *user-configured* value rather than against the
 * theme. Mark it on the offending line, or the line above it:
 *
 *   // theme-color-exception: contrasts against the user's lane color
 *
 * Deliberately per-line rather than a list of exempt files: the files that need an
 * exception are the ones where color code gets edited, so exempting a whole file
 * would wave through the *next* hardcoded color as well as the intended one.
 */
const EXCEPTION_MARKER = 'theme-color-exception:';

/**
 * The one scrim: a dialog overlay darkens whatever is behind it rather than
 * claiming a color of its own, so it is theme-independent by nature and every
 * dialog spells it the same way.
 */
const DIALOG_SCRIM_CLASS = 'bg-black/50';

interface SourceFile {
  /** Slash-separated path relative to `webview-ui/src`, for offender messages. */
  path: string;
  lines: string[];
}

function sourceFiles(): SourceFile[] {
  return readdirSync(WEBVIEW_SRC, { recursive: true, encoding: 'utf8' })
    .map((entry) => entry.split(sep).join('/'))
    .filter((path) => /\.(tsx?|css)$/.test(path) && !path.includes('__tests__/'))
    .map((path) => ({ path, lines: readFileSync(join(WEBVIEW_SRC, path), 'utf8').split('\n') }));
}

const COMMENT_LINE = /^\s*(\/\/|\/?\*)/;

/**
 * A line is excepted if it carries the marker itself, or if the comment block
 * immediately above it does — so the marker can go in a `//` line or anywhere in
 * a JSDoc block explaining the exception.
 */
function isExcepted(lines: string[], index: number): boolean {
  if (lines[index].includes(EXCEPTION_MARKER)) return true;
  for (let above = index - 1; above >= 0 && COMMENT_LINE.test(lines[above]); above--) {
    if (lines[above].includes(EXCEPTION_MARKER)) return true;
  }
  return false;
}

/**
 * Drop every `var(--token, fallback)` from a line so a hex *fallback* is allowed
 * while a hex anywhere else on the same line still fails. Innermost-first, so
 * nested fallbacks (`var(--a, var(--b))`) unwrap completely.
 */
function stripVarReferences(line: string): string {
  let stripped = line;
  for (let previous = ''; previous !== stripped; ) {
    previous = stripped;
    stripped = stripped.replace(/var\([^()]*\)/g, '');
  }
  return stripped;
}

function findOffenders(files: SourceFile[], matches: (line: string) => boolean): string[] {
  return files.flatMap(({ path, lines }) =>
    lines.flatMap((line, index) =>
      matches(line) && !isExcepted(lines, index) ? [`${path}:${index + 1}: ${line.trim()}`] : []
    )
  );
}

describe('tint', () => {
  it('mixes the color with transparent so it tracks the theme token', () => {
    expect(tint('var(--vscode-x)')).toBe('color-mix(in srgb, var(--vscode-x) 18%, transparent)');
  });

  it('honours an explicit percentage', () => {
    expect(tint('var(--vscode-x)', 10)).toBe('color-mix(in srgb, var(--vscode-x) 10%, transparent)');
  });
});

describe('exported colors', () => {
  it('are all VS Code theme token references', () => {
    const colors = Object.entries(themeColors).filter(([, value]) => typeof value === 'string');
    expect(colors.length).toBeGreaterThan(0);
    for (const [name, value] of colors) {
      expect(`${name}: ${value}`).toMatch(/var\(--vscode-/);
    }
  });
});

/**
 * The webview renders inside the user's editor, so a fixed palette color looks
 * right in the theme it was written against and wrong in every other one. These
 * two scans are the automatable half of that rule — they cannot catch "a token,
 * but the wrong one", which still needs a look on a light theme.
 */
describe('no hardcoded colors in the webview', () => {
  const files = sourceFiles();

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((file) => file.path.endsWith('.css'))).toBe(true);
  });

  it('uses no Tailwind palette colors', () => {
    const utility = '(text|bg|border|fill|stroke|ring|decoration|outline|accent|shadow|from|to|via|divide)';
    const numbered =
      '(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}';
    const pattern = new RegExp(`\\b${utility}-(${numbered}|white|black)(/[0-9]+)?\\b`);

    const offenders = findOffenders(files, (line) => pattern.test(line.split(DIALOG_SCRIM_CLASS).join('')));

    expect(offenders).toEqual([]);
  });

  it('uses no raw color values outside a var() fallback', () => {
    // `#rrggbb`/`#rrggbbaa` anywhere, `#rgb` shorthand only inside quotes so a
    // `#123` issue reference in prose is not mistaken for a color, and the CSS
    // color functions that take raw channel values.
    const pattern = /#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?\b|['"`]#[0-9a-fA-F]{3}['"`]|\b(rgba?|hsla?|hwb|oklch|lab)\(/;

    const offenders = findOffenders(files, (line) => {
      // A shadow darkens or lightens what is behind it rather than claiming a
      // color of its own — the same reasoning that exempts the dialog scrim.
      if (/(drop-)?shadow-\[/.test(line)) return false;
      return pattern.test(stripVarReferences(line));
    });

    expect(offenders).toEqual([]);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as themeColors from '../themeColors';
import { tint } from '../themeColors';

const WEBVIEW_SRC = join(__dirname, '..', '..');

/**
 * Files whose hardcoded colors are deliberate, each for a reason a theme token
 * cannot serve. Keep this list short and keep the reason in the file itself.
 */
const DELIBERATE_HARDCODED_COLORS = [
  // User-configurable graph lane palette, and the luminance-picked text color
  // that has to stay readable on whatever lane color the user chose.
  'utils/colorUtils.ts',
  // Badge border that must contrast against a user-configured lane color.
  'utils/worktreeBadgeStyle.ts',
  // Per-email hsl() background for the initials avatar fallback, and the label on it.
  'utils/gravatar.ts',
  'components/AuthorAvatar.tsx',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
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

  // The `*ClassName` strings must stay spelled out for Tailwind's JIT, so they
  // mirror the `*_COLOR` values rather than referencing them. Nothing but this
  // keeps the two halves in step.
  it('keep the spelled-out class strings in step with the color constants', () => {
    expect(themeColors.accentTextClassName).toBe(`text-[${themeColors.ACCENT_COLOR}]`);
    expect(themeColors.warningTextClassName).toBe(`text-[${themeColors.WARNING_COLOR}]`);
  });
});

/**
 * The webview renders inside the user's editor, so a fixed palette color looks
 * right in the theme it was written against and wrong in every other one. These
 * two scans are the automatable half of that rule — they cannot catch "a token,
 * but the wrong one", which still needs a look on a light theme.
 */
describe('no hardcoded colors in the webview', () => {
  const files = sourceFiles(WEBVIEW_SRC);

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('uses no Tailwind palette colors', () => {
    const utility = '(text|bg|border|fill|stroke|ring|decoration|outline|accent|shadow|from|to|via)';
    const palette =
      '(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
    const pattern = new RegExp(`\\b${utility}-${palette}-[0-9]{2,3}(/[0-9]+)?\\b`, 'g');

    const offenders = files.flatMap((file) => {
      const matches = readFileSync(file, 'utf8').match(pattern) ?? [];
      return matches.map((match) => `${relative(WEBVIEW_SRC, file)}: ${match}`);
    });

    expect(offenders).toEqual([]);
  });

  it('uses no raw hex or rgb() outside a var() fallback or a documented exception', () => {
    const offenders = files.flatMap((file) => {
      const rel = relative(WEBVIEW_SRC, file).split('\\').join('/');
      if (DELIBERATE_HARDCODED_COLORS.includes(rel)) return [];
      return readFileSync(file, 'utf8')
        .split('\n')
        // `#rrggbb` and `#rrggbbaa` anywhere; `#rgb` shorthand only inside quotes,
        // so a `#123` issue reference in a comment is not mistaken for a color.
        .filter(
          (line) =>
            /#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?\b|['"`]#[0-9a-fA-F]{3}['"`]|rgba?\(/.test(line) &&
            !line.includes('var(--vscode')
        )
        // A shadow is theme-independent — it darkens or lightens whatever is
        // behind it rather than claiming a color of its own, the same reasoning
        // that exempts the `bg-black/50` dialog scrims.
        .filter((line) => !/shadow/.test(line))
        .map((line) => `${rel}: ${line.trim()}`);
    });

    expect(offenders).toEqual([]);
  });
});

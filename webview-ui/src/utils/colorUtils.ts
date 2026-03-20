/** Default graph color palette when user has no custom colors configured. */
export const DEFAULT_GRAPH_PALETTE = ['#4ec9b0'];

/** Resolve a color index to a hex color from the palette (cycles via modulo). */
export function getColor(colorIndex: number, palette: string[]): string {
  return palette[colorIndex % palette.length];
}

/**
 * Parse a hex color string (#RRGGBB or #RGB) to [r, g, b] in 0–255 range.
 * Returns [0, 0, 0] for unparseable input.
 */
function parseHex(hex: string): [number, number, number] {
  const cleaned = hex.startsWith('#') ? hex.slice(1) : hex;

  if (cleaned.length === 3) {
    return [
      parseInt(cleaned[0] + cleaned[0], 16),
      parseInt(cleaned[1] + cleaned[1], 16),
      parseInt(cleaned[2] + cleaned[2], 16),
    ];
  }

  if (cleaned.length >= 6) {
    return [
      parseInt(cleaned.slice(0, 2), 16),
      parseInt(cleaned.slice(2, 4), 16),
      parseInt(cleaned.slice(4, 6), 16),
    ];
  }

  return [0, 0, 0];
}

/** Linearize an sRGB channel (0–1) for luminance calculation. */
function linearize(channel: number): number {
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** Return a contrasting text color (dark or light) for a given hex background. */
export function getContrastTextColor(hexColor: string): string {
  const [r, g, b] = parseHex(hexColor);
  const luminance =
    0.2126 * linearize(r / 255) +
    0.7152 * linearize(g / 255) +
    0.0722 * linearize(b / 255);

  return luminance > 0.4 ? '#1a1a1a' : '#f5f5f5';
}

/** Return inline style for a badge using the given lane hex color. */
export function getLaneColorStyle(hexColor: string): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  return {
    backgroundColor: hexColor + '99', // 60% opacity
    color: getContrastTextColor(hexColor),
    borderColor: hexColor,
  };
}

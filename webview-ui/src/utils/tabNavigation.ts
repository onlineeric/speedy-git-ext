/**
 * The WAI-ARIA tabs keyboard pattern: arrows move between tabs and wrap at the
 * ends, Home/End jump to the first/last. Returns `null` for any other key so the
 * caller leaves it alone.
 */
export function nextTabIndex(currentIndex: number, tabCount: number, key: string): number | null {
  if (tabCount <= 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (currentIndex + 1) % tabCount;
    case 'ArrowLeft':
      return (currentIndex - 1 + tabCount) % tabCount;
    case 'Home':
      return 0;
    case 'End':
      return tabCount - 1;
    default:
      return null;
  }
}

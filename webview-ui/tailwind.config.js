/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Deliberately no `theme.extend.colors`: a color registry here would be a second
  // place colors are defined, competing with `src/utils/themeColors.ts` and
  // invisible to the scans in `utils/__tests__/themeColors.test.ts`. Semantic
  // colors come from that module; one-off tokens are written inline as
  // `var(--vscode-*)` arbitrary values.
  theme: {},
  plugins: [],
};

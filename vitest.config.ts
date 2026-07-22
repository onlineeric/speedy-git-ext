import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Mirrors webview-ui/vite.config.ts so modules relying on the build-time
  // version define (webview-ui/src/utils/helpLinks.ts) work under test too.
  define: {
    __EXTENSION_VERSION__: JSON.stringify('0.0.0-test'),
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'src/__tests__/**/*.test.ts',
      'webview-ui/src/**/__tests__/**/*.test.ts',
    ],
  },
});

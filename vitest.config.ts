import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
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

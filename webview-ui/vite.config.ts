import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// Read at config time so the Help dialog can show the running version without
// an extra RPC round-trip (see webview-ui/src/utils/helpLinks.ts).
const { version } = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  define: {
    __EXTENSION_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    // Inline every imported asset (images in What's New) as a data: URL. An
    // emitted file would be referenced as `/assets/…`, which the webview cannot
    // resolve: the page's origin is not the extension folder, and the script is
    // not a module, so there is no `import.meta.url` to resolve against.
    assetsInlineLimit: () => true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared'),
    },
  },
});

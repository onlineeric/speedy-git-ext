import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

// Telemetry connection string: injected from a local gitignored `.env` on
// production builds only. Dev/watch/test builds always get an empty string,
// which makes the TelemetryService a structural no-op (FR-015/FR-019).
if (isProduction) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env present — build ships with telemetry off (safe default).
  }
}
const telemetryConnectionString = isProduction
  ? process.env.SPEEDYGIT_TELEMETRY_CONNECTION_STRING ?? ''
  : '';

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: 'info',
  define: {
    'process.env.SPEEDYGIT_TELEMETRY_CONNECTION_STRING': JSON.stringify(telemetryConnectionString),
  },
};

if (isProduction) {
  rmSync('dist/extension.js.map', { force: true });
}

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
}

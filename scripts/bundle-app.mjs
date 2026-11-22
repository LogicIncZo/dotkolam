#!/usr/bin/env node
/** Bundle the harness app with esbuild (dev dependency; no runtime deps). */
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('app/bundle.js', { force: true });
await build({
  entryPoints: ['app/main.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'app/bundle.js',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});
console.log('bundled app/bundle.js');

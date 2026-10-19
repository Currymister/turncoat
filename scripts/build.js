// Builds the phone app into dist/. Use --watch while developing.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

fs.mkdirSync(dist, { recursive: true });
const version = Date.now().toString(36);

function copyStatic() {
  const html = fs.readFileSync(path.join(root, 'client', 'index.html'), 'utf8').replaceAll('__V__', version);
  fs.writeFileSync(path.join(dist, 'index.html'), html);
  for (const f of ['favicon.svg', 'manifest.webmanifest']) {
    const src = path.join(root, 'client', f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dist, f));
  }
}

const options = {
  entryPoints: { app: path.join(root, 'client', 'src', 'main.jsx'), style: path.join(root, 'client', 'src', 'styles.css') },
  outdir: dist,
  bundle: true,
  minify: !watch,
  sourcemap: watch,
  format: 'esm',
  target: ['chrome100', 'safari15', 'firefox100'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  logLevel: 'info',
};

copyStatic();
if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching for changes…');
} else {
  await esbuild.build(options);
  console.log('Built to dist/');
}

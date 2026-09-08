// Copies the three.js ESM build out of node_modules into public/vendor so the
// client is fully self-hosted: no CDN, works offline, version pinned by npm.
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'node_modules', 'three', 'build');
const outDir = join(root, 'public', 'vendor');

// three.module.js re-exports from three.core.js, so both files must be vendored.
const FILES = ['three.module.js', 'three.core.js'];

if (!existsSync(join(buildDir, FILES[0]))) {
  console.warn('[vendor-three] three.js not installed yet; skipping copy.');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
for (const f of FILES) {
  const src = join(buildDir, f);
  if (existsSync(src)) copyFileSync(src, join(outDir, f));
}

const pkg = JSON.parse(readFileSync(join(root, 'node_modules', 'three', 'package.json'), 'utf8'));
console.log(`[vendor-three] public/vendor/three.module.js <- three@${pkg.version}`);

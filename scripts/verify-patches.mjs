import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// upstream: https://github.com/opennextjs/opennextjs-cloudflare/issues — hapus patch bila >1.20.9
// Patch menutup: (1) sharp di-alias ke shim (Workers tak bisa native),
// (2) esbuild logLevel error, (3) preview-props.json ikut glob manifest.
const EXPECTED = {
  '@opennextjs+cloudflare+1.20.9.patch':
    '616d3e459006c1eedbc548b774cfd310f0652b09d2f6967828455fe375d033da',
};

const dir = join(process.cwd(), 'patches');
const files = readdirSync(dir).filter((f) => f.endsWith('.patch'));
if (files.length === 0) throw new Error('patches/*.patch tidak ditemukan');

for (const f of files) {
  const expected = EXPECTED[f];
  if (!expected) throw new Error(`hash belum terdaftar untuk ${f}`);
  const actual = createHash('sha256').update(readFileSync(join(dir, f))).digest('hex');
  if (actual !== expected) throw new Error(`patch berubah: ${f}\n  expected ${expected}\n  actual   ${actual}`);
}

execSync('npm ls @opennextjs/cloudflare', { stdio: 'inherit' });
console.log('verify-patches: ok');

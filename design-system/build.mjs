#!/usr/bin/env node
/* Urbanyx design-system build.
 * Reads design-system/src/*.html, inlines src/base.css plus the real Google Sans
 * woff2 subsets and the Urbanyx logo PNGs as data URIs, and writes fully
 * self-contained previews to design-system/dist/.
 * Run:  node design-system/build.mjs
 * Then: /design-sync  (pushes design-system/dist to the Claude Design project)
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const DS = dirname(fileURLToPath(import.meta.url));
const REPO = join(DS, '..');
const SRC = join(DS, 'src');
const DIST = join(DS, 'dist');

const dataUri = (p, mime) => `data:${mime};base64,${readFileSync(join(REPO, p)).toString('base64')}`;

const FONT_REG  = dataUri('fonts/GoogleSans-sub-Regular.woff2',  'font/woff2');
const FONT_SB   = dataUri('fonts/GoogleSans-sub-SemiBold.woff2', 'font/woff2');
const LOGO_MARK = dataUri('analysis-logos/logo-landing-page.png',      'image/png');
const LOGO_TEXT = dataUri('analysis-logos/logo-landing-page-text.png', 'image/png');

const base = readFileSync(join(SRC, 'base.css'), 'utf8')
  .replace('__FONT_REG__', FONT_REG)
  .replace('__FONT_SB__',  FONT_SB);

mkdirSync(DIST, { recursive: true });

let n = 0;
for (const f of readdirSync(SRC).filter(f => f.endsWith('.html')).sort()) {
  const raw = readFileSync(join(SRC, f), 'utf8');

  if (!raw.startsWith('<!-- @dsCard group=')) {
    console.error(`  ✗ ${f}: first line must be a <!-- @dsCard group="…" --> marker`);
    process.exitCode = 1;
    continue;
  }

  const out = raw
    .replace('__BASE__', `<style>\n${base}\n</style>`)
    .replaceAll('__LOGO_MARK__', LOGO_MARK)
    .replaceAll('__LOGO_TEXT__', LOGO_TEXT);

  if (out.includes('__')) {
    const leftover = out.match(/__[A-Z_]+__/g);
    if (leftover) console.warn(`  ! ${f}: unresolved ${[...new Set(leftover)].join(', ')}`);
  }

  writeFileSync(join(DIST, basename(f)), out);
  const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
  console.log(`  ✓ ${f.padEnd(20)} ${kb.padStart(4)} KB`);
  n++;
}
console.log(`\n${n} preview${n === 1 ? '' : 's'} → design-system/dist/`);

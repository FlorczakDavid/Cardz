/** Buildless release checks: configuration, file references, assets and JS syntax. */
import { readFile, access, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateConfig, prepareQuestions } from '../assets/engine.mjs';
const root = new URL('../', import.meta.url), errors = [];
async function checkReference(ref, parent) {
  if (/^(https?:|data:|#)/.test(ref)) return;
  if (ref.startsWith('/')) { errors.push(`Non-relative path: ${ref}`); return; }
  const url = new URL(ref.split('#')[0].split('?')[0], parent);
  if (!url.href.startsWith(root.href)) { errors.push(`Path escapes release: ${ref}`); return; }
  try { await access(url); } catch { errors.push(`Missing file: ${fileURLToPath(url)}`); }
}
const cfg = validateConfig(JSON.parse(await readFile(new URL('config.json', root))));
const packs = await Promise.all(cfg.sources.map(async source => ({source,data:JSON.parse(await readFile(new URL(source.path, root)))})));
const qs = prepareQuestions(cfg, packs);
for (const html of ['index.html','guide.html']) {
  const url = new URL(html, root), raw = await readFile(url,'utf8');
  for (const match of raw.matchAll(/(?:src|href)="([^"]+)"/g)) await checkReference(match[1], url);
  if (!raw.includes('name="viewport"') || !raw.includes('lang="fr"')) errors.push(`${html}: language or viewport missing`);
  if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(raw)) errors.push(`${html}: unexpected inline script`);
}
for (const file of await readdir(new URL('assets/',root))) {
  if (!file.endsWith('.mjs')) continue;
  const url = new URL(`assets/${file}`,root), raw = await readFile(url,'utf8');
  execFileSync(process.execPath,['--check',fileURLToPath(url)]);
  for (const match of raw.matchAll(/from ['"]([^'"]+)['"]/g)) await checkReference(match[1],url);
  if (/\.innerHTML\s*=|\beval\s*\(|new Function\s*\(/.test(raw)) errors.push(`${file}: unsafe HTML or code evaluation`);
}
for (const [file, expected] of [
  ['bootstrap.min.css', 'sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB'],
  ['bootstrap.bundle.min.js', 'FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI']
]) {
  const bytes = await readFile(new URL(`assets/vendor/bootstrap/${file}`, root));
  if (createHash('sha384').update(bytes).digest('base64') !== expected) errors.push(`${file}: official Bootstrap 5.3.8 integrity mismatch`);
}
await access(new URL('assets/vendor/bootstrap/LICENSE', root));
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('assets/vendor/bootstrap/bootstrap.bundle.min.js', root))]);
await access(new URL('.nojekyll',root));
for (const file of ['config.schema.json','data/questions.schema.json']) JSON.parse(await readFile(new URL(file,root)));
if (errors.length) { console.error(errors.join('\n')); process.exitCode=1; }
else console.log(`Release checks passed: ${qs.length} questions, relative assets, JSON data, local ES modules, official Bootstrap 5.3.8 assets and license, .nojekyll.`);

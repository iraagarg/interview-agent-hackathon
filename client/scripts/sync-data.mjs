/**
 * Copies the shared candidate data into the client so the frontend builds
 * without reaching outside its own directory.
 *
 * Why this exists: Vercel builds with a Root Directory of `client`, and whether
 * files above it are available depends on a project setting. Relying on that
 * makes a successful local build no guarantee of a successful deploy. Instead
 * the copy is committed, and this script keeps it honest.
 *
 * Runs automatically before `npm run dev` and `npm run build`. When the source
 * is missing — which is exactly the situation on a Vercel builder — it leaves
 * the committed copy alone rather than failing the build.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = `${here}/../../data/candidates.json`;
const target = `${here}/../src/data/candidates.json`;

if (!existsSync(source)) {
  console.log('[sync-data] /data not reachable — using the committed copy.');
  process.exit(0);
}

const incoming = readFileSync(source, 'utf8');
const current = existsSync(target) ? readFileSync(target, 'utf8') : null;

if (incoming === current) {
  console.log('[sync-data] client copy already matches /data.');
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, incoming);
console.log('[sync-data] refreshed client copy from /data.');

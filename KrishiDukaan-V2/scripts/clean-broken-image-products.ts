/**
 * Finds products whose image URL is a relative path that returns 404 on
 * Firebase Hosting, then lists them for review. Pass --delete to actually
 * remove them.
 *
 * Run (dry-run first):
 *   npx tsx scripts/clean-broken-image-products.ts
 *
 * Run (delete confirmed broken):
 *   npx tsx scripts/clean-broken-image-products.ts --delete
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PROJECT = 'krishidukan-e8315';
const WEB_BASE = `https://${PROJECT}.web.app`;
const DB_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const DELETE_MODE = process.argv.includes('--delete');

// ── Token ─────────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const fbToolsPaths = [
    join(
      process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
      'npm', 'node_modules', 'firebase-tools', 'lib', 'auth',
    ),
  ];
  for (const p of fbToolsPaths) {
    try {
      const auth = require(p) as {
        getGlobalDefaultAccount: () => null | {
          tokens: { access_token?: string };
        };
      };
      const tok = auth.getGlobalDefaultAccount()?.tokens?.access_token;
      if (tok) { console.log('Using firebase-tools access token.'); return tok; }
    } catch { /* next */ }
  }
  throw new Error('No credentials. Run `firebase login --reauth` first.');
}

// ── Firestore REST ────────────────────────────────────────────────────────────

async function firestoreList(token: string) {
  const results: Array<{ name: string; fields: Record<string, unknown> }> = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${DB_BASE}/products`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`List failed: ${r.status} ${await r.text()}`);
    const page = await r.json() as {
      documents?: Array<{ name: string; fields: Record<string, unknown> }>;
      nextPageToken?: string;
    };
    results.push(...(page.documents ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return results;
}

async function firestoreDelete(token: string, docName: string) {
  const r = await fetch(`https://firestore.googleapis.com/v1/${docName}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 404)
    throw new Error(`DELETE failed: ${r.status} ${await r.text()}`);
}

// ── Image extraction ──────────────────────────────────────────────────────────

const IMAGE_FIELDS = [
  'image', 'img', 'imageUrl', 'imageURL', 'image_url',
  'photoUrl', 'photoURL', 'photo', 'thumbnail', 'thumb', 'coverUrl', 'cover',
];

type FVal = { stringValue?: string; arrayValue?: { values?: FVal[] } };

function extractString(v: unknown): string | undefined {
  if (v && typeof v === 'object' && 'stringValue' in v)
    return (v as FVal).stringValue;
  return undefined;
}

function pickImageUrl(fields: Record<string, unknown>): string {
  for (const key of IMAGE_FIELDS) {
    const s = extractString(fields[key]);
    if (s && s.trim().length > 0) return s.trim();
  }
  for (const key of ['images', 'photos', 'gallery']) {
    const v = fields[key];
    if (v && typeof v === 'object' && 'arrayValue' in v) {
      const arr = (v as FVal).arrayValue?.values ?? [];
      const first = extractString(arr[0]);
      if (first) return first;
    }
  }
  return '';
}

// ── URL check ────────────────────────────────────────────────────────────────

const BROKEN_CACHE = new Map<string, boolean>();

async function isImageBroken(raw: string): Promise<boolean> {
  if (BROKEN_CACHE.has(raw)) return BROKEN_CACHE.get(raw)!;

  // Build the full URL — decode first so already-encoded segments (e.g. %20)
  // aren't double-encoded to %2520.
  let url: string;
  if (raw.startsWith('/')) {
    const encoded = raw.split('/').map(s => encodeURIComponent(decodeURIComponent(s))).join('/');
    url = `${WEB_BASE}${encoded}`;
  } else {
    url = raw;
  }

  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const broken = r.status === 404 || r.status === 403;
    BROKEN_CACHE.set(raw, broken);
    return broken;
  } catch {
    BROKEN_CACHE.set(raw, true);
    return true;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const token = await getAccessToken();

  console.log('Fetching all products…');
  const docs = await firestoreList(token);
  console.log(`Total: ${docs.length}`);

  console.log('Checking image URLs (this may take a minute)…\n');

  const broken: Array<{ name: string; id: string; label: string; url: string }> = [];

  for (const doc of docs) {
    const fields = doc.fields as Record<string, unknown>;
    const raw = pickImageUrl(fields);
    if (!raw) continue; // already handled by previous cleanup

    const id = doc.name.split('/').pop() ?? doc.name;
    const productName = extractString(fields['name']) ?? '(no name)';

    const bad = await isImageBroken(raw);
    if (bad) {
      broken.push({ name: doc.name, id, label: `${id}  "${productName}"`, url: raw });
      console.log(`  ✗ broken: ${id}  "${productName}"\n         URL: ${raw}`);
    }
  }

  if (broken.length === 0) {
    console.log('\nAll product images resolve correctly!');
    process.exit(0);
  }

  console.log(`\n${broken.length} product(s) with broken image URLs.`);

  if (!DELETE_MODE) {
    console.log('\nRun with --delete to remove them:');
    console.log('  npx tsx scripts/clean-broken-image-products.ts --delete');
    process.exit(0);
  }

  console.log('\nDeleting…');
  let deleted = 0, failed = 0;
  for (const { name, label } of broken) {
    try {
      await firestoreDelete(token, name);
      console.log(`  ✓ deleted: ${label}`);
      deleted++;
    } catch (e) {
      console.warn(`  ✗ failed: ${label}  ${(e as Error).message}`);
      failed++;
    }
  }
  console.log(`\nDone. Deleted: ${deleted}  Failed: ${failed}`);
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });

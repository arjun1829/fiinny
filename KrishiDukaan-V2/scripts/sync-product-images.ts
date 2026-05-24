/**
 * Matches every Firestore product to a local image file in
 *   public/product-images/Product_Images/
 * and patches the `image` field with the correct Firebase Hosting path.
 *
 * Run (dry-run — shows what will be updated):
 *   npx tsx scripts/sync-product-images.ts
 *
 * Run (apply changes):
 *   npx tsx scripts/sync-product-images.ts --apply
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PROJECT = 'krishidukan-e8315';
const DB_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const IMAGE_DIR = join('C:', 'lifemap', 'KrishiDukaan-V2', 'public', 'product-images', 'Product_Images');
const IMAGE_BASE = '/product-images/Product_Images';
const APPLY = process.argv.includes('--apply');

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const p = join(
    process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
    'npm', 'node_modules', 'firebase-tools', 'lib', 'auth',
  );
  const auth = require(p) as {
    getGlobalDefaultAccount: () => null | { tokens: { access_token?: string } };
  };
  const tok = auth.getGlobalDefaultAccount()?.tokens?.access_token;
  if (!tok) throw new Error('Run `firebase login --reauth` first.');
  return tok;
}

// ── Firestore REST ────────────────────────────────────────────────────────────

type FDoc = { name: string; fields: Record<string, unknown> };

async function listAll(token: string): Promise<FDoc[]> {
  const docs: FDoc[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${DB_BASE}/products`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`List: ${r.status} ${await r.text()}`);
    const p = await r.json() as { documents?: FDoc[]; nextPageToken?: string };
    docs.push(...(p.documents ?? []));
    pageToken = p.nextPageToken;
  } while (pageToken);
  return docs;
}

async function patchImage(token: string, docName: string, imagePath: string) {
  const url = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=image`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { image: { stringValue: imagePath } } }),
  });
  if (!r.ok) throw new Error(`PATCH ${docName}: ${r.status} ${await r.text()}`);
}

// ── Matching ──────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return (v && typeof v === 'object' && 'stringValue' in v)
    ? (v as { stringValue: string }).stringValue
    : '';
}

/** Collapse punctuation/case for fuzzy comparison. */
function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[,\-:\.%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip ALL non-alphanumeric chars — "NPK 15:15:15" → "npk151515". */
function compactKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

type ImageMap = Map<string, { file: string; norm: string; compact: string }>;

/** Build lookup keyed by normalised stem. */
function buildImageMap(): ImageMap {
  const files = readdirSync(IMAGE_DIR);
  const map: ImageMap = new Map();
  for (const f of files) {
    const stem = f.replace(/\.[^.]+$/, '');
    const norm = normKey(stem);
    map.set(norm, { file: f, norm, compact: compactKey(stem) });
  }
  return map;
}

/**
 * Returns the matching filename (with extension) or null.
 * Priority (most specific → least):
 *   1. Exact normalised match
 *   2. Compact key (strips ALL punctuation/spaces) — handles "NPK 15:15:15" ↔ "NPK 151515"
 *   3. Prefix/suffix match (longer keys first, to prefer specific over generic)
 *   4. All words in file key appear in product key
 */
function matchImage(productName: string, map: ImageMap): string | null {
  const kp = normKey(productName);
  const cp = compactKey(productName);

  // 1. Exact
  if (map.has(kp)) return map.get(kp)!.file;

  // 2. Compact key (removes all punctuation — best for NPK ratios, numbered products)
  for (const v of Array.from(map.values())) {
    if (v.compact === cp && cp.length >= 4) return v.file;
  }

  // Sort by norm-key length desc so longer/more-specific keys are preferred.
  const sorted = Array.from(map.values()).sort((a, b) => b.norm.length - a.norm.length);

  // 3. Prefix match (product name starts with file name, e.g. size suffix present)
  for (const v of sorted) {
    if (kp === v.norm) return v.file;
    if (kp.startsWith(v.norm + ' ') || v.norm.startsWith(kp + ' ')) return v.file;
  }

  // 4. All words of the file key appear in the product key
  for (const v of sorted) {
    const words = v.norm.split(' ').filter(Boolean);
    if (words.length >= 2 && words.every(w => kp.includes(w))) return v.file;
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const token = await getToken();
  const imageMap = buildImageMap();
  console.log(`Local images available: ${imageMap.size}`);

  const docs = await listAll(token);
  console.log(`Firestore products: ${docs.length}\n`);

  const rows: Array<{ docName: string; id: string; name: string; file: string; currentImage: string }> = [];
  const unmatched: string[] = [];

  for (const doc of docs) {
    const name = str(doc.fields['name']);
    const currentImage = str(doc.fields['image']);
    const id = doc.name.split('/').pop() ?? '';
    const file = matchImage(name, imageMap);

    if (!file) {
      unmatched.push(`  ✗ no match: "${name}"`);
    } else {
      rows.push({ docName: doc.name, id, name, file, currentImage });
    }
  }

  // Print plan
  for (const { id, name, file, currentImage } of rows) {
    // Build the path we WILL set (encode just the filename part)
    const targetPath = `${IMAGE_BASE}/${encodeURIComponent(file)}`;
    const already = currentImage === targetPath;
    const indicator = already ? '─' : '✓';
    console.log(`${indicator}  "${name}"`);
    if (!already) {
      console.log(`   was: ${currentImage || '(empty)'}`);
      console.log(`   now: ${targetPath}`);
    }
  }

  if (unmatched.length) {
    console.log('\nUnmatched products (no local image found):');
    unmatched.forEach(u => console.log(u));
  }

  // Count how many actually need updating
  const toUpdate = rows.filter(({ file, currentImage }) => {
    const targetPath = `${IMAGE_BASE}/${encodeURIComponent(file)}`;
    return currentImage !== targetPath;
  });

  console.log(`\n${toUpdate.length} product(s) need image update. ${rows.length - toUpdate.length} already correct.`);

  if (!APPLY) {
    console.log('\nDry-run. Run with --apply to write changes:');
    console.log('  npx tsx scripts/sync-product-images.ts --apply');
    return;
  }

  console.log('\nApplying…');
  let ok = 0, fail = 0;
  for (const { docName, name, file } of toUpdate) {
    const targetPath = `${IMAGE_BASE}/${encodeURIComponent(file)}`;
    try {
      await patchImage(token, docName, targetPath);
      console.log(`  ✓ ${name} → ${file}`);
      ok++;
    } catch (e) {
      console.warn(`  ✗ ${name}: ${(e as Error).message}`);
      fail++;
    }
  }
  console.log(`\nDone. Updated: ${ok}  Failed: ${fail}`);
}

run().catch(e => { console.error(e); process.exit(1); });

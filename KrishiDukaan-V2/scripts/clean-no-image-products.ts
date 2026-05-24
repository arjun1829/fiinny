/**
 * Deletes every document in the `products` collection that has no usable
 * image field. Uses the Firestore REST API with the Firebase CLI's current
 * OAuth2 token — no service account needed.
 *
 * Prerequisites:
 *   firebase login --reauth   (must be done once in the terminal)
 *
 * Run:
 *   npx tsx scripts/clean-no-image-products.ts
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PROJECT = 'krishidukan-e8315';
const DB_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ── Token resolution ──────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  // 1. Try firebase-tools auth module (available after `firebase login`).
  try {
    const fbToolsPaths = [
      join(
        process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
        'npm', 'node_modules', 'firebase-tools', 'lib', 'auth',
      ),
      'firebase-tools/lib/auth',
    ];
    for (const p of fbToolsPaths) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const auth = require(p) as {
          getGlobalDefaultAccount: () => null | {
            tokens: { access_token?: string; refresh_token?: string };
          };
        };
        const account = auth.getGlobalDefaultAccount();
        if (account?.tokens?.access_token) {
          console.log('Using firebase-tools access token.');
          return account.tokens.access_token;
        }
      } catch { /* try next */ }
    }
  } catch { /* fall through */ }

  // 2. Refresh via Google OAuth2 using the ADC credential file written by
  //    `firebase login`.
  const appData =
    process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
  const credCandidates = [
    join(appData, 'firebase', 'arjun_tanpure_fiinny.com_application_default_credentials.json'),
    join(appData, 'firebase', 'application_default_credentials.json'),
    join(homedir(), '.config', 'firebase', 'application_default_credentials.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
  ].filter(Boolean);

  for (const credPath of credCandidates) {
    if (!existsSync(credPath)) continue;
    try {
      const cred = JSON.parse(
        require('fs').readFileSync(credPath, 'utf8'),
      ) as { refresh_token: string; client_id: string; client_secret: string };
      if (!cred.refresh_token) continue;

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: cred.refresh_token,
        client_id: cred.client_id,
        client_secret: cred.client_secret,
      });
      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const json = await resp.json() as { access_token?: string; error?: string };
      if (json.access_token) {
        console.log(`Refreshed token using ${credPath}`);
        return json.access_token;
      }
      console.warn('Token refresh failed:', json.error);
    } catch (e) {
      console.warn('Credential parse/refresh error:', (e as Error).message);
    }
  }

  throw new Error(
    'No valid credentials found.\n' +
    'Run:  firebase login --reauth\n' +
    'then retry this script.',
  );
}

// ── Firestore REST helpers ────────────────────────────────────────────────────

async function firestoreGet(
  token: string,
  path: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(`${DB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function firestoreDelete(token: string, docName: string): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/${docName}`;
  const r = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 404)
    throw new Error(`DELETE ${docName} → ${r.status} ${await r.text()}`);
}

// ── Image detection ───────────────────────────────────────────────────────────

const IMAGE_FIELDS = [
  'image', 'img', 'imageUrl', 'imageURL', 'image_url',
  'photoUrl', 'photoURL', 'photo', 'thumbnail', 'thumb',
  'coverUrl', 'cover',
];

type FirestoreValue =
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } }
  | object;

function extractString(val: FirestoreValue | undefined): string | undefined {
  if (!val) return undefined;
  if ('stringValue' in val) return (val as { stringValue: string }).stringValue;
  return undefined;
}

function hasImage(fields: Record<string, FirestoreValue>): boolean {
  for (const key of IMAGE_FIELDS) {
    const s = extractString(fields[key]);
    if (s && s.trim().length > 0) return true;
  }
  for (const listKey of ['images', 'photos', 'gallery']) {
    const v = fields[listKey];
    if (v && 'arrayValue' in v) {
      const arr = (v as { arrayValue: { values?: FirestoreValue[] } }).arrayValue.values;
      if (arr && arr.length > 0) return true;
    }
  }
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const token = await getAccessToken();

  console.log('Fetching all products…');
  const toDelete: { name: string; label: string }[] = [];
  let pageToken: string | undefined;
  let total = 0;

  // Paginate through all products (default page size 300).
  do {
    const params: Record<string, string> = { pageSize: '300' };
    if (pageToken) params.pageToken = pageToken;
    const page = await firestoreGet(token, '/products', params) as {
      documents?: Array<{ name: string; fields: Record<string, FirestoreValue> }>;
      nextPageToken?: string;
    };

    const docs = page.documents ?? [];
    total += docs.length;
    for (const doc of docs) {
      if (!hasImage(doc.fields ?? {})) {
        const id = doc.name.split('/').pop() ?? doc.name;
        const name = extractString((doc.fields ?? {})['name']) ?? '(no name)';
        toDelete.push({ name: doc.name, label: `${id}  "${name}"` });
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  console.log(`Total products fetched: ${total}`);

  if (toDelete.length === 0) {
    console.log('No products without images found. Database is already clean!');
    process.exit(0);
  }

  console.log(`\nFound ${toDelete.length} product(s) without images:`);
  toDelete.forEach(({ label }) => console.log(`  ${label}`));
  console.log('\nDeleting…');

  let deleted = 0;
  let failed = 0;
  for (const { name, label } of toDelete) {
    try {
      await firestoreDelete(token, name);
      console.log(`  ✓ deleted: ${label}`);
      deleted++;
    } catch (e: unknown) {
      console.warn(`  ✗ failed: ${label}  ${(e as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone. Deleted: ${deleted}  Failed: ${failed}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

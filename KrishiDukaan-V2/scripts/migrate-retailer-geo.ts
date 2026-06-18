/**
 * One-time migration: backfill geo (GeoPoint) + googleMapsUrl on retailer docs
 * from a CSV where the previous import lost coordinates due to smart-quote wrapping.
 *
 * Uses the Firestore REST API with the Firebase CLI's stored OAuth2 token —
 * no service account key file needed. Run `firebase login --reauth` first if
 * you get an authentication error.
 *
 * Usage:
 *   DRY_RUN=true  → npx tsx scripts/migrate-retailer-geo.ts   (preview, no writes)
 *   DRY_RUN=false → npx tsx scripts/migrate-retailer-geo.ts   (live writes)
 *
 * Safety:
 *   - Only updates docs that are MISSING a valid geo field.
 *   - Never touches the phone field.
 *   - Only writes to retailers/ — no other collections.
 */

import * as fs   from 'fs';
import * as path from 'path';
import { homedir } from 'os';

// ─────────────────────────────────────────────────────────────────────────────
//  RUN CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const DRY_RUN    = false;  // true = preview only, no Firestore writes
const TEST_LIMIT = 0;      // 0 = all rows; N = stop after N successful writes

const CSV_FILE  = path.join(__dirname, 'script - Sheet1.csv');
const PROJECT   = 'krishidukan-e8315';
const DB_BASE   = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ─────────────────────────────────────────────────────────────────────────────
//  Firebase CLI token — reads from ~/.config/configstore/firebase-tools.json
//  then refreshes via Google OAuth2 if needed.
// ─────────────────────────────────────────────────────────────────────────────

const FIREBASE_CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

async function getAccessToken(): Promise<string> {
  const configPath = path.join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Firebase CLI config not found at ${configPath}.\nRun: firebase login`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    tokens?: {
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
    };
  };

  const tokens = config.tokens ?? {};

  // Return existing access token if it hasn't expired yet (with 60s buffer)
  if (tokens.access_token && tokens.expires_at && Date.now() < tokens.expires_at - 60_000) {
    return tokens.access_token;
  }

  // Refresh using the stored refresh token
  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    throw new Error('No refresh_token in firebase-tools config.\nRun: firebase login --reauth');
  }

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     FIREBASE_CLIENT_ID,
    client_secret: FIREBASE_CLIENT_SECRET,
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  const json = await resp.json() as {
    access_token?: string;
    expires_in?:   number;
    error?:        string;
    error_description?: string;
  };

  if (!json.access_token) {
    throw new Error(
      `Token refresh failed: ${json.error} — ${json.error_description}\n` +
      'Run: firebase login --reauth',
    );
  }

  return json.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Firestore REST helpers
// ─────────────────────────────────────────────────────────────────────────────

type FsValue =
  | { stringValue: string }
  | { geoPointValue: { latitude: number; longitude: number } }
  | { nullValue: null }
  | { timestampValue: string }
  | { mapValue: { fields: Record<string, FsValue> } };

type FsDoc = {
  name:   string;
  fields: Record<string, FsValue>;
};

async function fsGet(token: string, docPath: string): Promise<FsDoc | null> {
  const url = `${DB_BASE}/${docPath}`;
  const r   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${docPath} → ${r.status}: ${await r.text()}`);
  return r.json() as Promise<FsDoc>;
}

/** Query a collection for docs where fieldPath == value. Returns up to `limit` docs. */
async function fsQuery(
  token:     string,
  colPath:   string,
  fieldPath: string,
  value:     string,
  limitN     = 2,
): Promise<FsDoc[]> {
  const url = `${DB_BASE}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: colPath }],
      where: {
        fieldFilter: {
          field: { fieldPath },
          op:    'EQUAL',
          value: { stringValue: value },
        },
      },
      limit: limitN,
    },
  };
  const r = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`runQuery ${colPath}[${fieldPath}==${value}] → ${r.status}: ${await r.text()}`);
  const rows = await r.json() as Array<{ document?: FsDoc }>;
  return rows.flatMap(row => row.document ? [row.document] : []);
}

/** PATCH (merge) specific fields onto an existing doc. */
async function fsPatch(
  token:      string,
  docPath:    string,
  fields:     Record<string, FsValue>,
  fieldMask:  string[],
): Promise<void> {
  const maskParams = fieldMask.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const url = `${DB_BASE}/${docPath}?${maskParams}`;
  const r   = await fetch(url, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`PATCH ${docPath} → ${r.status}: ${await r.text()}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toE164India(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10)                              return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91'))  return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0'))   return `+91${digits.slice(1)}`;
  if (digits.length === 13 && digits.startsWith('091')) return `+91${digits.slice(3)}`;
  return raw.trim();
}

function cleanUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^["""''＂]+/, '')
    .replace(/["""''＂]+$/, '')
    .trim();
}

function parseCoords(url: string): { lat: number; lng: number } | null {
  try {
    const u = new URL(url);
    const q = u.searchParams.get('q');
    if (q) {
      const m = q.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
      if (m) return { lat: parseFloat(m[1]!), lng: parseFloat(m[2]!) };
    }
  } catch { /* invalid URL */ }
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: parseFloat(at[1]!), lng: parseFloat(at[2]!) };
  const ll = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (ll) return { lat: parseFloat(ll[1]!), lng: parseFloat(ll[2]!) };
  return null;
}

/** True when the doc already has a valid non-zero GeoPoint in the geo field. */
function hasValidGeo(fields: Record<string, FsValue>): boolean {
  const g = fields['geo'];
  if (!g) return false;
  if ('geoPointValue' in g) {
    const { latitude, longitude } = (g as { geoPointValue: { latitude: number; longitude: number } }).geoPointValue;
    return typeof latitude === 'number' && typeof longitude === 'number' && (latitude !== 0 || longitude !== 0);
  }
  return false;
}

function describeGeo(fields: Record<string, FsValue>): string {
  const g = fields['geo'];
  if (g && 'geoPointValue' in g) {
    const gp = (g as { geoPointValue: { latitude: number; longitude: number } }).geoPointValue;
    return `(${gp.latitude.toFixed(5)}, ${gp.longitude.toFixed(5)})`;
  }
  return '(no geo)';
}

// ─────────────────────────────────────────────────────────────────────────────
//  CSV parser
// ─────────────────────────────────────────────────────────────────────────────

interface CsvRow { phone: string; mapsUrl: string }

function parseCSVRows(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const fi = t.indexOf(',');
    if (fi < 0) continue;
    const rawPhone = t.slice(0, fi).trim();
    const rawUrl   = t.slice(fi + 1).trim();
    if (/^(phone|phonenumber)$/i.test(rawPhone)) continue;
    if (!rawPhone || !rawUrl) continue;
    rows.push({ phone: rawPhone, mapsUrl: cleanUrl(rawUrl) });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Retailer doc lookup — direct by E164 ID, then 10-digit, then phone field query
// ─────────────────────────────────────────────────────────────────────────────

interface FoundDoc { id: string; fields: Record<string, FsValue> }

async function findRetailerDoc(token: string, e164Phone: string): Promise<FoundDoc | null> {
  const shortPhone = e164Phone.replace('+91', '');

  // 1. Direct: retailers/{+91XXXXXXXXXX}
  const e164Doc = await fsGet(token, `retailers/${encodeURIComponent(e164Phone)}`);
  if (e164Doc) return { id: e164Phone, fields: e164Doc.fields ?? {} };

  // 2. Direct: retailers/{XXXXXXXXXX} (10-digit legacy key)
  const shortDoc = await fsGet(token, `retailers/${shortPhone}`);
  if (shortDoc) return { id: shortPhone, fields: shortDoc.fields ?? {} };

  // 3. Query by phone field (handles UID-keyed docs)
  const byE164  = await fsQuery(token, 'retailers', 'phone', e164Phone);
  if (byE164.length > 0) {
    const d = byE164[0]!;
    return { id: d.name.split('/').pop()!, fields: d.fields ?? {} };
  }
  const byShort = await fsQuery(token, 'retailers', 'phone', shortPhone);
  if (byShort.length > 0) {
    const d = byShort[0]!;
    return { id: d.name.split('/').pop()!, fields: d.fields ?? {} };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Retailer geo migration');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  DRY_RUN    = ${DRY_RUN}${DRY_RUN ? '  (no writes)' : '  ⚠️  LIVE WRITES'}`);
  console.log(`  TEST_LIMIT = ${TEST_LIMIT || 'all rows'}`);
  console.log(`  CSV        = ${CSV_FILE}`);
  console.log('───────────────────────────────────────────────────\n');

  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌  CSV not found: ${CSV_FILE}`);
    process.exit(1);
  }

  console.log('🔑  Obtaining Firebase access token…');
  const token = await getAccessToken();
  console.log('✅  Token obtained.\n');

  const rows = parseCSVRows(fs.readFileSync(CSV_FILE, 'utf8'));
  console.log(`📄  ${rows.length} data rows parsed from CSV\n`);

  let processed = 0;
  let written   = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const row of rows) {
    const e164 = toE164India(row.phone);
    const num  = String(processed + 1).padStart(2, ' ');

    if (!/^\+91\d{10}$/.test(e164)) {
      console.log(`  [${num}] ⚠️  "${row.phone}" → "${e164}" not a valid Indian mobile — skip`);
      skipped++;
      continue;
    }

    const coords = parseCoords(row.mapsUrl);
    if (!coords) {
      console.log(`  [${num}] ⚠️  ${e164} — cannot parse coords from URL: "${row.mapsUrl}" — skip`);
      skipped++;
      continue;
    }

    processed++;

    const retailer = await findRetailerDoc(token, e164);
    if (!retailer) {
      console.log(`  [${num}] ❌  ${e164} — retailer doc NOT found — skip`);
      skipped++;
      continue;
    }

    if (hasValidGeo(retailer.fields)) {
      console.log(`  [${num}] ⏭️  ${e164} (doc: ${retailer.id}) — already has geo ${describeGeo(retailer.fields)} — skip`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `  [${num}] 🔍  DRY RUN — retailers/${retailer.id}` +
        ` → geo=(${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
      );
      written++;
    } else {
      try {
        const now = new Date().toISOString();
        await fsPatch(
          token,
          `retailers/${encodeURIComponent(retailer.id)}`,
          {
            geo:           { geoPointValue: { latitude: coords.lat, longitude: coords.lng } },
            googleMapsUrl: { stringValue: row.mapsUrl },
            updatedAt:     { timestampValue: now },
          },
          ['geo', 'googleMapsUrl', 'updatedAt'],
        );
        console.log(
          `  [${num}] ✅  retailers/${retailer.id}` +
          ` → geo=(${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
        );
        written++;
      } catch (err) {
        console.log(
          `  [${num}] ❌  retailers/${retailer.id} — write failed: ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );
        failed++;
      }
    }

    if (TEST_LIMIT > 0 && written >= TEST_LIMIT) {
      console.log(`\n  ⚙️  TEST_LIMIT=${TEST_LIMIT} reached — stopping early.\n`);
      break;
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('───────────────────────────────────────────────────');
  console.log(`  Total rows in CSV : ${rows.length}`);
  console.log(`  Firestore reads   : ${processed}`);
  console.log(`  ${DRY_RUN ? 'Would update  ' : 'Updated       '} : ${written}`);
  console.log(`  Skipped           : ${skipped}`);
  console.log(`  Failed            : ${failed}`);
  if (DRY_RUN) console.log('\n  ⚠️  DRY_RUN=true — no changes were made.');
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌  Fatal:', err.message ?? err);
  process.exit(1);
});

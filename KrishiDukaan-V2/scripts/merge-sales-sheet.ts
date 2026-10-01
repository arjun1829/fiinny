/**
 * Merge Sales Sheet enrichment into dealer-recovery-earliest.csv — NO Firestore writes.
 * ────────────────────────────────────────────────────────────────────────────
 * Fills ownerName / phone / address / type on the recovered dealer rows from the
 * hand-maintained sales sheet, and sets active=true for every recovered dealer.
 *
 * Matching: the target rows have NO ownerName/phone (they were unrecoverable from
 * dealerVisits), so the only shared key is Shop Name. We match on a normalized
 * shop name (lowercased, punctuation/space-collapsed). A short, explicit alias map
 * covers confirmed spelling variants; everything else must match exactly or is
 * reported as unmatched — we never fuzzy-guess silently.
 *
 * Preserves dealerId, geo, createdBy, createdAt (and existing non-empty values).
 * Usage: npx tsx scripts/merge-sales-sheet.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const OUT = path.join(__dirname, 'out');
const SHEET = path.join(OUT, 'sales  - Sheet1.csv');
const TARGET = path.join(OUT, 'dealer-recovery-earliest.csv');

// Confirmed spelling variants: normalized sheet name -> normalized target name.
const ALIASES: Record<string, string> = {
  'darade fertilizer': 'darade fartilizer', // same shop (Manmad); target keeps its own spelling
};

// ── tiny CSV parser (handles quoted fields with commas) ──────────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c === '\r') { /* skip */ }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

function csvCell(s: string): string {
  const v = s ?? '';
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function norm(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim().replace(/\s+/g, ' ');
}

// ── load ─────────────────────────────────────────────────────────────────────
const sheetRows = parseCsv(fs.readFileSync(SHEET, 'utf8'));
const sheetHeader = sheetRows[0];
// S.No.,Shop Name,Owner Name,Type,Phone Number,Area / Address
const si = {
  shop: sheetHeader.indexOf('Shop Name'),
  owner: sheetHeader.indexOf('Owner Name'),
  type: sheetHeader.indexOf('Type'),
  phone: sheetHeader.indexOf('Phone Number'),
  addr: sheetHeader.indexOf('Area / Address'),
};

type SheetRec = { shop: string; owner: string; type: string; phone: string; addr: string; normShop: string };
const sheet: SheetRec[] = sheetRows.slice(1).map((r) => ({
  shop: r[si.shop] ?? '', owner: r[si.owner] ?? '', type: r[si.type] ?? '',
  phone: r[si.phone] ?? '', addr: r[si.addr] ?? '', normShop: norm(r[si.shop] ?? ''),
}));

// Index sheet by normalized shop name; detect duplicate shop names within the sheet.
const sheetByShop = new Map<string, SheetRec[]>();
for (const s of sheet) {
  if (!sheetByShop.has(s.normShop)) sheetByShop.set(s.normShop, []);
  sheetByShop.get(s.normShop)!.push(s);
}

// Detect duplicate phone numbers across different shops in the sheet.
const phoneToShops = new Map<string, Set<string>>();
for (const s of sheet) {
  const p = s.phone.replace(/\D/g, '');
  if (!p) continue;
  if (!phoneToShops.has(p)) phoneToShops.set(p, new Set());
  phoneToShops.get(p)!.add(s.shop);
}
const dupPhones = [...phoneToShops.entries()].filter(([, shops]) => shops.size > 1);

// ── target ─────────────────────────────────────────────────────────────────
const tgtRows = parseCsv(fs.readFileSync(TARGET, 'utf8'));
const tgtHeader = tgtRows[0];
const col = (name: string) => tgtHeader.indexOf(name);
const c = {
  dealerId: col('dealerId'), shopName: col('shopName'), ownerName: col('ownerName'),
  phone: col('phone'), address: col('address'), geo: col('geo'), active: col('active'),
  type: col('type'), createdBy: col('createdBy'), createdAt: col('createdAt'), updatedAt: col('updatedAt'),
};

const matchedSheetShops = new Set<string>();
const matchedTargets: { shop: string; via: string }[] = [];
const unmatchedTargets: string[] = [];
const conflicts: string[] = [];

const outRows = tgtRows.slice(1).map((r) => {
  const row = [...r];
  row[c.active] = 'true'; // set active=true for every recovered dealer

  const normTgt = norm(row[c.shopName]);
  // exact normalized match, or via alias (sheetNorm -> targetNorm)
  let matches = sheetByShop.get(normTgt) ?? [];
  let via = matches.length ? 'exact' : '';
  if (!matches.length) {
    for (const [sheetNorm, targetNorm] of Object.entries(ALIASES)) {
      if (targetNorm === normTgt && sheetByShop.has(sheetNorm)) {
        matches = sheetByShop.get(sheetNorm)!; via = `alias(${sheetNorm})`; break;
      }
    }
  }

  if (!matches.length) { unmatchedTargets.push(row[c.shopName]); return row; }
  if (matches.length > 1) {
    conflicts.push(`AMBIGUOUS target "${row[c.shopName]}" matched ${matches.length} sheet rows: ${matches.map((m) => `${m.owner}/${m.phone}`).join(' , ')} — left unfilled`);
    return row;
  }

  const m = matches[0];
  matchedSheetShops.add(m.normShop);
  matchedTargets.push({ shop: row[c.shopName], via });

  // fill only when target is empty (never overwrite an existing non-empty value)
  const fill = (idx: number, val: string) => {
    if (val && val.trim() && !(row[idx] && row[idx].trim())) row[idx] = val.trim();
  };
  fill(c.ownerName, m.owner);
  fill(c.phone, m.phone);
  fill(c.address, m.addr);
  fill(c.type, m.type);
  return row;
});

const unmatchedSheet = sheet.filter((s) => !matchedSheetShops.has(s.normShop));

// ── write (backup first) ─────────────────────────────────────────────────────
fs.copyFileSync(TARGET, TARGET.replace(/\.csv$/, `.bak-${Date.now()}.csv`));
const outCsv = [tgtHeader, ...outRows].map((r) => r.map(csvCell).join(',')).join('\n');
fs.writeFileSync(TARGET, outCsv);

// ── report ─────────────────────────────────────────────────────────────────
const line = '═'.repeat(70);
console.log(`\n${line}\n  SALES SHEET → DEALER RECOVERY MERGE  (no Firestore writes)\n${line}`);
console.log(`  Target dealer rows      : ${outRows.length}`);
console.log(`  Sheet rows              : ${sheet.length}`);
console.log(`  Matched (filled)        : ${matchedTargets.length}`);
console.log(`  Unmatched target rows   : ${unmatchedTargets.length}`);
console.log(`  Unmatched sheet rows    : ${unmatchedSheet.length}`);
console.log(`  Ambiguous/conflict rows : ${conflicts.length}`);
console.log(`  active=true set on ALL  : ${outRows.length} rows`);

console.log(`\n  MATCHED (${matchedTargets.length}):`);
for (const m of matchedTargets) console.log(`    ✓ ${m.shop}${m.via !== 'exact' ? `   [${m.via}]` : ''}`);

console.log(`\n  UNMATCHED TARGET dealers (no sheet enrichment — owner/phone/address/type stay blank):`);
for (const u of unmatchedTargets) console.log(`    · ${u}`);

console.log(`\n  UNMATCHED SHEET rows (not present in recovery set — NOT added):`);
for (const s of unmatchedSheet) console.log(`    · ${s.shop}  (${s.owner} / ${s.phone})`);

if (conflicts.length) {
  console.log(`\n  AMBIGUOUS MATCHES (left unfilled for manual review):`);
  for (const x of conflicts) console.log(`    ! ${x}`);
}

if (dupPhones.length) {
  console.log(`\n  DUPLICATE PHONE across different sheet shops (verify before restore):`);
  for (const [p, shops] of dupPhones) console.log(`    ⚠ ${p} → ${[...shops].join(' , ')}`);
}

console.log(`\n  Updated CSV : ${TARGET}`);
console.log(`  Backup      : ${TARGET.replace(/\.csv$/, '.bak-<ts>.csv')}\n`);

import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  ReportCategory,
  cityGeoCollection,
  cityGeoDoc,
  monthDoc,
  monthRowsCollection,
  monthsCollection,
  type MonthKey,
} from './analyticsPaths';
import {
  computeTotals,
  monthKeyToLabel,
  slugifyCity,
  type DemographicRow,
  type MonthTotals,
} from './demographics';

export const SCHEMA_VERSION = 1;

/** Firestore writes/deletes are capped at 500 ops per batch; stay under it. */
const BATCH_LIMIT = 450;

/** Month doc metadata as read back for the dashboard nav + trends. */
export interface MonthSummary {
  month: MonthKey;
  label: string;
  rowCount: number;
  totals: MonthTotals;
  uploadedByEmail: string | null;
  uploadedAt: Timestamp | null;
}

export interface ImportInput {
  category: ReportCategory;
  month: MonthKey;
  rows: DemographicRow[];
  uploadedBy: { uid: string; email: string | null };
  filename: string;
  /** When true, delete any pre-existing rows for the month before writing. */
  replace: boolean;
}

/** Does a month report already exist? Used to drive the replace confirmation. */
export async function monthExists(
  category: ReportCategory,
  month: MonthKey,
): Promise<boolean> {
  const snap = await getDoc(monthDoc(category, month));
  return snap.exists();
}

/** All uploaded months for a category, oldest first. */
export async function listMonthSummaries(
  category: ReportCategory,
): Promise<MonthSummary[]> {
  const snap = await getDocs(monthsCollection(category));
  const months = snap.docs.map((d) => {
    const data = d.data();
    return {
      month: d.id as MonthKey,
      label: (data.label as string) ?? monthKeyToLabel(d.id),
      rowCount: (data.rowCount as number) ?? 0,
      totals: data.totals as MonthTotals,
      uploadedByEmail: (data.uploadedBy?.email as string) ?? null,
      uploadedAt: (data.uploadedAt as Timestamp) ?? null,
    } satisfies MonthSummary;
  });
  months.sort((a, b) => a.month.localeCompare(b.month));
  return months;
}

/** Every normalized city row for a month. */
export async function getMonthRows(
  category: ReportCategory,
  month: MonthKey,
): Promise<DemographicRow[]> {
  const snap = await getDocs(monthRowsCollection(category, month));
  return snap.docs.map((d) => d.data() as DemographicRow);
}

/** Stable, collision-free doc id per city within a month. */
function rowIdForCity(city: string, used: Set<string>): string {
  const base = slugifyCity(city);
  let id = base;
  let n = 1;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

async function deleteExistingRows(
  category: ReportCategory,
  month: MonthKey,
): Promise<void> {
  const snap = await getDocs(monthRowsCollection(category, month));
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) batch.delete(d.ref);
    await batch.commit();
  }
}

/**
 * Import (or replace) a month. Writes the month doc with computed totals, then
 * the normalized rows in batches. Re-importing with `replace` deletes stale rows
 * first so no duplicates or orphaned cities survive.
 */
export async function importMonth(input: ImportInput): Promise<void> {
  const { category, month, rows, uploadedBy, filename, replace } = input;

  if (replace) await deleteExistingRows(category, month);

  const totals = computeTotals(rows);

  await setDoc(monthDoc(category, month), {
    month,
    label: monthKeyToLabel(month),
    category,
    rowCount: rows.length,
    totals,
    source: { filename },
    uploadedBy: { uid: uploadedBy.uid, email: uploadedBy.email },
    uploadedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION,
  });

  const used = new Set<string>();
  for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const row of rows.slice(i, i + BATCH_LIMIT)) {
      const ref = monthRowsCollection(category, month);
      const id = rowIdForCity(row.city, used);
      batch.set(doc(ref, id), { ...row, month });
    }
    await batch.commit();
  }
}

/** Delete an entire month report (doc + rows). */
export async function deleteMonth(
  category: ReportCategory,
  month: MonthKey,
): Promise<void> {
  await deleteExistingRows(category, month);
  await deleteDoc(monthDoc(category, month));
}

// ── City coordinate cache ────────────────────────────────────────────────────
// Resolved city -> coordinates, persisted so a city is geocoded at most once
// (ever), not on every page load. Keyed by city slug.

export interface CityGeo {
  city: string;
  lat: number;
  lng: number;
  /** administrative_area_level_1 from Google, '' when unresolved. Optional for
   *  backward compatibility with docs cached before state support. */
  state?: string;
  country?: string;
  source: 'gazetteer' | 'geocode';
}

/** Load the full cached city->coords map for a category (one read). */
export async function getCityGeoCache(
  category: ReportCategory,
): Promise<Record<string, CityGeo>> {
  const snap = await getDocs(cityGeoCollection(category));
  const out: Record<string, CityGeo> = {};
  for (const d of snap.docs) out[d.id] = d.data() as CityGeo;
  return out;
}

/** Persist a resolved city coordinate so it is never geocoded again. */
export async function saveCityGeo(
  category: ReportCategory,
  geo: CityGeo,
): Promise<void> {
  await setDoc(cityGeoDoc(category, slugifyCity(geo.city)), {
    ...geo,
    resolvedAt: serverTimestamp(),
  });
}

import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Firestore namespace for KrishiDukan Analytics.
 *
 * Everything this app reads/writes lives under the single top-level `analytics`
 * document tree, kept fully separate from ERP / KrishiDukan business
 * collections. This app never touches any collection outside `analytics/**`.
 *
 * Layout:
 *
 *   analytics (collection)
 *     └─ demographicReports (doc)                  ← report category
 *          └─ months (collection)
 *               └─ {YYYY-MM} (doc)                 ← one monthly report
 *                    ├─ meta: month, label, rowCount, totals, uploadedAt,
 *                    │        uploadedBy, source, schemaVersion
 *                    └─ rows (collection)
 *                         └─ {citySlug} (doc)      ← one normalized CSV row
 *
 * Add sibling report categories (e.g. `acquisitionReports`, `engagementReports`)
 * as more Firebase Analytics CSV exports are onboarded — each follows the same
 * `{category}/months/{YYYY-MM}` shape.
 */

export const ANALYTICS_ROOT = 'analytics';

/** Report categories under the analytics root. Extend as new reports land. */
export const ReportCategory = {
  Demographic: 'demographicReports',
} as const;
export type ReportCategory =
  (typeof ReportCategory)[keyof typeof ReportCategory];

/** `YYYY-MM`, e.g. "2026-09". */
export type MonthKey = string;

/** Matches a `YYYY-MM` month key. */
export const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): value is MonthKey {
  return MONTH_KEY_RE.test(value);
}

/** analytics/{category} */
export function categoryDoc(category: ReportCategory): DocumentReference {
  return doc(db, ANALYTICS_ROOT, category);
}

/** analytics/{category}/months */
export function monthsCollection(
  category: ReportCategory,
): CollectionReference {
  return collection(categoryDoc(category), 'months');
}

/** analytics/{category}/months/{YYYY-MM} */
export function monthDoc(
  category: ReportCategory,
  month: MonthKey,
): DocumentReference {
  return doc(monthsCollection(category), month);
}

/** analytics/{category}/months/{YYYY-MM}/rows */
export function monthRowsCollection(
  category: ReportCategory,
  month: MonthKey,
): CollectionReference {
  return collection(monthDoc(category, month), 'rows');
}

/**
 * analytics/{category}/cityGeo — resolved city coordinates, cached across all
 * months so a given city is geocoded at most once (doc id = city slug).
 */
export function cityGeoCollection(category: ReportCategory): CollectionReference {
  return collection(categoryDoc(category), 'cityGeo');
}

/** analytics/{category}/cityGeo/{slug} */
export function cityGeoDoc(
  category: ReportCategory,
  slug: string,
): DocumentReference {
  return doc(cityGeoCollection(category), slug);
}

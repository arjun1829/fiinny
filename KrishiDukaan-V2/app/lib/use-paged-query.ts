"use client";

/**
 * Paged reads for tables and lists: a page of rows (50 by default), "Load more"
 * fetches the next page after the last doc, and changing the query (filters,
 * tab) starts again from the first page. Replaces whole-collection reads.
 *
 * `readAllDocs` is for the explicit "Export" buttons only: it pages through
 * every matching doc in chunks of 500.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDocs,
  limit,
  query,
  startAfter,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

export const ADMIN_PAGE_SIZE = 50;

export type PagedQuery<T> = {
  rows: T[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
  /** Replace or drop loaded rows after a write, without re-reading. */
  setRows: React.Dispatch<React.SetStateAction<T[]>>;
};

/**
 * `base` must be memoized by the caller (useMemo) and include its orderBy;
 * null means "nothing to load yet". `keep` filters rows the query can't
 * express; pages are still read 50 docs at a time.
 */
export function usePagedQuery<T>(
  base: Query<DocumentData> | null,
  map: (d: QueryDocumentSnapshot<DocumentData>) => T,
  opts: { pageSize?: number; keep?: (row: T) => boolean } = {},
): PagedQuery<T> {
  const pageSize = opts.pageSize ?? ADMIN_PAGE_SIZE;
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(base !== null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursor = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  // Ignores pages that arrive after the query changed.
  const generation = useRef(0);
  const mapRef = useRef(map);
  mapRef.current = map;
  const keepRef = useRef(opts.keep);
  keepRef.current = opts.keep;

  const fetchPage = useCallback(async (after: QueryDocumentSnapshot<DocumentData> | null) => {
    if (!base) return null;
    const snap = await getDocs(after ? query(base, startAfter(after), limit(pageSize)) : query(base, limit(pageSize)));
    const mapped = snap.docs.map((d) => mapRef.current(d));
    const keep = keepRef.current;
    return {
      rows: keep ? mapped.filter(keep) : mapped,
      last: snap.docs.length ? snap.docs[snap.docs.length - 1] : null,
      more: snap.docs.length === pageSize,
    };
  }, [base, pageSize]);

  const reload = useCallback(async () => {
    const gen = ++generation.current;
    cursor.current = null;
    setError(null);
    if (!base) {
      setRows([]);
      setHasMore(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const page = await fetchPage(null);
      if (gen !== generation.current || !page) return;
      setRows(page.rows);
      cursor.current = page.last;
      setHasMore(page.more);
    } catch (e) {
      if (gen !== generation.current) return;
      setRows([]);
      setHasMore(false);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [base, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!cursor.current || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursor.current);
      if (gen !== generation.current || !page) return;
      setRows((prev) => [...prev, ...page.rows]);
      cursor.current = page.last;
      setHasMore(page.more);
    } catch (e) {
      if (gen === generation.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, loadingMore]);

  useEffect(() => { void reload(); }, [reload]);

  return { rows, loading, loadingMore, hasMore, error, loadMore, reload, setRows };
}

/** Every doc matching `base`, 500 per read. For "Export" buttons only. */
export async function readAllDocs(base: Query<DocumentData>): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const out: QueryDocumentSnapshot<DocumentData>[] = [];
  let after: QueryDocumentSnapshot<DocumentData> | null = null;
  for (;;) {
    const snap = await getDocs(after ? query(base, startAfter(after), limit(500)) : query(base, limit(500)));
    out.push(...snap.docs);
    if (snap.docs.length < 500) return out;
    after = snap.docs[snap.docs.length - 1];
  }
}

/** Downloads rows as a CSV file (Excel-friendly, UTF-8 with BOM). */
export function downloadCsv(filename: string, header: string[], rows: unknown[][]): void {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

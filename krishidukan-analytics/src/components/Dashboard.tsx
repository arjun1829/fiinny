import { useCallback, useEffect, useMemo, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/useAuth';
import { ReportCategory } from '../lib/analyticsPaths';
import {
  getMonthRows,
  listMonthSummaries,
  type MonthSummary,
} from '../lib/analyticsRepo';
import {
  aggregateCitiesAcrossMonths,
  computeExactTotals,
  monthKeyToLabel,
  type DemographicRow,
  type MonthTotals,
} from '../lib/demographics';
import { MonthTabs, ALL_TIME } from './MonthTabs';
import { PeriodView } from './PeriodView';
import { Trends } from './Trends';
import { UploadModal } from './UploadModal';

const CATEGORY = ReportCategory.Demographic;

export function Dashboard() {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<MonthSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<string>(''); // ALL_TIME, a month key, or 'trends'
  const [rowsCache, setRowsCache] = useState<Record<string, DemographicRow[]>>({});
  const [showUpload, setShowUpload] = useState(false);

  // Default to All Time; otherwise keep a still-valid selection.
  const pickView = (list: MonthSummary[], prev: string, select?: string) => {
    if (select) return select;
    if (prev && (prev === ALL_TIME || prev === 'trends' || list.some((m) => m.month === prev))) {
      return prev;
    }
    return list.length ? ALL_TIME : '';
  };

  // Refresh handler (invoked after an import — not from an effect).
  const loadSummaries = useCallback(async (select?: string) => {
    try {
      const list = await listMonthSummaries(CATEGORY);
      setSummaries(list);
      setView((prev) => pickView(list, prev, select));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setSummaries([]);
    }
  }, []);

  // Initial load. setState happens only inside the async callback.
  useEffect(() => {
    let cancelled = false;
    listMonthSummaries(CATEGORY)
      .then((list) => {
        if (cancelled) return;
        setSummaries(list);
        setView((prev) => pickView(list, prev));
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setSummaries([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isAllTime = view === ALL_TIME;
  const isMonthView = view !== '' && view !== 'trends' && !isAllTime;

  // Lazily load rows for a single selected month.
  useEffect(() => {
    if (!isMonthView || rowsCache[view]) return;
    let cancelled = false;
    getMonthRows(CATEGORY, view)
      .then((rows) => !cancelled && setRowsCache((c) => ({ ...c, [view]: rows })))
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setRowsCache((c) => ({ ...c, [view]: [] }));
      });
    return () => {
      cancelled = true;
    };
  }, [view, isMonthView, rowsCache]);

  // For All Time, load every month's rows (missing ones only), then aggregate.
  useEffect(() => {
    if (!isAllTime || !summaries) return;
    const missing = summaries.filter((m) => !rowsCache[m.month]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((m) =>
        getMonthRows(CATEGORY, m.month)
          .then((rows) => [m.month, rows] as const)
          .catch(() => [m.month, [] as DemographicRow[]] as const),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setRowsCache((c) => {
        const next = { ...c };
        for (const [k, v] of entries) next[k] = v;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [isAllTime, summaries, rowsCache]);

  const selectedSummary = summaries?.find((m) => m.month === view);

  // Resolve the rows + totals for the active period.
  const period = useMemo<{
    label: string;
    meta: string | null;
    rows: DemographicRow[] | null;
    totals: MonthTotals | null;
  } | null>(() => {
    if (isAllTime && summaries) {
      if (!summaries.every((m) => rowsCache[m.month])) {
        return { label: 'All Time', meta: null, rows: null, totals: null };
      }
      const flat = summaries.flatMap((m) => rowsCache[m.month]);
      const rows = aggregateCitiesAcrossMonths(flat);
      const cities = rows.filter((r) => !r.isNotSet).length;
      return {
        label: 'All Time',
        meta: `${summaries.length} month(s) · ${cities} cities`,
        rows,
        totals: computeExactTotals(rows),
      };
    }
    if (isMonthView) {
      const rows = rowsCache[view] ?? null;
      return {
        label: monthKeyToLabel(view),
        meta: selectedSummary
          ? `${selectedSummary.rowCount} cities${
              selectedSummary.uploadedByEmail ? ` · uploaded by ${selectedSummary.uploadedByEmail}` : ''
            }`
          : null,
        rows,
        totals: selectedSummary?.totals ?? (rows ? computeExactTotals(rows) : null),
      };
    }
    return null;
  }, [isAllTime, isMonthView, summaries, rowsCache, view, selectedSummary]);

  const handleImported = (month: string) => {
    // Drop any cached rows for the replaced month, then refresh + select it.
    setRowsCache((c) => {
      const next = { ...c };
      delete next[month];
      return next;
    });
    void loadSummaries(month);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>KrishiDukan Analytics</h1>
          <span className="subtitle">Monthly demographic reports</span>
        </div>
        <div className="header-actions">
          <button className="primary" onClick={() => setShowUpload(true)}>
            Upload Monthly Report
          </button>
          <span className="user">{user?.email}</span>
          <button onClick={() => void signOut(auth)}>Sign out</button>
        </div>
      </header>

      {summaries === null ? (
        <div className="state">Loading reports…</div>
      ) : summaries.length === 0 ? (
        <div className="state empty-state">
          <h2>No reports yet</h2>
          <p>Upload your first monthly Firebase Analytics CSV to get started.</p>
          <button className="primary" onClick={() => setShowUpload(true)}>
            Upload Monthly Report
          </button>
          {loadError && <p className="error-text">{loadError}</p>}
        </div>
      ) : (
        <>
          <MonthTabs
            months={summaries}
            selected={view}
            onSelect={setView}
            showTrends={summaries.length >= 2}
          />

          <main className="content">
            {loadError && <p className="error-text">{loadError}</p>}

            {view === 'trends' ? (
              <section>
                <h2 className="section-title">Trends across months</h2>
                <Trends months={summaries} />
              </section>
            ) : period ? (
              <>
                <div className="month-meta">
                  <h2 className="section-title">{period.label}</h2>
                  {period.meta && <span className="meta-sub">{period.meta}</span>}
                </div>

                {period.rows ? (
                  <PeriodView
                    rows={period.rows}
                    totals={period.totals}
                    category={CATEGORY}
                    isAllTime={isAllTime}
                  />
                ) : (
                  <div className="state">
                    {isAllTime ? 'Aggregating all uploaded months…' : 'Loading city data…'}
                  </div>
                )}
              </>
            ) : null}
          </main>
        </>
      )}

      {showUpload && user && (
        <UploadModal
          category={CATEGORY}
          uploadedBy={{ uid: user.uid, email: user.email }}
          onClose={() => setShowUpload(false)}
          onImported={handleImported}
        />
      )}
    </div>
  );
}

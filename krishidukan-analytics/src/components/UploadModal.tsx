import { useEffect, useMemo, useState } from 'react';
import {
  buildMonthKey,
  computeTotals,
  METRICS,
  MONTH_OPTIONS,
  monthKeyToLabel,
  parseDemographicCsv,
  type ParseResult,
} from '../lib/demographics';
import { importMonth, monthExists } from '../lib/analyticsRepo';
import type { ReportCategory } from '../lib/analyticsPaths';
import { formatInt, formatMetric } from '../lib/format';

type Phase = 'select' | 'review' | 'importing' | 'done' | 'error';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 3, CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

export function UploadModal({
  category,
  uploadedBy,
  onClose,
  onImported,
}: {
  category: ReportCategory;
  uploadedBy: { uid: string; email: string | null };
  onClose: () => void;
  onImported: (month: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>('select');
  const [filename, setFilename] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [month, setMonth] = useState<number>(new Date().getMonth()); // prev month (0-based => last month's 1-based index)
  const [existing, setExisting] = useState<boolean | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [importError, setImportError] = useState('');

  const monthKey = useMemo(
    () => (month >= 1 ? buildMonthKey(year, month) : ''),
    [year, month],
  );

  const totals = useMemo(
    () => (parsed && parsed.rows.length ? computeTotals(parsed.rows) : null),
    [parsed],
  );

  // Check for an existing report whenever the chosen month changes. Resets fold
  // into the async callback to avoid synchronous setState inside the effect body.
  useEffect(() => {
    if (phase !== 'review' || !monthKey) return;
    let cancelled = false;
    monthExists(category, monthKey)
      .then((e) => {
        if (cancelled) return;
        setExisting(e);
        setConfirmReplace(false);
      })
      .catch(() => !cancelled && setExisting(false));
    return () => {
      cancelled = true;
    };
  }, [category, monthKey, phase]);

  async function handleFile(file: File) {
    const text = await file.text();
    const result = parseDemographicCsv(text);
    setFilename(file.name);
    setParsed(result);
    if (result.detectedMonth) {
      const [y, m] = result.detectedMonth.split('-').map(Number);
      if (y) setYear(y);
      if (m) setMonth(m);
    }
    setPhase('review');
  }

  async function handleImport() {
    if (!parsed || !monthKey) return;
    setPhase('importing');
    setImportError('');
    try {
      await importMonth({
        category,
        month: monthKey,
        rows: parsed.rows,
        uploadedBy,
        filename,
        replace: existing === true,
      });
      setPhase('done');
      onImported(monthKey);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  const hasErrors = (parsed?.errors.length ?? 0) > 0;
  const noRows = (parsed?.rows.length ?? 0) === 0;
  const needsReplaceConfirm = existing === true && !confirmReplace;
  const canImport =
    phase === 'review' && !!monthKey && month >= 1 && !hasErrors && !noRows && !needsReplaceConfirm;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Upload Monthly Report</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {phase === 'select' && (
          <div className="modal-body">
            <p>
              Upload the Firebase Analytics <strong>Demographic details: City</strong>{' '}
              CSV export for a single month.
            </p>
            <label className="file-drop">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              <span>Choose CSV file…</span>
            </label>
          </div>
        )}

        {phase === 'review' && parsed && (
          <div className="modal-body">
            <div className="field-row">
              <label>
                Report month
                <div className="month-select">
                  <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                    <option value={0}>Month…</option>
                    {MONTH_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                    {YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <div className="detected">
                {parsed.detectedMonth
                  ? `Detected from file: ${monthKeyToLabel(parsed.detectedMonth)}`
                  : 'No month detected in file — please confirm.'}
              </div>
            </div>

            <div className="summary-line">
              <span><strong>{filename}</strong></span>
              <span>{formatInt(parsed.rows.length)} city rows</span>
              {totals && <span>{formatInt(totals.activeUsers)} active users (summed)</span>}
            </div>

            {parsed.warnings.length > 0 && (
              <ul className="warn-list">
                {parsed.warnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            )}

            {hasErrors && (
              <div className="error-box">
                <strong>{parsed.errors.length} invalid numeric value(s).</strong> Fix the
                CSV and re-upload. First issues:
                <ul>
                  {parsed.errors.slice(0, 6).map((err, i) => (
                    <li key={i}>
                      Row {err.rowNumber} ({err.city}) — {err.field}: "{err.value}"
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {existing === true && (
              <div className="replace-box">
                <p>
                  ⚠ A report for <strong>{monthKeyToLabel(monthKey)}</strong> already
                  exists. Importing will <strong>replace</strong> it (old rows deleted
                  first — no duplicates).
                </p>
                <label className="confirm-check">
                  <input
                    type="checkbox"
                    checked={confirmReplace}
                    onChange={(e) => setConfirmReplace(e.target.checked)}
                  />
                  Yes, replace the existing {monthKeyToLabel(monthKey)} report
                </label>
              </div>
            )}

            {!noRows && (
              <div className="preview">
                <div className="preview-title">Preview (first 8 rows)</div>
                <div className="table-wrap">
                  <table className="city-table">
                    <thead>
                      <tr>
                        <th className="col-city">City</th>
                        {METRICS.map((m) => (
                          <th key={m.key} className="num">
                            {m.short}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 8).map((r) => (
                        <tr key={r.city} className={r.isNotSet ? 'row-not-set' : ''}>
                          <td className="col-city">{r.city}</td>
                          {METRICS.map((m) => (
                            <td key={m.key} className="num">
                              {formatMetric(m.kind, r[m.key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button onClick={() => setPhase('select')}>Back</button>
              <button className="primary" disabled={!canImport} onClick={() => void handleImport()}>
                {existing === true ? 'Replace & Import' : 'Import'}
              </button>
            </div>
          </div>
        )}

        {phase === 'importing' && (
          <div className="modal-body">
            <p>Importing {monthKeyToLabel(monthKey)}…</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="modal-body">
            <p>✓ Imported {monthKeyToLabel(monthKey)} successfully.</p>
            <div className="modal-actions">
              <button className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="modal-body">
            <div className="error-box">Import failed: {importError}</div>
            <div className="modal-actions">
              <button onClick={() => setPhase('review')}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { getUserLocation } from '../../app/utils/geolocation';
import {
  VISIT_PURPOSES,
  type MarkVisitInput,
  type VisitPurpose,
} from '../../app/sales/dealers/dealer-visit-service';
import type { Dealer } from '../../app/sales/dealers/dealers-service';

interface VisitFormProps {
  open: boolean;
  dealer: Dealer | null;
  onClose: () => void;
  onSubmit: (input: Omit<MarkVisitInput, 'daySessionId' | 'visitSequence'>) => Promise<void>;
}

export default function VisitForm({ open, dealer, onClose, onSubmit }: VisitFormProps) {
  const [purpose, setPurpose] = useState<VisitPurpose | ''>('');
  const [purposeOther, setPurposeOther] = useState('');
  const [notes, setNotes] = useState('');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPurpose('');
    setPurposeOther('');
    setNotes('');
    setGeo(null);
    setGeoStatus('loading');
    setError('');
    getUserLocation({ skipCache: true })
      .then((result) => {
        setGeo({ lat: result.coords.lat, lng: result.coords.lng });
        setGeoStatus('ok');
      })
      .catch(() => setGeoStatus('error'));
  }, [open]);

  const validate = (): string => {
    if (!purpose) return 'Please select a purpose.';
    if (purpose === 'Other' && !purposeOther.trim()) return 'Please describe the purpose.';
    if (geoStatus === 'loading') return 'Waiting for location…';
    if (geoStatus === 'error') return 'Location is required. Please allow location access and try again.';
    return '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    if (!dealer || !geo) return;
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({
        dealerId:     dealer.id,
        dealerName:   dealer.shopName,
        purpose:      purpose as VisitPurpose,
        purposeOther: purpose === 'Other' ? purposeOther.trim() : undefined,
        notes:        notes.trim() || undefined,
        geo,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !dealer) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-outline/30" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3 pt-1">
          <div>
            <h2 className="text-base font-bold text-on-surface">Mark as Visited</h2>
            <p className="text-xs text-on-surface-variant">{dealer.shopName} · {dealer.ownerName}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 pb-8">

          {/* Purpose */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Purpose <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={purpose}
                onChange={(e) => { setPurpose(e.target.value as VisitPurpose); setError(''); }}
                className="w-full appearance-none rounded-xl border border-outline/30 bg-surface-container-low px-4 py-3 pr-10 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="" disabled>Select purpose…</option>
                {VISIT_PURPOSES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
            </div>
          </div>

          {/* Other purpose */}
          {purpose === 'Other' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Describe Purpose <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={purposeOther}
                onChange={(e) => setPurposeOther(e.target.value)}
                placeholder="Briefly describe the purpose"
                autoFocus
                className="w-full rounded-xl border border-outline/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Notes <span className="text-outline font-normal normal-case">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional observations or remarks…"
              className="w-full resize-none rounded-xl border border-outline/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Location — auto-captured */}
          <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold ${
            geoStatus === 'ok'
              ? 'border-green-300 bg-green-50 text-green-700'
              : geoStatus === 'error'
              ? 'border-red-300 bg-red-50 text-red-600'
              : 'border-outline/30 bg-surface-container-low text-on-surface-variant'
          }`}>
            {geoStatus === 'loading' ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : geoStatus === 'ok' ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>
              {geoStatus === 'loading'
                ? 'Getting location…'
                : geoStatus === 'ok'
                ? 'Location captured'
                : 'Location unavailable — check permissions'}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-outline/30 py-3.5 text-sm font-bold text-on-surface-variant transition active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || geoStatus === 'loading'}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Saving…' : 'Mark as Visited'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

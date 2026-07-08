"use client";

import { FormEvent, useEffect, useState } from 'react';
import { X, LocateFixed, CheckCircle, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { getUserLocation } from '../../app/utils/geolocation';
import {
  VISIT_PURPOSES,
  type DealerVisit,
  type VisitInput,
  type VisitPurpose,
} from '../../app/sales/dealers/dealer-visit-service';
import type { Dealer } from '../../app/sales/dealers/dealers-service';

interface VisitFormProps {
  open: boolean;
  dealer: Dealer | null;
  onClose: () => void;
  onSubmit: (input: VisitInput) => Promise<void>;
}

const EMPTY_PURPOSE = '' as VisitPurpose;

export default function VisitForm({ open, dealer, onClose, onSubmit }: VisitFormProps) {
  const [purpose, setPurpose] = useState<VisitPurpose | ''>(EMPTY_PURPOSE);
  const [purposeOther, setPurposeOther] = useState('');
  const [notes, setNotes] = useState('');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPurpose(EMPTY_PURPOSE);
      setPurposeOther('');
      setNotes('');
      setGeo(null);
      setGeoStatus('idle');
      setError('');
    }
  }, [open]);

  const handleLocation = async () => {
    setGeoStatus('loading');
    try {
      const result = await getUserLocation();
      setGeo({ lat: result.coords.lat, lng: result.coords.lng });
      setGeoStatus('ok');
    } catch {
      setGeoStatus('error');
    }
  };

  const validate = (): string => {
    if (!purpose) return 'Please select a purpose.';
    if (purpose === 'Other' && !purposeOther.trim()) return 'Please describe the purpose.';
    if (!geo) return 'Location is required. Tap "Use Current Location".';
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
        dealerId: dealer.id,
        dealerName: dealer.shopName,
        purpose: purpose as VisitPurpose,
        purposeOther: purpose === 'Other' ? purposeOther : undefined,
        notes: notes || undefined,
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
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-outline/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-1">
          <div>
            <h2 className="text-base font-bold text-on-surface">Start Visit</h2>
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

          {/* Other purpose text */}
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

          {/* Location */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Location <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={handleLocation}
              disabled={geoStatus === 'loading'}
              className={`flex w-full items-center justify-center gap-2.5 rounded-xl border py-3 text-sm font-semibold transition active:scale-95 ${
                geoStatus === 'ok'
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : geoStatus === 'error'
                  ? 'border-red-300 bg-red-50 text-red-600'
                  : 'border-outline/30 bg-surface-container-low text-on-surface-variant hover:border-primary/40'
              }`}
            >
              {geoStatus === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : geoStatus === 'ok' ? (
                <CheckCircle className="h-4 w-4" />
              ) : geoStatus === 'error' ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
              {geoStatus === 'loading'
                ? 'Getting location…'
                : geoStatus === 'ok'
                ? `Location captured (${geo?.lat.toFixed(4)}, ${geo?.lng.toFixed(4)})`
                : geoStatus === 'error'
                ? 'Permission denied — tap to retry'
                : 'Use Current Location'}
            </button>
          </div>

          {/* Error */}
          {error ? (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : null}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? 'Logging visit…' : 'Start Visit'}
          </button>
        </form>
      </div>
    </>
  );
}

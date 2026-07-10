"use client";

import { FormEvent, useEffect, useState } from 'react';
import { X, LocateFixed, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { getUserLocation } from '../../app/utils/geolocation';
import type { Dealer, DealerInput } from '../../app/sales/dealers/dealers-service';

interface DealerFormProps {
  open: boolean;
  initial?: Dealer | null;
  onClose: () => void;
  onSubmit: (input: DealerInput) => Promise<void>;
}

const EMPTY: DealerInput = {
  shopName: '',
  ownerName: '',
  phone: '',
  address: '',
  geo: null,
};

export default function DealerForm({ open, initial, onClose, onSubmit }: DealerFormProps) {
  const [form, setForm] = useState<DealerInput>(EMPTY);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset form when sheet opens / edit target changes
  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          shopName: initial.shopName,
          ownerName: initial.ownerName,
          phone: initial.phone,
          address: initial.address,
          geo: initial.geo
            ? { lat: initial.geo.latitude, lng: initial.geo.longitude }
            : null,
        });
        setGeoStatus(initial.geo ? 'ok' : 'idle');
      } else {
        setForm(EMPTY);
        setGeoStatus('idle');
      }
      setError('');
    }
  }, [open, initial]);

  const set = (key: keyof DealerInput, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleLocation = async () => {
    setGeoStatus('loading');
    try {
      const result = await getUserLocation();
      setForm((f) => ({
        ...f,
        geo: { lat: result.coords.lat, lng: result.coords.lng },
      }));
      setGeoStatus('ok');
    } catch {
      setGeoStatus('error');
    }
  };

  const validate = (): string => {
    if (!form.shopName.trim()) return 'Shop name is required.';
    if (!form.ownerName.trim()) return 'Owner name is required.';
    if (!form.phone.trim()) return 'Phone number is required.';
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, '').slice(-10)))
      return 'Enter a valid 10-digit phone number.';
    if (!form.address.trim()) return 'Address is required.';
    if (!form.geo) return 'Location is required. Tap "Use Current Location".';
    return '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const isEdit = !!initial;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-outline/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-1">
          <h2 className="text-base font-bold text-on-surface">
            {isEdit ? 'Edit Dealer' : 'Add Dealer'}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-5 pb-8">

          {/* Shop Name */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Shop Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.shopName}
              onChange={(e) => set('shopName', e.target.value)}
              placeholder="e.g. Sharma Agro Store"
              className="w-full rounded-xl border border-outline/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Owner Name */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Owner Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.ownerName}
              onChange={(e) => set('ownerName', e.target.value)}
              placeholder="e.g. Ramesh Sharma"
              className="w-full rounded-xl border border-outline/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Phone <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile number"
              className="w-full rounded-xl border border-outline/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Address */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Address <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Shop address, village/town, district"
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
                ? `Location captured (${form.geo?.lat.toFixed(4)}, ${form.geo?.lng.toFixed(4)})`
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
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Dealer'}
          </button>
        </form>
      </div>
    </>
  );
}

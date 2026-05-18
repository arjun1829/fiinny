"use client";

import { FormEvent, useState } from "react";
import { Loader2, PackagePlus } from "lucide-react";
import Link from "next/link";
import { createManufacturerProduct } from "../_lib/manufacturer-products-firestore";
import type { SeatStats } from "../_types/subscriptions";

// ─── Category options ─────────────────────────────────────────────────────────

const CATEGORIES = [
  "Seeds",
  "Fertilizers",
  "Pesticides",
  "Tools",
  "Irrigation",
  "Soil Nutrients",
  "Growth Promoters",
  "Equipment",
  "Animal Feed",
  "Organic Products",
  "Others",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type AddProductInventoryFormProps = {
  userId: string | null;
  /** Only "manufacturer" is supported — retailers no longer have product-create permission. */
  role: "manufacturer" | "retailer";
  disabled?: boolean;
  onCreated: () => Promise<void>;
  /** Real seat availability derived from active subscriptions minus active listings. */
  seatStats: SeatStats;
};

const emptyForm = {
  name: "",
  category: CATEGORIES[0],
  unit: "pkt",
  sellingPrice: "",
  description: "",
  imageUrl: "",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AddProductInventoryForm({
  userId,
  role,
  disabled,
  onCreated,
  seatStats,
}: AddProductInventoryFormProps) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Gate: only manufacturers can add products
  const isManufacturer = role === "manufacturer";

  // Seat availability from real subscription data
  const hasSeats = seatStats.available > 0;
  const noSubscription = seatStats.totalPurchased === 0;

  const isDisabled = disabled || submitting || !userId || !hasSeats || !isManufacturer;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId || !isManufacturer) return;
    if (!hasSeats) {
      setMessage({ type: "err", text: "No seats available. Buy more seats to add products." });
      return;
    }

    const sellingPrice = Math.max(0, Number(form.sellingPrice));
    if (!form.name.trim() || !form.category || !form.unit.trim()) {
      setMessage({ type: "err", text: "Name, category, and unit are required." });
      return;
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
      setMessage({ type: "err", text: "Enter a valid price." });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      await createManufacturerProduct(userId, {
        name: form.name,
        category: form.category,
        unit: form.unit,
        price: sellingPrice,
        description: form.description,
        image: form.imageUrl.trim() || undefined,
      });
      setMessage({ type: "ok", text: "Product added to your catalogue." });
      setForm(emptyForm);
      await onCreated();
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Failed to create product.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Retailer: show informational banner instead of form
  if (!isManufacturer) {
    return (
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low px-5 py-6 text-center text-sm text-on-surface-variant">
        Products are assigned to your account by manufacturers. Contact your manufacturer partner to
        have products listed in your store.
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border p-4 shadow-ambient md:p-5 ${
        !hasSeats ? "border-red-200 bg-red-50/30" : "border-outline-variant/30 bg-surface-container-lowest"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-on-surface">Add product to catalogue</h2>
        <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant">
          {seatStats.available} seat{seatStats.available !== 1 ? "s" : ""} available
        </span>
      </div>

      {/* Seat warnings */}
      {noSubscription && (
        <p className="mt-2 text-sm font-bold text-red-600">
          No active subscription. Purchase a plan to start listing products.
        </p>
      )}
      {!noSubscription && !hasSeats && (
        <p className="mt-2 text-sm font-bold text-red-600">
          All {seatStats.totalPurchased} seat{seatStats.totalPurchased !== 1 ? "s" : ""} used.
          Buy more to add products.
        </p>
      )}

      {/* Feedback message */}
      {message ? (
        <div
          className={`mt-4 rounded-xl px-3 py-2 text-sm ${
            message.type === "ok"
              ? "border border-primary/30 bg-primary/10 text-primary"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        {/* Product name */}
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-on-surface">Product name</span>
          <input
            required
            disabled={isDisabled}
            className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2 disabled:opacity-50"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Hybrid Tomato Seeds"
          />
        </label>

        {/* Category — dropdown */}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-on-surface">Category</span>
          <select
            required
            disabled={isDisabled}
            className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2 disabled:opacity-50 appearance-none"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as typeof CATEGORIES[number] }))}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        {/* Unit */}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-on-surface">Unit</span>
          <select
            required
            disabled={isDisabled}
            className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2 disabled:opacity-50 appearance-none"
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
          >
            <option value="pkt">Packet (pkt)</option>
            <option value="kg">Kilogram (kg)</option>
            <option value="g">Gram (g)</option>
            <option value="L">Litre (L)</option>
            <option value="ml">Millilitre (ml)</option>
            <option value="bag">Bag</option>
            <option value="pcs">Piece (pcs)</option>
            <option value="box">Box</option>
            <option value="bottle">Bottle</option>
            <option value="bundle">Bundle</option>
            <option value="can">Can</option>
            <option value="drum">Drum</option>
          </select>
        </label>

        {/* Price */}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-on-surface">Price (₹)</span>
          <input
            required
            type="number"
            min={0}
            step={0.01}
            disabled={isDisabled}
            className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2 disabled:opacity-50"
            value={form.sellingPrice}
            onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
          />
        </label>

        {/* Description */}
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-on-surface">Description</span>
          <textarea
            rows={3}
            disabled={isDisabled}
            className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2 disabled:opacity-50"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Product details for retailers and buyers"
          />
        </label>

        {/* Image URL */}
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-on-surface">Image URL (optional)</span>
          <input
            type="url"
            disabled={isDisabled}
            className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2 disabled:opacity-50"
            value={form.imageUrl}
            onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
            placeholder="https://…"
          />
        </label>

        {/* Actions */}
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={isDisabled}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50 transition-all"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PackagePlus className="h-4 w-4" />
            )}
            {!hasSeats ? "No seats available" : submitting ? "Saving…" : "Add to catalogue"}
          </button>

          {(!hasSeats) && (
            <Link
              href="/dashboard/upgrade"
              className="inline-flex items-center gap-2 rounded-xl border border-primary text-primary px-4 py-2.5 text-sm font-bold hover:bg-primary/5 transition-all"
            >
              Buy More Seats
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}

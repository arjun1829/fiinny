"use client";

import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  Globe, MapPin, Weight, Plus, Trash2, Save,
  Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { auth } from "../../firebase";
import { getUserProfile } from "../../firebase";
import {
  fetchDeliverySettings,
  saveDeliverySettings,
} from "../_lib/delivery-settings-firestore";
import type { WeightSlab, CoverageType } from "../_types/delivery-settings";
import { INDIAN_STATES } from "../_types/delivery-settings";
import { PageHeader } from "./page-header";
import { FeatureLocked } from "./feature-locked";

// ─── helpers ──────────────────────────────────────────────────────────────────

function overlaps(slabs: WeightSlab[], idx: number, next: WeightSlab): string | null {
  for (let i = 0; i < slabs.length; i++) {
    if (i === idx) continue;
    const s = slabs[i];
    const overlapExists =
      next.minKg < s.maxKg && next.maxKg > s.minKg;
    if (overlapExists)
      return `Overlaps with slab ${s.minKg}–${s.maxKg} kg`;
  }
  return null;
}

function validateSlab(
  slab: WeightSlab,
  slabs: WeightSlab[],
  idx: number,
): string | null {
  if (!Number.isFinite(slab.minKg) || slab.minKg < 0)
    return "Min weight must be ≥ 0";
  if (!Number.isFinite(slab.maxKg) || slab.maxKg <= slab.minKg)
    return "Max weight must be greater than min";
  if (!Number.isFinite(slab.charge) || slab.charge < 0)
    return "Charge must be ≥ 0";
  return overlaps(slabs, idx, slab);
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient overflow-hidden">
      <div className="flex items-start gap-3 border-b border-outline-variant/20 bg-surface-container-low/50 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-on-surface">{title}</h2>
            {badge}
          </div>
          <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ─── Slab Row ─────────────────────────────────────────────────────────────────

type SlabDraft = WeightSlab & { error?: string };

function SlabRow({
  slab,
  index,
  allSlabs,
  isOnly,
  onChange,
  onDelete,
  disabled,
}: {
  slab: SlabDraft;
  index: number;
  allSlabs: SlabDraft[];
  isOnly: boolean;
  onChange: (patch: Partial<WeightSlab>) => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const next: WeightSlab = { minKg: slab.minKg, maxKg: slab.maxKg, charge: slab.charge };
  const error = validateSlab(next, allSlabs as WeightSlab[], index);

  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-2 ${error ? "border-red-200 bg-red-50/30" : "border-outline-variant/25 bg-white"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-on-surface-variant">Slab {index + 1}</span>
        <button
          type="button"
          disabled={disabled || isOnly}
          onClick={onDelete}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant hover:bg-red-50 hover:text-red-500 disabled:opacity-30 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-on-surface-variant">Min (kg)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            disabled={disabled}
            value={slab.minKg}
            onChange={(e) => onChange({ minKg: parseFloat(e.target.value) || 0 })}
            className="rounded-lg border border-outline-variant/40 bg-surface-container-low px-2.5 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-on-surface-variant">Max (kg)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            disabled={disabled}
            value={slab.maxKg}
            onChange={(e) => onChange({ maxKg: parseFloat(e.target.value) || 0 })}
            className="rounded-lg border border-outline-variant/40 bg-surface-container-low px-2.5 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-on-surface-variant">Charge (₹)</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">₹</span>
            <input
              type="number"
              min={0}
              step={1}
              disabled={disabled}
              value={slab.charge}
              onChange={(e) => onChange({ charge: parseFloat(e.target.value) || 0 })}
              className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low pl-6 pr-2.5 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
          </div>
        </label>
      </div>

      {error && (
        <p className="flex items-center gap-1 text-[10px] font-medium text-red-600">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
        </p>
      )}

      {!error && (
        <p className="text-[10px] text-on-surface-variant">
          Orders {slab.minKg}–{slab.maxKg} kg → <span className="font-semibold text-on-surface">₹{slab.charge}</span> delivery charge
        </p>
      )}
    </div>
  );
}

// ─── State Picker ─────────────────────────────────────────────────────────────

function StatePicker({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (states: string[]) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filtered = query.trim()
    ? INDIAN_STATES.filter((s) =>
        s.toLowerCase().includes(query.toLowerCase()),
      )
    : INDIAN_STATES;

  const visible = showAll ? filtered : filtered.slice(0, 16);

  const toggle = (state: string) => {
    if (selected.includes(state)) {
      onChange(selected.filter((s) => s !== state));
    } else {
      onChange([...selected, state]);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Search states…"
          disabled={disabled}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 flex-1 min-w-[180px]"
        />
        {selected.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange([])}
            className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
          >
            Clear all
          </button>
        )}
        <span className="text-xs text-on-surface-variant">
          {selected.length} of {INDIAN_STATES.length} selected
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
        {visible.map((state) => {
          const isSelected = selected.includes(state);
          return (
            <button
              key={state}
              type="button"
              disabled={disabled}
              onClick={() => toggle(state)}
              className={`rounded-xl border px-3 py-2 text-xs font-medium text-left transition-all ${
                isSelected
                  ? "border-primary bg-primary text-white shadow-sm"
                  : "border-outline-variant/40 bg-white text-on-surface-variant hover:border-primary/50 hover:text-primary"
              } disabled:opacity-50`}
            >
              {state}
            </button>
          );
        })}
      </div>

      {filtered.length > 16 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center gap-1 self-start text-xs font-semibold text-primary hover:underline"
        >
          {showAll ? (
            <><ChevronUp className="h-3.5 w-3.5" /> Show less</>
          ) : (
            <><ChevronDown className="h-3.5 w-3.5" /> Show all {filtered.length} states</>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DeliverySettingsPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [sellerPhone, setSellerPhone] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Profile-level gate — set from profile.onlineDelivery on load
  const [profileOnlineDelivery, setProfileOnlineDelivery] = useState<boolean | null>(null);

  // Preserved from Firestore — not exposed in UI (profile is source of truth)
  const [storedOnlineDeliveryEnabled, setStoredOnlineDeliveryEnabled] = useState(true);

  // Section 2: weight slabs
  const [slabs, setSlabs] = useState<SlabDraft[]>([]);

  // Section 3: coverage
  const [coverageType, setCoverageType] = useState<CoverageType>("pan_india");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      setUid(user.uid);
      try {
        const profile = await getUserProfile(user.uid);
        const phone = String((profile as any)?.phone ?? "").trim();
        const hasOnlineDelivery = !!(profile as any)?.onlineDelivery;
        setProfileOnlineDelivery(hasOnlineDelivery);
        setSellerPhone(phone || null);

        if (phone) {
          const settings = await fetchDeliverySettings(phone);
          if (settings) {
            setStoredOnlineDeliveryEnabled(settings.onlineDeliveryEnabled);
            setSlabs(settings.weightSlabs);
            setCoverageType(settings.coverageType);
            setSelectedStates(settings.states);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // ── Slab helpers ───────────────────────────────────────────────────────────
  const addSlab = () => {
    const lastMax = slabs.length > 0 ? slabs[slabs.length - 1].maxKg : 0;
    setSlabs((prev) => [
      ...prev,
      { minKg: lastMax, maxKg: lastMax + 5, charge: 0 },
    ]);
  };

  const updateSlab = (i: number, patch: Partial<WeightSlab>) =>
    setSlabs((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const deleteSlab = (i: number) =>
    setSlabs((prev) => prev.filter((_, idx) => idx !== i));

  // ── Validation ─────────────────────────────────────────────────────────────
  const slabErrors = slabs.map((s, i) =>
    validateSlab(s as WeightSlab, slabs as WeightSlab[], i),
  );
  const hasSlabErrors = slabErrors.some(Boolean);

  const coverageInvalid =
    coverageType === "states" && selectedStates.length === 0;

  const canSave = !hasSlabErrors && !coverageInvalid && !!sellerPhone;

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!sellerPhone || !canSave) return;
    setSaving(true);
    setStatus(null);
    try {
      await saveDeliverySettings(
        sellerPhone,
        {
          onlineDeliveryEnabled: storedOnlineDeliveryEnabled,
          coverageType,
          states: coverageType === "states" ? selectedStates : [],
          weightSlabs: slabs as WeightSlab[],
        },
      );
      setStatus({ type: "ok", text: "Delivery settings saved." });
    } catch (e) {
      setStatus({
        type: "err",
        text: e instanceof Error ? e.message : "Failed to save.",
      });
    } finally {
      setSaving(false);
    }
  }, [sellerPhone, canSave, storedOnlineDeliveryEnabled, coverageType, selectedStates, slabs]);

  // Auto-dismiss success
  useEffect(() => {
    if (status?.type !== "ok") return;
    const id = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(id);
  }, [status]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!uid) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        You must be logged in to manage delivery settings.
      </div>
    );
  }

  if (profileOnlineDelivery === false) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Delivery Settings"
          description="Configure online delivery, charge slabs, and coverage for your products."
        />
        <FeatureLocked />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Delivery Settings"
        description="Configure online delivery, charge slabs, and coverage for your products."
      />

      {/* ── Section 2: Delivery Charge Slabs ── */}
      <Section
        icon={Weight}
        title="Delivery Charge Configuration"
        subtitle="Set weight-based delivery charges. Customers pay the charge for the slab their order weight falls into."
      >
        {/* Example hint */}
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
          <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
          <p className="text-xs text-primary/80">
            Example: 0–2 kg → ₹100, 2–5 kg → ₹250, 5–10 kg → ₹500.
            Ranges must not overlap. Leave empty for free delivery.
          </p>
        </div>

        {slabs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant/50 bg-surface-container-low/50 py-8 text-center text-sm text-on-surface-variant">
            No slabs configured — delivery is free for all orders.
          </div>
        ) : (
          <div className="flex flex-col gap-2 mb-3">
            {slabs.map((slab, i) => (
              <SlabRow
                key={i}
                slab={slab}
                index={i}
                allSlabs={slabs}
                isOnly={slabs.length <= 1}
                onChange={(patch) => updateSlab(i, patch)}
                onDelete={() => deleteSlab(i)}
                disabled={saving}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={addSlab}
          className="flex items-center gap-2 rounded-xl border border-dashed border-outline-variant/50 bg-white px-4 py-2.5 text-sm text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Slab
        </button>

        {hasSlabErrors && (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Fix slab errors before saving.
          </p>
        )}
      </Section>

      {/* ── Section 3: Delivery Coverage ── */}
      <Section
        icon={Globe}
        title="Delivery Coverage"
        subtitle="Choose where you deliver. Customers outside your coverage area will not be able to place orders."
        badge={
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
            <MapPin className="h-3 w-3" />
            {coverageType === "pan_india"
              ? "Pan India"
              : `${selectedStates.length} state${selectedStates.length !== 1 ? "s" : ""}`}
          </span>
        }
      >
        {/* Coverage type selector */}
        <div className="flex gap-3 mb-5">
          {(["pan_india", "states"] as CoverageType[]).map((type) => (
            <button
              key={type}
              type="button"
              disabled={saving}
              onClick={() => setCoverageType(type)}
              className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                coverageType === type
                  ? "border-primary bg-primary text-white shadow-md"
                  : "border-outline-variant/40 bg-white text-on-surface-variant hover:border-primary/50 hover:text-primary"
              } disabled:opacity-50`}
            >
              {type === "pan_india" ? (
                <><Globe className="h-4 w-4" /> Pan India</>
              ) : (
                <><MapPin className="h-4 w-4" /> Selected States</>
              )}
            </button>
          ))}
        </div>

        {coverageType === "pan_india" && (
          <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-primary/80">
            You deliver to all states and union territories across India.
          </div>
        )}

        {coverageType === "states" && (
          <>
            <StatePicker
              selected={selectedStates}
              onChange={setSelectedStates}
              disabled={saving}
            />
            {coverageInvalid && (
              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Select at least one state.
              </p>
            )}
          </>
        )}
      </Section>

      {/* ── Save bar ── */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-outline-variant/30 bg-white/95 backdrop-blur px-5 py-4 shadow-ambient">
        <div className="flex-1 min-w-0">
          {status ? (
            <div
              className={`flex items-center gap-2 text-sm font-medium ${
                status.type === "ok" ? "text-primary" : "text-red-600"
              }`}
            >
              {status.type === "ok" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              {status.text}
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant">
              Changes apply to all your products immediately after saving.
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={saving || !canSave}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50 transition-all"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          ) : (
            <><Save className="h-4 w-4" /> Save Settings</>
          )}
        </button>
      </div>

    </div>
  );
}

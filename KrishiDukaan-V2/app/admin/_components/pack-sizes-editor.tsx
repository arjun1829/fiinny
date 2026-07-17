"use client";

import { X, Plus, Layers } from "lucide-react";

// Pack-sizes / variants editor shared by the admin product form. The unit-building
// and parsing logic is intentionally identical to the seller modal
// (app/dashboard/_components/edit-product-modal.tsx) so admin- and seller-created
// products produce the same `variants` shape: { unit, price, stock? }[].

// ─── Constants ──────────────────────────────────────────────────────────────
export const UNIT_TYPES = [
  { value: "g",      label: "gm",     display: "gm" },
  { value: "kg",     label: "KG",     display: "KG" },
  { value: "ml",     label: "ml",     display: "ml" },
  { value: "L",      label: "L",      display: "L" },
  { value: "pkt",    label: "Packet", display: "Packet" },
  { value: "pcs",    label: "Piece",  display: "Piece" },
  { value: "bottle", label: "Bottle", display: "Bottle" },
  { value: "can",    label: "Can",    display: "Can" },
  { value: "custom", label: "Custom", display: "" },
] as const;

export const SIZE_OPTIONS_BY_UNIT: Record<string, string[]> = {
  g:  ["10", "25", "50", "100", "250", "500"],
  kg: ["1", "2", "5", "10", "25", "50"],
  ml: ["50", "100", "250", "500"],
  L:  ["1", "2", "5", "10", "20"],
};

export const UNITS_WITH_SIZE = new Set(["g", "kg", "ml", "L"]);
export const MAX_VARIANTS = 8;

// ─── Types ────────────────────────────────────────────────────────────────────
export type Variant = {
  unitType: string;
  sizeAmount: string;
  customSize: string;
  customUnit: string;
  price: string;
  stock: string;
};

export type SavedVariant = { unit: string; price: number; stock?: number };

export const emptyVariant = (): Variant =>
  ({ unitType: "kg", sizeAmount: "1", customSize: "", customUnit: "", price: "", stock: "" });

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function buildUnit(v: Variant): string {
  if (v.unitType === "custom") return v.customUnit.trim();
  if (!UNITS_WITH_SIZE.has(v.unitType)) return v.unitType;
  const size = v.sizeAmount === "custom" ? v.customSize.trim() : v.sizeAmount;
  if (!size) return v.unitType;
  return `${size}${v.unitType}`;
}

export function buildPreviewLabel(v: Variant): string {
  if (v.unitType === "custom") return v.customUnit.trim() || "";
  const ut = UNIT_TYPES.find(u => u.value === v.unitType);
  if (!ut) return "";
  if (!UNITS_WITH_SIZE.has(v.unitType)) return ut.display;
  const size = v.sizeAmount === "custom" ? (v.customSize.trim() || "?") : v.sizeAmount;
  if (!size) return "";
  return `${size} ${ut.display}`;
}

function parseUnitToVariant(unit: string | undefined | null): Pick<Variant, "unitType" | "sizeAmount" | "customSize" | "customUnit"> {
  unit = (unit ?? "").trim();
  if (!unit) return { unitType: "custom", sizeAmount: "", customSize: "", customUnit: "" };
  const match = unit.match(/^(\d+(?:\.\d+)?)(g|kg|ml|L)$/i);
  if (match) {
    const size = match[1];
    const type = match[2] === "l" ? "L" : match[2];
    const knownSizes = SIZE_OPTIONS_BY_UNIT[type] ?? [];
    return {
      unitType: type,
      sizeAmount: knownSizes.includes(size) ? size : "custom",
      customSize: knownSizes.includes(size) ? "" : size,
      customUnit: "",
    };
  }
  if (unit === "pkt" || unit === "packet") return { unitType: "pkt", sizeAmount: "", customSize: "", customUnit: "" };
  if (unit === "pcs" || unit === "piece")  return { unitType: "pcs", sizeAmount: "", customSize: "", customUnit: "" };
  if (unit === "bottle")                   return { unitType: "bottle", sizeAmount: "", customSize: "", customUnit: "" };
  if (unit === "can")                      return { unitType: "can", sizeAmount: "", customSize: "", customUnit: "" };
  return { unitType: "custom", sizeAmount: "", customSize: "", customUnit: unit };
}

/** Hydrates editor rows from a product's saved `variants` array (or a flat fallback). */
export function variantsToRows(
  variants: Array<{ unit?: string; price?: number | string; stock?: number | string }> | undefined,
  fallback?: { unit?: string; price?: number | string },
): Variant[] {
  const src = (variants && variants.length)
    ? variants
    : [{ unit: fallback?.unit ?? "1kg", price: fallback?.price ?? "" }];
  return src.map(v => ({
    ...parseUnitToVariant(String(v.unit ?? "")),
    price: v.price !== undefined && v.price !== null ? String(v.price) : "",
    stock: v.stock !== undefined && v.stock !== null ? String(v.stock) : "",
  }));
}

/** Validates + serializes editor rows for saving. */
export function parseVariantsForSave(
  variants: Variant[],
): { ok: boolean; variants: SavedVariant[]; error: string } {
  const parsed = variants.map(v => {
    const stockNum = v.stock !== "" ? Number(v.stock) : undefined;
    return {
      unit: buildUnit(v),
      price: Number(v.price),
      ...(stockNum !== undefined && Number.isFinite(stockNum) ? { stock: stockNum } : {}),
    };
  });
  if (parsed.some(v => !v.unit)) return { ok: false, variants: [], error: "Please complete the unit for each package." };
  if (parsed.some(v => !Number.isFinite(v.price) || v.price <= 0)) {
    return { ok: false, variants: [], error: "Each package needs a price greater than 0." };
  }
  return { ok: true, variants: parsed, error: "" };
}

// ─── Variant Row ──────────────────────────────────────────────────────────────
function VariantRow({ v, i, disabled, isOnly, setV, removeV }: {
  v: Variant; i: number; disabled: boolean; isOnly: boolean;
  setV: (i: number, p: Partial<Variant>) => void;
  removeV: (i: number) => void;
}) {
  const hasSizes = UNITS_WITH_SIZE.has(v.unitType);
  const sizeOptions = hasSizes ? SIZE_OPTIONS_BY_UNIT[v.unitType] ?? [] : [];
  const preview = buildPreviewLabel(v);

  return (
    <div className="rounded-xl border border-outline-variant/25 bg-white p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-on-surface-variant">Package {i + 1}</span>
        <button type="button" disabled={disabled || isOnly} onClick={() => removeV(i)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant hover:bg-red-50 hover:text-red-500 disabled:opacity-30 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Step 1: Unit */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Step 1 — Unit</span>
        <div className="flex flex-wrap gap-1.5">
          {UNIT_TYPES.map(ut => (
            <button key={ut.value} type="button" disabled={disabled}
              onClick={() => setV(i, {
                unitType: ut.value,
                sizeAmount: UNITS_WITH_SIZE.has(ut.value) ? (SIZE_OPTIONS_BY_UNIT[ut.value]?.[0] ?? "") : "",
                customSize: "",
                customUnit: "",
              })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                v.unitType === ut.value
                  ? "border-primary bg-primary text-white shadow-sm"
                  : "border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:border-primary/50 hover:text-primary"
              } disabled:opacity-50`}
            >
              {ut.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Package Size */}
      {hasSizes && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Step 2 — Package Size</span>
          <div className="flex flex-wrap gap-1.5">
            {sizeOptions.map(size => (
              <button key={size} type="button" disabled={disabled}
                onClick={() => setV(i, { sizeAmount: size, customSize: "" })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  v.sizeAmount === size
                    ? "border-primary bg-primary text-white shadow-sm"
                    : "border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:border-primary/50 hover:text-primary"
                } disabled:opacity-50`}
              >
                {size}
              </button>
            ))}
            <button type="button" disabled={disabled}
              onClick={() => setV(i, { sizeAmount: "custom", customSize: "" })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                v.sizeAmount === "custom"
                  ? "border-primary bg-primary text-white shadow-sm"
                  : "border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:border-primary/50 hover:text-primary"
              } disabled:opacity-50`}
            >
              Custom
            </button>
          </div>
          {v.sizeAmount === "custom" && (
            <input type="number" min={0} step="any" disabled={disabled}
              placeholder="e.g. 750"
              className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 w-32"
              value={v.customSize} onChange={(e) => setV(i, { customSize: e.target.value })} />
          )}
        </div>
      )}

      {v.unitType === "custom" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Your Unit Label</span>
          <input type="text" disabled={disabled}
            placeholder="e.g. 30 tablets, 1 acre dose, 4L drum…"
            className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            value={v.customUnit} onChange={(e) => setV(i, { customUnit: e.target.value })} />
        </div>
      )}

      {preview && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/60">Package</span>
          <span className="text-sm font-bold text-primary">{preview}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-on-surface-variant">Price (₹) *</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-on-surface-variant">₹</span>
            <input type="number" min={1} step={0.01} disabled={disabled}
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest pl-7 pr-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              placeholder="0" value={v.price}
              onChange={(e) => setV(i, { price: e.target.value })} />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-on-surface-variant">Stock Qty</span>
          <input type="number" min={0} disabled={disabled}
            className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5 text-sm text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            placeholder="—" value={v.stock}
            onChange={(e) => setV(i, { stock: e.target.value })} />
        </label>
      </div>
    </div>
  );
}

// ─── Editor wrapper ─────────────────────────────────────────────────────────
export function PackSizesEditor({ variants, onChange, disabled }: {
  variants: Variant[];
  onChange: (v: Variant[]) => void;
  disabled?: boolean;
}) {
  const setV = (i: number, p: Partial<Variant>) =>
    onChange(variants.map((v, idx) => idx === i ? { ...v, ...p } : v));
  const removeV = (i: number) => onChange(variants.filter((_, idx) => idx !== i));
  const addV = () => { if (variants.length < MAX_VARIANTS) onChange([...variants, emptyVariant()]); };

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
        <Layers className="h-4 w-4 text-primary" /> Pack sizes &amp; prices
      </div>
      <div className="flex flex-col gap-3">
        {variants.map((v, i) => (
          <VariantRow key={i} v={v} i={i} disabled={!!disabled} isOnly={variants.length <= 1}
            setV={setV} removeV={removeV} />
        ))}
      </div>
      {variants.length < MAX_VARIANTS && (
        <button type="button" onClick={addV} disabled={disabled}
          className="flex items-center gap-2 rounded-xl border border-dashed border-outline-variant/50 px-3 py-2 text-sm text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add size
        </button>
      )}
    </div>
  );
}

/**
 * Category-specific product information schema.
 *
 * Each category defines the structured fields shown in the create/edit form
 * and rendered on the product detail page.  The data is stored as:
 *   product.categoryInfo: Record<string, string | string[]>
 * where "chips" field types are stored as string[] and everything else as string.
 */

// ─── Category list ───────────────────────────────────────────────────────────

export const PRODUCT_CATEGORIES = [
  "Fertilizers",
  "Pesticides",
  "Herbicides",
  "Bio-Stimulants",
  "Seeds",
  "Sprayers",
  "Tools",
  "Other",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Returns true if the value is one of the canonical categories. */
export function isStandardCategory(value: string): value is ProductCategory {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(value);
}

// ─── Field schema ─────────────────────────────────────────────────────────────

export type FieldType = "text" | "textarea" | "chips";

export interface CategoryField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
}

// ─── Per-category field definitions ──────────────────────────────────────────

export const CATEGORY_FIELDS: Record<ProductCategory, CategoryField[]> = {
  Fertilizers: [
    { key: "application", label: "Application",          type: "textarea", placeholder: "e.g. Suitable for foliar spray and fertigation..." },
    { key: "dosage",      label: "Recommended Dosage",   type: "text",     placeholder: "e.g. 3–5 gm / Litre" },
    { key: "bestForCrops",label: "Best For Crops",       type: "chips",    placeholder: "e.g. Tomatoes, Wheat, Sugarcane" },
  ],

  Pesticides: [
    { key: "activeIngredient", label: "Active Ingredient",    type: "text",  placeholder: "e.g. Chlorpyrifos 50% EC" },
    { key: "chemicalGroup",    label: "Chemical Group",       type: "text",  placeholder: "e.g. Organophosphate" },
    { key: "targetPest",       label: "Target Pest",          type: "text",  placeholder: "e.g. Aphids, Thrips, White Flies" },
    { key: "modeOfAction",     label: "Mode of Action",       type: "textarea", placeholder: "e.g. Contact and systemic action..." },
    { key: "dosage",           label: "Recommended Dosage",   type: "text",  placeholder: "e.g. 2 ml / Litre of water" },
    { key: "waitingPeriod",    label: "Waiting Period",       type: "text",  placeholder: "e.g. 14 days before harvest" },
    { key: "bestForCrops",     label: "Best For Crops",       type: "chips", placeholder: "e.g. Cotton, Rice, Vegetables" },
  ],

  Herbicides: [
    { key: "activeIngredient",   label: "Active Ingredient",             type: "text",  placeholder: "e.g. Glyphosate 41% SL" },
    { key: "targetWeeds",        label: "Target Weeds",                  type: "text",  placeholder: "e.g. Broad-leaf weeds, Grasses" },
    { key: "type",               label: "Type",                          type: "text",  placeholder: "Selective / Non-Selective" },
    { key: "applicationStage",   label: "Application Stage",             type: "text",  placeholder: "Pre-Emergence / Post-Emergence" },
    { key: "dosage",             label: "Recommended Dosage",            type: "text",  placeholder: "e.g. 1.5 L / acre" },
    { key: "bestForCrops",       label: "Best For Crops",                type: "chips", placeholder: "e.g. Wheat, Maize, Soybean" },
  ],

  "Bio-Stimulants": [
    { key: "keyIngredients",   label: "Key Ingredients",     type: "text",     placeholder: "e.g. Humic acid, Seaweed extract" },
    { key: "benefits",         label: "Benefits",            type: "chips",    placeholder: "e.g. Improves root development, Enhances nutrient uptake" },
    { key: "applicationMethod",label: "Application Method",  type: "text",     placeholder: "e.g. Soil drench, foliar spray" },
    { key: "dosage",           label: "Recommended Dosage",  type: "text",     placeholder: "e.g. 2–3 ml / Litre" },
    { key: "growthStage",      label: "Growth Stage",        type: "text",     placeholder: "e.g. Vegetative, Flowering" },
    { key: "bestForCrops",     label: "Best For Crops",      type: "chips",    placeholder: "e.g. Tomatoes, Grapes, Paddy" },
  ],

  Seeds: [
    { key: "varietyName",     label: "Variety Name",      type: "text", placeholder: "e.g. HYV-123, Pusa Basmati" },
    { key: "seedType",        label: "Seed Type",         type: "text", placeholder: "Hybrid / Open Pollinated / OPV" },
    { key: "germinationRate", label: "Germination Rate",  type: "text", placeholder: "e.g. 90–95%" },
    { key: "maturityPeriod",  label: "Maturity Period",   type: "text", placeholder: "e.g. 90–110 days" },
    { key: "seedRate",        label: "Seed Rate",         type: "text", placeholder: "e.g. 8–10 kg / acre" },
    { key: "suitableSeason",  label: "Suitable Season",   type: "text", placeholder: "Kharif / Rabi / Zaid" },
    { key: "bestRegions",     label: "Best Regions",      type: "chips",placeholder: "e.g. Maharashtra, Karnataka, Punjab" },
  ],

  Sprayers: [
    { key: "tankCapacity", label: "Tank Capacity",  type: "text", placeholder: "e.g. 16 Litres" },
    { key: "material",     label: "Material",       type: "text", placeholder: "e.g. HDPE, Stainless Steel" },
    { key: "weight",       label: "Weight",         type: "text", placeholder: "e.g. 2.5 kg (empty)" },
    { key: "powerSource",  label: "Power Source",   type: "text", placeholder: "Manual / Battery / Petrol" },
    { key: "sprayRange",   label: "Spray Range",    type: "text", placeholder: "e.g. 5–8 metres" },
    { key: "nozzleType",   label: "Nozzle Type",    type: "text", placeholder: "e.g. Adjustable fan nozzle" },
  ],

  Tools: [
    { key: "material",   label: "Material",      type: "text", placeholder: "e.g. High-carbon steel" },
    { key: "dimensions", label: "Dimensions",    type: "text", placeholder: "e.g. 40 × 15 cm" },
    { key: "weight",     label: "Weight",        type: "text", placeholder: "e.g. 1.2 kg" },
    { key: "suitableFor",label: "Suitable For",  type: "text", placeholder: "e.g. Weeding, Digging" },
    { key: "handleType", label: "Handle Type",   type: "text", placeholder: "e.g. Wooden, Fibreglass" },
    { key: "warranty",   label: "Warranty",      type: "text", placeholder: "e.g. 1 year manufacturer warranty" },
  ],

  Other: [
    { key: "keyFeatures",      label: "Key Features / Product Info", type: "textarea", placeholder: "e.g. Non-ionic surfactant. Improves spreading and sticking of spray solutions..." },
    { key: "benefits",         label: "Benefits",                    type: "chips",    placeholder: "e.g. Reduces surface tension, Improves coverage, Enhances absorption" },
    { key: "applicationMethod",label: "Application Method",          type: "text",     placeholder: "e.g. Tank mix with pesticide or herbicide solution" },
    { key: "dosage",           label: "Recommended Dosage",          type: "text",     placeholder: "e.g. 0.5 ml / Litre of spray solution" },
    { key: "specifications",   label: "Specifications",              type: "textarea", placeholder: "List key product specifications..." },
    { key: "application",      label: "Application",                 type: "textarea", placeholder: "Describe how the product is used..." },
    { key: "additionalNotes",  label: "Additional Notes",            type: "textarea", placeholder: "Any other relevant information..." },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Chips fields that are stored as string[] instead of string. */
export const CHIPS_FIELDS = new Set(["bestForCrops", "bestRegions", "benefits"]);

/** Convert a raw Firestore record to a typed CategoryInfo map. */
export function parseCategoryInfo(
  raw: Record<string, unknown>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) out[k] = v.map(String);
    else if (v != null) out[k] = String(v);
  }
  return out;
}

/**
 * Backward-compatibility helper: synthesize a categoryInfo map from the legacy
 * flat fertilizer fields that were stored directly on product documents
 * before this refactor (nitrogen, phosphorus, potassium, applicationDesc,
 * dosage, bestForCrops).
 *
 * Returns the synthesized map, or null if no legacy fields are present.
 */
export function synthesizeFertilizerInfo(
  data: Record<string, unknown>,
): Record<string, string | string[]> | null {
  const n  = data.nitrogen   ? String(data.nitrogen)   : "";
  const p  = data.phosphorus ? String(data.phosphorus) : "";
  const k  = data.potassium  ? String(data.potassium)  : "";
  const app= data.applicationDesc ? String(data.applicationDesc) : "";
  const dos= data.dosage     ? String(data.dosage)     : "";
  const bfc= Array.isArray(data.bestForCrops)
    ? data.bestForCrops.map(String)
    : data.bestForCrops ? [String(data.bestForCrops)] : [];

  if (!n && !p && !k && !app && !dos && !bfc.length) return null;

  const out: Record<string, string | string[]> = {};
  if (n)         out.nitrogen    = n;
  if (p)         out.phosphorus  = p;
  if (k)         out.potassium   = k;
  if (app)       out.application = app;
  if (dos)       out.dosage      = dos;
  if (bfc.length)out.bestForCrops= bfc;
  return out;
}

/**
 * Get the effective categoryInfo for a product, falling back to legacy flat
 * fields for Fertilizer products that predate this refactor.
 */
export function effectiveCategoryInfo(
  data: Record<string, unknown>,
): Record<string, string | string[]> | null {
  if (data.categoryInfo && typeof data.categoryInfo === "object" &&
      !Array.isArray(data.categoryInfo)) {
    const ci = data.categoryInfo as Record<string, unknown>;
    if (Object.keys(ci).length > 0) return parseCategoryInfo(ci);
  }
  // Fall back to legacy flat fields for Fertilizers
  const cat = String(data.category ?? "").trim();
  if (!cat || cat === "Fertilizers" || cat.toLowerCase().includes("fertilizer")) {
    return synthesizeFertilizerInfo(data);
  }
  return null;
}

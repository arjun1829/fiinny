/**
 * Category metadata for SEO category landing pages (/category/[category]).
 *
 * The canonical category names mirror PRODUCT_CATEGORIES in
 * app/dashboard/_lib/category-info.ts. This module is server-safe (no client
 * imports) and only provides display names, URL slugs and intro copy — it does
 * not touch product data or any business logic.
 */

export interface CategoryMeta {
  /** URL slug, e.g. "fertilizers" */
  slug: string;
  /** Canonical category name as stored on product docs, e.g. "Fertilizers" */
  name: string;
  /** Plural display heading */
  heading: string;
  /** ~150–250 word indexable intro copy rendered above the product grid */
  intro: string;
  /** SEO meta description */
  metaDescription: string;
}

export const SEO_CATEGORIES: CategoryMeta[] = [
  {
    slug: "seeds",
    name: "Seeds",
    heading: "Seeds",
    intro:
      "Buy high-quality agricultural seeds online at KrishiDukan. Browse hybrid and open-pollinated seed varieties for cereals, pulses, oilseeds, vegetables and cash crops, sourced from verified manufacturers and trusted local retailers. Each listing shows the variety name, seed type, germination rate, maturity period, recommended seed rate and the seasons and regions it suits best, so farmers can choose the right seed for their soil and climate. Compare prices across nearby sellers and order with doorstep delivery.",
    metaDescription:
      "Buy agricultural seeds online at KrishiDukan — hybrid & open-pollinated varieties for vegetables, cereals, pulses & cash crops. Best prices, verified sellers, doorstep delivery.",
  },
  {
    slug: "fertilizers",
    name: "Fertilizers",
    heading: "Fertilizers",
    intro:
      "Shop fertilizers online at KrishiDukan — from straight nutrients like urea and DAP to water-soluble NPK grades such as 19:19:19, micronutrient mixtures and organic options. Every product page lists the nitrogen, phosphorus and potassium content, recommended dosage, application method and the crops it works best for, helping farmers feed their crops correctly at each growth stage. Buy from verified manufacturers and nearby retailers at competitive prices with home delivery.",
    metaDescription:
      "Buy fertilizers online at KrishiDukan — urea, DAP, water-soluble NPK, micronutrients & organic fertilizers with NPK details, dosage & crop guidance. Best prices, doorstep delivery.",
  },
  {
    slug: "pesticides",
    name: "Pesticides",
    heading: "Pesticides",
    intro:
      "Protect your crops with the right pesticides from KrishiDukan. Browse insecticides for sucking and chewing pests, with each listing detailing the active ingredient, chemical group, target pest, mode of action, recommended dosage and the safe waiting period before harvest. Choose the correct product for your crop and pest problem, compare prices across verified sellers, and order online with delivery to your farm.",
    metaDescription:
      "Buy pesticides & insecticides online at KrishiDukan with active ingredient, target pest, dosage & waiting-period details. Verified sellers, best prices, doorstep delivery.",
  },
  {
    slug: "herbicides",
    name: "Herbicides",
    heading: "Herbicides (Weedicides)",
    intro:
      "Control weeds effectively with herbicides from KrishiDukan. Find selective and non-selective weedicides for pre-emergence and post-emergence application, with each listing showing the active ingredient, target weeds, type, application stage, recommended dosage and suitable crops. Pick the right herbicide for your field, compare prices from verified manufacturers and retailers, and get it delivered to your doorstep.",
    metaDescription:
      "Buy herbicides & weedicides online at KrishiDukan — selective & non-selective, pre- and post-emergence, with active ingredient, target weeds & dosage. Best prices, doorstep delivery.",
  },
  {
    slug: "bio-stimulants",
    name: "Bio-Stimulants",
    heading: "Bio-Stimulants",
    intro:
      "Boost crop growth and yield with bio-stimulants from KrishiDukan. Browse products based on humic acid, seaweed extract, amino acids and other natural ingredients that improve root development, nutrient uptake and stress tolerance. Each listing details the key ingredients, benefits, application method, dosage, growth stage and best crops. Buy from verified sellers at competitive prices with home delivery.",
    metaDescription:
      "Buy bio-stimulants online at KrishiDukan — humic acid, seaweed extract & amino-acid based growth promoters with benefits, dosage & crop details. Verified sellers, doorstep delivery.",
  },
  {
    slug: "sprayers",
    name: "Sprayers",
    heading: "Sprayers",
    intro:
      "Find the right sprayer for your farm at KrishiDukan. Browse manual, battery-operated and petrol knapsack sprayers across tank capacities, with each listing showing the tank size, material, weight, power source, spray range and nozzle type. Compare prices from verified manufacturers and retailers and order online with doorstep delivery.",
    metaDescription:
      "Buy agricultural sprayers online at KrishiDukan — manual, battery & petrol knapsack sprayers with tank capacity, power source & nozzle details. Best prices, doorstep delivery.",
  },
  {
    slug: "tools",
    name: "Tools",
    heading: "Farming Tools & Equipment",
    intro:
      "Equip your farm with quality tools from KrishiDukan. Browse hand tools and farming equipment for weeding, digging, harvesting and more, with each listing detailing the material, dimensions, weight, intended use, handle type and warranty. Buy durable, well-priced tools from verified sellers with delivery to your doorstep.",
    metaDescription:
      "Buy farming tools & equipment online at KrishiDukan — weeding, digging & harvesting tools with material, dimensions & warranty details. Best prices, doorstep delivery.",
  },
  {
    slug: "other",
    name: "Other",
    heading: "Other Agriculture Products",
    intro:
      "Discover more agriculture products at KrishiDukan that support every stage of farming. Browse this category for items beyond the standard seed, fertilizer, crop-protection and equipment ranges, each with detailed specifications and usage guidance. Compare prices from verified manufacturers and retailers and order online with doorstep delivery.",
    metaDescription:
      "Browse more agriculture products online at KrishiDukan — verified sellers, detailed specifications and best prices with doorstep delivery for farmers across India.",
  },
];

/** Look up category metadata by URL slug (case-insensitive). */
export function getCategoryBySlug(slug: string): CategoryMeta | null {
  const s = slug.trim().toLowerCase();
  return SEO_CATEGORIES.find((c) => c.slug === s) ?? null;
}

/** Map an arbitrary stored category name to its SEO slug, or null if unknown. */
export function categoryNameToSlug(name: string): string | null {
  const n = name.trim().toLowerCase();
  return SEO_CATEGORIES.find((c) => c.name.toLowerCase() === n)?.slug ?? null;
}

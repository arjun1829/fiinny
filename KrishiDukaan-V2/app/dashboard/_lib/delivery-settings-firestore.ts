import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { DeliverySettings, WeightSlab, CoverageType } from "../_types/delivery-settings";

const COLLECTION = "deliverySettings";

function phoneFromData(data: Record<string, unknown>): string {
  return String(data.sellerPhone ?? "");
}

export async function fetchDeliverySettings(
  sellerPhone: string,
): Promise<DeliverySettings | null> {
  if (!sellerPhone) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, sellerPhone));
    if (!snap.exists()) return null;
    const d = snap.data() as Record<string, unknown>;
    return {
      sellerPhone: phoneFromData(d),
      onlineDeliveryEnabled: d.onlineDeliveryEnabled === true,
      coverageType: d.coverageType === "states" ? "states" : "pan_india",
      states: Array.isArray(d.states) ? (d.states as string[]) : [],
      weightSlabs: Array.isArray(d.weightSlabs)
        ? (d.weightSlabs as WeightSlab[]).filter(
            (s) =>
              typeof s.minKg === "number" &&
              typeof s.maxKg === "number" &&
              typeof s.charge === "number",
          )
        : [],
      updatedAt: (d.updatedAt as DeliverySettings["updatedAt"]) ?? null,
    };
  } catch {
    return null;
  }
}

export async function saveDeliverySettings(
  sellerPhone: string,
  settings: {
    onlineDeliveryEnabled: boolean;
    coverageType: CoverageType;
    states: string[];
    weightSlabs: WeightSlab[];
  },
): Promise<void> {
  const now = serverTimestamp();

  // 1. Write full config to deliverySettings/{sellerPhone}
  await setDoc(
    doc(db, COLLECTION, sellerPhone),
    {
      sellerPhone,
      onlineDeliveryEnabled: settings.onlineDeliveryEnabled,
      coverageType: settings.coverageType,
      states: settings.coverageType === "states" ? settings.states : [],
      weightSlabs: settings.weightSlabs,
      updatedAt: now,
    },
    { merge: true },
  );

}

/**
 * Given a cart weight in kg and the seller's weight slabs,
 * return the delivery charge. Returns 0 if no matching slab found (free / unconfigured).
 */
export function calculateDeliveryCharge(
  weightKg: number,
  slabs: WeightSlab[],
): number {
  const sorted = [...slabs].sort((a, b) => a.minKg - b.minKg);
  for (const slab of sorted) {
    if (weightKg >= slab.minKg && weightKg < slab.maxKg) return slab.charge;
  }
  // Check if above all slabs (open-ended last slab)
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    if (weightKg >= last.minKg) return last.charge;
  }
  return 0;
}

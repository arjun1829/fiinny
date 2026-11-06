"use client";

import { useEffect, useState } from "react";
import { Truck, Save, Loader2, X, Info, Globe, MapPin } from "lucide-react";
import Link from "next/link";
import {
  fetchDeliverySettings,
  saveDeliverySettings,
} from "../_lib/delivery-settings-firestore";
import {
  DEFAULT_IN_STATE_SLABS,
  DEFAULT_OUT_STATE_SLABS,
} from "../_types/delivery-settings";
import { SlabList, slabSetHasErrors, type SlabDraft } from "./delivery-settings-page";
import type { WeightSlab } from "../_types/delivery-settings";
import { useI18n } from "../../i18n/I18nContext";

/**
 * In-place popup shown right after a seller accepts the Online Delivery terms.
 *
 * It reuses the exact slab editor (SlabList) and validation from the full
 * Delivery Settings page, prefilled with:
 *   • the spec'd pan-India DEFAULTS when the seller has no saved configuration
 *     (first-time setup), or
 *   • the seller's OWN saved slabs when a configuration already exists — so it
 *     is also a quick "edit my delivery charges" dialog and never silently
 *     replaces existing values (nothing is written until the seller hits Save).
 *
 * Coverage: pan-India is the default for first-time setup. A seller already on
 * state-specific coverage is sent to the full page instead, so this focused
 * popup can never flip their coverage to pan-India by accident.
 */
export function DeliverySetupModal({
  open,
  sellerPhone,
  sellerState,
  onClose,
  onSaved,
}: {
  open: boolean;
  sellerPhone: string;
  sellerState: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inStateSlabs, setInStateSlabs] = useState<SlabDraft[]>([]);
  const [outStateSlabs, setOutStateSlabs] = useState<SlabDraft[]>([]);
  const [isDefaults, setIsDefaults] = useState(true);
  const [statesCoverage, setStatesCoverage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !sellerPhone) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const existing = await fetchDeliverySettings(sellerPhone);
      if (cancelled) return;
      if (existing && existing.coverageType === "states") {
        // Don't risk flipping their coverage — defer to the full page.
        setStatesCoverage(true);
        setLoading(false);
        return;
      }
      setStatesCoverage(false);
      const hasExisting =
        !!existing &&
        (existing.inStateSlabs.length > 0 ||
          existing.outStateSlabs.length > 0 ||
          existing.weightSlabs.length > 0);
      if (hasExisting) {
        const inSet = existing!.inStateSlabs.length ? existing!.inStateSlabs : existing!.weightSlabs;
        setInStateSlabs(inSet.map((s) => ({ ...s })));
        setOutStateSlabs(
          (existing!.outStateSlabs.length ? existing!.outStateSlabs : DEFAULT_OUT_STATE_SLABS).map((s) => ({ ...s })),
        );
        setIsDefaults(false);
      } else {
        setInStateSlabs(DEFAULT_IN_STATE_SLABS.map((s) => ({ ...s })));
        setOutStateSlabs(DEFAULT_OUT_STATE_SLABS.map((s) => ({ ...s })));
        setIsDefaults(true);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sellerPhone]);

  if (!open) return null;

  const hasErrors =
    slabSetHasErrors(inStateSlabs as WeightSlab[]) ||
    slabSetHasErrors(outStateSlabs as WeightSlab[]);
  const canSave = !hasErrors && !!sellerPhone && !loading && !statesCoverage;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await saveDeliverySettings(sellerPhone, {
        onlineDeliveryEnabled: true,
        coverageType: "pan_india",
        states: [],
        weightSlabs: inStateSlabs as WeightSlab[],
        inStateSlabs: inStateSlabs as WeightSlab[],
        outStateSlabs: outStateSlabs as WeightSlab[],
        sellerState: sellerState ?? "",
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deliverySaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-setup-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl bg-surface-container-lowest shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/30 px-5 py-4">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary shrink-0" />
            <h2 id="delivery-setup-title" className="text-base font-semibold text-on-surface">
              {t("deliverySettingsTitle")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {statesCoverage ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <MapPin className="h-9 w-9 text-on-surface-variant/40" />
              <p className="text-sm text-on-surface-variant max-w-sm">
                {t("deliveryCoverageSubtitle")}
              </p>
              <Link
                href="/dashboard/delivery"
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
              >
                {t("deliverySettingsTitle")}
              </Link>
            </div>
          ) : (
            <>
              {isDefaults && (
                <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                  <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-on-surface">{t("deliveryDefaultsBannerTitle")}</p>
                    <p className="mt-0.5 text-xs text-on-surface-variant leading-relaxed">
                      {t("deliveryDefaultsBannerBody")}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low/60 px-3 py-2.5">
                <Globe className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <p className="text-xs text-on-surface-variant">{t("deliveryPanIndiaInfo")}</p>
              </div>

              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <div>
                    <p className="mb-2 text-sm font-bold text-on-surface">
                      {sellerState
                        ? t("deliveryWithinStateTitleNamed", { state: sellerState })
                        : t("deliveryWithinStateTitle")}
                    </p>
                    <SlabList slabs={inStateSlabs} setSlabs={setInStateSlabs} disabled={saving} t={t} />
                  </div>
                  <div className="border-t border-outline-variant/20 pt-5">
                    <p className="mb-2 text-sm font-bold text-on-surface">{t("deliveryOutsideStateTitle")}</p>
                    <SlabList slabs={outStateSlabs} setSlabs={setOutStateSlabs} disabled={saving} t={t} />
                  </div>
                  <Link
                    href="/dashboard/delivery"
                    onClick={onClose}
                    className="self-start text-xs font-semibold text-primary hover:underline"
                  >
                    {t("deliveryCoverageTitle")} →
                  </Link>
                </>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        {!statesCoverage && (
          <div className="flex items-center justify-end gap-3 border-t border-outline-variant/30 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
            >
              {t("cancelBtn")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("deliverySaving")}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> {t("deliverySaveSettings")}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

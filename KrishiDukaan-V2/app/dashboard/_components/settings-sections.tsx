"use client";

import { useState } from "react";
import { shopProfileMock } from "../_data/mock";
import { useI18n } from "../../i18n/I18nContext";

export function SettingsSections() {
  const { t } = useI18n();
  const [profile, setProfile] = useState(shopProfileMock);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5">
        <h2 className="text-base font-semibold text-on-surface">{t('shopProfileSection')}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{t('shopProfileSectionDesc')}</p>
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('shopNameLabel')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.shopName}
              onChange={(e) => setProfile((p) => ({ ...p, shopName: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('taglineLabel')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.tagline}
              onChange={(e) => setProfile((p) => ({ ...p, tagline: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('ownerManagerLabel')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.owner}
              onChange={(e) => setProfile((p) => ({ ...p, owner: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5">
        <h2 className="text-base font-semibold text-on-surface">{t('contactDetailsSection')}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{t('contactDetailsSectionDesc')}</p>
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('phoneLabelDash')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.phone}
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('emailLabelDash')}</span>
            <input
              type="email"
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.email}
              onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('whatsAppLabel')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.whatsapp}
              onChange={(e) => setProfile((p) => ({ ...p, whatsapp: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5 lg:col-span-2">
        <h2 className="text-base font-semibold text-on-surface">{t('addressSection')}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{t('addressSectionDesc')}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('line1Label')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.addressLine1}
              onChange={(e) => setProfile((p) => ({ ...p, addressLine1: e.target.value }))}
            />
          </label>
          <label className="sm:col-span-2 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('line2Label')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.addressLine2}
              onChange={(e) => setProfile((p) => ({ ...p, addressLine2: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('cityLabel')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.city}
              onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('stateLabel')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.state}
              onChange={(e) => setProfile((p) => ({ ...p, state: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('pinLabel')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.pin}
              onChange={(e) => setProfile((p) => ({ ...p, pin: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('gstinLabel')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.gstin}
              onChange={(e) => setProfile((p) => ({ ...p, gstin: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5 lg:col-span-2">
        <h2 className="text-base font-semibold text-on-surface">{t('businessSettingsSection')}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{t('businessSettingsDesc')}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('storeHoursLabel')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.hours}
              onChange={(e) => setProfile((p) => ({ ...p, hours: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('deliveryRadiusLabel')}</span>
            <input
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
              value={profile.deliveryRadiusKm}
              onChange={(e) => setProfile((p) => ({ ...p, deliveryRadiusKm: e.target.value }))}
            />
          </label>
          <div className="flex flex-col justify-end gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm font-medium text-on-surface">
              <input
                type="checkbox"
                checked={profile.codEnabled}
                onChange={(e) => setProfile((p) => ({ ...p, codEnabled: e.target.checked }))}
                className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
              />
              {t('cashOnDelivery')}
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-on-surface">
              <input
                type="checkbox"
                checked={profile.onlinePayments}
                onChange={(e) => setProfile((p) => ({ ...p, onlinePayments: e.target.checked }))}
                className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
              />
              {t('onlinePaymentsLabel')}
            </label>
          </div>
        </div>
        <p className="mt-4 text-xs text-on-surface-variant">
          {t('changesLocalOnly')}
        </p>
      </section>
    </div>
  );
}

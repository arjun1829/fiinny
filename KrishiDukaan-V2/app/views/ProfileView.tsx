"use client";

import { MarketplaceProduct } from "../../types/product";
import { FormEvent, useState } from 'react';
import { ICONS } from '../constants';
import { saveManufacturerProduct, saveRetailerProduct, db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useI18n } from '../i18n/I18nContext';
import { HelperIcon } from '../../components/helpers';
import { ChevronDown, Layers } from 'lucide-react';
import MyOrdersView from './MyOrdersView';

type UserRole = 'customer' | 'retailer' | 'manufacturer';

interface UserProfile {
  name: string;
  phone: string;
  email: string;
  totalSeats?: number;
  productCount?: number;
}

interface ProfileViewProps {
  uid: string;
  role: UserRole;
  profile: UserProfile;
  onProfileSave: (profile: UserProfile) => void;
  onRetailerProductSaved: () => Promise<void>;
  onNavigate?: (view: any) => void;
}

interface ProductFormState {
  name: string;
  price: string;
  description: string;
  image: string;
  stock: string;
  category: string;
  distance: string;
  sellMode: "online_delivery" | "offline_store_only";
  nitrogen?: string;
  phosphorus?: string;
  potassium?: string;
  applicationDesc?: string;
  dosage?: string;
  bestForCrops?: string;
}

const initialProductForm: ProductFormState = {
  name: '',
  price: '',
  description: '',
  image: '',
  stock: 'In Stock',
  category: 'general',
  distance: 'Nearby',
  sellMode: 'offline_store_only',
  nitrogen: '',
  phosphorus: '',
  potassium: '',
  applicationDesc: '',
  dosage: '',
  bestForCrops: ''
};

export default function ProfileView({
  uid,
  role,
  profile,
  onProfileSave,
  onRetailerProductSaved,
  onNavigate,
}: ProfileViewProps) {
  const { t } = useI18n();
  const [localProfile, setLocalProfile] = useState(profile);
  const [productForm, setProductForm] = useState<ProductFormState>(initialProductForm);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showAdditionalData, setShowAdditionalData] = useState(false);

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uid) {
      setStatus({ type: 'error', message: t('pvSignInToSaveProfile') });
      return;
    }
    setSavingProfile(true);
    setStatus(null);
    try {
      await updateDoc(doc(db, 'users', uid), {
        name: localProfile.name.trim(),
        phone: localProfile.phone.trim(),
        email: localProfile.email.trim(),
        updatedAt: serverTimestamp()
      });
      onProfileSave(localProfile);
      setStatus({ type: 'success', message: t('pvProfileUpdated') });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('pvProfileUpdateFailed');
      setStatus({ type: 'error', message });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleProductSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uid) {
      setStatus({ type: 'error', message: t('pvSignInToPublish') });
      return;
    }
    setLoadingProduct(true);
    setStatus(null);
    try {
      const cleanBestForCrops = productForm.bestForCrops
        ? productForm.bestForCrops.split(',').map((s) => s.trim()).filter(Boolean)
        : null;

      const payload = {
        ...productForm,
        bestForCrops: cleanBestForCrops,
        nitrogen: productForm.nitrogen?.trim() || null,
        phosphorus: productForm.phosphorus?.trim() || null,
        potassium: productForm.potassium?.trim() || null,
        applicationDesc: productForm.applicationDesc?.trim() || null,
        dosage: productForm.dosage?.trim() || null,
      };

      if (role === 'retailer') {
        await saveRetailerProduct(uid, {
          ...payload,
          store: localProfile.name
        });
      } else {
        await saveManufacturerProduct(uid, {
          ...payload,
          manufacturerName: localProfile.name
        });
      }
      await onRetailerProductSaved();
      setProductForm(initialProductForm);
      setShowAdditionalData(false);
      setStatus({ type: 'success', message: t('pvProductPublished') });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('pvPublishFailed');
      setStatus({ type: 'error', message });
    } finally {
      setLoadingProduct(false);
    }
  };

  const totalSeats = profile.totalSeats || 0;
  const productCount = profile.productCount || 0;
  const seatsRemaining = Math.max(0, totalSeats - productCount);

  const isBusinessRole = role === 'retailer' || role === 'manufacturer';

  return (
    <div className="px-4 md:px-10 max-w-5xl mx-auto w-full py-8 space-y-6">
      {/* Listing Seats Card - Business roles only */}
      {isBusinessRole && (
        <div className="bg-primary/5 rounded-3xl border border-primary/20 p-6 md:p-8 flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ICONS.Star className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-primary uppercase tracking-wider">{t('pvListingSeatsTitle')}</h2>
              <HelperIcon
                size="xs"
                variant="ghost"
                side="right"
                textKey="pvListingSeats"
                ariaLabel={`${t('pvListingSeatsTitle')} help`}
              />
            </div>
            <p className="text-on-surface-variant text-sm">
              {t('pvSeatsUsage', { used: productCount, total: totalSeats })}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <span className="text-2xl font-black text-on-surface">{seatsRemaining}</span>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">{t('pvAvailable')}</p>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('subscription')}
              className="bg-primary text-white text-xs font-black uppercase tracking-widest px-6 py-3 rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
            >
              {t('pvBuyMoreSeats')}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-surface-container p-6 md:p-8 shadow-ambient">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-on-surface">{t('pvMyProfile')}</h1>
              <HelperIcon
                size="sm"
                variant="ghost"
                side="right"
                textKey="pvProfileSection"
                ariaLabel={`${t('pvMyProfile')} help`}
              />
            </div>
            <p className="text-on-surface-variant text-sm mt-1">
              {t('pvManageProfileDesc')}
            </p>
          </div>
        </div>

        <form onSubmit={handleProfileSubmit} className="grid md:grid-cols-3 gap-4">
          <input
            type="text"
            value={localProfile.name}
            onChange={(e) => setLocalProfile((prev) => ({ ...prev, name: e.target.value }))}
            placeholder={t('pvNamePlaceholder')}
            required
            className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="tel"
            value={localProfile.phone}
            onChange={(e) => setLocalProfile((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder={t('pvPhonePlaceholder')}
            required
            className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="email"
            value={localProfile.email}
            onChange={(e) => setLocalProfile((prev) => ({ ...prev, email: e.target.value }))}
            placeholder={t('pvEmailPlaceholder')}
            required
            className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={savingProfile}
            className="md:col-span-3 bg-primary text-white font-semibold px-5 py-3 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-70"
          >
            {savingProfile ? t('pvSaving') : t('pvSaveProfile')}
          </button>
        </form>
      </div>

      {/* My Orders — customers only */}
      {role === 'customer' && uid && (
        <div className="bg-white rounded-3xl border border-surface-container p-6 md:p-8 shadow-ambient">
          <div className="flex items-center gap-2 mb-5">
            <ICONS.Delivery className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-on-surface">My Orders</h2>
          </div>
          <MyOrdersView customerId={uid} />
        </div>
      )}

      {isBusinessRole && (
        <div className="bg-white rounded-3xl border border-surface-container p-6 md:p-8 shadow-ambient">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xl font-bold text-on-surface">{t('pvAddProductTitle')}</h2>
            <HelperIcon
              size="xs"
              variant="ghost"
              side="right"
              textKey="pvProductMedia"
              ariaLabel={`${t('pvAddProductTitle')} help`}
            />
          </div>
          <form onSubmit={handleProductSubmit} className="grid md:grid-cols-2 gap-4">
            <input type="text" required value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} placeholder={t('pvProductNamePlaceholder')} className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <input type="number" required min="1" value={productForm.price} onChange={(e) => setProductForm((p) => ({ ...p, price: e.target.value }))} placeholder={t('pvPricePlaceholder')} className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <input type="text" required value={productForm.category} onChange={(e) => setProductForm((p) => ({ ...p, category: e.target.value }))} placeholder={t('pvCategoryPlaceholder')} className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <div className="relative flex items-center gap-2">
              <select value={productForm.sellMode} onChange={(e) => setProductForm((p) => ({ ...p, sellMode: e.target.value as "online_delivery" | "offline_store_only" }))} className="flex-1 bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="offline_store_only">{t('pvSellModeOffline')}</option>
                <option value="online_delivery">{t('pvSellModeOnline')}</option>
              </select>
              <HelperIcon
                size="xs"
                variant="ghost"
                side="left"
                textKey="pvSellMode"
                ariaLabel={`${t('pvSellModeOffline')} help`}
              />
            </div>
            <input type="text" required value={productForm.stock} onChange={(e) => setProductForm((p) => ({ ...p, stock: e.target.value }))} placeholder={t('pvStockPlaceholder')} className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <input type="text" required value={productForm.distance} onChange={(e) => setProductForm((p) => ({ ...p, distance: e.target.value }))} placeholder={t('pvDistancePlaceholder')} className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <input type="url" required value={productForm.image} onChange={(e) => setProductForm((p) => ({ ...p, image: e.target.value }))} placeholder={t('pvImageUrlPlaceholder')} className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <textarea value={productForm.description} required onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))} placeholder={t('pvDescriptionPlaceholder')} className="md:col-span-2 bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm min-h-24 focus:outline-none focus:ring-1 focus:ring-primary" />

            {/* Additional details collapsible button */}
            <div className="md:col-span-2 border-t border-outline-variant/20 pt-4 mt-2">
              <button
                type="button"
                onClick={() => setShowAdditionalData(!showAdditionalData)}
                className="flex items-center justify-between text-sm font-semibold text-on-surface w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 focus:outline-none"
              >
                <span className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> {t('additionalDataLabel') || 'Additional Data'} (Optional)
                </span>
                <ChevronDown className={`h-4 w-4 text-on-surface-variant transition-transform ${showAdditionalData ? 'rotate-180' : ''}`} />
              </button>
              
              {showAdditionalData && (
                <div className="flex flex-col gap-4 mt-4 bg-surface-container-low/40 p-4 rounded-2xl border border-outline-variant/20">
                  {/* Composition */}
                  <div>
                    <span className="text-xs font-bold text-primary uppercase tracking-wider block mb-2">{t('composition')}</span>
                    <div className="grid grid-cols-3 gap-3">
                      <input
                        type="text"
                        disabled={loadingProduct}
                        value={productForm.nitrogen || ''}
                        onChange={(e) => setProductForm((p) => ({ ...p, nitrogen: e.target.value }))}
                        placeholder={t('nitrogenN') || 'Nitrogen (N)'}
                        className="bg-white border border-outline-variant rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <input
                        type="text"
                        disabled={loadingProduct}
                        value={productForm.phosphorus || ''}
                        onChange={(e) => setProductForm((p) => ({ ...p, phosphorus: e.target.value }))}
                        placeholder={t('phosphorusP') || 'Phosphorus (P)'}
                        className="bg-white border border-outline-variant rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <input
                        type="text"
                        disabled={loadingProduct}
                        value={productForm.potassium || ''}
                        onChange={(e) => setProductForm((p) => ({ ...p, potassium: e.target.value }))}
                        placeholder={t('potassiumK') || 'Potassium (K)'}
                        className="bg-white border border-outline-variant rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Application */}
                  <div className="border-t border-outline-variant/20 pt-4 flex flex-col gap-3">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider block">{t('application')}</span>
                    <textarea
                      disabled={loadingProduct}
                      rows={2}
                      value={productForm.applicationDesc || ''}
                      onChange={(e) => setProductForm((p) => ({ ...p, applicationDesc: e.target.value }))}
                      placeholder={t('application') || 'Application Instructions'}
                      className="bg-white border border-outline-variant rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                    <input
                      type="text"
                      disabled={loadingProduct}
                      value={productForm.dosage || ''}
                      onChange={(e) => setProductForm((p) => ({ ...p, dosage: e.target.value }))}
                      placeholder={t('recommendedDosage') || 'Recommended Dosage'}
                      className="bg-white border border-outline-variant rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {/* Best for Crops */}
                  <div className="border-t border-outline-variant/20 pt-4">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider block mb-1">{t('bestForCrops')}</span>
                    <p className="text-[10px] text-on-surface-variant mb-2">{t('formBestForCropsHint')}</p>
                    <input
                      type="text"
                      disabled={loadingProduct}
                      value={productForm.bestForCrops || ''}
                      onChange={(e) => setProductForm((p) => ({ ...p, bestForCrops: e.target.value }))}
                      placeholder="e.g. Tomatoes, Wheat, Sugarcane"
                      className="w-full bg-white border border-outline-variant rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              )}
            </div>

            {seatsRemaining <= 0 && (
              <div className="md:col-span-2 bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-sm font-medium">
                {t('pvLimitReachedMsg', { used: productCount, total: totalSeats })}
              </div>
            )}

            <button
              type="submit"
              disabled={loadingProduct || seatsRemaining <= 0}
              className="md:col-span-2 inline-flex items-center justify-center gap-2 bg-primary text-white font-semibold px-5 py-3 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              <ICONS.AddToCart className="w-4 h-4" />
              {loadingProduct ? t('pvPublishing') : seatsRemaining <= 0 ? t('pvLimitReached') : t('pvPublishProduct')}
            </button>
          </form>
        </div>
      )}

      {status && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            status.type === 'success'
              ? 'bg-primary-container/20 text-primary border border-primary/30'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {status.message}
        </div>
      )}
    </div>
  );
}

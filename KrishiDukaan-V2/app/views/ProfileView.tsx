import { MarketplaceProduct } from "../../types/product";
import { FormEvent, useState } from 'react';
import { ICONS } from '../constants';
import { saveManufacturerProduct, saveRetailerProduct, db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

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
}

const initialProductForm: ProductFormState = {
  name: '',
  price: '',
  description: '',
  image: '',
  stock: 'In Stock',
  category: 'general',
  distance: 'Nearby',
  sellMode: 'offline_store_only'
};

export default function ProfileView({
  uid,
  role,
  profile,
  onProfileSave,
  onRetailerProductSaved,
  onNavigate
}: ProfileViewProps) {
  const [localProfile, setLocalProfile] = useState(profile);
  const [productForm, setProductForm] = useState<ProductFormState>(initialProductForm);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uid) {
      setStatus({ type: 'error', message: 'Please sign in to save profile.' });
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
      setStatus({ type: 'success', message: 'Profile details updated.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile.';
      setStatus({ type: 'error', message });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleProductSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uid) {
      setStatus({ type: 'error', message: 'Please sign in to publish products.' });
      return;
    }
    setLoadingProduct(true);
    setStatus(null);
    try {
      if (role === 'retailer') {
        await saveRetailerProduct(uid, {
          ...productForm,
          store: localProfile.name
        });
      } else {
        await saveManufacturerProduct(uid, {
          ...productForm,
          manufacturerName: localProfile.name
        });
      }
      await onRetailerProductSaved();
      setProductForm(initialProductForm);
      setStatus({ type: 'success', message: 'Product published. Customers can now see it.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish product.';
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
              <h2 className="text-lg font-bold text-primary uppercase tracking-wider">Product Listing Seats</h2>
            </div>
            <p className="text-on-surface-variant text-sm">
              You have used <span className="font-bold text-on-surface">{productCount}</span> out of <span className="font-bold text-on-surface">{totalSeats}</span> available seats.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <span className="text-2xl font-black text-on-surface">{seatsRemaining}</span>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Available</p>
            </div>
            <button 
              onClick={() => onNavigate && onNavigate('subscription')}
              className="bg-primary text-white text-xs font-black uppercase tracking-widest px-6 py-3 rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
            >
              Buy More Seats
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-surface-container p-6 md:p-8 shadow-ambient">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">My Profile</h1>
            <p className="text-on-surface-variant text-sm mt-1">
              Manage your business profile and product listings.
            </p>
          </div>
        </div>

        <form onSubmit={handleProfileSubmit} className="grid md:grid-cols-3 gap-4">
          <input
            type="text"
            value={localProfile.name}
            onChange={(e) => setLocalProfile((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Your Name"
            required
            className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="tel"
            value={localProfile.phone}
            onChange={(e) => setLocalProfile((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="Phone Number"
            required
            className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="email"
            value={localProfile.email}
            onChange={(e) => setLocalProfile((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="Email Address"
            required
            className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={savingProfile}
            className="md:col-span-3 bg-primary text-white font-semibold px-5 py-3 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-70"
          >
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>

      {isBusinessRole && (
        <div className="bg-white rounded-3xl border border-surface-container p-6 md:p-8 shadow-ambient">
          <h2 className="text-xl font-bold text-on-surface mb-4">Add Product for Customers</h2>
          <form onSubmit={handleProductSubmit} className="grid md:grid-cols-2 gap-4">
            <input type="text" required value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} placeholder="Product Name" className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <input type="number" required min="1" value={productForm.price} onChange={(e) => setProductForm((p) => ({ ...p, price: e.target.value }))} placeholder="Price (₹)" className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <input type="text" required value={productForm.category} onChange={(e) => setProductForm((p) => ({ ...p, category: e.target.value }))} placeholder="Category (seeds/fertilizers/tools)" className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <select value={productForm.sellMode} onChange={(e) => setProductForm((p) => ({ ...p, sellMode: e.target.value as "online_delivery" | "offline_store_only" }))} className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="offline_store_only">Offline store only</option>
              <option value="online_delivery">Online + Delivery</option>
            </select>
            <input type="text" required value={productForm.stock} onChange={(e) => setProductForm((p) => ({ ...p, stock: e.target.value }))} placeholder="Stock Status (In Stock)" className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <input type="text" required value={productForm.distance} onChange={(e) => setProductForm((p) => ({ ...p, distance: e.target.value }))} placeholder="Distance (e.g. 2.5km)" className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <input type="url" required value={productForm.image} onChange={(e) => setProductForm((p) => ({ ...p, image: e.target.value }))} placeholder="Product Image URL" className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <textarea value={productForm.description} required onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))} placeholder="Product Description" className="md:col-span-2 bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm min-h-24 focus:outline-none focus:ring-1 focus:ring-primary" />
            
            {seatsRemaining <= 0 && (
              <div className="md:col-span-2 bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-sm font-medium">
                You have reached your product listing limit ({productCount}/{totalSeats}). Please buy more seats to publish new products.
              </div>
            )}

            <button
              type="submit"
              disabled={loadingProduct || seatsRemaining <= 0}
              className="md:col-span-2 inline-flex items-center justify-center gap-2 bg-primary text-white font-semibold px-5 py-3 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              <ICONS.AddToCart className="w-4 h-4" />
              {loadingProduct ? 'Publishing...' : seatsRemaining <= 0 ? 'Limit Reached' : 'Publish Product'}
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

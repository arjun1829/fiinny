"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil, Search, ShieldCheck, Users, AlertTriangle, X, Check,
  Package, ChevronRight, ChevronUp, ChevronDown, ExternalLink, UserPlus, Loader2, Link2, Trash2,
  SlidersHorizontal, Calendar, RotateCcw, MapPin, Truck, WifiOff, Tag, Receipt, LayoutDashboard,
} from "lucide-react";
import {
  fetchAllUsers, promoteToAdmin,
  fetchAllSellerProducts, fetchAllSubscriptions,
  selectUserProductDocs, collapseUserProductDocs,
  adminAssignProductToSeller, adminRemoveAssignment, ensureSellerStorefront,
  adminUpdateProductSellMode,
  type UserProduct,
  db, auth,
} from "../../firebase";
import { AdminUserEditPanel } from "../_components/admin-user-edit-panel";
import { SearchableDropdown } from "../_components/searchable-dropdown";
import { AddProductInventoryForm } from "../../dashboard/_components/add-product-inventory-form";
import { DiscountPanel } from "../../dashboard/_components/discount-panel";
import {
  addDoc, doc, setDoc, getDoc, serverTimestamp, collection, Timestamp, GeoPoint,
  query, where, getDocs, limit,
} from "firebase/firestore";

declare global {
  interface Window { google?: any }
}

function extractAddressFields(place: any) {
  const out: { address?: string; city?: string; state?: string; pincode?: string; latitude?: number; longitude?: number } = {};
  const parts: { long_name: string; types: string[] }[] = place?.address_components || [];
  for (const want of ["locality", "postal_town", "sublocality_level_1", "administrative_area_level_2"]) {
    const m = parts.find(p => p.types.includes(want));
    if (m) { out.city = m.long_name; break; }
  }
  const st = parts.find(p => p.types.includes("administrative_area_level_1"));
  if (st) out.state = st.long_name;
  const pin = parts.find(p => p.types.includes("postal_code"));
  if (pin) out.pincode = pin.long_name;
  if (place?.formatted_address) out.address = place.formatted_address;
  if (place?.geometry?.location) {
    out.latitude  = typeof place.geometry.location.lat === "function" ? place.geometry.location.lat() : place.geometry.location.lat;
    out.longitude = typeof place.geometry.location.lng === "function" ? place.geometry.location.lng() : place.geometry.location.lng;
  }
  return out;
}

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-red-100 text-red-700 border border-red-200",
  manufacturer: "bg-blue-100 text-blue-700 border border-blue-200",
  retailer: "bg-green-100 text-green-700 border border-green-200",
  customer: "bg-gray-100 text-gray-600 border border-gray-200",
};

function AdminSellModeToggle({
  productId, sellMode, sellerPhone, onRefresh,
}: {
  productId: string;
  sellMode: string | undefined;
  sellerPhone: string | undefined;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const isOnline = sellMode !== "offline_store_only";

  const handleToggle = async () => {
    if (!productId) return;
    setBusy(true);
    try {
      const next: "online_delivery" | "offline_store_only" = isOnline ? "offline_store_only" : "online_delivery";
      await adminUpdateProductSellMode(productId, next, sellerPhone);
      await onRefresh();
    } catch (e) {
      console.error("Failed to toggle sell mode", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className={`flex items-center gap-1 cursor-pointer select-none ${busy ? "opacity-60 pointer-events-none" : ""}`} title={isOnline ? "Online delivery — click to disable" : "Offline only — click to enable"}>
      {isOnline
        ? <Truck className="h-2.5 w-2.5 text-blue-500 shrink-0" />
        : <WifiOff className="h-2.5 w-2.5 text-orange-500 shrink-0" />}
      <span className={`text-[10px] font-semibold ${isOnline ? "text-blue-600" : "text-orange-600"}`}>
        {isOnline ? "Online" : "Offline"}
      </span>
      <div className="relative shrink-0">
        <input type="checkbox" className="sr-only" checked={isOnline} disabled={busy} onChange={handleToggle} />
        <div className={`h-4 w-7 rounded-full transition-colors duration-200 ${isOnline ? "bg-blue-500" : "bg-surface-container-highest"}`} />
        <div className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${isOnline ? "translate-x-3" : "translate-x-0"}`}>
          {busy && <Loader2 className="h-2 w-2 animate-spin text-outline absolute inset-0.5" />}
        </div>
      </div>
    </label>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [allSubs, setAllSubs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState("all");

  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterHasSubscription, setFilterHasSubscription] = useState<"all" | "yes" | "no">("all");
  const [filterMinProducts, setFilterMinProducts] = useState("");
  const [filterMaxProducts, setFilterMaxProducts] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterState, setFilterState] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const [editUser, setEditUser] = useState<any | null>(null);

  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<any | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteSearch, setPromoteSearch] = useState("");

  // Create User modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "", email: "", phone: "", password: "", shopName: "",
    role: "customer" as string,
    address: "", city: "", state: "", pincode: "",
    latitude: null as number | null, longitude: null as number | null,
    gstin: "",
    secondaryPhone: "",
    subscriptionStatus: "inactive" as "inactive" | "active",
    seats: 1,
    durationMonths: 12 as 1 | 3 | 6 | 12,
  });
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [seatsInput, setSeatsInput] = useState("1");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Product edit from within the users panel
  const [editingProductDoc, setEditingProductDoc] = useState<any | null>(null);
  const [editingInventoryDoc, setEditingInventoryDoc] = useState<any | null>(null);
  const [loadingEditProduct, setLoadingEditProduct] = useState(false);

  // Products panel (products derived from allProducts — see memos below)
  const [productsUser, setProductsUser] = useState<any | null>(null);
  const [assignProductId, setAssignProductId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [assignMsg, setAssignMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Google Maps autocomplete ref — create modal only
  const createAddressInputRef = useRef<HTMLInputElement>(null);
  const createAcListenerRef   = useRef<any>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchAllUsers(),
      fetchAllSellerProducts().catch(() => []),
      fetchAllSubscriptions().catch(() => []),
    ])
      .then(([us, ps, ss]) => { setUsers(us); setAllProducts(ps); setAllSubs(ss); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Google Maps autocomplete for the Create User modal
  useEffect(() => {
    if (!showCreate) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    const setup = () => {
      if (!createAddressInputRef.current || !window.google?.maps?.places) return;
      if (createAcListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(createAcListenerRef.current);
      const ac = new window.google.maps.places.Autocomplete(createAddressInputRef.current, {
        fields: ["name", "formatted_address", "geometry", "address_components"],
        types: ["establishment", "geocode"],
      });
      createAcListenerRef.current = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place) return;
        const fields = extractAddressFields(place);
        if (createAddressInputRef.current && fields.address)
          createAddressInputRef.current.value = fields.address;
        setCreateForm(prev => ({
          ...prev,
          ...(place.name && (prev.role === "retailer" ? { shopName: place.name } : prev.role === "manufacturer" ? { shopName: place.name } : {})),
          address:   fields.address   ?? prev.address,
          city:      fields.city      ?? prev.city,
          state:     fields.state     ?? prev.state,
          pincode:   fields.pincode   ?? prev.pincode,
          latitude:  fields.latitude  ?? prev.latitude,
          longitude: fields.longitude ?? prev.longitude,
        }));
      });
    };

    const scriptId = "google-maps-places-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const run = () => requestAnimationFrame(() => setup());
    if (window.google?.maps?.places) { run(); }
    else if (existing) {
      if (existing.dataset.loaded === "true") run();
      else existing.addEventListener("load", run, { once: true });
    } else {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true; script.defer = true;
      script.onload = () => { script.dataset.loaded = "true"; run(); };
      document.head.appendChild(script);
    }
    return () => {
      if (createAcListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(createAcListenerRef.current);
      createAcListenerRef.current = null;
    };
  }, [showCreate]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (showCreate) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [showCreate]);

  const promoteCandidates = users.filter(u =>
    u.role !== "admin" &&
    (!promoteSearch || [u.name, u.email].join(" ").toLowerCase().includes(promoteSearch.toLowerCase()))
  );

  const counts = {
    all: users.length,
    retailer: users.filter(u => u.role === "retailer").length,
    manufacturer: users.filter(u => u.role === "manufacturer").length,
    admin: users.filter(u => u.role === "admin").length,
    customer: users.filter(u => !u.role || u.role === "customer").length,
  };

  // Accurate per-user product count (deduped) — keyed by user doc id.
  const productCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of users) {
      m.set(u.id, collapseUserProductDocs(selectUserProductDocs(allProducts, u)).length);
    }
    return m;
  }, [users, allProducts]);

  // Total active seats per user — sum of seatsPurchased across all non-expired active subs.
  // Keyed by ownerPhone. Editing seats still targets the latest active sub record (unchanged).
  const activeSeatsByPhone = useMemo(() => {
    const now = new Date();
    const m = new Map<string, number>();
    for (const sub of allSubs) {
      if (sub.subscriptionStatus !== "active") continue;
      const expiry: Date | undefined = sub.expiryDate?.toDate?.();
      if (expiry && expiry < now) continue;
      const phone = sub.ownerPhone as string | undefined;
      if (!phone) continue;
      m.set(phone, (m.get(phone) ?? 0) + (Number(sub.seatsPurchased) || 0));
    }
    return m;
  }, [allSubs]);

  // Utility: extract a numeric timestamp from a Firestore Timestamp, Date, or string
  const getTs = (val: any): number => {
    if (!val) return 0;
    if (typeof val.toDate === "function") return val.toDate().getTime();
    if (val instanceof Date) return val.getTime();
    if (typeof val === "string" || typeof val === "number") return new Date(val).getTime();
    return 0;
  };

  // Utility: format a Firestore timestamp or date string nicely
  const fmtDate = (val: any): string => {
    if (!val) return "—";
    let d: Date | null = null;
    if (typeof val.toDate === "function") d = val.toDate();
    else if (val instanceof Date) d = val;
    else if (typeof val === "string" || typeof val === "number") d = new Date(val);
    if (!d || isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const resetAdvanced = () => {
    setFilterActive("all");
    setFilterHasSubscription("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterMinProducts("");
    setFilterMaxProducts("");
    setFilterCity("");
    setFilterState("");
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || [u.name, u.email, u.role, u.id, u.phone, u.city, u.state, u.shopName, u.businessName].join(" ").toLowerCase().includes(q);
    const matchRole = filterRole === "all" || (filterRole === "customer" ? (!u.role || u.role === "customer") : u.role === filterRole);

    // Advanced filters
    const matchActive =
      filterActive === "all" ? true :
      filterActive === "active" ? !!u.isPaid :
      !u.isPaid;

    const matchSubscription =
      filterHasSubscription === "all" ? true :
      filterHasSubscription === "yes" ? (!!u.subscriptionStatus && u.subscriptionStatus !== "" && u.subscriptionStatus !== "free") :
      (!u.subscriptionStatus || u.subscriptionStatus === "" || u.subscriptionStatus === "free");

    // Date filtering — createdAt can be a Firestore Timestamp or a JS Date
    const uCreatedAt = getTs(u.createdAt);
    const matchDateFrom = !filterDateFrom ? true : (uCreatedAt > 0 ? uCreatedAt >= new Date(filterDateFrom).getTime() : false);
    const matchDateTo   = !filterDateTo   ? true : (uCreatedAt > 0 ? uCreatedAt <= new Date(filterDateTo).getTime() + 86399999 : false);

    const pc = (productCounts.get(u.id) ?? 0);
    const matchMinProd = filterMinProducts === "" ? true : pc >= Number(filterMinProducts);
    const matchMaxProd = filterMaxProducts === "" ? true : pc <= Number(filterMaxProducts);

    const matchCity  = !filterCity.trim()  ? true : (u.city  || "").toLowerCase().includes(filterCity.trim().toLowerCase());
    const matchState = !filterState.trim() ? true : (u.state || "").toLowerCase().includes(filterState.trim().toLowerCase());

    return matchSearch && matchRole && matchActive && matchSubscription && matchDateFrom && matchDateTo && matchMinProd && matchMaxProd && matchCity && matchState;
  });

  // Sort filtered results by createdAt (desc = newest first, asc = oldest first)
  const sorted = [...filtered].sort((a, b) =>
    sortOrder === "desc" ? getTs(b.createdAt) - getTs(a.createdAt) : getTs(a.createdAt) - getTs(b.createdAt),
  );

  // Count how many advanced filters are active
  const activeAdvancedCount = [
    filterActive !== "all",
    filterHasSubscription !== "all",
    !!filterDateFrom,
    !!filterDateTo,
    filterMinProducts !== "",
    filterMaxProducts !== "",
    !!filterCity.trim(),
    !!filterState.trim(),
  ].filter(Boolean).length;

  // Products shown in the slide-over for the selected user (deduped).
  const panelProducts = useMemo<UserProduct[]>(
    () => productsUser ? collapseUserProductDocs(selectUserProductDocs(allProducts, productsUser)) : [],
    [productsUser, allProducts],
  );

  // Canonical (non-copy) products that an admin can assign, de-duped by name.
  const assignableProducts = useMemo(() => {
    const copySources = new Set(["admin_assigned", "retailer_inventory_copy", "manufacturer_assigned"]);
    const seen = new Set<string>();
    const out: { id: string; name: string; category: string; image: string; price: number }[] = [];
    for (const d of allProducts) {
      if (d.isActive === false || copySources.has(d.source) || !d.name) continue;
      const key = String(d.name).toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      const image = String(d.image || (Array.isArray(d.images) ? d.images[0] : "") || "");
      out.push({ id: d.id, name: String(d.name), category: String(d.category || ""), image, price: Number(d.price || 0) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [allProducts]);

  const openProducts = (u: any) => {
    setProductsUser(u);
    setAssignProductId("");
    setAssignMsg(null);
    // Self-heal: make sure this seller has a live storefront record so they appear
    // in stores and their assigned products attach to a store.
    if (u.role === "retailer" || u.role === "manufacturer") {
      ensureSellerStorefront({
        phone: u.phone || u.id, id: u.id, uid: u.uid, role: u.role,
        name: u.name, shopName: u.shopName, businessName: u.businessName,
        address: u.address, city: u.city, state: u.state, pincode: u.pincode,
        latitude: u.latitude, longitude: u.longitude,
      }).catch(() => { /* non-blocking */ });
    }
  };

  const refreshProducts = async () => {
    try { setAllProducts(await fetchAllSellerProducts()); } catch { /* keep current */ }
  };

  const handleEditProduct = async (entry: UserProduct) => {
    const docId = entry.docIds[0] || entry.id;
    if (!docId) return;
    setLoadingEditProduct(true);
    try {
      const [productSnap, invSnap] = await Promise.all([
        getDoc(doc(db, "products", docId)),
        getDocs(query(collection(db, "inventory"), where("productId", "==", docId), limit(1))),
      ]);
      if (productSnap.exists()) setEditingProductDoc({ id: productSnap.id, ...productSnap.data() });
      const invDoc = invSnap.docs[0];
      setEditingInventoryDoc(invDoc ? { id: invDoc.id, ...invDoc.data() } : null);
    } finally { setLoadingEditProduct(false); }
  };

  const handleAdminProductSave = async (payload: any) => {
    const { editProductId, ...data } = payload;
    if (!editProductId) return;

    const { doc: fDoc, setDoc: fSetDoc, getDoc: fGetDoc, serverTimestamp: fTs } = await import("firebase/firestore");
    const { db: fdb } = await import("../../firebase");

    // Strip internal/ownership fields the form should never overwrite.
    // In particular, "source" must not be changed (admin_assigned would become "admin").
    const IMMUTABLE = new Set(["source", "id", "originalProductId", "manufacturerProductId",
      "ownerId", "ownerPhone", "ownerType", "retailerId", "retailerPhone",
      "manufacturerId", "manufacturerPhone", "assignedByAdmin", "assignedAt", "createdAt"]);
    const clean: Record<string, unknown> = Object.fromEntries(
      Object.entries(data).filter(([k, v]) => v !== undefined && !IMMUTABLE.has(k)),
    );

    // Sync isOnline into every availability[] entry so ProductDetailView's
    // per-store canOrder check (availEntry.isOnline !== false) stays in sync.
    const currentAv = (editingProductDoc as any)?.availability as any[] | undefined;
    if (typeof data.isOnline === 'boolean' && Array.isArray(currentAv) && currentAv.length > 0) {
      clean.availability = currentAv.map((entry: any) => ({ ...entry, isOnline: data.isOnline }));
    }

    await fSetDoc(fDoc(fdb, "products", editProductId), { ...clean, updatedAt: fTs() }, { merge: true });

    // When enabling online delivery, also flip the account-level flag so
    // ProductDetailView's canOrder (storeOnlineMap[phone] === true) passes.
    // fetchStoreOnlineDelivery checks retailers/ first then manufacturers/,
    // so update whichever docs already exist to avoid creating spurious records.
    if (data.isOnline === true && productsUser) {
      const sellerPhone = productsUser.phone || productsUser.id;
      if (sellerPhone) {
        const now = fTs();
        const [rSnap, mSnap] = await Promise.all([
          fGetDoc(fDoc(fdb, "retailers", sellerPhone)),
          fGetDoc(fDoc(fdb, "manufacturers", sellerPhone)),
        ]);
        await Promise.all([
          rSnap.exists() ? fSetDoc(fDoc(fdb, "retailers", sellerPhone), { onlineDelivery: true, updatedAt: now }, { merge: true }) : null,
          mSnap.exists() ? fSetDoc(fDoc(fdb, "manufacturers", sellerPhone), { onlineDelivery: true, updatedAt: now }, { merge: true }) : null,
        ].filter(Boolean) as Promise<void>[]);
      }
    }
  };

  const handleAssign = async () => {
    const prod = assignableProducts.find(p => p.id === assignProductId);
    if (!productsUser || !prod) return;
    setAssigning(true); setAssignMsg(null);
    try {
      const adminUid = auth.currentUser?.uid ?? "admin";
      const sellerPhone = productsUser.phone || productsUser.id;
      const sellerName = productsUser.shopName || productsUser.businessName || productsUser.name || sellerPhone;
      const role = productsUser.role === "manufacturer" ? "manufacturer" : "retailer";
      const res = await adminAssignProductToSeller(prod.id, prod.name, sellerPhone, sellerName, role, adminUid);
      if (res.alreadyAssigned) setAssignMsg({ ok: false, text: `"${prod.name}" is already assigned to this seller.` });
      else { setAssignMsg({ ok: true, text: `Assigned "${prod.name}".` }); setAssignProductId(""); }
      await refreshProducts();
    } catch (e) {
      setAssignMsg({ ok: false, text: e instanceof Error ? e.message : "Assignment failed." });
    } finally { setAssigning(false); }
  };

  const handleRemove = async (entry: UserProduct) => {
    const docIds = entry.docIds.length ? entry.docIds : entry.assignedDocIds;
    if (!productsUser || docIds.length === 0) return;
    const isOwn = entry.assignedDocIds.length === 0; // self-created, not an admin assignment
    if (!window.confirm(
      isOwn
        ? `Remove "${entry.name}"? This is this seller's own product — it will be hidden from the marketplace.`
        : `Remove "${entry.name}" from this seller?`,
    )) return;
    setRemovingId(entry.id); setAssignMsg(null);
    try {
      const adminUid = auth.currentUser?.uid ?? "admin";
      const sellerPhone = productsUser.phone || productsUser.id;
      for (const docId of docIds) {
        await adminRemoveAssignment(docId, entry.name, sellerPhone, adminUid);
      }
      await refreshProducts();
      setAssignMsg({ ok: true, text: `Removed "${entry.name}".` });
    } catch (e) {
      setAssignMsg({ ok: false, text: e instanceof Error ? e.message : "Remove failed." });
    } finally { setRemovingId(null); }
  };


  const handlePromoteConfirm = async () => {
    if (!promoteTarget) return;
    if (confirmEmail.trim().toLowerCase() !== (promoteTarget.email || "").toLowerCase()) {
      alert("Email does not match. Promotion cancelled.");
      return;
    }
    setPromoting(true);
    try {
      await promoteToAdmin(promoteTarget.id);
      setUsers(prev => prev.map(u => u.id === promoteTarget.id ? { ...u, role: "admin", isPaid: true } : u));
      setPromoteTarget(null);
      setConfirmEmail("");
      setShowPromotePanel(false);
    } catch (e) {
      alert("Failed to promote. Check console.");
      console.error(e);
    } finally {
      setPromoting(false);
    }
  };

  const BLANK_FORM = {
    name: "", email: "", phone: "", password: "", shopName: "", role: "customer",
    address: "", city: "", state: "", pincode: "", latitude: null as number | null, longitude: null as number | null,
    gstin: "", secondaryPhone: "",
    subscriptionStatus: "inactive" as "inactive" | "active",
    seats: 1,
    durationMonths: 12 as 1 | 3 | 6 | 12,
  };

  const handleCreateUser = async () => {
    const { name, email, phone, password, shopName, role, gstin, secondaryPhone, subscriptionStatus, seats, durationMonths } = createForm;

    // ── Admin / Sales Executive: server route (needs Firebase Auth createUser) ─
    if (role === "admin" || role === "salesExecutive") {
      const label = role === "salesExecutive" ? "sales executive" : "admin";
      if (!email.trim())                    { setCreateError(`Email is required for ${label} accounts.`); return; }
      if (!password || password.length < 6) { setCreateError("Password must be at least 6 characters."); return; }
      setCreating(true); setCreateError(null); setCreateSuccess(null);
      try {
        const callerUid = auth.currentUser?.uid;
        const res = await fetch("/api/admin/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, callerUid, role }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to create ${label}.`);
        setCreateSuccess(data.message ?? `${label} account created.`);
        setCreateForm(BLANK_FORM);
        load();
      } catch (e) {
        setCreateError(e instanceof Error ? e.message : `Failed to create ${label}.`);
      } finally { setCreating(false); }
      return;
    }

    // ── Retailer / Manufacturer / Consumer: write Firestore directly ──────────
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setPhoneError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!name.trim()) { setCreateError("Full Name is required."); return; }
    if ((role === "retailer" || role === "manufacturer") && !shopName.trim()) {
      setCreateError(`${role === "retailer" ? "Shop Name" : "Business Name"} is required.`);
      return;
    }
    if (subscriptionStatus === "active" && seats < 1) {
      setCreateError("Seats must be at least 1 for active subscriptions.");
      return;
    }

    const normalizedPhone = `+91${digits}`;
    setCreating(true); setCreateError(null); setCreateSuccess(null);
    try {
      const existing = await getDoc(doc(db, "users", normalizedPhone));
      if (existing.exists()) throw new Error(`A user with phone ${normalizedPhone} already exists.`);

      const now = serverTimestamp();
      const callerUid = auth.currentUser?.uid ?? "admin";
      const currentAddress = createAddressInputRef.current?.value?.trim() || createForm.address;

      const isPaid     = subscriptionStatus === "active";
      const totalSeats = isPaid ? Math.max(1, seats) : 0;

      // users/{normalizedPhone}
      await setDoc(doc(db, "users", normalizedPhone), {
        phone: normalizedPhone,
        uid: null,
        name: name.trim(),
        email: email ? email.trim().toLowerCase() : null,
        role,
        isPaid,
        subscriptionStatus,
        totalSeats,
        productCount: 0,
        address: currentAddress || null,
        city: createForm.city || null,
        state: createForm.state || null,
        pincode: createForm.pincode || null,
        latitude:  createForm.latitude  ?? null,
        longitude: createForm.longitude ?? null,
        ...(gstin.trim()          ? { gstin: gstin.trim().toUpperCase() }        : {}),
        ...(secondaryPhone.trim() ? { secondaryPhone: secondaryPhone.trim() } : {}),
        preCreatedByAdmin: callerUid,
        createdAt: now,
        updatedAt: now,
      });

      // profiles/{normalizedPhone} for sellers
      if (role === "retailer" || role === "manufacturer") {
        await setDoc(doc(db, "profiles", normalizedPhone), {
          type: role,
          ownerPhone: normalizedPhone,
          businessName: (shopName || name).trim(),
          ownerName: name.trim(),
          phone: normalizedPhone,
          email: email ? email.trim().toLowerCase() : null,
          address: {
            line1:   currentAddress || null,
            city:    createForm.city    || null,
            state:   createForm.state   || null,
            pincode: createForm.pincode || null,
          },
          // Must be a Firestore GeoPoint — plain {lat,lng} objects are not recognised
          // by parseGeo() as instanceof GeoPoint and are ignored by the Profile page.
          ...(createForm.latitude && createForm.longitude
            ? { geo: new GeoPoint(createForm.latitude, createForm.longitude) }
            : {}),
          ...(gstin.trim() ? { gstin: gstin.trim().toUpperCase() } : {}),
          isActive: true,
          subscriptionStatus,
          catalogIds: [],
          retailerPhones: [],
          preCreatedByAdmin: callerUid,
          createdAt: now,
          updatedAt: now,
        });

        await ensureSellerStorefront({
          phone: normalizedPhone, role, name, shopName,
          address: currentAddress || createForm.address,
          city: createForm.city, state: createForm.state, pincode: createForm.pincode,
          latitude: createForm.latitude, longitude: createForm.longitude,
          createdByAdmin: callerUid,
        });
      }

      // Create subscription record for active sellers — mirrors updateSubscriptionStatus logic
      if (isPaid && (role === "retailer" || role === "manufacturer")) {
        const startDate = new Date();
        const expiryDate = new Date(startDate);
        expiryDate.setMonth(expiryDate.getMonth() + durationMonths);
        await addDoc(collection(db, "subscriptions"), {
          ownerPhone: normalizedPhone,
          ownerId: null,
          ownerType: role,
          planName: "Admin Assigned",
          seatsPurchased: totalSeats,
          durationMonths,
          amountPaid: 0,
          currency: "INR",
          subscriptionStatus: "active",
          startDate: Timestamp.fromDate(startDate),
          expiryDate: Timestamp.fromDate(expiryDate),
          createdByAdmin: callerUid,
          createdAt: now,
          updatedAt: now,
        });
      }

      setCreateSuccess(
        `Pre-registered ${normalizedPhone} as ${role}${subscriptionStatus === "active" ? ` (active, ${durationMonths}mo)` : ""}. When they sign in via OTP they will automatically get the ${role} role.`
      );
      setCreateForm(BLANK_FORM);
      setPhoneError(null);
      setSeatsInput("1");
      if (createAddressInputRef.current) createAddressInputRef.current.value = "";
      load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create user.");
    } finally { setCreating(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-2xl font-black text-on-surface">Users & Roles</h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant ml-7 sm:ml-9">View and edit all platform users.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate(true); setCreateError(null); setCreateSuccess(null);
            setPhoneError(null); setSeatsInput("1"); setCreateForm(BLANK_FORM);
          }}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity shrink-0"
        >
          <UserPlus className="h-4 w-4" /> Create User
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {(["all", "retailer", "manufacturer", "customer", "admin"] as const).map(role => (
          <button key={role} onClick={() => setFilterRole(role)}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap shrink-0 ${filterRole === role ? "bg-primary text-white shadow-sm" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}>
            {role === "all" ? "All" : role.charAt(0).toUpperCase() + role.slice(1)} ({counts[role as keyof typeof counts]})
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-3 bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2.5">
          <Search className="h-4 w-4 text-outline shrink-0" />
          <input type="text" placeholder="Search name, email, phone, city…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant" />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="text-outline hover:text-on-surface">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          className={`relative flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all shrink-0 ${
            showAdvanced || activeAdvancedCount > 0
              ? "bg-primary text-white border-primary shadow-sm"
              : "bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-container"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeAdvancedCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-black text-white">
              {activeAdvancedCount}
            </span>
          )}
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <div className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Advanced Filters
            </p>
            {activeAdvancedCount > 0 && (
              <button type="button" onClick={resetAdvanced}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80">
                <RotateCcw className="h-3 w-3" /> Reset all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Active Status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Subscription Status</label>
              <select value={filterActive} onChange={e => setFilterActive(e.target.value as any)}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none">
                <option value="all">All</option>
                <option value="active">Active / Paid</option>
                <option value="inactive">Free / Inactive</option>
              </select>
            </div>

            {/* Has Subscription */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Has Subscription</label>
              <select value={filterHasSubscription} onChange={e => setFilterHasSubscription(e.target.value as any)}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none">
                <option value="all">All</option>
                <option value="yes">Has Subscription</option>
                <option value="no">No Subscription</option>
              </select>
            </div>

            {/* City */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">City</label>
              <input type="text" value={filterCity} onChange={e => setFilterCity(e.target.value)}
                placeholder="e.g. Pune"
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
            </div>

            {/* State */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">State</label>
              <input type="text" value={filterState} onChange={e => setFilterState(e.target.value)}
                placeholder="e.g. Maharashtra"
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
            </div>

            {/* Min Products */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Min Products</label>
              <input type="number" min="0" value={filterMinProducts} onChange={e => setFilterMinProducts(e.target.value)}
                placeholder="0"
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
            </div>

            {/* Max Products */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Max Products</label>
              <input type="number" min="0" value={filterMaxProducts} onChange={e => setFilterMaxProducts(e.target.value)}
                placeholder="Any"
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
            </div>
          </div>

          {/* Date Range */}
          <div className="border-t border-outline-variant/20 pt-3">
            <p className="text-xs font-semibold text-on-surface-variant mb-2 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Registered Between
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-on-surface-variant">From</label>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-on-surface-variant">To</label>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-surface-container-low border border-outline-variant/20 px-3 py-2 text-xs text-on-surface-variant">
            Showing <span className="font-bold text-on-surface">{filtered.length}</span> of <span className="font-bold text-on-surface">{users.length}</span> users
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/20 bg-surface-container-low">
            <span className="text-xs font-bold text-on-surface-variant">{filtered.length} user{filtered.length !== 1 ? "s" : ""}</span>
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">User</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Role</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Subscription</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Products</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Seats</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    <button
                      type="button"
                      onClick={() => setSortOrder(o => o === "desc" ? "asc" : "desc")}
                      className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                      title={sortOrder === "desc" ? "Newest first — click for oldest first" : "Oldest first — click for newest first"}
                    >
                      Joined
                      {sortOrder === "desc"
                        ? <ChevronDown className="h-3 w-3 text-primary" />
                        : <ChevronUp className="h-3 w-3 text-primary" />}
                    </button>
                  </th>
                  <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(u => (
                  <tr key={u.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors">
                    <td className="px-5 py-3">
                      {(u.role === "retailer" || u.role === "manufacturer") ? (
                        <>
                          <p className="font-semibold text-on-surface">{u.shopName || u.businessName || u.name || "—"}</p>
                          {(u.name || u.ownerName) && (
                            <p className="text-xs text-on-surface-variant">{u.ownerName || u.name}</p>
                          )}
                          {u.phone && <p className="text-xs text-on-surface-variant/70">{u.phone}</p>}
                        </>
                      ) : (
                        <>
                          <p className="font-semibold text-on-surface">{u.name || "—"}</p>
                          {u.phone && <p className="text-xs text-on-surface-variant/70">{u.phone}</p>}
                        </>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${ROLE_BADGE[u.role] || ROLE_BADGE.customer}`}>
                        {u.role || "customer"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`flex items-center gap-1 text-xs font-bold ${u.isPaid ? "text-green-600" : "text-on-surface-variant"}`}>
                        <span className={`w-2 h-2 rounded-full ${u.isPaid ? "bg-green-500" : "bg-gray-300"}`} />
                        {u.isPaid ? "Active" : "Free"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {(() => {
                        const isSeller = u.role === "retailer" || u.role === "manufacturer";
                        const pc = productCounts.get(u.id) ?? 0;
                        return (isSeller || pc > 0) ? (
                          <button type="button" onClick={() => openProducts(u)}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                            <Package className="h-3.5 w-3.5" />
                            {pc}
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-sm text-on-surface-variant">—</span>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-3 text-sm text-on-surface">
                      {(() => {
                        const phone = u.phone || u.id;
                        const aggSeats = activeSeatsByPhone.get(phone);
                        return aggSeats !== undefined ? aggSeats : (u.totalSeats ?? "—");
                      })()}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-on-surface-variant whitespace-nowrap">{fmtDate(u.createdAt)}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {(u.role === "retailer" || u.role === "manufacturer") && (
                          <a
                            href={`/dashboard?adminView=${encodeURIComponent(u.phone || u.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                            title={`Open ${u.shopName || u.name || u.id}'s dashboard`}
                          >
                            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
                          </a>
                        )}
                        <button type="button" onClick={() => setEditUser(u)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-on-surface-variant">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-outline-variant/10">
            {sorted.map(u => (
              <div key={u.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {(u.role === "retailer" || u.role === "manufacturer") ? (
                      <>
                        <p className="text-sm font-semibold text-on-surface truncate">{u.shopName || u.businessName || u.name || "—"}</p>
                        {(u.name || u.ownerName) && (
                          <p className="text-[11px] text-on-surface-variant truncate">{u.ownerName || u.name}</p>
                        )}
                        {u.phone && <p className="text-[11px] text-on-surface-variant/70 truncate">{u.phone}</p>}
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-on-surface truncate">{u.name || "—"}</p>
                        {u.phone && <p className="text-[11px] text-on-surface-variant/70 truncate">{u.phone}</p>}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(u.role === "retailer" || u.role === "manufacturer") && (
                      <a
                        href={`/dashboard?adminView=${encodeURIComponent(u.phone || u.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                      >
                        <LayoutDashboard className="h-3 w-3" />
                      </a>
                    )}
                    <button type="button" onClick={() => setEditUser(u)}
                      className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1 text-[11px] font-medium text-on-surface hover:bg-surface-container">
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${ROLE_BADGE[u.role] || ROLE_BADGE.customer}`}>
                    {u.role || "customer"}
                  </span>
                  <span className={`flex items-center gap-1 text-[11px] font-bold ${u.isPaid ? "text-green-600" : "text-on-surface-variant"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${u.isPaid ? "bg-green-500" : "bg-gray-300"}`} />
                    {u.isPaid ? "Active" : "Free"}
                  </span>
                  {((u.role === "retailer" || u.role === "manufacturer") || (productCounts.get(u.id) ?? 0) > 0) && (
                    <button type="button" onClick={() => openProducts(u)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                      <Package className="h-3 w-3" /> {productCounts.get(u.id) ?? 0}
                    </button>
                  )}
                  {(() => {
                    const phone = u.phone || u.id;
                    const aggSeats = activeSeatsByPhone.get(phone) ?? u.totalSeats ?? 0;
                    return aggSeats > 0 ? (
                      <span className="text-[11px] text-on-surface-variant">{aggSeats} seats</span>
                    ) : null;
                  })()}
                  {u.createdAt && (
                    <span className="text-[11px] text-on-surface-variant flex items-center gap-0.5">
                      <Calendar className="h-2.5 w-2.5" />{fmtDate(u.createdAt)}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {sorted.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-on-surface-variant">No users found.</div>
            )}
          </div>
        </div>
      )}

      {/* ─── Edit User Panel ─────────────────────────────────────────────────────── */}
      {editUser && (
        <AdminUserEditPanel
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { load(); }}
        />
      )}

      {/* ─── Products Panel (view + assign) ──────────────────────────────── */}
      {productsUser && (() => {
        const isSeller = productsUser.role === "retailer" || productsUser.role === "manufacturer";
        return (
        <div className="fixed inset-0 z-[70] flex items-end justify-end bg-black/40 backdrop-blur-sm pt-16">
          <div className="w-full max-w-xl h-full bg-white flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-on-surface">
                  Products — {productsUser.name || productsUser.email || "User"}
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {productsUser.role} · {panelProducts.length} product{panelProducts.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button type="button" onClick={() => setProductsUser(null)}
                className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Assign a product (sellers only) */}
            {isSeller && (
              <div className="border-b border-outline-variant/30 px-5 py-4 shrink-0 space-y-3 bg-surface-container-lowest">
                <div className="flex items-center gap-1.5">
                  <Link2 className="h-4 w-4 text-primary" />
                  <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Assign a product</p>
                </div>
                <SearchableDropdown
                  placeholder="Search product to assign…"
                  items={assignableProducts}
                  selectedId={assignProductId}
                  onSelect={setAssignProductId}
                  loading={loading}
                  filterFn={(p, q) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)}
                  renderOption={p => (
                    <div className="flex items-center gap-2.5">
                      {p.image
                        ? <img src={p.image} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0 border border-outline-variant/10" />
                        : <div className="h-8 w-8 rounded-lg bg-surface-container shrink-0 flex items-center justify-center"><Package className="h-4 w-4 text-on-surface-variant/40" /></div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{p.name}</p>
                        <p className="text-[10px] text-on-surface-variant capitalize">{p.category || "—"} · ₹{p.price}</p>
                      </div>
                    </div>
                  )}
                  renderSelected={p => (
                    <div className="flex items-center gap-2.5">
                      {p.image
                        ? <img src={p.image} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0 border border-outline-variant/10" />
                        : <div className="h-8 w-8 rounded-lg bg-primary/10 shrink-0 flex items-center justify-center"><Package className="h-4 w-4 text-primary" /></div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{p.name}</p>
                        <p className="text-[10px] text-on-surface-variant capitalize">{p.category || "—"} · ₹{p.price}</p>
                      </div>
                    </div>
                  )}
                />
                {assignMsg && (
                  <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                    assignMsg.ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"
                  }`}>
                    {assignMsg.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                    {assignMsg.text}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={assigning || !assignProductId}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {assigning ? <><Loader2 className="h-4 w-4 animate-spin" /> Assigning…</> : <><Link2 className="h-4 w-4" /> Assign Product</>}
                </button>
                <p className="text-[11px] text-on-surface-variant">
                  Creates a live, in-stock copy in this seller&apos;s inventory. Assigning the same product twice is blocked.
                </p>
              </div>
            )}

            {/* Product list (deduped) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : panelProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-on-surface-variant">
                  <Package className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No products yet for this user.</p>
                </div>
              ) : panelProducts.map(p => (
                <div key={p.id}
                  className="rounded-xl border border-outline-variant/30 bg-surface-container-low overflow-hidden">
                  {/* Top row: image + name + actions */}
                  <div className="flex items-start gap-3 p-3">
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="h-14 w-14 rounded-lg object-cover shrink-0 border border-outline-variant/20" />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-surface-container shrink-0 flex items-center justify-center">
                        <Package className="h-6 w-6 text-on-surface-variant opacity-40" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-sm text-on-surface truncate">{p.name || "—"}</p>
                        {p.copies > 1 && (
                          <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[9px] font-black">×{p.copies}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-on-surface-variant capitalize">{p.category || "—"}</span>
                        {p.price > 0 && (
                          <span className="text-xs font-bold text-secondary">· ₹{p.price.toLocaleString("en-IN")}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => handleEditProduct(p)} disabled={loadingEditProduct}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors disabled:opacity-50"
                        title="Edit product">
                        {loadingEditProduct ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                      </button>
                      <a href={`/?view=product&product=${p.id}`} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors" title="View product">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button type="button" onClick={() => handleRemove(p)} disabled={removingId === p.id}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title={p.assignedDocIds.length > 0 ? "Remove assignment" : "Remove product"}>
                        {removingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  {/* Bottom info bar */}
                  <div className="flex items-center gap-1.5 flex-wrap px-3 pb-3">
                    {/* Stock */}
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                      p.stock === "In Stock" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                    }`}>{p.stock || "—"}</span>
                    {/* Discount */}
                    {(p.effectiveDiscountPct ?? 0) > 0 ? (
                      <span className="flex items-center gap-0.5 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        <Tag className="h-2.5 w-2.5" />{p.effectiveDiscountPct}% OFF
                      </span>
                    ) : (
                      <span className="text-[10px] text-on-surface-variant/50 px-2 py-0.5 rounded-full border border-dashed border-outline-variant/30">No discount</span>
                    )}
                    {/* Online delivery — inline toggle */}
                    <AdminSellModeToggle
                      productId={p.docIds[0] || p.id}
                      sellMode={p.sellMode}
                      sellerPhone={productsUser?.phone || productsUser?.id}
                      onRefresh={refreshProducts}
                    />
                    {/* GST */}
                    {p.gstApplicable ? (
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant border border-outline-variant/30">
                        <Receipt className="h-2.5 w-2.5" />GST {p.gstRate}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-on-surface-variant/50 px-2 py-0.5 rounded-full border border-dashed border-outline-variant/30">No GST</span>
                    )}
                    {/* Source */}
                    {p.source && (
                      <span className="text-[9px] text-on-surface-variant/40 font-mono px-1.5">{p.source}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        );
      })()}

      {/* ─── Product Edit Modal (from Users panel) ──────────────────────── */}
      {editingProductDoc && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-[90] flex items-end justify-center bg-on-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-64px)] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-surface-container px-5 py-4 shrink-0">
              <h2 className="text-base font-bold text-on-surface">Edit Product</h2>
              <button onClick={() => { setEditingProductDoc(null); setEditingInventoryDoc(null); }} className="p-2 rounded-xl hover:bg-surface-container transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
              <AddProductInventoryForm
                adminMode
                initialProduct={editingProductDoc}
                userId={auth.currentUser?.uid ?? null}
                role="manufacturer"
                seatStats={{ totalPurchased: 99, activeUsed: 0, available: 99, expiringSoon: 0 }}
                onAdminSave={handleAdminProductSave}
                onCreated={async () => {
                  await refreshProducts();
                  setEditingProductDoc(null);
                  setEditingInventoryDoc(null);
                }}
              />
              {editingInventoryDoc && (
                <div className="border-t border-outline-variant/20 pt-5">
                  <p className="text-sm font-semibold text-on-surface mb-3">Discount Settings</p>
                  <DiscountPanel
                    inventoryId={editingInventoryDoc.id}
                    productId={editingProductDoc.id}
                    originalProductId={editingProductDoc.originalProductId ?? null}
                    sellingPrice={editingInventoryDoc.sellingPrice ?? editingProductDoc.price ?? 0}
                    discountEnabled={editingInventoryDoc.discountEnabled ?? false}
                    discountType={editingInventoryDoc.discountType ?? "percentage"}
                    discountPct={editingInventoryDoc.discountPct ?? 0}
                    discountFixedAmt={editingInventoryDoc.discountFixedAmt ?? 0}
                    discountStartDate={editingInventoryDoc.discountStartDate?.toDate?.() ?? null}
                    discountEndDate={editingInventoryDoc.discountEndDate?.toDate?.() ?? null}
                    bulkDiscountEnabled={editingInventoryDoc.bulkDiscountEnabled ?? false}
                    bulkDiscountTiers={editingInventoryDoc.bulkDiscountTiers ?? []}
                    isActive={editingProductDoc.isActive ?? true}
                    onSaved={async () => {
                      const freshInv = await getDocs(query(collection(db, "inventory"), where("productId", "==", editingProductDoc.id), limit(1)));
                      const invDoc = freshInv.docs[0];
                      if (invDoc) setEditingInventoryDoc({ id: invDoc.id, ...invDoc.data() });
                      await refreshProducts();
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Guarded Admin Promotion Section ─────────────────────────────── */}
      <div className="rounded-2xl border-2 border-dashed border-red-200 bg-red-50/40 overflow-hidden">
        <button type="button" onClick={() => setShowPromotePanel(v => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-red-50 transition-colors">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700">Admin Promotion Zone</p>
            <p className="text-xs text-red-500">Danger area — use only when intentionally granting admin access.</p>
          </div>
          <span className="text-xs font-bold text-red-500 shrink-0">{showPromotePanel ? "Close ↑" : "Open ↓"}</span>
        </button>

        {showPromotePanel && (
          <div className="border-t border-red-200 p-5 space-y-4">
            <p className="text-xs text-red-600 font-semibold">
              Admin access grants full platform control. Select a user, then type their exact email to confirm.
            </p>
            <div className="flex items-center gap-3 bg-white border border-red-200 rounded-xl px-3 py-2">
              <Search className="h-4 w-4 text-red-300 shrink-0" />
              <input type="text" placeholder="Search user to promote…" value={promoteSearch}
                onChange={e => setPromoteSearch(e.target.value)}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-red-300" />
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-white">
              {promoteCandidates.length === 0 && (
                <p className="text-xs text-on-surface-variant text-center py-4">No matching non-admin users.</p>
              )}
              {promoteCandidates.map(u => (
                <button key={u.id} type="button"
                  onClick={() => { setPromoteTarget(u); setConfirmEmail(""); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-red-50 last:border-0 ${promoteTarget?.id === u.id ? "bg-red-50" : "hover:bg-red-50/50"}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{u.name || "—"}</p>
                    <p className="text-xs text-on-surface-variant truncate">{u.email}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${ROLE_BADGE[u.role] || ROLE_BADGE.customer}`}>
                    {u.role || "customer"}
                  </span>
                  {promoteTarget?.id === u.id && <span className="text-xs text-red-600 font-bold shrink-0">Selected</span>}
                </button>
              ))}
            </div>
            {promoteTarget && (
              <div className="rounded-xl border border-red-300 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-red-700">
                    Promoting: <span className="text-on-surface">{promoteTarget.name || promoteTarget.email}</span>
                  </p>
                  <button type="button" onClick={() => { setPromoteTarget(null); setConfirmEmail(""); }}
                    className="p-1 rounded-lg hover:bg-red-50 text-red-400"><X className="h-4 w-4" /></button>
                </div>
                <p className="text-xs text-red-600">Type <strong>{promoteTarget.email}</strong> exactly to confirm:</p>
                <input type="text" value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)}
                  placeholder="Type the user's email to confirm…"
                  className="w-full rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200" />
                <button type="button" onClick={handlePromoteConfirm}
                  disabled={promoting || confirmEmail.trim().toLowerCase() !== (promoteTarget.email || "").toLowerCase()}
                  className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  {promoting ? "Promoting…" : "Confirm Promote to Admin"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Create User Modal ──────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <h2 className="text-base font-bold text-on-surface">Create New User</h2>
              </div>
              <button type="button" onClick={() => { setShowCreate(false); setPhoneError(null); setSeatsInput("1"); }}
                className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-5 flex-1">
              {createError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 font-medium">{createError}</div>
              )}
              {createSuccess && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700 font-medium">{createSuccess}</div>
              )}

              {/* ── Role ── */}
              <div>
                <SectionLabel>Role</SectionLabel>
                <select
                  value={createForm.role}
                  onChange={e => {
                    setCreateForm({ ...BLANK_FORM, role: e.target.value });
                    setPhoneError(null); setSeatsInput("1");
                    if (createAddressInputRef.current) createAddressInputRef.current.value = "";
                  }}
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none"
                >
                  <option value="customer">Customer (Regular User)</option>
                  <option value="retailer">Retailer</option>
                  <option value="manufacturer">Manufacturer</option>
                  <option value="salesExecutive">Sales Executive (Field Team)</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* ── Email + password path (admin & sales executive) ── */}
              {createForm.role === "admin" || createForm.role === "salesExecutive" ? (
                <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 space-y-3">
                  <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {createForm.role === "salesExecutive"
                      ? "Sales Executive — Email + Password login at /sales/login"
                      : "Admin — Email + Password login at /admin-login"}
                  </p>
                  <Field label="Full Name" value={createForm.name} onChange={v => setCreateForm(f => ({ ...f, name: v }))} placeholder={createForm.role === "salesExecutive" ? "e.g. Ramesh Field" : "e.g. Vinay Admin"} />
                  <Field label="Email *" value={createForm.email} onChange={v => setCreateForm(f => ({ ...f, email: v }))} placeholder={createForm.role === "salesExecutive" ? "rep@example.com" : "admin@example.com"} type="email" />
                  <Field label="Password * (min 6 chars)" value={createForm.password} onChange={v => setCreateForm(f => ({ ...f, password: v }))} placeholder="Secure password" type="password" />
                </div>
              ) : (
                /* Non-admin: phone OTP */
                <>
                  {/* ── Required Fields ── */}
                  <div>
                    <SectionLabel>Required</SectionLabel>
                    <div className="space-y-3">
                      {/* Phone with inline validation */}
                      <div className="flex flex-col gap-1.5 text-sm">
                        <span className="font-medium text-on-surface">Phone Number *</span>
                        <div className={`flex items-center gap-2 rounded-xl border bg-surface-container-low px-3 py-2 ${phoneError ? "border-red-400 ring-2 ring-red-200" : "border-outline-variant/40 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary"}`}>
                          <span className="text-sm font-bold text-on-surface-variant shrink-0">+91</span>
                          <input
                            type="tel"
                            value={createForm.phone}
                            onChange={e => {
                              const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                              setCreateForm(f => ({ ...f, phone: digits }));
                              setPhoneError(digits.length > 0 && digits.length < 10
                                ? "Please enter a valid 10-digit mobile number."
                                : null);
                            }}
                            onBlur={() => {
                              const digits = createForm.phone.replace(/\D/g, "");
                              setPhoneError(digits.length > 0 && digits.length !== 10
                                ? "Please enter a valid 10-digit mobile number."
                                : null);
                            }}
                            placeholder="98765 43210"
                            maxLength={10}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface"
                          />
                          {createForm.phone.length === 10 && (
                            <Check className="h-4 w-4 text-green-500 shrink-0" />
                          )}
                        </div>
                        {phoneError && (
                          <p className="text-xs text-red-600 font-medium flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="h-3 w-3 shrink-0" /> {phoneError}
                          </p>
                        )}
                      </div>

                      <Field
                        label="Full Name *"
                        value={createForm.name}
                        onChange={v => setCreateForm(f => ({ ...f, name: v }))}
                        placeholder="e.g. Raju Sharma"
                      />
                    </div>
                  </div>

                  {/* ── Optional Fields ── */}
                  <div>
                    <SectionLabel>Optional</SectionLabel>
                    <div className="space-y-3">
                      <Field label="Email" value={createForm.email} onChange={v => setCreateForm(f => ({ ...f, email: v }))} placeholder="user@example.com" type="email" />

                      {/* Address — Google Maps autocomplete */}
                      <div className="flex flex-col gap-1.5 text-sm">
                        <span className="font-medium text-on-surface flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-primary" /> Address
                          <span className="text-xs font-normal text-on-surface-variant">(type to search)</span>
                        </span>
                        <input
                          ref={createAddressInputRef}
                          autoComplete="off"
                          placeholder="Type address, landmark or pincode…"
                          className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Field label="City"    value={createForm.city}    onChange={v => setCreateForm(f => ({ ...f, city: v }))}    placeholder="City" />
                        <Field label="State"   value={createForm.state}   onChange={v => setCreateForm(f => ({ ...f, state: v }))}   placeholder="State" />
                        <Field label="Pincode" value={createForm.pincode} onChange={v => setCreateForm(f => ({ ...f, pincode: v }))} placeholder="000000" />
                      </div>
                      {createForm.latitude && createForm.longitude && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          Location pinned ({createForm.latitude.toFixed(4)}, {createForm.longitude.toFixed(4)})
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Business Details (retailer / manufacturer only) ── */}
                  {(createForm.role === "retailer" || createForm.role === "manufacturer") && (
                    <div>
                      <SectionLabel>Business Details</SectionLabel>
                      <div className="space-y-3">
                        <Field
                          label={`${createForm.role === "retailer" ? "Shop Name" : "Business Name"} *`}
                          value={createForm.shopName}
                          onChange={v => setCreateForm(f => ({ ...f, shopName: v }))}
                          placeholder={createForm.role === "retailer" ? "e.g. Sharma Agro Store" : "e.g. KisanBio Inputs Ltd"}
                        />
                        <Field
                          label="GSTIN (optional)"
                          value={createForm.gstin}
                          onChange={v => setCreateForm(f => ({ ...f, gstin: v.toUpperCase().replace(/[^A-Z0-9]/g, "") }))}
                          placeholder="e.g. 27AAPFU0939F1ZV"
                        />
                        {/* Secondary mobile */}
                        <div className="flex flex-col gap-1.5 text-sm">
                          <span className="font-medium text-on-surface">Secondary Mobile (optional)</span>
                          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                            <span className="text-sm font-bold text-on-surface-variant shrink-0">+91</span>
                            <input
                              type="tel"
                              value={createForm.secondaryPhone}
                              onChange={e => setCreateForm(f => ({ ...f, secondaryPhone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                              placeholder="Alternate number"
                              maxLength={10}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Subscription Setup ── */}
                  <div>
                    <SectionLabel>Subscription Setup</SectionLabel>
                    <div className="space-y-4">
                      {/* Status pills */}
                      <div className="flex gap-2">
                        {(["inactive", "active"] as const).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setCreateForm(f => ({ ...f, subscriptionStatus: s }))}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                              createForm.subscriptionStatus === s
                                ? s === "active"
                                  ? "bg-green-600 text-white border-green-600 shadow-sm"
                                  : "bg-surface-container-high text-on-surface border-outline-variant shadow-sm"
                                : "bg-surface-container-low text-on-surface-variant border-outline-variant/40 hover:bg-surface-container"
                            }`}
                          >
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>

                      {/* Active-only fields */}
                      {createForm.subscriptionStatus === "active" && (
                        <div className="space-y-3 rounded-xl border border-green-200 bg-green-50/40 p-3">
                          {/* Seats */}
                          <div className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-on-surface">Seats</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={seatsInput}
                              onChange={e => {
                                const raw = e.target.value.replace(/\D/g, "");
                                setSeatsInput(raw);
                                setCreateForm(f => ({ ...f, seats: raw === "" ? 0 : parseInt(raw, 10) }));
                              }}
                              placeholder="e.g. 1, 5, 20, 100"
                              className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 w-36"
                            />
                          </div>

                          {/* Duration */}
                          <div className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-on-surface">Duration</span>
                            <div className="flex gap-2">
                              {([1, 3, 6, 12] as const).map(m => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => setCreateForm(f => ({ ...f, durationMonths: m }))}
                                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                    createForm.durationMonths === m
                                      ? "bg-primary text-white border-primary shadow-sm"
                                      : "bg-white text-on-surface-variant border-outline-variant/40 hover:bg-surface-container"
                                  }`}
                                >
                                  {m === 1 ? "1 Mo" : m === 12 ? "1 Yr" : `${m} Mo`}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-outline-variant/20 px-5 py-4 shrink-0 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setShowCreate(false); setPhoneError(null); setSeatsInput("1"); }} disabled={creating}
                className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-60 sm:w-auto w-full">
                Cancel
              </button>
              <button type="button" onClick={handleCreateUser} disabled={creating}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 sm:w-auto w-full">
                {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <><UserPlus className="h-4 w-4" /> Create User</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">{children}</p>;
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-on-surface">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
    </label>
  );
}

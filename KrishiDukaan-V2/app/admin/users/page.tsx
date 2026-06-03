"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil, Search, ShieldCheck, Users, AlertTriangle, X, Check,
  Instagram, Facebook, MessageCircle, Youtube, MapPin, Package,
  ChevronRight, ExternalLink, UserPlus, Loader2, Link2, Trash2,
} from "lucide-react";
import {
  fetchAllUsers, promoteToAdmin, adminUpdateUser, fetchBusinessProfile,
  fetchAllSellerProducts, selectUserProductDocs, collapseUserProductDocs,
  adminAssignProductToSeller, adminRemoveAssignment, ensureSellerStorefront,
  type UserProduct,
  db, auth,
} from "../../firebase";
import { SearchableDropdown } from "../_components/searchable-dropdown";
import {
  doc, setDoc, getDoc, serverTimestamp, collection,
} from "firebase/firestore";

declare global {
  interface Window { google?: any }
}

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-red-100 text-red-700 border border-red-200",
  manufacturer: "bg-blue-100 text-blue-700 border border-blue-200",
  retailer: "bg-green-100 text-green-700 border border-green-200",
  customer: "bg-gray-100 text-gray-600 border border-gray-200",
};

const EDITABLE_ROLES = ["customer", "retailer", "manufacturer"] as const;
const SUB_STATUSES = ["", "paid", "unpaid", "revoked"];

type SocialLinks = { instagram: string; facebook: string; whatsapp: string; youtube: string };

type EditState = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isPaid: boolean;
  subscriptionStatus: string;
  // business
  shopName: string;
  businessName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  // social
  social: SocialLinks;
};

function extractAddressFields(place: any): Partial<Pick<EditState, "city" | "state" | "pincode" | "address" | "latitude" | "longitude">> {
  const out: ReturnType<typeof extractAddressFields> = {};
  const parts: { long_name: string; types: string[] }[] = place?.address_components || [];
  const cityPriority = ["locality", "postal_town", "sublocality_level_1", "administrative_area_level_2", "neighborhood"];
  for (const want of cityPriority) {
    const match = parts.find(p => p.types.includes(want));
    if (match) { out.city = match.long_name; break; }
  }
  const stateComp = parts.find(p => p.types.includes("administrative_area_level_1"));
  if (stateComp) out.state = stateComp.long_name;
  const pinComp = parts.find(p => p.types.includes("postal_code"));
  if (pinComp) out.pincode = pinComp.long_name;
  if (place?.formatted_address) out.address = place.formatted_address;
  if (place?.geometry?.location) {
    out.latitude = typeof place.geometry.location.lat === "function" ? place.geometry.location.lat() : place.geometry.location.lat;
    out.longitude = typeof place.geometry.location.lng === "function" ? place.geometry.location.lng() : place.geometry.location.lng;
  }
  return out;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState("all");

  const [editTarget, setEditTarget] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<any | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteSearch, setPromoteSearch] = useState("");

  // Create User modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "", email: "", phone: "", password: "", shopName: "",
    role: "consumer" as string,
    address: "", city: "", state: "", pincode: "",
    latitude: null as number | null, longitude: null as number | null,
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Products panel (products derived from allProducts — see memos below)
  const [productsUser, setProductsUser] = useState<any | null>(null);
  const [assignProductId, setAssignProductId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [assignMsg, setAssignMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Google Maps autocomplete refs — one for edit modal, one for create modal
  const addressInputRef       = useRef<HTMLInputElement>(null);
  const acListenerRef         = useRef<any>(null);
  const createAddressInputRef = useRef<HTMLInputElement>(null);
  const createAcListenerRef   = useRef<any>(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchAllUsers(), fetchAllSellerProducts().catch(() => [])])
      .then(([us, ps]) => { setUsers(us); setAllProducts(ps); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Set up Google Places autocomplete whenever edit modal opens
  useEffect(() => {
    if (!editTarget) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    const setup = () => {
      if (!addressInputRef.current || !window.google?.maps?.places) return;
      if (acListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(acListenerRef.current);
      const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ["name", "formatted_address", "geometry", "address_components"],
        types: ["establishment", "geocode"],
      });
      acListenerRef.current = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place) return;
        const fields = extractAddressFields(place);
        if (addressInputRef.current && fields.address)
          addressInputRef.current.value = fields.address;
        setEditTarget(prev => prev ? {
          ...prev,
          ...(place.name && (prev.role === "retailer" ? { shopName: place.name } : prev.role === "manufacturer" ? { businessName: place.name } : {})),
          address: fields.address ?? prev.address,
          city: fields.city ?? prev.city,
          state: fields.state ?? prev.state,
          pincode: fields.pincode ?? prev.pincode,
          latitude: fields.latitude ?? prev.latitude,
          longitude: fields.longitude ?? prev.longitude,
        } : prev);
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
      if (acListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(acListenerRef.current);
      acListenerRef.current = null;
    };
  }, [editTarget?.uid]);

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

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || [u.name, u.email, u.role, u.id, u.phone].join(" ").toLowerCase().includes(q);
    const matchRole = filterRole === "all" || (filterRole === "customer" ? (!u.role || u.role === "customer") : u.role === filterRole);
    return matchSearch && matchRole;
  });

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

  const openEdit = (u: any) => {
    setEditTarget({
      uid: u.id,
      name: u.name || "",
      email: u.email || "",
      phone: u.phone || "",
      role: u.role || "customer",
      isPaid: !!u.isPaid,
      subscriptionStatus: u.subscriptionStatus || "",
      shopName: u.shopName || "",
      businessName: u.businessName || "",
      address: u.address || "",
      city: u.city || "",
      state: u.state || "",
      pincode: u.pincode || "",
      latitude: u.latitude ?? null,
      longitude: u.longitude ?? null,
      social: {
        instagram: u.socialLinks?.instagram || "",
        facebook: u.socialLinks?.facebook || "",
        whatsapp: u.socialLinks?.whatsapp || "",
        youtube: u.socialLinks?.youtube || "",
      },
    });
    setSaveError(null);
    // prime the uncontrolled address input when it mounts
    requestAnimationFrame(() => {
      if (addressInputRef.current) addressInputRef.current.value = u.address || "";
    });

    if (u.role === "retailer" || u.role === "manufacturer") {
      fetchBusinessProfile(u.id, u.role, u.phone || u.id)
        .then((profile) => {
          if (!profile) return;
          setEditTarget((prev) => {
            if (!prev || prev.uid !== u.id) return prev;
            const newAddress = profile.address?.line1 || prev.address || "";
            if (addressInputRef.current) {
              addressInputRef.current.value = newAddress;
            }
            return {
              ...prev,
              shopName: profile.shopName || prev.shopName,
              businessName: profile.businessName || prev.businessName,
              address: newAddress,
              city: profile.address?.city || prev.city,
              state: profile.address?.state || prev.state,
              pincode: profile.address?.pincode || prev.pincode,
              latitude: profile.latitude !== undefined ? profile.latitude : prev.latitude,
              longitude: profile.longitude !== undefined ? profile.longitude : prev.longitude,
              social: {
                instagram: profile.socialLinks?.instagram || prev.social.instagram,
                facebook: profile.socialLinks?.facebook || prev.social.facebook,
                whatsapp: profile.socialLinks?.whatsapp || prev.social.whatsapp,
                youtube: profile.socialLinks?.youtube || prev.social.youtube,
              },
            };
          });
        })
        .catch((err) => {
          console.error("Error loading business profile in openEdit:", err);
        });
    }
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    setSaveError(null);
    const currentAddress = addressInputRef.current?.value?.trim() || editTarget.address;
    try {
      await adminUpdateUser(editTarget.uid, {
        name: editTarget.name,
        email: editTarget.email,
        phone: editTarget.phone,
        role: editTarget.role,
        isPaid: editTarget.isPaid,
        subscriptionStatus: editTarget.subscriptionStatus || undefined,
        shopName: editTarget.role === "retailer" ? editTarget.shopName : undefined,
        businessName: editTarget.role === "manufacturer" ? editTarget.businessName : undefined,
        address: currentAddress || undefined,
        city: editTarget.city || undefined,
        state: editTarget.state || undefined,
        pincode: editTarget.pincode || undefined,
        latitude: editTarget.latitude,
        longitude: editTarget.longitude,
        socialLinks: editTarget.social,
      });
      setUsers(prev => prev.map(u => u.id === editTarget.uid ? {
        ...u,
        name: editTarget.name, email: editTarget.email, phone: editTarget.phone,
        role: editTarget.role, isPaid: editTarget.isPaid,
        subscriptionStatus: editTarget.subscriptionStatus,
        shopName: editTarget.shopName, businessName: editTarget.businessName,
        address: currentAddress, city: editTarget.city,
        state: editTarget.state, pincode: editTarget.pincode,
        latitude: editTarget.latitude, longitude: editTarget.longitude,
        socialLinks: editTarget.social,
      } : u));
      setEditTarget(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
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

  const handleCreateUser = async () => {
    const { name, email, phone, password, shopName, role } = createForm;

    // ── Admin: server route (needs Firebase Auth createUser) ──────────────────
    if (role === "admin") {
      if (!email.trim())                    { setCreateError("Email is required for admin accounts."); return; }
      if (!password || password.length < 6) { setCreateError("Password must be at least 6 characters."); return; }
      setCreating(true); setCreateError(null); setCreateSuccess(null);
      try {
        const callerUid = auth.currentUser?.uid;
        const res = await fetch("/api/admin/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, callerUid }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create admin.");
        setCreateSuccess(data.message ?? "Admin account created.");
        setCreateForm({ name: "", email: "", phone: "", password: "", shopName: "", role: "consumer",
          address: "", city: "", state: "", pincode: "", latitude: null, longitude: null });
        load();
      } catch (e) {
        setCreateError(e instanceof Error ? e.message : "Failed to create admin.");
      } finally { setCreating(false); }
      return;
    }

    // ── Retailer / Manufacturer / Consumer: write Firestore directly ──────────
    // No server hop needed — admin's Firebase token satisfies Firestore rules.
    if (!phone.trim()) { setCreateError("Phone number is required."); return; }
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setCreateError("Enter a valid 10-digit phone number."); return; }
    const normalizedPhone = digits.length === 10 ? `+91${digits}` : `+${digits}`;

    setCreating(true); setCreateError(null); setCreateSuccess(null);
    try {
      const existing = await getDoc(doc(db, "users", normalizedPhone));
      if (existing.exists()) throw new Error(`A user with phone ${normalizedPhone} already exists.`);

      const now = serverTimestamp();
      const callerUid = auth.currentUser?.uid ?? "admin";
      const currentAddress = createAddressInputRef.current?.value?.trim() || createForm.address;

      // users/{normalizedPhone}
      await setDoc(doc(db, "users", normalizedPhone), {
        phone: normalizedPhone,
        uid: null,
        name: (name || "").trim(),
        email: email ? email.trim().toLowerCase() : null,
        role,
        isPaid: false,
        totalSeats: 0,
        productCount: 0,
        address: currentAddress || null,
        city: createForm.city || null,
        state: createForm.state || null,
        pincode: createForm.pincode || null,
        latitude:  createForm.latitude  ?? null,
        longitude: createForm.longitude ?? null,
        preCreatedByAdmin: callerUid,
        createdAt: now,
        updatedAt: now,
      });

      // profiles/{normalizedPhone} for sellers
      if (role === "retailer" || role === "manufacturer") {
        await setDoc(doc(db, "profiles", normalizedPhone), {
          type: role,
          ownerPhone: normalizedPhone,
          businessName: (shopName || name || "").trim(),
          ownerName: (name || "").trim(),
          phone: normalizedPhone,
          email: email ? email.trim().toLowerCase() : null,
          address: {
            line1:   currentAddress || null,
            city:    createForm.city    || null,
            state:   createForm.state   || null,
            pincode: createForm.pincode || null,
          },
          geo: (createForm.latitude && createForm.longitude)
            ? { latitude: createForm.latitude, longitude: createForm.longitude }
            : null,
          isActive: true,
          subscriptionStatus: "free",
          catalogIds: [],
          retailerPhones: [],
          preCreatedByAdmin: callerUid,
          createdAt: now,
          updatedAt: now,
        });

        // Activate the seller's storefront immediately so admins don't have to
        // wait for the seller's first OTP login. The record is keyed by phone;
        // OTP login later merges the real uid onto the same doc. Without this the
        // seller never shows in fetchStores() and assigned products have no store.
        await ensureSellerStorefront({
          phone: normalizedPhone, role, name, shopName,
          address: currentAddress || createForm.address,
          city: createForm.city, state: createForm.state, pincode: createForm.pincode,
          latitude: createForm.latitude, longitude: createForm.longitude,
          createdByAdmin: callerUid,
        });
      }

      const BLANK_FORM = { name: "", email: "", phone: "", password: "", shopName: "", role: "consumer",
        address: "", city: "", state: "", pincode: "", latitude: null, longitude: null };
      setCreateSuccess(
        `Pre-registered ${normalizedPhone} as ${role}. When they sign in via OTP they will automatically get the ${role} role.`
      );
      setCreateForm(BLANK_FORM);
      if (createAddressInputRef.current) createAddressInputRef.current.value = "";
      load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create user.");
    } finally { setCreating(false); }
  };

  const set = (key: keyof EditState, value: any) =>
    setEditTarget(prev => prev ? { ...prev, [key]: value } : prev);
  const setSocial = (key: keyof SocialLinks, value: string) =>
    setEditTarget(prev => prev ? { ...prev, social: { ...prev.social, [key]: value } } : prev);

  const mapUrl = editTarget?.latitude && editTarget?.longitude
    ? `https://maps.google.com/maps?q=${editTarget.latitude},${editTarget.longitude}&z=15&output=embed`
    : null;

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
            setCreateForm({ name: "", email: "", phone: "", password: "", shopName: "", role: "consumer",
              address: "", city: "", state: "", pincode: "", latitude: null, longitude: null });
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

      <div className="flex items-center gap-3 bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2.5">
        <Search className="h-4 w-4 text-outline shrink-0" />
        <input type="text" placeholder="Search by name, email, phone or role…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant" />
      </div>

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
                  <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-on-surface">{u.name || "—"}</p>
                      <p className="text-xs text-on-surface-variant truncate max-w-[200px]">{u.email || "—"}</p>
                      {u.phone && <p className="text-xs text-on-surface-variant">{u.phone}</p>}
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
                    <td className="px-5 py-3 text-sm text-on-surface">{u.totalSeats ?? "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <button type="button" onClick={() => openEdit(u)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-on-surface-variant">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-outline-variant/10">
            {filtered.map(u => (
              <div key={u.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{u.name || "—"}</p>
                    <p className="text-[11px] text-on-surface-variant truncate">{u.email || u.phone || u.id}</p>
                  </div>
                  <button type="button" onClick={() => openEdit(u)}
                    className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1 text-[11px] font-medium text-on-surface hover:bg-surface-container shrink-0">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
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
                  {(u.totalSeats ?? 0) > 0 && (
                    <span className="text-[11px] text-on-surface-variant">{u.totalSeats} seats</span>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-on-surface-variant">No users found.</div>
            )}
          </div>
        </div>
      )}

      {/* ─── Edit User Modal ─────────────────────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4 sm:pt-20">
          <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-full">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-on-surface">Edit User</h2>
                <p className="text-xs text-on-surface-variant mt-0.5 font-mono">{editTarget.uid.slice(0, 22)}…</p>
              </div>
              <button type="button" onClick={() => setEditTarget(null)}
                className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-6 flex-1">
              {saveError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>
              )}

              {/* ── Basic Info ── */}
              <div>
                <SectionLabel>Basic Info</SectionLabel>
                <div className="space-y-3">
                  <Field label="Name" value={editTarget.name} onChange={v => set("name", v)} placeholder="Full name" />
                  <Field label="Email" value={editTarget.email} onChange={v => set("email", v)} placeholder="user@example.com" type="email" />
                  <Field label="Phone" value={editTarget.phone} onChange={v => set("phone", v)} placeholder="+91…" type="tel" />
                  <div className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-on-surface">Role</span>
                    <select value={editTarget.role} onChange={e => set("role", e.target.value)}
                      className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none">
                      {EDITABLE_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* ── Subscription ── */}
              <div>
                <SectionLabel>Subscription & Seats</SectionLabel>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2.5">
                    <span className="text-sm font-medium text-on-surface">Paid / Active</span>
                    <button type="button" onClick={() => set("isPaid", !editTarget.isPaid)}
                      className={`w-10 h-6 rounded-full transition-colors flex items-center ${editTarget.isPaid ? "bg-green-500 justify-end" : "bg-gray-300 justify-start"}`}>
                      <span className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-on-surface">Subscription Status</span>
                    <select value={editTarget.subscriptionStatus} onChange={e => set("subscriptionStatus", e.target.value)}
                      className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none">
                      {SUB_STATUSES.map(s => <option key={s} value={s}>{s || "— not set —"}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* ── Business Details (role-specific) ── */}
              {(editTarget.role === "retailer" || editTarget.role === "manufacturer") && (
                <div>
                  <SectionLabel>Business Details</SectionLabel>
                  <div className="space-y-3">
                    {editTarget.role === "retailer" && (
                      <Field label="Shop Name" value={editTarget.shopName} onChange={v => set("shopName", v)} placeholder="Shop name" />
                    )}
                    {editTarget.role === "manufacturer" && (
                      <Field label="Business Name" value={editTarget.businessName} onChange={v => set("businessName", v)} placeholder="Business name" />
                    )}

                    {/* Google Maps Address */}
                    <div className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-on-surface flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        Search location on Google Maps
                        <span className="text-xs font-normal text-on-surface-variant">(auto-fills address)</span>
                      </span>
                      {/* Uncontrolled input — Google Autocomplete sets value via DOM directly */}
                      <input
                        ref={addressInputRef}
                        autoComplete="off"
                        defaultValue={editTarget.address}
                        placeholder="Type address, shop or landmark…"
                        className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2"
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <Field label="City" value={editTarget.city} onChange={v => set("city", v)} placeholder="City" />
                      <Field label="State" value={editTarget.state} onChange={v => set("state", v)} placeholder="State" />
                      <Field label="Pincode" value={editTarget.pincode} onChange={v => set("pincode", v)} placeholder="000000" />
                    </div>

                    {/* Map preview */}
                    {mapUrl && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                          <MapPin className="h-3.5 w-3.5" /> Location pinned
                        </div>
                        <div className="overflow-hidden rounded-xl border border-outline-variant/30">
                          <iframe title="Location preview" src={mapUrl} className="h-40 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Social Links ── */}
              <div>
                <SectionLabel>Social Links</SectionLabel>
                <div className="space-y-3">
                  {([
                    { key: "instagram" as const, icon: Instagram, label: "Instagram", placeholder: "instagram.com/yourpage" },
                    { key: "facebook"  as const, icon: Facebook,  label: "Facebook",  placeholder: "facebook.com/yourpage" },
                    { key: "whatsapp"  as const, icon: MessageCircle, label: "WhatsApp", placeholder: "+91 98765 43210" },
                    { key: "youtube"   as const, icon: Youtube,   label: "YouTube",   placeholder: "youtube.com/@channel" },
                  ]).map(({ key, icon: Icon, label, placeholder }) => (
                    <label key={key} className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-on-surface flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </span>
                      <input type="text" value={editTarget.social[key]}
                        onChange={e => setSocial(key, e.target.value)}
                        placeholder={placeholder}
                        className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse gap-3 border-t border-outline-variant/20 px-5 py-4 shrink-0 sm:flex-row sm:items-center sm:justify-end">
              <button type="button" onClick={() => setEditTarget(null)} disabled={saving}
                className="w-full rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-60 sm:w-auto">
                Cancel
              </button>
              <button type="button" onClick={handleSaveEdit} disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60 sm:w-auto">
                {saving ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Saving…</>
                ) : (
                  <><Check className="h-4 w-4" /> Save changes</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Products Panel (view + assign) ──────────────────────────────── */}
      {productsUser && (() => {
        const isSeller = productsUser.role === "retailer" || productsUser.role === "manufacturer";
        return (
        <div className="fixed inset-0 z-[70] flex items-end justify-end bg-black/40 backdrop-blur-sm pt-16">
          <div className="w-full max-w-md h-full bg-white flex flex-col shadow-2xl">
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
                  className="flex items-start gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-low p-3">
                  {p.image ? (
                    <img src={p.image} alt={p.name} className="h-12 w-12 rounded-lg object-cover shrink-0 border border-outline-variant/20" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-surface-container shrink-0 flex items-center justify-center">
                      <Package className="h-5 w-5 text-on-surface-variant opacity-40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm text-on-surface truncate">{p.name || "—"}</p>
                      {p.copies > 1 && (
                        <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[9px] font-black">×{p.copies}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-on-surface-variant">{p.category || "—"}</span>
                      {p.price > 0 && (
                        <span className="text-xs font-bold text-secondary">₹{p.price.toLocaleString("en-IN")}</span>
                      )}
                      <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                        p.stock === "In Stock" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                      }`}>{p.stock || "—"}</span>
                      {p.source && (
                        <span className="text-[10px] text-on-surface-variant font-mono">{p.source}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
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
              ))}
            </div>
          </div>
        </div>
        );
      })()}

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
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <h2 className="text-base font-bold text-on-surface">Create New User</h2>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4 flex-1">
              {createError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 font-medium">{createError}</div>
              )}
              {createSuccess && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700 font-medium">{createSuccess}</div>
              )}

              {/* Role selector first — drives which fields appear */}
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">Role</span>
                <select
                  value={createForm.role}
                  onChange={e => {
                    setCreateForm(f => ({ ...f, role: e.target.value, phone: "", email: "", password: "", shopName: "",
                      address: "", city: "", state: "", pincode: "", latitude: null, longitude: null }));
                    if (createAddressInputRef.current) createAddressInputRef.current.value = "";
                  }}
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none"
                >
                  <option value="consumer">Consumer (Regular User)</option>
                  <option value="retailer">Retailer</option>
                  <option value="manufacturer">Manufacturer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Admin path — email + password */}
              {createForm.role === "admin" ? (
                <div className="rounded-xl border border-red-100 bg-red-50/50 p-3 space-y-3">
                  <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" /> Admin — Email + Password login at /admin-login
                  </p>
                  <Field label="Full Name" value={createForm.name} onChange={v => setCreateForm(f => ({ ...f, name: v }))} placeholder="e.g. Vinay Admin" />
                  <Field label="Email *" value={createForm.email} onChange={v => setCreateForm(f => ({ ...f, email: v }))} placeholder="admin@example.com" type="email" />
                  <Field label="Password * (min 6 chars)" value={createForm.password} onChange={v => setCreateForm(f => ({ ...f, password: v }))} placeholder="Secure password" type="password" />
                </div>
              ) : (
                /* Non-admin path — phone OTP only */
                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span className="font-bold">Phone OTP only</span> — pre-registers this number so when they sign in via OTP they get the <span className="font-bold capitalize">{createForm.role}</span> role automatically.
                  </div>
                  <Field label="Phone Number *" value={createForm.phone} onChange={v => setCreateForm(f => ({ ...f, phone: v }))} placeholder="98765 43210" type="tel" />
                  <Field label="Full Name" value={createForm.name} onChange={v => setCreateForm(f => ({ ...f, name: v }))} placeholder="e.g. Raju Sharma" />
                  <Field label="Email (optional)" value={createForm.email} onChange={v => setCreateForm(f => ({ ...f, email: v }))} placeholder="user@example.com" type="email" />
                  {(createForm.role === "retailer" || createForm.role === "manufacturer") && (
                    <Field
                      label={createForm.role === "retailer" ? "Shop Name" : "Business Name"}
                      value={createForm.shopName}
                      onChange={v => setCreateForm(f => ({ ...f, shopName: v }))}
                      placeholder={createForm.role === "retailer" ? "e.g. Sharma Agro Store" : "e.g. KisanBio Inputs Ltd"}
                    />
                  )}

                  {/* Address — Google Maps autocomplete */}
                  <div className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-on-surface flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> Address
                      <span className="text-xs font-normal text-on-surface-variant">(optional — type to search)</span>
                    </span>
                    <input
                      ref={createAddressInputRef}
                      autoComplete="off"
                      placeholder="Type shop address, landmark or pincode…"
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
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-outline-variant/20 px-5 py-4 shrink-0 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowCreate(false)} disabled={creating}
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

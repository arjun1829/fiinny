"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil, Search, ShieldCheck, Users, AlertTriangle, X, Check,
  ChevronUp, ChevronDown, UserPlus, Loader2,
  SlidersHorizontal, Calendar, RotateCcw, MapPin, LayoutDashboard,
  Bell,
} from "lucide-react";
import {
  promoteToAdmin, ensureSellerStorefront,
  fetchUsersPage, fetchSubscriptionsForPhones, type UserRoleFilter,
  db, auth,
} from "../../firebase";
import { AdminUserEditPanel } from "../_components/admin-user-edit-panel";
import { PendingSignupPanel } from "../_components/pending-signup-panel";
import { RefreshButton } from "../_components/refresh-button";
import { useAdminAuth } from "../_context/admin-auth-context";
import {
  getUsers, getSubscriptions, getRoleCounts, invalidateUsers, newestAge, CACHE_KEYS,
} from "../_lib/admin-data";
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

export default function AdminUsersPage() {
  const identity = useAdminAuth();
  const isFullAdmin = identity.role === "admin";
  // Browse mode — Firestore-paginated "page N of users", loaded 25 at a time via "See More".
  const PAGE_SIZE = 20;
  const [pageUsers, setPageUsers] = useState<any[]>([]);
  const [pageSubs, setPageSubs] = useState<any[]>([]);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [roleCounts, setRoleCounts] = useState({ all: 0, retailer: 0, manufacturer: 0, admin: 0, customer: 0 });

  // Full mode — the complete users/subscriptions collections, pulled from the shared
  // admin cache (app/admin/_lib/admin-data) the moment search/role-filter/advanced-filter/
  // promote needs to look beyond whatever pages are currently loaded. The cache is shared
  // with the other admin tabs, so this is normally free after the first use.
  // Products are deliberately NOT fetched here — this tab shows no product data.
  const [fullUsers, setFullUsers] = useState<any[] | null>(null);
  const [fullSubs, setFullSubs] = useState<any[] | null>(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dataAge, setDataAge] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  // Debounced copy of `search` — the input stays instant while the (potentially
  // thousands-of-rows) filter/sort pass runs at most once per pause in typing.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState("all");

  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPendingSignups, setShowPendingSignups] = useState(false);
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterHasSubscription, setFilterHasSubscription] = useState<"all" | "yes" | "no">("all");
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

  // Google Maps autocomplete ref — create modal only
  const createAddressInputRef = useRef<HTMLInputElement>(null);
  const createAcListenerRef   = useRef<any>(null);

  // Whether the admin has engaged search/role-chip/advanced-filter/promote-panel — any of
  // these need to look beyond whatever pages are currently loaded, so they trigger a
  // one-time fetch-and-cache of the complete collections instead of scoped paginated data.
  // Role is now applied by Firestore inside fetchUsersPage, so it no longer
  // forces the whole collection into memory. Only the filters Firestore cannot
  // express as a paginated query still do — free-text search across several
  // fields, subscription joins, and the city/state/date predicates.
  const isFiltering = !!debouncedSearch.trim() ||
    filterActive !== "all" || filterHasSubscription !== "all" ||
    !!filterDateFrom || !!filterDateTo ||
    !!filterCity.trim() || !!filterState.trim();
  const needsFullData = isFiltering || showPromotePanel;

  // Derived "current dataset" — paginated browse-mode pages by default, or the fully
  // cached collections once full mode has been triggered and loaded.
  const users = isFiltering ? (fullUsers ?? []) : pageUsers;
  const allSubs = isFiltering ? (fullSubs ?? []) : pageSubs;
  // Promote-to-admin search always needs the full user list regardless of the main
  // table's mode, falling back to whatever page is loaded while the full fetch is in flight.
  const promoteSourceUsers = fullUsers ?? pageUsers;

  /**
   * Reloads the first page. `force` (the Refresh button, and every write on this tab)
   * also drops the shared users cache so the next search re-reads Firestore; a plain
   * reload reuses whatever the cache already holds.
   */
  const load = (force = false, role: string = filterRole) => {
    if (force) invalidateUsers();
    setLoading(true);
    setPageUsers([]); setPageSubs([]);
    setLastDoc(null); setHasMore(true);
    setFullUsers(null); setFullSubs(null);
    return Promise.all([
      fetchUsersPage(PAGE_SIZE, null, role as UserRoleFilter),
      getRoleCounts({ force }),
    ])
      .then(async ([page, counts]) => {
        setPageUsers(page.users);
        setLastDoc(page.lastDoc);
        setHasMore(page.hasMore);
        setRoleCounts(counts);
        setDataAge(Date.now());
        const ss = await fetchSubscriptionsForPhones(page.users.map(u => u.phone).filter(Boolean)).catch(() => []);
        setPageSubs(ss);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Switching role tab re-queries Firestore for that role instead of filtering a
  // fully-downloaded list. Skips the very first run, which load() above covers.
  const didMountRole = useRef(false);
  useEffect(() => {
    if (!didMountRole.current) { didMountRole.current = true; return; }
    load(false, filterRole);
  }, [filterRole]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Clearing the box takes effect immediately; typing settles after 250ms.
    if (!search) { setDebouncedSearch(""); return; }
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    load(true).finally(() => setRefreshing(false));
  };

  const loadMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchUsersPage(PAGE_SIZE, lastDoc, filterRole as UserRoleFilter);
      setPageUsers(prev => [...prev, ...page.users]);
      setLastDoc(page.lastDoc);
      setHasMore(page.hasMore);
      const ss = await fetchSubscriptionsForPhones(page.users.map(u => u.phone).filter(Boolean)).catch(() => []);
      setPageSubs(prev => {
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...ss.filter(p => !seen.has(p.id))];
      });
    } finally {
      setLoadingMore(false);
    }
  };

  // Pull the full collections the moment full mode is needed. Both come from the shared
  // admin cache, so searching after the first time costs no Firestore reads at all.
  useEffect(() => {
    if (!needsFullData || fullUsers !== null || fullLoading) return;
    setFullLoading(true);
    Promise.all([getUsers(), getSubscriptions().catch(() => [])])
      .then(([us, ss]) => {
        setFullUsers(us); setFullSubs(ss);
        const age = newestAge(CACHE_KEYS.users);
        if (age !== null) setDataAge(Date.now() - age);
      })
      .finally(() => setFullLoading(false));
  }, [needsFullData, fullUsers, fullLoading]);

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

  const promoteCandidates = promoteSourceUsers.filter(u =>
    u.role !== "admin" &&
    (!promoteSearch || [u.name, u.email].join(" ").toLowerCase().includes(promoteSearch.toLowerCase()))
  );

  // Role-chip counts come from cheap server-side aggregates (roleCounts), not the
  // currently-loaded page — they stay accurate no matter how many pages are loaded.
  const counts = roleCounts;

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
    setFilterCity("");
    setFilterState("");
  };

  const filtered = users.filter(u => {
    const q = debouncedSearch.toLowerCase();
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

    const matchCity  = !filterCity.trim()  ? true : (u.city  || "").toLowerCase().includes(filterCity.trim().toLowerCase());
    const matchState = !filterState.trim() ? true : (u.state || "").toLowerCase().includes(filterState.trim().toLowerCase());

    return matchSearch && matchRole && matchActive && matchSubscription && matchDateFrom && matchDateTo && matchCity && matchState;
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
    !!filterCity.trim(),
    !!filterState.trim(),
  ].filter(Boolean).length;

  const handlePromoteConfirm = async () => {
    if (!promoteTarget) return;
    if (confirmEmail.trim().toLowerCase() !== (promoteTarget.email || "").toLowerCase()) {
      alert("Email does not match. Promotion cancelled.");
      return;
    }
    setPromoting(true);
    try {
      await promoteToAdmin(promoteTarget.id);
      invalidateUsers();
      const promote = (prev: any[]) => prev.map(u => u.id === promoteTarget.id ? { ...u, role: "admin", isPaid: true } : u);
      setPageUsers(promote);
      setFullUsers(prev => (prev === null ? prev : promote(prev)));
      getRoleCounts({ force: true }).then(setRoleCounts).catch(() => {});
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
        const idToken = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/admin/create-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ name, email, password, role }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to create ${label}.`);
        setCreateSuccess(data.message ?? `${label} account created.`);
        setCreateForm(BLANK_FORM);
        load(true);
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
      load(true);
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
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <RefreshButton savedAt={dataAge} refreshing={refreshing} onRefresh={handleRefresh} />
          <button
            type="button"
            onClick={() => setShowPendingSignups(v => !v)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              showPendingSignups
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
            }`}
          >
            <Bell className="h-4 w-4" /> Pending Signups
          </button>
          {isFullAdmin && (
            <button
              type="button"
              onClick={() => {
                setShowCreate(true); setCreateError(null); setCreateSuccess(null);
                setPhoneError(null); setSeatsInput("1"); setCreateForm(BLANK_FORM);
              }}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity"
            >
              <UserPlus className="h-4 w-4" /> Create User
            </button>
          )}
        </div>
      </div>

      {showPendingSignups && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
          <PendingSignupPanel />
        </div>
      )}

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
            Showing <span className="font-bold text-on-surface">{filtered.length}</span> of <span className="font-bold text-on-surface">{roleCounts.all}</span> users
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/20 bg-surface-container-low flex items-center gap-2">
            <span className="text-xs font-bold text-on-surface-variant">
              {isFiltering
                ? `${filtered.length} user${filtered.length !== 1 ? "s" : ""}`
                : `Showing ${filtered.length} of ${roleCounts.all} user${roleCounts.all !== 1 ? "s" : ""}`}
            </span>
            {fullLoading && (
              <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching all users…
              </span>
            )}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">User</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Role</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Subscription</th>
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
                      {/* Sellers are edited from their own dashboard (Dashboard button) —
                          the inline Edit panel is kept only for roles that have no dashboard. */}
                      <div className="inline-flex items-center gap-1.5">
                        {(u.role === "retailer" || u.role === "manufacturer") ? (
                          <a
                            href={`/dashboard?adminView=${encodeURIComponent(u.phone || u.id)}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                            title={`Open ${u.shopName || u.name || u.id}'s dashboard`}
                          >
                            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
                          </a>
                        ) : (
                          <button type="button" onClick={() => setEditUser(u)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-on-surface-variant">No users found.</td></tr>
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
                    {(u.role === "retailer" || u.role === "manufacturer") ? (
                      <a
                        href={`/dashboard?adminView=${encodeURIComponent(u.phone || u.id)}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                      >
                        <LayoutDashboard className="h-3 w-3" />
                      </a>
                    ) : (
                      <button type="button" onClick={() => setEditUser(u)}
                        className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1 text-[11px] font-medium text-on-surface hover:bg-surface-container">
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    )}
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

          {/* See More — only in browse mode; search/filters already show every match. */}
          {!isFiltering && hasMore && (
            <div className="flex justify-center border-t border-outline-variant/20 py-3">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-5 py-2 text-sm font-bold text-on-surface hover:bg-surface-container disabled:opacity-60"
              >
                {loadingMore ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</> : "See More"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Edit User Panel ─────────────────────────────────────────────────────── */}
      {editUser && (
        <AdminUserEditPanel
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { load(true); }}
        />
      )}


      {/* ─── Guarded Admin Promotion Section (full admins only) ──────────── */}
      {isFullAdmin && (
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
      )}

      {/* ─── Create User Modal ──────────────────────────────────────────────── */}
      {isFullAdmin && showCreate && (
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

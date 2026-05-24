"use client";

import { useEffect, useState } from "react";
import {
  Building2, Phone, Plus, RefreshCw, Check, X,
  Pencil, ChevronDown, ChevronUp, Loader2, Trash2,
  Package, Store, Video, LinkIcon
} from "lucide-react";
import {
  fetchAllCompanyPages,
  saveCompanyPage,
  assignCompanyOwner,
  removeCompanyOwner,
  type CompanyPageDoc,
} from "../../firebase";
import { MANUFACTURERS } from "../../constants";

// ── Seed a single manufacturer from constants.ts → Firestore ──────────────────
async function seedCompany(mfrId: string): Promise<void> {
  const mfr = MANUFACTURERS[mfrId];
  if (!mfr) return;
  await saveCompanyPage(mfrId, {
    id: mfrId,
    name: mfr.name,
    tagline: mfr.tagline,
    location: mfr.location,
    about: mfr.about,
    founded: mfr.founded,
    website: mfr.website ?? "",
    socialProof: mfr.socialProof,
    certifications: mfr.certifications,
    primaryColor: mfr.primaryColor,
    accentColor: mfr.accentColor,
    phone: mfr.phone ?? "",
    email: mfr.email ?? "",
    videos: (mfr as any).videos ?? [],
    ownerPhone: (mfr as any).ownerPhone ?? "",
  });
}

// ── Row component ──────────────────────────────────────────────────────────────

function CompanyRow({
  company,
  onRefresh,
}: {
  company: CompanyPageDoc;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [phoneInput, setPhoneInput] = useState(company.ownerPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const handleAssign = async () => {
    setSaving(true); setStatus(null);
    try {
      const phone = phoneInput.trim();
      if (!phone && company.ownerPhone) {
        await removeCompanyOwner(company.id, company.ownerPhone);
      } else if (phone) {
        await assignCompanyOwner(company.id, phone);
      }
      setStatus({ type: "ok", msg: phone ? `Assigned to ${phone}` : "Ownership removed." });
      onRefresh();
    } catch (err) {
      setStatus({ type: "err", msg: err instanceof Error ? err.message : "Failed." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-container/50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Color swatch */}
        <div
          className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
          style={{ background: company.primaryColor || "#154212" }}
        >
          <Building2 className="w-5 h-5 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-on-surface text-sm">{company.name}</p>
          <p className="text-xs text-on-surface-variant truncate">{company.location}</p>
        </div>

        {/* Owner badge */}
        {company.ownerPhone ? (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-[11px] font-bold shrink-0">
            <Phone className="w-3 h-3" /> {company.ownerPhone}
          </span>
        ) : (
          <span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-semibold shrink-0">
            No owner
          </span>
        )}

        {expanded ? (
          <ChevronUp className="w-4 h-4 text-on-surface-variant shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-on-surface-variant shrink-0" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-outline-variant/20 px-5 py-5 space-y-5 bg-surface-container/30">
          {/* Quick info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Package, label: "Products", value: String((company as any).productIds?.length ?? "—") },
              { icon: Store, label: "Stores", value: String((company as any).storeIds?.length ?? "—") },
              { icon: Video, label: "Videos", value: String(company.videos?.length ?? 0) },
              { icon: LinkIcon, label: "Website", value: company.website ? "Set" : "None" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-xl bg-surface-container-low border border-outline-variant/20 p-3 text-center">
                <Icon className="w-4 h-4 text-primary mx-auto mb-1" />
                <p className="text-sm font-bold text-on-surface">{value}</p>
                <p className="text-[10px] text-on-surface-variant">{label}</p>
              </div>
            ))}
          </div>

          {/* About */}
          <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-3">{company.about}</p>

          {/* Assign owner */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-on-surface uppercase tracking-wider">Assign Owner (by phone)</p>
            <p className="text-xs text-on-surface-variant">
              Enter the Indian mobile number of the person who will manage this company page from their dashboard.
              Phone is the universal identifier — it must match their KrishiDukan account.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant" />
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="e.g. 9307199040 or +919307199040"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-outline-variant/40 bg-white text-sm text-on-surface outline-none ring-primary/30 focus:ring-2"
                />
              </div>
              <button
                type="button"
                onClick={handleAssign}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 transition-opacity shrink-0"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {phoneInput.trim() ? "Assign" : "Remove"}
              </button>
            </div>
            {status && (
              <p className={`text-xs font-medium ${status.type === "ok" ? "text-green-700" : "text-red-600"}`}>
                {status.type === "ok" ? "✓ " : "✗ "}{status.msg}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<CompanyPageDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allConstantIds = Object.keys(MANUFACTURERS);
  const seededIds = new Set(companies.map((c) => c.id));
  const unseededIds = allConstantIds.filter((id) => !seededIds.has(id));

  const load = () => {
    setLoading(true);
    setError(null);
    fetchAllCompanyPages()
      .then(setCompanies)
      .catch((err) => setError(err.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSeedAll = async () => {
    setSeeding(true); setSeedStatus(null);
    try {
      for (const id of unseededIds) {
        await seedCompany(id);
      }
      setSeedStatus(`✓ Seeded ${unseededIds.length} company page(s) to Firestore.`);
      load();
    } catch (err) {
      setSeedStatus(`✗ ${err instanceof Error ? err.message : "Seed failed."}`);
    } finally {
      setSeeding(false);
    }
  };

  const handleSeedOne = async (id: string) => {
    setSeeding(true); setSeedStatus(null);
    try {
      await seedCompany(id);
      setSeedStatus(`✓ ${MANUFACTURERS[id]?.name} seeded.`);
      load();
    } catch (err) {
      setSeedStatus(`✗ ${err instanceof Error ? err.message : "Seed failed."}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Building2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-black text-on-surface">Company Pages</h1>
        </div>
        <p className="text-sm text-on-surface-variant ml-9">
          Manage brand pages and assign them to their owners via phone number.
        </p>
      </div>

      {/* Seed banner — only when there are un-seeded companies in constants */}
      {unseededIds.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="font-bold text-amber-800 text-sm">
                {unseededIds.length} company page{unseededIds.length > 1 ? "s" : ""} in constants.ts not yet in Firestore
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Seed them to Firestore so owners can edit their brand, products, and stores from their dashboard.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {unseededIds.map((id) => (
                  <span key={id} className="text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                    {MANUFACTURERS[id]?.name}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSeedAll}
              disabled={seeding}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 transition-opacity shrink-0"
            >
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Seed All to Firestore
            </button>
          </div>
          {seedStatus && (
            <p className={`mt-3 text-xs font-medium ${seedStatus.startsWith("✓") ? "text-green-700" : "text-red-600"}`}>
              {seedStatus}
            </p>
          )}
        </div>
      )}

      {seedStatus && unseededIds.length === 0 && (
        <p className={`text-xs font-medium rounded-xl px-4 py-2.5 border ${seedStatus.startsWith("✓") ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-600"}`}>
          {seedStatus}
        </p>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm font-semibold text-on-surface-variant">
          {companies.length} company page{companies.length !== 1 ? "s" : ""} in Firestore
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-outline-variant/40 bg-white text-sm font-semibold text-on-surface hover:bg-surface-container transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : companies.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-16 text-center space-y-3">
          <Building2 className="w-10 h-10 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No company pages in Firestore yet.</p>
          <p className="text-sm text-on-surface-variant">Use the &quot;Seed All&quot; button above to import from constants.ts.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map((company) => (
            <CompanyRow key={company.id} company={company} onRefresh={load} />
          ))}
        </div>
      )}

      {/* Seed individual companies from constants that aren't in Firestore yet */}
      {unseededIds.length > 0 && companies.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Not yet seeded</p>
          {unseededIds.map((id) => (
            <div key={id} className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-outline-variant/40 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-on-surface">{MANUFACTURERS[id]?.name}</p>
                <p className="text-xs text-on-surface-variant">{MANUFACTURERS[id]?.location}</p>
              </div>
              <button
                type="button"
                onClick={() => handleSeedOne(id)}
                disabled={seeding}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
              >
                {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Seed
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

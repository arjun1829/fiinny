"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Smartphone, Save, RefreshCw } from "lucide-react";
import { auth, db } from "../../firebase";

type Policy = {
  enabled: boolean;
  latestVersion: string;
  minSupportedVersion: string;
  releaseNotes: string;
  androidUrl: string;
  iosUrl: string;
};

const EMPTY: Policy = {
  enabled: true,
  latestVersion: "",
  minSupportedVersion: "",
  releaseNotes: "",
  androidUrl: "",
  iosUrl: "",
};

const VERSION_RE = /^\d+(\.\d+){0,3}$/;

/** -1 / 0 / 1, numeric per segment — same rule as the app's compareVersions. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export default function AdminAppVersionPage() {
  const [policy, setPolicy] = useState<Policy>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "appVersion", "current"));
      const d = snap.data() ?? {};
      setPolicy({
        enabled: d.enabled !== false,
        latestVersion: String(d.latestVersion ?? ""),
        minSupportedVersion: String(d.minSupportedVersion ?? ""),
        releaseNotes: String(d.releaseNotes ?? ""),
        androidUrl: String(d.androidUrl ?? ""),
        iosUrl: String(d.iosUrl ?? ""),
      });
    } catch (e) {
      console.error(e);
      setMessage({ ok: false, text: "Could not load the current settings." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const set = <K extends keyof Policy>(k: K, v: Policy[K]) => setPolicy((p) => ({ ...p, [k]: v }));

  const validate = (): string | null => {
    const latest = policy.latestVersion.trim();
    const min = policy.minSupportedVersion.trim();
    if (latest && !VERSION_RE.test(latest)) return "Latest version must look like 2.5.0";
    if (min && !VERSION_RE.test(min)) return "Minimum version must look like 2.4.0";
    if (min && !latest) return "Set the latest version too — the forced update needs a target.";
    if (min && latest && compareVersions(min, latest) > 0) {
      return "Minimum supported version cannot be newer than the latest version.";
    }
    for (const url of [policy.androidUrl, policy.iosUrl]) {
      if (url.trim() && !/^https:\/\//.test(url.trim())) return "Store links must start with https://";
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) {
      setMessage({ ok: false, text: err });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await setDoc(
        doc(db, "appVersion", "current"),
        {
          enabled: policy.enabled,
          latestVersion: policy.latestVersion.trim(),
          minSupportedVersion: policy.minSupportedVersion.trim(),
          releaseNotes: policy.releaseNotes.trim(),
          androidUrl: policy.androidUrl.trim(),
          iosUrl: policy.iosUrl.trim(),
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid ?? null,
        },
        { merge: true },
      );
      setMessage({ ok: true, text: "Saved. Apps pick this up on their next launch or resume." });
    } catch (e) {
      console.error(e);
      setMessage({ ok: false, text: "Save failed — check your permissions and try again." });
    } finally {
      setSaving(false);
    }
  };

  const input =
    "w-full rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-on-surface">
            <Smartphone className="h-6 w-6 text-primary" /> App updates
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Controls the &ldquo;Update available&rdquo; prompt in the Android and iOS apps.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm font-semibold"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="space-y-2 rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant">
        <p>
          <b>Android</b> users installed from the Play Store get Google Play&rsquo;s own update popup
          automatically whenever a newer build is live — nothing to set here for that.
        </p>
        <p>
          <b>iOS</b> users are prompted when the App Store has a newer version, also automatically.
        </p>
        <p>
          Use <b>Minimum supported version</b> only when older builds genuinely break: anyone below it
          sees a full-screen update they cannot skip.
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-outline-variant/30 bg-white p-5">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-bold text-on-surface">Show update prompts</span>
            <span className="block text-xs text-on-surface-variant">Turn off to silence every prompt.</span>
          </span>
          <input
            type="checkbox"
            checked={policy.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
            className="h-5 w-5 accent-[#0f391b]"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-on-surface">Latest version</span>
            <input
              className={input}
              placeholder="e.g. 2.5.0"
              value={policy.latestVersion}
              onChange={(e) => set("latestVersion", e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-on-surface-variant">
              Used for sideloaded / non-Play installs.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-on-surface">Minimum supported version</span>
            <input
              className={input}
              placeholder="blank = never force"
              value={policy.minSupportedVersion}
              onChange={(e) => set("minSupportedVersion", e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-on-surface-variant">Below this, update is forced.</span>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-on-surface">What&rsquo;s new (optional)</span>
          <textarea
            className={`${input} min-h-[90px]`}
            maxLength={400}
            value={policy.releaseNotes}
            onChange={(e) => set("releaseNotes", e.target.value)}
          />
        </label>

        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-on-surface-variant">Store links (optional)</summary>
          <div className="mt-3 grid gap-4">
            <input
              className={input}
              placeholder="Play Store link — defaults to the KrishiDukan listing"
              value={policy.androidUrl}
              onChange={(e) => set("androidUrl", e.target.value)}
            />
            <input
              className={input}
              placeholder="App Store link — defaults to the KrishiDukan listing"
              value={policy.iosUrl}
              onChange={(e) => set("iosUrl", e.target.value)}
            />
          </div>
        </details>

        {message && (
          <p className={`text-sm font-semibold ${message.ok ? "text-primary" : "text-red-600"}`}>{message.text}</p>
        )}

        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void save()}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

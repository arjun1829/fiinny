"use client";

import { useRef, useState } from "react";
import { Truck, X, Link2, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { updateOrderStatus } from "../../firebase";
import type { OrderDoc } from "../../../types/order";
import {
  COURIERS,
  MAX_TRACKING_SENDS,
  TRACKING_ID_TYPES,
  buildTrackingUrl,
  callTrackingApi,
  emptyTrackingDraft,
  isTrackingSendEnabled,
  isValidTrackingUrl,
  newRequestId,
  trackingDraftError,
  trackingSendsRemaining,
  type CourierValue,
  type TrackingDraft,
} from "./_tracking";

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6" onClick={onClose}>
      <div className="relative w-full max-w-md my-6 rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const fieldLabel = "text-[11px] font-black uppercase tracking-widest text-on-surface-variant";
const fieldInput = "mt-1.5 w-full rounded-xl border border-outline-variant/50 px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60";

/**
 * The shipment-tracking fields shared by the dispatch and resend modals:
 * courier (a convenience that auto-fills the link), tracking link, identifier
 * type (with a custom label when "Other"), and the identifier itself. The saved
 * fields live in the parent `TrackingDraft`; the courier choice and whether the
 * link was hand-edited are UI-only state kept here (never persisted).
 *
 * Auto-fill rules, designed to never clobber a user's own edit:
 *   • Pick a courier → the link is rebuilt from its format + current ID (and the
 *     "hand-edited" flag resets, since this is a fresh intent).
 *   • Change the Tracking ID → the link is rebuilt only while a supported
 *     courier is selected AND the user has not hand-edited the link.
 *   • Type in the link → marks it hand-edited; ID changes stop touching it until
 *     a courier is picked again.
 */
function TrackingFields({
  draft,
  onChange,
  disabled,
}: {
  draft: TrackingDraft;
  onChange: (next: TrackingDraft) => void;
  disabled: boolean;
}) {
  // Courier defaults to "Other" so a pre-filled link (resend flow) is preserved;
  // a link already present counts as hand-edited for the same reason.
  const [courier, setCourier] = useState<CourierValue>("other");
  const [urlEdited, setUrlEdited] = useState(() => draft.url.trim().length > 0);
  const urlTouchedInvalid = draft.url.length > 0 && !isValidTrackingUrl(draft.url);
  const isOtherCourier = courier === "other";

  const onCourierChange = (next: CourierValue) => {
    setCourier(next);
    if (next === "other") {
      // Let the seller paste a complete URL; don't overwrite what's there.
      setUrlEdited(true);
      return;
    }
    setUrlEdited(false);
    onChange({ ...draft, url: buildTrackingUrl(next, draft.id) });
  };

  const onIdChange = (id: string) => {
    const next = { ...draft, id };
    if (!isOtherCourier && !urlEdited) next.url = buildTrackingUrl(courier, id);
    onChange(next);
  };

  const onUrlChange = (url: string) => {
    setUrlEdited(true);
    onChange({ ...draft, url });
  };

  return (
    <div className="space-y-4">
      <label className="block">
        <span className={fieldLabel}>Courier / Platform</span>
        <select
          value={courier}
          onChange={(e) => onCourierChange(e.target.value as CourierValue)}
          disabled={disabled}
          className={fieldInput}
        >
          {COURIERS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={fieldLabel}>Tracking Link</span>
        <input
          type="url"
          inputMode="url"
          value={draft.url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://example.com/track/123456"
          disabled={disabled}
          className={fieldInput}
        />
        {urlTouchedInvalid && <span className="mt-1 block text-xs text-red-600">Enter a valid http(s) URL.</span>}
        {!isOtherCourier && (
          <span className="mt-1 block text-[11px] text-on-surface-variant">Auto-filled from the courier — edit it if needed.</span>
        )}
      </label>

      <label className="block">
        <span className={fieldLabel}>Tracking ID Type</span>
        <select
          value={draft.idType}
          onChange={(e) => onChange({ ...draft, idType: e.target.value as TrackingDraft["idType"] })}
          disabled={disabled}
          className={fieldInput}
        >
          {TRACKING_ID_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      {draft.idType === "other" && (
        <label className="block">
          <span className={fieldLabel}>Custom ID Label</span>
          <input
            type="text"
            value={draft.customLabel}
            onChange={(e) => onChange({ ...draft, customLabel: e.target.value })}
            placeholder="e.g. Docket Number"
            disabled={disabled}
            className={fieldInput}
          />
        </label>
      )}

      <label className="block">
        <span className={fieldLabel}>Tracking ID</span>
        <input
          type="text"
          value={draft.id}
          onChange={(e) => onIdChange(e.target.value)}
          placeholder="Enter tracking ID"
          disabled={disabled}
          className={fieldInput}
        />
      </label>
    </div>
  );
}

/**
 * Shown when the seller clicks "Mark Dispatched" on an accepted order. Two
 * paths, chosen on the first screen:
 *   • "Send Tracking Link"    → opens the tracking-details form, dispatches, and
 *                               sends the `order_tracking_link` WhatsApp template.
 *   • "Dispatch Without Link" → dispatches immediately, sends nothing.
 * The status change goes through the existing updateOrderStatus; the link + ID +
 * WhatsApp send go through /api/orders/tracking. A WhatsApp failure does NOT undo
 * the dispatch — the order is already dispatched by that point.
 */
export function DispatchDialog({
  order,
  onCancel,
  onDone,
}: {
  order: OrderDoc;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const [step, setStep] = useState<"choose" | "form">("choose");
  const [draft, setDraft] = useState<TrackingDraft>(() => emptyTrackingDraft());
  const [busy, setBusy] = useState<null | "send" | "plain">(null);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per dialog — retrying the send after a transient failure
  // reuses it so the server never double-sends.
  const requestId = useRef(newRequestId());
  const sendEnabled = isTrackingSendEnabled();
  const draftError = trackingDraftError(draft);

  const dispatchPlain = async () => {
    setBusy("plain");
    setError(null);
    try {
      await updateOrderStatus(order.id, "dispatched");
      onDone("Order marked as dispatched.");
    } catch {
      setError("Could not mark the order dispatched. Please try again.");
      setBusy(null);
    }
  };

  const dispatchAndSend = async () => {
    if (draftError) {
      setError(draftError);
      return;
    }
    setBusy("send");
    setError(null);
    try {
      // Status first — if this fails we never claim a send. Once it succeeds the
      // dispatch stands regardless of what the WhatsApp send does.
      await updateOrderStatus(order.id, "dispatched");
    } catch {
      setError("Could not mark the order dispatched. Please try again.");
      setBusy(null);
      return;
    }
    try {
      const res = await callTrackingApi({
        orderId: order.id,
        url: draft.url.trim(),
        idType: draft.idType,
        idLabel: draft.idType === "other" ? draft.customLabel.trim() : undefined,
        id: draft.id.trim(),
        send: true,
        requestId: requestId.current,
      });
      onDone(res.sent ? "Order dispatched and tracking link sent to the customer." : "Order dispatched. Tracking details saved.");
    } catch (e) {
      // Dispatch already happened — report the send failure but keep the order dispatched.
      onDone(`Order dispatched, but the tracking message failed: ${e instanceof Error ? e.message : "unknown error"}. You can resend it from order details.`);
    }
  };

  return (
    <Overlay onClose={busy ? () => {} : onCancel}>
      <div className="flex items-center justify-between border-b border-surface-container px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-indigo-600" />
          <p className="font-black text-on-surface">Dispatch order #{order.id.slice(0, 8).toUpperCase()}</p>
        </div>
        <button type="button" onClick={onCancel} disabled={!!busy} aria-label="Close" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container disabled:opacity-40">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-5">
        {step === "choose" ? (
          <>
            <p className="text-sm text-on-surface-variant">
              How would you like to dispatch this order?
            </p>
            {error && (
              <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setError(null); setStep("form"); }}
                disabled={!!busy || !sendEnabled}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> Send Tracking Link
              </button>
              <button
                type="button"
                onClick={dispatchPlain}
                disabled={!!busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-indigo-700 transition-all hover:bg-indigo-100 disabled:opacity-50"
              >
                {busy === "plain" ? "Dispatching…" : "Dispatch Without Link"}
              </button>
              {!sendEnabled && (
                <span className="flex items-start gap-1 text-xs text-amber-700">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  Sending is disabled while the WhatsApp template is under review. You can still dispatch; add the link later.
                </span>
              )}
              <button
                type="button"
                onClick={onCancel}
                disabled={!!busy}
                className="rounded-xl px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <TrackingFields draft={draft} onChange={setDraft} disabled={!!busy} />

            {error && (
              <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={dispatchAndSend}
                disabled={!!busy || !sendEnabled || !!draftError}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> {busy === "send" ? "Dispatching…" : "Mark Dispatched & Send Tracking Link"}
              </button>
              <button
                type="button"
                onClick={() => { setError(null); setStep("choose"); }}
                disabled={!!busy}
                className="rounded-xl px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}

/**
 * Add / send / resend a tracking link for an already-dispatched order, WITHOUT
 * changing the order status. Enforces (client-side, mirroring the server) the
 * per-order send limit and requires confirmation before each send.
 */
export function TrackingDialog({
  order,
  onCancel,
  onDone,
}: {
  order: OrderDoc;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const [draft, setDraft] = useState<TrackingDraft>(() => emptyTrackingDraft(order));
  const [busy, setBusy] = useState<null | "save" | "send">(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const remaining = trackingSendsRemaining(order);
  const used = MAX_TRACKING_SENDS - remaining;
  const sendEnabled = isTrackingSendEnabled();
  const urlValid = isValidTrackingUrl(draft.url);
  const draftError = trackingDraftError(draft);
  const hasSentBefore = used > 0;

  const apiArgs = (send: boolean) => ({
    orderId: order.id,
    url: draft.url.trim(),
    idType: draft.idType,
    idLabel: draft.idType === "other" ? draft.customLabel.trim() : undefined,
    id: draft.id.trim() || undefined,
    send,
    requestId: newRequestId(),
  });

  const save = async () => {
    if (!urlValid) { setError("Enter a valid http(s) tracking link."); return; }
    if (draft.idType === "other" && !draft.customLabel.trim()) { setError("Enter a label for the custom tracking ID type."); return; }
    setBusy("save"); setError(null); setInfo(null);
    try {
      await callTrackingApi(apiArgs(false));
      onDone("Tracking details saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the details.");
      setBusy(null);
    }
  };

  const send = async () => {
    if (busy) return; // guard against double-clicks within the handler
    if (draftError) { setError(draftError); return; }
    if (remaining <= 0) { setError(`This order has already used all ${MAX_TRACKING_SENDS} sends.`); return; }
    const verb = hasSentBefore ? "Resend" : "Send";
    if (!window.confirm(`${verb} the tracking link to ${order.customerName || "the customer"} on WhatsApp? This uses 1 of your remaining ${remaining} send${remaining === 1 ? "" : "s"}.`)) return;
    setBusy("send"); setError(null); setInfo(null);
    try {
      const res = await callTrackingApi(apiArgs(true));
      onDone(res.duplicate ? "Tracking link already sent." : `Tracking link sent. ${res.sendsRemaining} send${res.sendsRemaining === 1 ? "" : "s"} remaining.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the tracking link.");
      setBusy(null);
    }
  };

  return (
    <Overlay onClose={busy ? () => {} : onCancel}>
      <div className="flex items-center justify-between border-b border-surface-container px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <p className="font-black text-on-surface">Tracking link · #{order.id.slice(0, 8).toUpperCase()}</p>
        </div>
        <button type="button" onClick={onCancel} disabled={!!busy} aria-label="Close" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container disabled:opacity-40">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between rounded-lg bg-surface-container-lowest px-3 py-2 text-xs">
          <span className="text-on-surface-variant">Sends used</span>
          <span className="font-black text-on-surface">{used} / {MAX_TRACKING_SENDS} · <span className={remaining > 0 ? "text-green-700" : "text-red-600"}>{remaining} remaining</span></span>
        </div>

        <TrackingFields draft={draft} onChange={setDraft} disabled={!!busy} />

        {!sendEnabled && (
          <p className="flex items-start gap-1 text-xs text-amber-700">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            Sending is disabled while the WhatsApp template is under review. You can still save the details.
          </p>
        )}
        {error && <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}</p>}
        {info && <p className="flex items-start gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {info}</p>}

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={send}
            disabled={!!busy || !sendEnabled || !!draftError || remaining <= 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-all hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> {busy === "send" ? "Sending…" : remaining <= 0 ? "No sends remaining" : hasSentBefore ? "Resend Tracking Link" : "Send Tracking Link"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!!busy || !urlValid}
            className="rounded-xl border border-outline-variant/50 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-on-surface transition-all hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {busy === "save" ? "Saving…" : "Save Details Only"}
          </button>
          <button type="button" onClick={onCancel} disabled={!!busy} className="rounded-xl px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container disabled:opacity-50">
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  );
}

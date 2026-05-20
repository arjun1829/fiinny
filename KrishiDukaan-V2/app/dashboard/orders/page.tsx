"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Truck } from "lucide-react";
import { auth, fetchIncomingOrdersForSeller, getUserProfile, updateOrderStatus } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import type { OrderDoc, OrderStatus } from "../../../types/order";
import { useI18n } from "../../i18n/I18nContext";

const transitions: Record<OrderStatus, OrderStatus[]> = {
  placed: ["accepted", "rejected"],
  accepted: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  rejected: [],
};

export default function OrdersPage() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [sellerType, setSellerType] = useState<"retailer" | "manufacturer" | null>(null);
  const [onlineDelivery, setOnlineDelivery] = useState<boolean | null>(null);

  const load = async (nextUid: string, nextSellerType: "retailer" | "manufacturer") => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchIncomingOrdersForSeller(nextUid, nextSellerType);
      setOrders(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load orders.";
      setError(msg);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUid(null);
        setSellerType(null);
        setOrders([]);
        setLoading(false);
        return;
      }
      const profile = await getUserProfile(user.uid);
      const role = profile?.role;
      const hasOnlineDelivery = !!(profile as any)?.onlineDelivery;
      setOnlineDelivery(hasOnlineDelivery);
      if (role === "retailer" || role === "manufacturer") {
        setUid(user.uid);
        setSellerType(role);
        if (hasOnlineDelivery) {
          await load(user.uid, role);
        } else {
          setLoading(false);
        }
      } else {
        setUid(null);
        setSellerType(null);
        setOrders([]);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const onAdvance = async (orderId: string, status: OrderStatus) => {
    await updateOrderStatus(orderId, status);
    if (uid && sellerType) await load(uid, sellerType);
  };

  return (
    <>
      <PageHeader
        title={t('incomingOrdersTitle')}
        description={t('ordersDesc')}
        helperKey="dashOrders"
      />

      {!uid || !sellerType ? (
        <p className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          {t('signInForOrders')}
        </p>
      ) : onlineDelivery === false ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-16 text-center">
          <div className="rounded-full bg-surface-container p-5">
            <Truck className="h-9 w-9 text-on-surface-variant/40" />
          </div>
          <div>
            <p className="text-base font-semibold text-on-surface">Online delivery not enabled</p>
            <p className="mt-1 text-sm text-on-surface-variant max-w-sm mx-auto">
              Enable online delivery in your Profile settings to start accepting online orders.
            </p>
          </div>
          <Link href="/dashboard/profile?tab=settings"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            Go to Settings
          </Link>
        </div>
      ) : loading ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : !orders.length ? (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-8 text-center text-on-surface-variant">
          {t('noOrdersYet')}
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="rounded-2xl border border-outline-variant/30 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-on-surface">{t('orderPrefix')}{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {order.customerName} · {order.customerPhone}
                  </p>
                  <p className="text-xs text-on-surface-variant">{order.customerAddress}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black uppercase tracking-widest text-primary">{order.status.replaceAll("_", " ")}</p>
                  <p className="font-black text-on-surface mt-1">₹{Number(order.subtotal || 0).toFixed(2)}</p>
                </div>
              </div>
              <div className="mt-3 border-t border-surface-container pt-3 space-y-1.5">
                {(order.items || []).map((item) => (
                  <div key={`${order.id}-${item.productId}`} className="flex justify-between text-sm">
                    <span className="text-on-surface">{item.name} × {item.qty}</span>
                    <span className="font-semibold text-on-surface">₹{Number(item.lineTotal || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {transitions[order.status]?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {transitions[order.status].map((next) => (
                    <button
                      key={next}
                      onClick={() => void onAdvance(order.id, next)}
                      className="rounded-lg border border-outline-variant/40 px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-surface-container-low"
                    >
                      {t('markLabel')} {next.replaceAll("_", " ")}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

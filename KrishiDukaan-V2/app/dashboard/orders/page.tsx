"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, fetchIncomingOrdersForSeller, getUserProfile, updateOrderStatus } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import type { OrderDoc, OrderStatus } from "../../../types/order";

const transitions: Record<OrderStatus, OrderStatus[]> = {
  placed: ["accepted", "rejected"],
  accepted: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  rejected: [],
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [sellerType, setSellerType] = useState<"retailer" | "manufacturer" | null>(null);

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
      if (role === "retailer" || role === "manufacturer") {
        setUid(user.uid);
        setSellerType(role);
        await load(user.uid, role);
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
        title="Incoming Orders"
        description="Orders placed by farmers for your online-delivery products."
        helperKey="dashOrders"
      />

      {!uid || !sellerType ? (
        <p className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          Sign in as retailer or manufacturer to view orders.
        </p>
      ) : loading ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : !orders.length ? (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-8 text-center text-on-surface-variant">
          No incoming orders yet.
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="rounded-2xl border border-outline-variant/30 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-on-surface">Order #{order.id.slice(0, 8)}</p>
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
                      Mark {next.replaceAll("_", " ")}
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


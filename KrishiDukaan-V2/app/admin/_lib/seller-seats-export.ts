import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { millisOfTs, phoneKey, summarizeSubscriptions } from "../../lib/subscription-status";

/**
 * "Seats" export for admins and the sales team: every seller with what their
 * plans give them NOW (running plans only), how many listing seats they use,
 * how many sit empty, and why to call them.
 *
 * Read only when someone clicks Export: sellers (role query), all
 * subscriptions and active seat listings — once per click, nothing on page
 * load. Seat rules match the seller dashboard: plans count while active,
 * started and unexpired (app/lib/subscription-status.ts); a seat is used by a
 * listing that is active and unexpired (isListingActive).
 */

export type SellerSeatRow = {
  shop: string;
  owner: string;
  phone: string;
  whatsapp: string;
  role: string;
  city: string;
  state: string;
  joined: string;
  planStatus: "Active" | "Scheduled" | "Expired" | "No plan";
  planEnds: string;
  daysLeft: number | "";
  runningPlans: number;
  seatsPurchased: number;
  seatsUsed: number;
  seatsRemaining: number;
  usagePct: number | "";
  lastPlanEnded: string;
  followUp: string;
};

export type SeatSummary = {
  sellers: number;
  withRunningPlan: number;
  seatsPurchased: number;
  seatsUsed: number;
  seatsRemaining: number;
  sellersWithEmptySeats: number;
  sellersNotUsingAnySeat: number;
  endingIn7Days: number;
  expiredInLast60Days: number;
  neverBought: number;
};

const DAY = 24 * 60 * 60 * 1000;

const fmt = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

/** Pure: rows + summary from already-loaded docs. */
export function buildSellerSeatRows(
  sellers: any[],
  subs: any[],
  activeListings: any[],
  now = Date.now(),
): { rows: SellerSeatRow[]; summary: SeatSummary } {
  // Index plans and used seats by phone (any format) and by uid.
  const subsByKey = new Map<string, any[]>();
  const push = (m: Map<string, any[]>, k: string, v: any) => {
    if (!k) return;
    const list = m.get(k) ?? [];
    list.push(v);
    m.set(k, list);
  };
  for (const s of subs) {
    push(subsByKey, `p:${phoneKey(s.ownerPhone) || phoneKey(s.ownerId)}`, s);
    if (s.ownerId) push(subsByKey, `u:${s.ownerId}`, s);
  }
  const usedByKey = new Map<string, Set<string>>();
  for (const l of activeListings) {
    if (l.status !== "active") continue;
    const exp = millisOfTs(l.expiresAt);
    if (!exp || exp <= now) continue;
    for (const k of [`p:${phoneKey(l.ownerId)}`, l.ownerId ? `u:${l.ownerId}` : ""]) {
      if (!k || k === "p:") continue;
      const set = usedByKey.get(k) ?? new Set<string>();
      set.add(l.id);
      usedByKey.set(k, set);
    }
  }

  const rows: SellerSeatRow[] = sellers.map((u) => {
    const keys = [`p:${phoneKey(u.phone || u.id)}`, u.uid ? `u:${u.uid}` : "", `u:${u.id}`].filter((k) => k && k !== "p:");
    const mine = new Set<any>();
    const used = new Set<string>();
    for (const k of keys) {
      (subsByKey.get(k) ?? []).forEach((s) => mine.add(s));
      (usedByKey.get(k) ?? new Set()).forEach((id) => used.add(id));
    }
    const plans = Array.from(mine);
    const summary = summarizeSubscriptions(plans, now);
    const purchased = summary.seats;
    const seatsUsed = used.size;
    const remaining = Math.max(0, purchased - seatsUsed);
    const endsMs = summary.state === "active" && summary.until ? summary.until.getTime() : 0;
    const daysLeft = endsMs ? Math.max(0, Math.ceil((endsMs - now) / DAY)) : "";
    const lastEndedMs =
      summary.state === "active"
        ? 0
        : Math.max(0, ...plans.map((s) => millisOfTs(s.expiryDate)).filter((ms) => ms && ms <= now));

    const planStatus =
      summary.state === "active" ? "Active" : summary.state === "scheduled" ? "Scheduled" : summary.state === "expired" ? "Expired" : "No plan";

    let followUp = "";
    if (summary.state === "active") {
      if (typeof daysLeft === "number" && daysLeft <= 7) followUp = `Plan ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — renewal`;
      else if (purchased > 0 && seatsUsed === 0) followUp = `Not using any of ${purchased} seats — help list products`;
      else if (remaining > 0) followUp = `${remaining} seat${remaining === 1 ? "" : "s"} empty — list more products`;
    } else if (summary.state === "expired") {
      followUp = `Plan ended ${fmt(lastEndedMs)} — renewal`;
    } else if (summary.state === "scheduled") {
      followUp = `Plan starts ${fmt(summary.until?.getTime() ?? 0)}`;
    } else {
      followUp = "No plan yet — pitch a plan";
    }

    const ten = phoneKey(u.phone || u.id);
    return {
      shop: String(u.shopName || u.businessName || u.name || ""),
      owner: String(u.ownerName || u.name || ""),
      phone: ten ? `+91${ten}` : String(u.phone || ""),
      whatsapp: ten ? `https://wa.me/91${ten}` : "",
      role: String(u.role || ""),
      city: String(u.city || u.address?.city || ""),
      state: String(u.state || u.address?.state || ""),
      joined: fmt(millisOfTs(u.createdAt)),
      planStatus,
      planEnds: fmt(endsMs),
      daysLeft,
      runningPlans: summary.running,
      seatsPurchased: purchased,
      seatsUsed,
      seatsRemaining: remaining,
      usagePct: purchased > 0 ? Math.round((Math.min(seatsUsed, purchased) / purchased) * 100) : "",
      lastPlanEnded: fmt(lastEndedMs),
      followUp,
    };
  });

  const active = rows.filter((r) => r.planStatus === "Active");
  const summary: SeatSummary = {
    sellers: rows.length,
    withRunningPlan: active.length,
    seatsPurchased: active.reduce((n, r) => n + r.seatsPurchased, 0),
    seatsUsed: active.reduce((n, r) => n + Math.min(r.seatsUsed, r.seatsPurchased), 0),
    seatsRemaining: active.reduce((n, r) => n + r.seatsRemaining, 0),
    sellersWithEmptySeats: active.filter((r) => r.seatsRemaining > 0).length,
    sellersNotUsingAnySeat: active.filter((r) => r.seatsPurchased > 0 && r.seatsUsed === 0).length,
    endingIn7Days: active.filter((r) => typeof r.daysLeft === "number" && r.daysLeft <= 7).length,
    expiredInLast60Days: rows.filter((r) => {
      if (r.planStatus !== "Expired") return false;
      const ended = Date.parse(r.lastPlanEnded);
      return Number.isFinite(ended) && now - ended <= 60 * DAY;
    }).length,
    neverBought: rows.filter((r) => r.planStatus === "No plan").length,
  };
  return { rows, summary };
}

const HEADERS: Array<[keyof SellerSeatRow, string]> = [
  ["shop", "Shop"],
  ["owner", "Owner"],
  ["phone", "Phone"],
  ["whatsapp", "WhatsApp"],
  ["role", "Role"],
  ["city", "City"],
  ["state", "State"],
  ["joined", "Joined"],
  ["planStatus", "Plan status"],
  ["planEnds", "Plan ends"],
  ["daysLeft", "Days left"],
  ["runningPlans", "Running plans"],
  ["seatsPurchased", "Seats purchased"],
  ["seatsUsed", "Seats used"],
  ["seatsRemaining", "Seats remaining"],
  ["usagePct", "Usage %"],
  ["lastPlanEnded", "Last plan ended"],
  ["followUp", "Why call"],
];

/** Loads everything, builds the workbook and downloads it. Returns the summary. */
export async function exportSellerSeats(): Promise<SeatSummary> {
  const [sellerSnap, subSnap, listingSnap] = await Promise.all([
    getDocs(query(collection(db, "users"), where("role", "in", ["retailer", "manufacturer"]))),
    getDocs(collection(db, "subscriptions")),
    getDocs(query(collection(db, "retailerSeatListings"), where("status", "==", "active"))),
  ]);
  const { rows, summary } = buildSellerSeatRows(
    sellerSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    subSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    listingSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  );

  // Loaded only when exporting — keeps SheetJS out of the admin bundle.
  const XLSX = await import("xlsx");
  const toSheet = (list: SellerSeatRow[]) => {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS.map(([, h]) => h), ...list.map((r) => HEADERS.map(([k]) => r[k]))]);
    ws["!cols"] = HEADERS.map(([k]) => ({ wch: k === "followUp" ? 42 : k === "shop" || k === "whatsapp" ? 26 : 14 }));
    ws["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(HEADERS.length - 1)}${list.length + 1}` };
    return ws;
  };
  const byShop = (a: SellerSeatRow, b: SellerSeatRow) => a.shop.localeCompare(b.shop);

  const wb = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["KrishiDukan seller seats", today],
      [],
      ["Sellers", summary.sellers],
      ["With a running plan", summary.withRunningPlan],
      ["Seats purchased (running plans)", summary.seatsPurchased],
      ["Seats used", summary.seatsUsed],
      ["Seats remaining", summary.seatsRemaining],
      ["Sellers with empty seats", summary.sellersWithEmptySeats],
      ["Sellers not using any seat", summary.sellersNotUsingAnySeat],
      ["Plans ending in 7 days", summary.endingIn7Days],
      ["Plans expired in last 60 days", summary.expiredInLast60Days],
      ["Sellers who never bought", summary.neverBought],
      [],
      ["Only plans running today count. Expired plans add no seats."],
    ]),
    "Summary",
  );
  XLSX.utils.book_append_sheet(wb, toSheet([...rows].sort(byShop)), "All sellers");
  XLSX.utils.book_append_sheet(
    wb,
    toSheet(rows.filter((r) => r.planStatus === "Active" && r.seatsRemaining > 0).sort((a, b) => b.seatsRemaining - a.seatsRemaining)),
    "Empty seats - call",
  );
  XLSX.utils.book_append_sheet(
    wb,
    toSheet(
      rows
        .filter((r) => r.planStatus === "Expired" || (r.planStatus === "Active" && typeof r.daysLeft === "number" && r.daysLeft <= 7))
        .sort(byShop),
    ),
    "Renewals - call",
  );
  XLSX.writeFile(wb, `krishidukan-seller-seats-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return summary;
}

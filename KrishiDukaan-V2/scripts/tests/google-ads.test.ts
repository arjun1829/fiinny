import assert from "node:assert/strict";
import {
  reportProductPurchase,
  reportSubscriptionPurchase,
  GOOGLE_ADS_ID,
  GOOGLE_ADS_SUBSCRIPTION_LABEL,
  GOOGLE_ADS_PURCHASE_LABEL,
} from "../../app/lib/ads/google-ads";
let n = 0;
const t = async (name: string, f: () => void | Promise<void>) => { await f(); n++; console.log("ok -", name); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Minimal browser: a recording gtag and a localStorage that survives "reloads".
const store = new Map<string, string>();
let calls: unknown[][] = [];
const win: any = {
  setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
};
const recordingGtag = (...args: unknown[]) => void calls.push(args);
(globalThis as any).window = win;
const reset = () => { calls = []; win.gtag = recordingGtag; };
const SUB = `${GOOGLE_ADS_ID}/${GOOGLE_ADS_SUBSCRIPTION_LABEL}`;

(async () => {
  await t("verified subscription sends destination, INR rupees from paise, payment id", () => {
    reset();
    reportSubscriptionPurchase({ amountPaise: 1_100_000, transactionId: "pay_A" });
    assert.deepEqual(calls, [["event", "conversion", {
      send_to: "AW-18461273625/YRn-CNv_iKgdEJncguNE",
      value: 11000,
      currency: "INR",
      transaction_id: "pay_A",
    }]]);
  });

  await t("paise are kept, not rounded away (10150 paise = ₹101.50)", () => {
    reset();
    reportSubscriptionPurchase({ amountPaise: 10150, transactionId: "pay_B" });
    assert.equal((calls[0]![2] as any).value, 101.5);
  });

  await t("same payment reported again sends nothing (in-page and after reload)", () => {
    reset();
    reportSubscriptionPurchase({ amountPaise: 1_100_000, transactionId: "pay_A" });
    assert.equal(calls.length, 0);
    // A fresh page load: the in-page Set is gone, localStorage still has it.
    store.set("kd_gads_subscription:pay_RELOADED", "1");
    reportSubscriptionPurchase({ amountPaise: 21000, transactionId: "pay_RELOADED" });
    assert.equal(calls.length, 0);
  });

  await t("no amount, zero (free activation) or no payment id sends nothing", () => {
    reset();
    reportSubscriptionPurchase({ amountPaise: 0, transactionId: "pay_FREE" });
    reportSubscriptionPurchase({ amountPaise: NaN, transactionId: "pay_NOAMT" });
    reportSubscriptionPurchase({ amountPaise: undefined as any, transactionId: "pay_UNDEF" });
    reportSubscriptionPurchase({ amountPaise: 21000, transactionId: "  " });
    reportSubscriptionPurchase({ amountPaise: 21000, transactionId: undefined as any });
    assert.equal(calls.length, 0);
  });

  await t("tag still loading: waits for gtag, then sends exactly once", async () => {
    reset();
    delete win.gtag;
    reportSubscriptionPurchase({ amountPaise: 21000, transactionId: "pay_LATE" });
    reportSubscriptionPurchase({ amountPaise: 21000, transactionId: "pay_LATE" });
    assert.equal(calls.length, 0);
    await sleep(300);
    win.gtag = recordingGtag;
    await sleep(600);
    assert.equal(calls.length, 1);
    assert.equal((calls[0]![2] as any).transaction_id, "pay_LATE");
    assert.equal((calls[0]![2] as any).send_to, SUB);
  });

  await t("blocked tag or throwing gtag/storage never throws into the caller", () => {
    reset();
    delete win.gtag;
    assert.doesNotThrow(() => reportSubscriptionPurchase({ amountPaise: 21000, transactionId: "pay_BLOCKED" }));
    win.gtag = () => { throw new Error("blocked"); };
    assert.doesNotThrow(() => reportSubscriptionPurchase({ amountPaise: 21000, transactionId: "pay_THROW" }));
    const ls = win.localStorage;
    win.localStorage = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    win.gtag = recordingGtag;
    assert.doesNotThrow(() => reportSubscriptionPurchase({ amountPaise: 21000, transactionId: "pay_NOSTORE" }));
    assert.equal(calls.length, 1);
    win.localStorage = ls;
  });

  await t("product purchase is unchanged and never uses the subscription label", () => {
    reset();
    assert.equal(reportProductPurchase({ orderValue: 452.4, transactionId: "pay_P" }), true);
    assert.deepEqual(calls, [["event", "conversion", {
      send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`,
      value: 452.4,
      currency: "INR",
      transaction_id: "pay_P",
    }]]);
    assert.equal(reportProductPurchase({ orderValue: 452.4, transactionId: "pay_P" }), false);
    assert.equal(calls.length, 1);
  });

  // Wait out any pending poll from the blocked-tag case before exiting.
  await sleep(50);
  console.log(`\n${n} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

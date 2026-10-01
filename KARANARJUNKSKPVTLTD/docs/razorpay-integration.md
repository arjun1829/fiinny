# Razorpay Integration — Architecture Note

SaaS subscription billing for Fiinny ERP. Card/UPI checkout via Razorpay; all secret logic and Firestore writes are server-side in Cloud Functions (`asia-south1`). Reflects the current implemented code.

## Components

| Layer | File | Role |
|---|---|---|
| Frontend | `src/pages/PricingPage.tsx` | Plan UI, loads checkout.js, calls the 3 endpoints, opens Razorpay modal, redirects on success |
| Functions | `functions/src/payments.ts` | `createSaaSOrder`, `verifySaaSPayment`, `getSaaSSubscription` (exported via `index.ts`) |
| Routing (prod) | `firebase.json` | Hosting rewrites `/api/saas/*` → Cloud Functions |
| Routing (dev) | `vite.config.ts` | `server.proxy` maps `/api/saas/*` → Functions Emulator (`:5001`) with real export names |
| Rules | `firestore.rules` | `tenantSubscriptions` (super-admin write), `saasPayments` (`write:false`) |

## Endpoints (all `onRequest`, POST, CORS-guarded, `asia-south1`)

| Path (rewrite source) | Function | Purpose |
|---|---|---|
| `/api/saas/order` | `createSaaSOrder` | Create Razorpay order; returns `order_id`, public `key_id`, `amount` |
| `/api/saas/verify` | `verifySaaSPayment` | HMAC-verify signature, then write subscription + ledger |
| `/api/saas/subscription` | `getSaaSSubscription` | Read `tenantSubscriptions/{tenantId}` → `{plan, status, expiryAt}` |

Every endpoint calls `authenticate(req)` (Firebase ID token, `Bearer`) then `assertTenantOwnership(uid, tenantId)` (caller's `users` doc `tenantId` must match).

## Payment flow

```
PricingPage.handleSubscribe
  1. POST /api/saas/order  { plan, cycle, tenantId }   → { order_id, key_id, amount }
  2. Razorpay checkout modal (key_id + order_id)       → { order_id, payment_id, signature }
  3. POST /api/saas/verify { ...ids, plan, cycle, tenantId }
        └─ HMAC-SHA256(order_id|payment_id, KEY_SECRET) === signature  (fail-closed)
        └─ writes (below)
  4. success → activation overlay → navigate('/dashboard')
     AuthContext listener on tenantSubscriptions/{tenantId} refreshes entitlements
```

## Firestore writes (on successful verify, Admin SDK — bypasses rules)

| Doc | Contents |
|---|---|
| `saasPayments/{razorpayPaymentId}` | Audit ledger: `tenantId, planId, cycle, amount(paise), currency, razorpayOrderId, razorpayPaymentId, status:'captured', createdAt`. **Signature never stored.** |
| `tenantSubscriptions/{tenantId}` | **Source of truth**: `planId, status:'active', startedAt, expiresAt, assignedBy:'razorpay:<pid>', updatedAt` |
| `tenants/{tenantId}` | Back-compat mirror: `plan, planStatus, planExpiryAt` |
| `tenants/{tenantId}/modules/{moduleId}` | Plan add-on modules (`activatePlanModules`) |

Plan/amount catalogue: `PLAN_AMOUNTS` (starter/growth/pro × monthly/yearly, INR); tier→catalog id via `PRICING_TO_PLAN_ID`. Cycle → 30d (monthly) / 365d (yearly).

## Credentials & security

- **Secret** (`RAZORPAY_KEY_SECRET`) + key id in `functions/.env`; never sent to client. Public `key_id` is returned by `createSaaSOrder`. Root `.env` holds `VITE_RAZORPAY_KEY_ID` (test).
- Signature verification is strict HMAC-SHA256, no bypass; mismatch → `400`.
- Client never writes subscription/payment data — enforced by rules (`saasPayments` `write:false`; `tenantSubscriptions` write = super admin only) and by Admin-SDK-only writes.
- TEST mode (`rzp_test_...`).

## Notes

- Dev requires the Functions Emulator running; the Vite proxy rewrites short paths to real export names (`order→createSaaSOrder`, etc.). `VITE_USE_EMULATOR` is unset, so the app uses the relative `/api/saas/*` proxy path.
- `getSaaSSubscription` is read-only; entitlement enforcement is driven by the `AuthContext` listener on `tenantSubscriptions`.

# KrishiDukan ERP mobile — v2 billing release (31 Oct 2026)

The app was a read-only owner dashboard. It now bills and manages day-to-day
data against the same Firestore project as the web ERP, writing the same
documents the web writes.

## What is in the app

| Area | Screen | Web equivalent |
|---|---|---|
| Sell | POS bill (search / barcode scan, khata credit, transport/labour/discount) | POS Billing |
| Sell | B2B GST invoice (partner, salesperson, transporter, round-off) | B2B Invoice |
| Sell | Invoice view → share PDF / print / WhatsApp | Order History reprint |
| Customers | List, add/edit, live ledger, record partner payment, collect khata | Worklist → Partners, Customers |
| Ledgers | Khata (Udhari): customer table, Add Udhari, collect, remind | POS → Khata (Udhari) |
| Stock | Products (add/edit), batches, low/out filters | Inventory → Product Master, Batches |
| Ledgers | Stock movement | Inventory → Stock Movement |
| Ledgers | Supplier ledger (read-only, live totals) | Supplier Ledger |
| Ledgers | Expenses (add/edit/delete) | Expenses |
| Ledgers | Online orders (read-only) | Worklist → Online Orders |
| Owner | Overview, Bills, Payments due, Position (unchanged) | Reports / dashboards |

Stays on the web (opened from More → "Open full web ERP"): editing or
cancelling bills, sales returns, purchase/supplier invoice entry, supplier
payments, dispatch/tracking, barcode label printing, admin/users/roles.

## Who sees what (`lib/core/roles.dart`, `lib/core/access.dart`)

Role gates come from `firestore.rules`; plan gates from the tenant's
`plans/{id}.screens`, same as `isScreenAllowedByPlan` on the web.

| | admin / analyst | shopkeeper | sales |
|---|---|---|---|
| POS / B2B billing | ✓ | ✗ (rules: products/batches are admin-only) | ✗ |
| Customers | full | view + add/edit | view, assigned only |
| Partner payments | ✓ | ✗ | ✗ |
| Khata collect / Add Udhari | ✓ | ✓ | ✗ |
| Products | add/edit | view + batches | view |
| Supplier ledger, expenses, stock movement, online orders | ✓ | ✗ | ✗ |

## Data safety

- A sale is one Firestore transaction: bill number + invoice + FEFO batch
  deduction + product stock + customer balance (+ B2B cash payment). It
  commits fully or not at all. The web does these in separate writes.
- Same product on several lines is deducted once for the total quantity.
- Stock on batch-tracked products can't be hand-edited in the app.
- Khata collection re-reads every bill inside its transaction and also sets
  `paymentStatus` Paid/Partial (the web Khata leaves it stale).
- Every action writes the web's `auditLogs` shape.

## Verification done

- `flutter analyze`: clean. `flutter test`: 31 tests (billing math vs web,
  khata grouping, roles, PDF rendering incl. Marathi names).
- `npm run test:rules` (in `KARANARJUNKSKPVTLTD/`): 50 tests, including
  `tests/rules/mobileApp.rules-test.ts`, which replays each mobile write per
  role and checks tenant isolation for a new customer business.
- End-to-end on the Firebase emulators (local rules, seeded data, web
  build with `--dart-define=USE_EMULATOR=true`): POS cash sale across two
  batches, khata sale creating a new customer with oversell warning, B2B
  credit invoice with round-off, partner payment, khata collection
  (over-limit refused), Add Udhari, shopkeeper role gating, and every
  ledger screen — each write checked field by field in the database.

Not verified: a real Android device (camera scan, share sheet, printing),
and the rules currently deployed in production (tests ran on the local
`firestore.rules`).

## Before handing it to customers

1. Deploy the tenant-isolation rules on branch `fix/erp-tenant-isolation`
   (run `scripts/set-super-admin.mjs` first — see project notes).
2. Signing: `android/key.properties` and the `.jks` are not on this machine,
   so release builds fall back to the debug key. Fine for side-loading the
   APK; Play Store needs the original upload key.
3. `BUILD.md` in git contains the keystore password — rotate if that key
   matters.

## Build

```
flutter pub get
flutter build apk --release --split-per-abi   # side-load: app-arm64-v8a-release.apk
flutter build appbundle --release             # Play Store (needs key.properties)
```

Local end-to-end run: start `firebase emulators:start --only auth,firestore
--project demo-ka-mobile` in `KARANARJUNKSKPVTLTD/`, seed, then
`flutter run -d chrome --dart-define=USE_EMULATOR=true`.

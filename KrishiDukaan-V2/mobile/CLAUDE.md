# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run on a connected device/emulator
flutter run

# Run with overridden config (use for non-production API or Razorpay key)
flutter run --dart-define=API_BASE_URL=http://localhost:3001 --dart-define=RAZORPAY_KEY_ID=rzp_test_SmPxtEcNJ25LUj

# Static analysis (run before every commit)
flutter analyze

# Run tests
flutter test
flutter test test/widget_test.dart  # single file

# Build release APK
flutter build apk --release --dart-define=API_BASE_URL=https://krishidukan.com

# Regenerate l10n files after editing lib/l10n/*.arb
flutter gen-l10n
```

## Architecture

**Feature-first layout** under `lib/features/`. Each feature owns its `data/`, `providers/`, and `screens/` subdirectories. Shared code lives in `lib/core/`.

**State management**: Riverpod throughout. Providers are declared at module level (not inside widgets). `StreamProvider.family` is the standard pattern for Firestore real-time streams parameterized by phone or ID. `FutureProvider.family` for one-shot reads.

**Routing**: `go_router` with a `StatefulShellRoute` for the five bottom-nav tabs (Home, Marketplace, Hubs, Stores, Profile). All dashboard and full-screen routes sit outside the shell under `_rootKey`. Route guards live in the `redirect` callback of `routerProvider` — they check `authStateProvider`, `currentUserProvider`, `canAccessDashboardProvider`, and `isManufacturerProvider`.

**Theme and constants**: `AppColors`, `AppTextStyles`, and `AppConfig` in `lib/core/constants/`. Never hardcode colors or text styles inline; always reference these. `AppConfig.razorpayKeyId` and `AppConfig.apiBaseUrl` are injected via `--dart-define` at build time.

## Firestore Schema

The primary products collection is **`products`** (not `catalog` or `listings` — those names appear only in `FirestoreKeys` as legacy references). Every product doc doubles as a listing; there is no separate listings collection.

**Dual-field writes are mandatory.** The schema evolved from UID-keyed to phone-keyed. Every query that touches seller identity must run against multiple fields in parallel and deduplicate results:
- `retailerPhone` (current, phone string)
- `retailerId` / `ownerId` (legacy, Firebase Auth UID)
- `ownerPhone` (web new schema)

See `DashboardRepository.watchMyListings` and `DashboardRepository.fetchStats` for the canonical parallel-query + merge pattern.

**User documents** live at `users/{phone}` (new) with a fallback to `users/{uid}` (legacy). See `currentUserProvider` for the dual-read pattern.

**Retailer profiles** live at `retailers/{phone}` (phone-keyed docs) and sometimes `stores/{id}` (legacy). When reading a stranger's profile (e.g., in `ListingRepository._fetchProfile`), permission errors are silently swallowed and the availability entry's `storeName` field is used as a fallback — never skip a seller just because their profile is unreadable.

**Product availability** is stored as `availability: [{storeId, storePhone, storeName, stockLevel, sellingPrice}]` on the manufacturer's canonical product doc. The `storeId` is the retailer's doc ID in `retailers/` (often their phone number).

## Role System and Paywall

Roles: `consumer`, `retailer`, `manufacturer`, `admin`. Stored in `users/{phone}.role`.

`canAccessDashboard = (isRetailer || isManufacturer) && isPaid`. Users without a paid subscription are redirected to `/subscription?reason=paywall`. The manufacturer sub-dashboard (`/dashboard/manufacturer/*`) is additionally gated by `isManufacturerProvider`.

## Key Cross-File Patterns

**Product merging** (`CatalogRepository.fetchAllMergedProducts`): The marketplace fetches all `products` docs and merges them by name, accumulating seller availability entries from retailer copies (docs with `source: 'manufacturer_assigned' | 'retailer_inventory_copy'`). This is the most complex piece of business logic in the app — read it fully before modifying `CatalogModel` or `AvailabilityEntry`.

**Listings "Available At"** (`ListingRepository.watchListingsForCatalog`): Reads the canonical product doc, resolves each `availability[]` entry into a `ListingModel` by fetching the retailer's profile. Skipping happens only when `name` is totally empty after all fallbacks (profile → storeName → phone → storeId). The Razorpay key mismatch fix: both `/api/payment/create-order` and `/api/payment/create-cart-order` return `key_id` in their response; the mobile reads `result['key_id'] ?? AppConfig.razorpayKeyId` before opening the SDK.

**Discount model**: `ListingModel.discount` (a `DiscountModel`) drives the seller tile UI in `ProductDetailScreen._SellerTile`. The `DiscountModel.isActive` field is the live flag; `isCurrentlyActive` also enforces date windows. `DashboardRepository.setDiscount` writes the `discount` map to `products/{id}`.

**Image handling**: Both `images: []` (new) and `image: ""` (legacy single URL) fields are parsed in `CatalogModel.fromFirestore`. Always write `images` (list) for new products.

## Payment Flow

1. Mobile POSTs to `${AppConfig.apiBaseUrl}/api/payment/create-cart-order` (cart) or `/api/payment/create-order` (subscription) with a Firebase ID token in `Authorization: Bearer`.
2. Backend creates a Razorpay order using `process.env.RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (must be set in production env — `.env.local` is local-only).
3. Backend returns the Razorpay order object plus `key_id`.
4. Mobile opens `razorpay_flutter` SDK with `order['key_id']` (not the hardcoded constant) to guarantee key consistency.
5. On success, `CheckoutScreen._onPaymentSuccess` verifies via `/api/payment/verify`, then writes orders to Firestore via `OrderRepository.createOrdersAfterPayment`.

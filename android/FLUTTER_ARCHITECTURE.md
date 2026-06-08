# KrishiDukaan Flutter Android — Architecture & Implementation Plan

> **Date:** 2026-06-05  
> **CEO Directive:** Flutter (cross-platform, Android-first)  
> **Firebase Project:** `krishidukan-e8315`  
> **Parity Target:** Full feature parity with KrishiDukaan-V2 web app

---

## Table of Contents

1. [Tech Stack Decisions](#1-tech-stack-decisions)
2. [Project Structure](#2-project-structure)
3. [State Management Architecture](#3-state-management-architecture)
4. [Navigation Architecture](#4-navigation-architecture)
5. [Feature Modules](#5-feature-modules)
6. [Data Layer](#6-data-layer)
7. [Authentication Flow](#7-authentication-flow)
8. [UI/UX System](#8-uiux-system)
9. [Integrations](#9-integrations)
10. [Role-Based Access](#10-role-based-access)
11. [Offline & Performance Strategy](#11-offline--performance-strategy)
12. [Build & Release](#12-build--release)
13. [Implementation Phases](#13-implementation-phases)
14. [Package Registry](#14-package-registry)
15. [Known Risks & Mitigations](#15-known-risks--mitigations)

---

## 1. Tech Stack Decisions

### Core Framework
| Decision | Choice | Reason |
|---|---|---|
| Framework | **Flutter 3.22+** (Dart 3.4+) | CEO directive, single codebase for Android + future iOS |
| Min SDK | **Android API 21** (Android 5.0) | Covers 99%+ of Indian market devices |
| Target SDK | **Android 34** | Latest stable, required for Play Store |
| Architecture | **Feature-first Clean Architecture** | Mirrors web project modular layout |

### State Management
| Layer | Choice | Reason |
|---|---|---|
| Global state | **Riverpod 2.x** (code-gen) | Type-safe, testable, no context dependency, best for Firestore streams |
| Local UI state | `StatefulWidget` / `useState` | For simple form/toggle state within a single screen |
| Navigation state | **GoRouter 14.x** | Declarative, handles deep links, role-based redirect guards |

### Backend
Same Firebase project as web — no migration needed.
| Service | Flutter Package |
|---|---|
| Firebase Auth | `firebase_auth` |
| Firestore | `cloud_firestore` |
| Firebase Storage | `firebase_storage` |
| Firebase Analytics | `firebase_analytics` |
| Remote Config | `firebase_remote_config` (feature flags) |

### Payments
- **Razorpay Flutter SDK** (`razorpay_flutter`) — same Razorpay account as web  
- Payment server calls hit the **existing** Next.js `/api/payment/*` endpoints — no new backend needed

### Maps & Location
| Need | Package |
|---|---|
| Current location | `geolocator` |
| Map display | `flutter_map` (OpenStreetMap tiles, same as Leaflet on web) |
| Address autocomplete | Google Places API via `google_places_flutter` |
| Reverse geocode | Existing `/api/geocode/reverse` endpoint |

---

## 2. Project Structure

```
krishidukaan_app/
├── android/                    # Android-specific configs (existing folder repurposed)
├── ios/                        # Future iOS support
├── lib/
│   ├── main.dart               # Entry point, ProviderScope, app bootstrap
│   ├── app.dart                # MaterialApp.router, GoRouter, theme setup
│   │
│   ├── core/
│   │   ├── constants/
│   │   │   ├── app_colors.dart         # Material 3 color tokens (matches web)
│   │   │   ├── app_text_styles.dart    # Typography scale
│   │   │   └── firestore_keys.dart     # Collection/field name constants
│   │   ├── firebase/
│   │   │   ├── firebase_options.dart   # FlutterFire CLI generated
│   │   │   └── firestore_service.dart  # Base Firestore helper (pagination, etc.)
│   │   ├── models/                     # All data models (shared across features)
│   │   │   ├── user_model.dart
│   │   │   ├── catalog_model.dart
│   │   │   ├── listing_model.dart
│   │   │   ├── order_model.dart
│   │   │   ├── subscription_model.dart
│   │   │   ├── retailer_model.dart
│   │   │   ├── manufacturer_model.dart
│   │   │   ├── hub_model.dart
│   │   │   ├── review_model.dart
│   │   │   ├── delivery_settings_model.dart
│   │   │   └── company_page_model.dart
│   │   ├── providers/
│   │   │   ├── auth_provider.dart      # Auth state, phone, role
│   │   │   └── user_provider.dart      # Logged-in user doc stream
│   │   ├── router/
│   │   │   ├── app_router.dart         # GoRouter config, all routes
│   │   │   └── route_guards.dart       # Auth guard, role guard, paywall guard
│   │   ├── utils/
│   │   │   ├── phone_utils.dart        # Normalize to +91XXXXXXXXXX
│   │   │   ├── geo_utils.dart          # Haversine distance calculation
│   │   │   ├── currency_utils.dart     # INR formatting
│   │   │   └── date_utils.dart
│   │   └── widgets/
│   │       ├── loading_overlay.dart
│   │       ├── error_view.dart
│   │       ├── empty_state.dart
│   │       ├── app_bottom_nav.dart
│   │       └── product_card.dart       # Reused everywhere
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── data/
│   │   │   │   └── auth_repository.dart
│   │   │   ├── providers/
│   │   │   │   └── auth_state_provider.dart
│   │   │   └── screens/
│   │   │       ├── phone_entry_screen.dart
│   │   │       ├── otp_verification_screen.dart
│   │   │       └── onboarding_screen.dart      # First-time profile setup
│   │   │
│   │   ├── marketplace/
│   │   │   ├── data/
│   │   │   │   ├── catalog_repository.dart
│   │   │   │   └── listing_repository.dart
│   │   │   ├── providers/
│   │   │   │   ├── marketplace_provider.dart   # Filtered listings stream
│   │   │   │   └── search_provider.dart
│   │   │   └── screens/
│   │   │       ├── home_screen.dart
│   │   │       ├── marketplace_screen.dart
│   │   │       ├── product_detail_screen.dart
│   │   │       ├── store_locator_screen.dart   # Map view
│   │   │       └── brand_page_screen.dart
│   │   │
│   │   ├── cart/
│   │   │   ├── data/
│   │   │   │   ├── cart_repository.dart        # SharedPreferences-backed local cart
│   │   │   │   └── order_repository.dart
│   │   │   ├── providers/
│   │   │   │   ├── cart_provider.dart
│   │   │   │   └── checkout_provider.dart
│   │   │   └── screens/
│   │   │       ├── cart_screen.dart
│   │   │       ├── store_selection_screen.dart # Multi-seller store picker
│   │   │       └── checkout_screen.dart
│   │   │
│   │   ├── orders/
│   │   │   ├── data/
│   │   │   │   └── order_repository.dart
│   │   │   ├── providers/
│   │   │   │   └── orders_provider.dart
│   │   │   └── screens/
│   │   │       ├── customer_orders_screen.dart
│   │   │       └── order_detail_screen.dart
│   │   │
│   │   ├── hubs/
│   │   │   ├── data/
│   │   │   │   └── hub_repository.dart
│   │   │   ├── providers/
│   │   │   │   └── hubs_provider.dart
│   │   │   └── screens/
│   │   │       ├── hubs_list_screen.dart
│   │   │       └── hub_detail_screen.dart
│   │   │
│   │   ├── profile/
│   │   │   ├── data/
│   │   │   │   └── profile_repository.dart
│   │   │   ├── providers/
│   │   │   │   └── profile_provider.dart
│   │   │   └── screens/
│   │   │       ├── profile_screen.dart
│   │   │       ├── edit_profile_screen.dart
│   │   │       └── become_retailer_screen.dart
│   │   │
│   │   ├── subscription/
│   │   │   ├── data/
│   │   │   │   └── subscription_repository.dart
│   │   │   ├── providers/
│   │   │   │   └── subscription_provider.dart
│   │   │   └── screens/
│   │   │       ├── subscription_screen.dart    # Plan picker + payment
│   │   │       └── subscription_status_screen.dart
│   │   │
│   │   ├── dashboard/                          # Retailer & Manufacturer
│   │   │   ├── data/
│   │   │   │   └── dashboard_repository.dart
│   │   │   ├── providers/
│   │   │   │   └── dashboard_provider.dart
│   │   │   └── screens/
│   │   │       ├── dashboard_home_screen.dart  # Stats overview
│   │   │       ├── analytics_screen.dart
│   │   │       └── reviews_screen.dart
│   │   │
│   │   ├── inventory/                          # Retailer inventory
│   │   │   ├── data/
│   │   │   │   └── inventory_repository.dart
│   │   │   ├── providers/
│   │   │   │   └── inventory_provider.dart
│   │   │   └── screens/
│   │   │       ├── inventory_screen.dart
│   │   │       ├── add_product_screen.dart
│   │   │       ├── edit_product_screen.dart
│   │   │       └── delivery_settings_screen.dart
│   │   │
│   │   ├── manufacturer/                       # Manufacturer-only
│   │   │   ├── data/
│   │   │   │   └── manufacturer_repository.dart
│   │   │   ├── providers/
│   │   │   │   └── manufacturer_provider.dart
│   │   │   └── screens/
│   │   │       ├── retailer_network_screen.dart
│   │   │       ├── add_retailer_screen.dart
│   │   │       ├── product_assignment_screen.dart
│   │   │       ├── brand_edit_screen.dart
│   │   │       └── manufacturer_catalog_screen.dart
│   │   │
│   │   └── seller_orders/                      # Retailer incoming orders
│   │       ├── data/
│   │       │   └── seller_orders_repository.dart
│   │       ├── providers/
│   │       │   └── seller_orders_provider.dart
│   │       └── screens/
│   │           ├── seller_orders_screen.dart
│   │           └── seller_order_detail_screen.dart
│   │
│   └── l10n/
│       ├── app_en.arb          # English strings
│       └── app_hi.arb          # Hindi strings
│
├── test/
│   ├── unit/
│   ├── widget/
│   └── integration/
│
├── assets/
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── pubspec.yaml
├── analysis_options.yaml
└── .env                        # Never committed — see secrets section
```

---

## 3. State Management Architecture

### Riverpod Provider Hierarchy

```
ProviderScope (root)
│
├── authStateProvider (StreamProvider)           — Firebase Auth state changes
│   └── currentUserProvider (StreamProvider)    — users/{phone} Firestore doc
│       ├── userRoleProvider (Provider)          — derived: role string
│       ├── isRetailerProvider (Provider)        — derived: bool
│       ├── isManufacturerProvider (Provider)    — derived: bool
│       └── subscriptionProvider (StreamProvider)— subscriptions query by phone
│
├── locationProvider (StateNotifierProvider)    — device GPS coords
│   └── nearbyListingsProvider (StreamProvider) — catalog filtered by geo
│
├── cartProvider (StateNotifierProvider)         — in-memory + SharedPrefs
│   └── cartCountProvider (Provider)            — badge count on nav
│
├── marketplaceFilterProvider (StateNotifier)   — category, sort, distance
│   └── filteredListingsProvider (StreamProvider)— reactive to filter changes
│
└── [feature-specific providers...]
```

### Data Flow Pattern (per feature)

```
Firestore / API
      ↓
Repository (data access, model mapping)
      ↓
Riverpod Provider (business logic, caching)
      ↓
ConsumerWidget (UI, no business logic)
```

---

## 4. Navigation Architecture

### Route Map

```
/                               → HomeScreen (bottom nav shell)
/marketplace                    → MarketplaceScreen
/product/:catalogId             → ProductDetailScreen
/product/:catalogId/store/:phone → StoreDetailSheet (modal)
/map                            → StoreLocatorScreen
/hubs                           → HubsListScreen
/hubs/:hubId                    → HubDetailScreen
/brand/:phone                   → BrandPageScreen
/cart                           → CartScreen
/cart/store-select              → StoreSelectionScreen
/checkout                       → CheckoutScreen (auth required)
/orders                         → CustomerOrdersScreen (auth required)
/orders/:orderId                → OrderDetailScreen (auth required)
/login                          → PhoneEntryScreen
/login/otp                      → OtpVerificationScreen
/signup                         → OnboardingScreen (post-OTP)
/profile                        → ProfileScreen (auth required)
/profile/edit                   → EditProfileScreen
/become-retailer                → BecomeRetailerScreen
/subscription                   → SubscriptionScreen (auth required)

/dashboard                      → DashboardHomeScreen (retailer/mfr guard)
/dashboard/inventory            → InventoryScreen
/dashboard/inventory/add        → AddProductScreen
/dashboard/inventory/:id/edit   → EditProductScreen
/dashboard/orders               → SellerOrdersScreen
/dashboard/orders/:orderId      → SellerOrderDetailScreen
/dashboard/delivery             → DeliverySettingsScreen
/dashboard/analytics            → AnalyticsScreen
/dashboard/reviews              → ReviewsScreen
/dashboard/subscription         → SubscriptionStatusScreen
/dashboard/manufacturer         → RetailerNetworkScreen (mfr guard)
/dashboard/manufacturer/add     → AddRetailerScreen
/dashboard/manufacturer/assign  → ProductAssignmentScreen
/dashboard/manufacturer/catalog → ManufacturerCatalogScreen
/dashboard/manufacturer/brand   → BrandEditScreen
```

### Route Guards (GoRouter redirects)

```dart
// 1. Auth guard — any /dashboard, /checkout, /orders, /profile requires login
// 2. Paywall guard — /dashboard requires isPaid=true OR invited retailer exception
// 3. Role guard — /dashboard/manufacturer requires role=='manufacturer'
// 4. Onboarding guard — after OTP, if no name set, redirect to /signup
```

### Bottom Navigation Structure

**Consumer:**
```
[Home]  [Marketplace]  [Cart(badge)]  [Hubs]  [Profile]
```

**Retailer/Manufacturer (logged in + paid):**
```
[Home]  [Marketplace]  [Cart(badge)]  [Dashboard]  [Profile]
```

---

## 5. Feature Modules

### 5.1 Authentication

**Phone OTP Flow:**
1. User enters 10-digit phone → app normalizes to `+91XXXXXXXXXX`
2. `FirebaseAuth.verifyPhoneNumber()` triggers SMS OTP
3. OTP screen (6 digits, auto-fill from SMS via `sms_autofill`)
4. On success: check if `users/{phone}` exists
   - Exists → sign in, redirect to home or intended route
   - Not exists → redirect to `/signup` (name, optional business type)
5. Write `users/{phone}` + `uidIndex/{uid}` on first signup

**Invite Code Handling:**
- Deep link: `krishidukaan://signup?inviteCode=XXXXXXXX`
- After OTP verified, if invite code present → call `acceptManufacturerInvite()` logic
- Implemented as a Firestore transaction (same logic as web)

**Role Upgrade:**
- `become-retailer`: User fills business profile → `role` updated to `retailer`
- Manufacturer upgrade: Confirmation dialog → `role` updated to `manufacturer`

---

### 5.2 Marketplace & Product Browsing

**Home Screen:**
- Featured products (top-rated or curated)
- Crop category quick-nav (horizontal scroll)
- "Near you" products (location-based)
- Hero banner (Remote Config controlled)

**Marketplace Screen:**
- Infinite scroll of `catalog` docs
- Filter sheet: category, distance, price sort, in-stock only
- Search bar → Firestore `nameSearch` array-contains queries
- Product cards show: image, name, price range, rating, seller count

**Product Detail Screen:**
- Full spec sheet (NPK values, description, images carousel)
- "Available At" section — list of `listings` by catalogId, sorted by distance
- Add to Cart → store selection if multiple sellers
- Reviews tab — `productReviews` by catalogId
- "View Brand" button if manufacturer exists

**Distance Sorting:**
- `listings` embed seller `geo` (lat/lng)
- Haversine distance calculated client-side (web does same)
- Sort listings by distance if location permission granted

---

### 5.3 Cart & Checkout

**Cart (local persistence):**
```dart
class CartItem {
  String catalogId;
  String catalogName;
  String? selectedSellerPhone;    // null = not yet assigned
  String? selectedSellerName;
  double price;
  int quantity;
  String? variantLabel;
}
```
- Stored in `SharedPreferences` as JSON (mirrors web's localStorage)
- `cartProvider` = `StateNotifierProvider<CartNotifier, List<CartItem>>`

**Store Selection Screen:**
- Shows all `listings` for that `catalogId`
- Displays distance, price, stock, seller name
- User picks one seller per cart item

**Checkout Flow:**
1. User enters delivery address (autocomplete or manual)
2. App calls `/api/payment/create-cart-order` (existing backend)
3. Razorpay Flutter SDK opens payment sheet
4. On success: app calls `/api/payment/verify`
5. On verification success: write `orders/{orderId}` docs (one per seller)
6. Navigate to order confirmation screen

---

### 5.4 Orders

**Customer Orders:**
- Query: `orders` where `customerId == uid` orderBy `createdAt` desc
- Status chips: Pending / Accepted / Dispatched / Delivered / Cancelled
- Order detail: items list, seller contact, total breakdown, tracking steps

**Seller Orders (Dashboard):**
- Query: `orders` where `sellerId == userPhone`
- Real-time listener (Firestore stream) for new order badges
- Actions: Accept → Mark Dispatched → Mark Delivered / Reject
- Push notification on new order (FCM)

---

### 5.5 Retailer Dashboard

**Dashboard Home:**
- Stats cards: Views (7d), Calls, Directions, Active products
- Inventory health (low stock alerts)
- Recent reviews

**Inventory Management:**
- List of seller's `listings` docs
- Add product: search master `catalog`, if not found → create new catalog entry + listing
- Edit: price, variants, stock, discounts
- Discount: toggle with start/end date, percentage
- Delivery settings: weight slab builder (same as web)

**Analytics:**
- Charts using `fl_chart` package
- Data from Firestore `analytics` subcollection or aggregated docs

---

### 5.6 Manufacturer Dashboard

**Retailer Network:**
- List from `manufacturerNetwork` where `manufacturerPhone == userPhone`
- Status: invited / active / revoked
- Add retailer: form (name, email, phone, address) → creates network doc + triggers email via existing `/api/email/invite` endpoint
- Revoke / re-invite actions

**Product Assignment:**
- Select from own catalog → select retailers → assign
- Updates `listings` with `assignedByManufacturerPhone` field

**Brand Page Editor:**
- Edit `companyPages/{phone}` doc
- Upload logo → Firebase Storage
- Reorder/add product videos (YouTube URLs)
- Certification upload
- Color picker for primary/accent brand colors

---

### 5.7 Knowledge Hubs

- List `hubs` collection
- Filter by crop type
- Detail: rich content renderer (markdown or structured sections)
- Offline-cacheable (Firestore offline persistence)

---

### 5.8 Subscription & Payments

**Subscription Screen:**
- Plan grid: 1/3/6/12 months × seats selector
- Price: ₹21/54/90/144 per seat
- Promo code field (validated by server)
- Payment via Razorpay Flutter SDK
- On success: write `subscriptions` doc + set `users/{phone}.isPaid = true`

**Subscription Status:**
- Current plan, seats, expiry countdown
- Renewal button

---

## 6. Data Layer

### Repository Pattern

Each feature has a `*Repository` class that:
1. Takes `FirebaseFirestore` and `FirebaseAuth` via constructor (injected by Riverpod)
2. Converts Firestore `DocumentSnapshot` → typed Dart model
3. Returns `Stream<T>` for real-time data or `Future<T>` for one-shots
4. Never exposes Firestore types to UI layer

```dart
// Example
class CatalogRepository {
  final FirebaseFirestore _db;
  CatalogRepository(this._db);

  Stream<List<CatalogModel>> watchMarketplace({
    String? category,
    int limit = 20,
    DocumentSnapshot? startAfter,
  }) {
    Query q = _db.collection('catalog');
    if (category != null) q = q.where('category', isEqualTo: category);
    return q.limit(limit).snapshots().map(
      (snap) => snap.docs.map(CatalogModel.fromFirestore).toList(),
    );
  }
}
```

### Model Conventions

All models follow:
```dart
class CatalogModel {
  // fields...
  
  factory CatalogModel.fromFirestore(DocumentSnapshot doc) { ... }
  Map<String, dynamic> toFirestore() { ... }
  CatalogModel copyWith({ ... }) { ... }
}
```

### Phone Normalization (critical)

Web uses `+91XXXXXXXXXX` format as Firestore keys. Flutter must match exactly:
```dart
String normalizePhone(String input) {
  final digits = input.replaceAll(RegExp(r'\D'), '');
  if (digits.startsWith('91') && digits.length == 12) return '+$digits';
  if (digits.length == 10) return '+91$digits';
  throw FormatException('Invalid phone: $input');
}
```

---

## 7. Authentication Flow

### Detailed OTP Flow

```
PhoneEntryScreen
  └── AuthRepository.sendOtp(phone)
        └── FirebaseAuth.verifyPhoneNumber(
              phoneNumber: '+91XXXXXXXXXX',
              verificationCompleted: (cred) → autoSignIn(),  // Android SMS auto-detect
              verificationFailed: (e) → showError(),
              codeSent: (verificationId, token) → navigate to OtpScreen,
              codeAutoRetrievalTimeout: ...
            )

OtpVerificationScreen
  └── AuthRepository.verifyOtp(verificationId, smsCode)
        └── FirebaseAuth.signInWithCredential(PhoneAuthCredential)
              → success: check users/{phone} existence
                  ├── exists → navigate to home (or redirect target)
                  └── not exists → navigate to /signup

OnboardingScreen (first time)
  └── ProfileRepository.createUser(phone, name, role:'consumer')
        └── write users/{phone}, uidIndex/{uid}
              → navigate to home
```

### Auth State in Riverpod

```dart
@riverpod
Stream<User?> authState(AuthStateRef ref) {
  return FirebaseAuth.instance.authStateChanges();
}

@riverpod
Stream<UserModel?> currentUser(CurrentUserRef ref) {
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) return Stream.value(null);
  final phone = ref.read(phoneFromUidProvider(user.uid));
  return FirebaseFirestore.instance
      .collection('users')
      .doc(phone)
      .snapshots()
      .map((snap) => snap.exists ? UserModel.fromFirestore(snap) : null);
}
```

---

## 8. UI/UX System

### Design System

Match the web app's Material Design 3 color system exactly:

```dart
// lib/core/constants/app_colors.dart
class AppColors {
  static const primary = Color(0xFF2E7D32);       // Green 800 — agri theme
  static const primaryContainer = Color(0xFFA5D6A7);
  static const secondary = Color(0xFFF9A825);     // Amber — CTA color
  static const surface = Color(0xFFFFFBF5);
  static const error = Color(0xFFB00020);
  // ... match web tailwind.config.js tokens
}
```

### Typography

```dart
class AppTextStyles {
  static const heading1 = TextStyle(fontSize: 28, fontWeight: FontWeight.w700, fontFamily: 'Poppins');
  static const heading2 = TextStyle(fontSize: 22, fontWeight: FontWeight.w600, fontFamily: 'Poppins');
  static const body = TextStyle(fontSize: 14, fontFamily: 'Inter');
  static const caption = TextStyle(fontSize: 12, color: AppColors.onSurfaceVariant, fontFamily: 'Inter');
}
```

### Shared Widget Conventions

| Widget | Used for |
|---|---|
| `ProductCard` | Grid/list cards in marketplace, inventory |
| `SectionHeader` | "Featured Products", "Near You" section titles |
| `StatusChip` | Order status, retailer status badges |
| `PriceText` | INR-formatted price with optional strikethrough |
| `RatingBar` | Star rating display |
| `AppBottomNav` | Bottom navigation with cart badge |
| `LoadingOverlay` | Full-screen loading with shimmer |
| `ErrorView` | Error + retry button |
| `EmptyState` | Empty list illustrations |

### Responsive Approach

- All layouts use `LayoutBuilder` + `MediaQuery`
- Cards: 2 columns on phones, 3 on tablets
- Bottom sheets for modals (not dialogs) — matches mobile UX conventions
- `SafeArea` wrapping on all scaffold bodies

### Localization (Hindi/English)

```dart
// pubspec.yaml
flutter:
  generate: true

// l10n.yaml
arb-dir: lib/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
```

Language toggle in profile settings → stored in `SharedPreferences` + UserModel.

---

## 9. Integrations

### 9.1 Razorpay

```dart
// lib/features/subscription/data/payment_service.dart
class PaymentService {
  final Razorpay _razorpay = Razorpay();

  void initHandlers({
    required Function(PaymentSuccessResponse) onSuccess,
    required Function(PaymentFailureResponse) onFailure,
  }) {
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, onSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, onFailure);
  }

  Future<void> openCheckout({
    required String orderId,       // from /api/payment/create-order
    required int amountPaise,
    required String customerPhone,
    required String description,
  }) async {
    _razorpay.open({
      'key': const String.fromEnvironment('RAZORPAY_KEY_ID'),
      'order_id': orderId,
      'amount': amountPaise,
      'name': 'KrishiDukaan',
      'description': description,
      'prefill': {'contact': customerPhone},
    });
  }

  void dispose() => _razorpay.clear();
}
```

**Payment server calls:** All go to `https://krishidukan.com/api/payment/*` — same endpoints as web. App sends Firebase ID token in `Authorization: Bearer <token>` header.

---

### 9.2 Firebase Cloud Messaging (Push Notifications)

New requirement (not in web) — critical for mobile:

```
New order → FCM token of seller → "New order received" notification
Order status update → FCM token of customer → "Your order is dispatched"
Invite accepted → FCM token of manufacturer
```

**Setup:**
1. Store FCM token in `users/{phone}.fcmToken` on app launch
2. Cloud Function (new, small) listens to `orders` collection writes → sends FCM via Admin SDK
3. Handle foreground notifications with `flutter_local_notifications`

---

### 9.3 Google Maps / Location

```dart
// Geolocation
final position = await Geolocator.getCurrentPosition(
  desiredAccuracy: LocationAccuracy.medium,
);

// flutter_map (OpenStreetMap — free, no API key for tiles)
FlutterMap(
  options: MapOptions(center: LatLng(lat, lng), zoom: 13),
  children: [
    TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
    MarkerLayer(markers: retailers.map((r) => buildMarker(r)).toList()),
  ],
)

// Address autocomplete → Google Places HTTP API
// Reuse existing /api/geocode/reverse for reverse geocoding
```

---

### 9.4 Image Handling

- Product images: loaded from Firebase Storage URLs via `cached_network_image`
- Image upload (for inventory): `image_picker` → compress → upload to `gs://krishidukan-e8315.appspot.com/products/{phone}/{uuid}.jpg`
- Logo upload (brand page): same pattern

---

### 9.5 Deep Links

Enable Android App Links for invite flow:
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="krishidukan.com" android:pathPrefix="/signup" />
</intent-filter>
```

GoRouter handles `?inviteCode=XXXXXXXX` param automatically.

---

## 10. Role-Based Access

### Role Check Logic (matches web exactly)

```dart
// lib/core/router/route_guards.dart
String? routeGuard(BuildContext context, GoRouterState state) {
  final user = ref.read(currentUserProvider).valueOrNull;
  final path = state.uri.path;

  // Not logged in → login (with redirect back)
  if (user == null && _requiresAuth(path)) {
    return '/login?redirect=${Uri.encodeComponent(path)}';
  }

  // Dashboard → needs payment
  if (path.startsWith('/dashboard') && user != null) {
    if (!user.isPaid) return '/subscription?reason=paywall';
  }

  // Manufacturer routes → needs manufacturer role
  if (path.startsWith('/dashboard/manufacturer') && user?.role != 'manufacturer') {
    return '/dashboard';
  }

  return null; // allow
}
```

### Feature Visibility by Role

| Feature | Consumer | Retailer | Manufacturer | Admin |
|---|---|---|---|---|
| Browse marketplace | ✓ | ✓ | ✓ | ✓ |
| Add to cart / checkout | ✓ | ✓ | ✓ | ✗ |
| My orders | ✓ | ✓ | ✓ | ✗ |
| Dashboard home | ✗ | ✓ | ✓ | ✗ |
| Inventory management | ✗ | ✓ | ✓ | ✗ |
| Seller orders | ✗ | ✓ | ✓ | ✗ |
| Retailer network | ✗ | ✗ | ✓ | ✗ |
| Brand page edit | ✗ | ✗ | ✓ | ✗ |
| Product assignment | ✗ | ✗ | ✓ | ✗ |
| Become retailer CTA | ✓ | ✗ | ✗ | ✗ |

---

## 11. Offline & Performance Strategy

### Firestore Offline Persistence

```dart
// main.dart
FirebaseFirestore.instance.settings = const Settings(
  persistenceEnabled: true,
  cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED,
);
```

This gives free offline reads for:
- Marketplace catalog (read-heavy, browsed repeatedly)
- Learning Hubs (almost never changes)
- User's own orders
- User's own inventory

### Image Caching

`cached_network_image` with disk cache — product images load fast on re-visits.

### Pagination

Marketplace uses cursor-based Firestore pagination (`startAfterDocument`):
```dart
// Load 20 products, on scroll-end load next 20
final provider = StateNotifierProvider<MarketplaceNotifier, MarketplaceState>(...);
// MarketplaceNotifier.loadMore() appends next page
```

### Shimmer Loading

Use `shimmer` package for skeleton loading cards — better perceived performance than spinners.

---

## 12. Build & Release

### Environment Configuration

```dart
// Use --dart-define at build time, never hardcode secrets
flutter build apk \
  --dart-define=RAZORPAY_KEY_ID=rzp_live_xxx \
  --dart-define=GOOGLE_MAPS_API_KEY=AIzaXXX \
  --dart-define=API_BASE_URL=https://krishidukan.com
```

`google-services.json` → `android/app/google-services.json` (from Firebase Console, gitignored).

### Build Variants

| Variant | Firebase Project | Razorpay | API URL |
|---|---|---|---|
| debug | `krishidukan-e8315` | test key | localhost or prod |
| release | `krishidukan-e8315` | live key | `krishidukan.com` |

### Signing

```
android/key.properties (gitignored):
storePassword=...
keyPassword=...
keyAlias=krishidukaan
storeFile=../krishidukaan.keystore
```

### Play Store

- Package name: `com.karanarjuntechnologies.krishidukan`
- Target SDK: 34
- Min SDK: 21
- App bundle (`.aab`) for Play Store submission

---

## 13. Implementation Phases

### Phase 1 — Foundation (Week 1–2)

**Goal:** Working app skeleton with auth and marketplace browsing.

- [ ] Init Flutter project (`flutter create krishidukaan_app --org com.karanarjuntechnologies`)
- [ ] FlutterFire CLI setup (`flutterfire configure`)
- [ ] Riverpod + GoRouter setup
- [ ] Core models: `UserModel`, `CatalogModel`, `ListingModel`
- [ ] Auth: PhoneEntry → OTP → Onboarding → home redirect
- [ ] Bottom navigation shell
- [ ] Marketplace screen: catalog list with category filter
- [ ] Product detail screen (read-only)
- [ ] Basic design system (colors, typography, shared widgets)

**Deliverable:** User can sign up, browse products, view product detail.

---

### Phase 2 — Consumer Commerce (Week 3–4)

**Goal:** Full consumer purchase flow.

- [ ] Cart (local persistence with `SharedPreferences`)
- [ ] Store selection screen (multi-seller per item)
- [ ] Checkout screen with address entry
- [ ] Razorpay payment integration (test mode)
- [ ] Order creation (Firestore writes after payment)
- [ ] Customer orders list + detail screen
- [ ] Geolocation + distance-sorted listings
- [ ] Store locator (flutter_map)
- [ ] Google Places address autocomplete

**Deliverable:** Consumer can add to cart, pay, and track orders.

---

### Phase 3 — Learning & Discovery (Week 5)

**Goal:** Knowledge hubs + brand pages.

- [ ] Hubs list + detail screens
- [ ] Brand/manufacturer page
- [ ] Product reviews display
- [ ] Store reviews display
- [ ] Search with debounce

**Deliverable:** Full consumer-facing feature parity with web.

---

### Phase 4 — Retailer Dashboard (Week 6–7)

**Goal:** Retailers can manage their business from mobile.

- [ ] Dashboard home with stats
- [ ] Inventory CRUD (add, edit, delete listings)
- [ ] Product image upload (camera + gallery)
- [ ] Discount management (toggle, date range, %)
- [ ] Delivery settings (weight slab builder)
- [ ] Seller orders screen (real-time stream)
- [ ] Order management (accept/reject/dispatch/deliver)
- [ ] Subscription screen + payment
- [ ] Paywall guard

**Deliverable:** Retailer can manage store fully from phone.

---

### Phase 5 — Manufacturer Features (Week 8–9)

**Goal:** Manufacturers can onboard and manage retailer network.

- [ ] Retailer network screen
- [ ] Add retailer form (triggers existing invite email API)
- [ ] Product assignment flow
- [ ] Manufacturer catalog management
- [ ] Brand page editor (logo, colors, videos)
- [ ] Deep link: `?inviteCode=` → auto-claim on signup
- [ ] Manufacturer dashboard analytics

**Deliverable:** Full manufacturer feature parity.

---

### Phase 6 — Polish & Launch (Week 10)

**Goal:** Production-ready release.

- [ ] FCM push notifications (new orders, status updates)
- [ ] Hindi/English localization
- [ ] Offline persistence verification
- [ ] Error handling polish (retry, no-connection banner)
- [ ] Performance: image caching, pagination, shimmer
- [ ] Crashlytics integration
- [ ] App icons + splash screen
- [ ] Razorpay switch to live keys
- [ ] Play Store listing (screenshots, description)
- [ ] `.aab` signed build

**Deliverable:** App submitted to Play Store.

---

## 14. Package Registry

```yaml
# pubspec.yaml

dependencies:
  flutter:
    sdk: flutter
  
  # State management & routing
  flutter_riverpod: ^2.5.1
  riverpod_annotation: ^2.3.5
  go_router: ^14.2.0
  
  # Firebase
  firebase_core: ^3.3.0
  firebase_auth: ^5.1.4
  cloud_firestore: ^5.2.1
  firebase_storage: ^12.1.3
  firebase_analytics: ^11.2.1
  firebase_messaging: ^15.0.4       # FCM push notifications
  firebase_crashlytics: ^4.0.4
  firebase_remote_config: ^5.0.4
  
  # Payments
  razorpay_flutter: ^1.3.6
  
  # Maps & Location
  geolocator: ^12.0.0
  flutter_map: ^7.0.2
  latlong2: ^0.9.1
  google_places_flutter: ^2.0.8
  
  # Images
  cached_network_image: ^3.4.0
  image_picker: ^1.1.2
  flutter_image_compress: ^2.3.0
  
  # Local storage
  shared_preferences: ^2.3.1
  
  # UI
  shimmer: ^3.0.0
  fl_chart: ^0.68.0                  # Analytics charts
  flutter_rating_bar: ^4.0.1
  
  # Utilities
  http: ^1.2.2                       # API calls to krishidukan.com
  intl: ^0.19.0                      # Date/number formatting
  sms_autofill: ^2.4.0               # OTP auto-read from SMS
  url_launcher: ^6.3.0               # Open maps, phone calls
  share_plus: ^10.0.2                # Share product links

dev_dependencies:
  flutter_test:
    sdk: flutter
  riverpod_generator: ^2.4.3
  build_runner: ^2.4.11
  flutter_lints: ^4.0.0
  flutter_launcher_icons: ^0.14.1
  flutter_native_splash: ^2.4.1
```

---

## 15. Known Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Firebase Phone Auth reCAPTCHA on Android | OTP might fail without Play Services | Use `SafetyNet`/`Play Integrity` attestation; test on real devices, not emulators |
| Razorpay Flutter SDK version conflicts | Payment failures | Pin to exact tested version; keep SDK updated for PCI compliance |
| Firestore cold start latency | Slow first marketplace load | Enable offline persistence; pre-warm on app launch |
| Image upload size on low-end devices | OOM crashes | `flutter_image_compress` before upload; max 800px, 80% quality |
| Multi-seller cart state loss on kill | Lost cart = lost sale | Persist cart to `SharedPreferences` on every change |
| Invite deep link not caught | Retailer can't claim invite | Test both cold-start and warm deep links; Android App Links verification |
| Firestore security rules — phone key | Writes rejected if phone not normalized | Strict phone normalization util used everywhere; unit test coverage |
| Web API calls from app (payment, email) | CORS issues | Existing Next.js routes already return proper CORS headers for mobile |
| Razorpay test vs live key mixup | Real money in test | Separate `--dart-define` per build variant; CI enforces test key on debug |
| Google Maps billing | Unexpected cost | Use OpenStreetMap tiles (free) for map display; only use Google API for geocoding/places |

---

## Appendix A — Firestore Collections Quick Reference

| Collection | Key Type | App Usage |
|---|---|---|
| `uidIndex/{uid}` | Firebase UID | Auth: resolve uid → phone |
| `users/{phone}` | E164 phone | User profile, role, isPaid, seats |
| `catalog/{id}` | Auto | Master product (marketplace) |
| `listings/{id}` | Auto | Seller offer of catalog item |
| `retailers/{phone}` | E164 phone | Retailer business profile |
| `manufacturers/{phone}` | E164 phone | Manufacturer profile |
| `profiles/{phone}` | E164 phone | Unified seller profile (new schema) |
| `manufacturerNetwork/{id}` | Auto | Mfr ↔ Retailer relationship |
| `orders/{id}` | Auto | Customer orders |
| `subscriptions/{id}` | Auto | Subscription records |
| `payments/{id}` | Auto | Payment transaction log |
| `deliverySettings/{phone}` | E164 phone | Weight-based delivery slabs |
| `hubs/{id}` | Auto | Knowledge hubs |
| `productReviews/{id}` | Auto | By catalogId |
| `storeReviews/{id}` | Auto | By storePhone |
| `companyPages/{phone}` | E164 phone | Brand page data |
| `siteVisits/{date}` | YYYY-MM-DD | Analytics (mobile: use Firebase Analytics instead) |

---

## Appendix B — API Calls to Existing Backend

All server-side operations reuse the existing Next.js API. App authenticates with Firebase ID token.

```dart
final token = await FirebaseAuth.instance.currentUser!.getIdToken();
final response = await http.post(
  Uri.parse('$apiBase/api/payment/create-cart-order'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({...}),
);
```

| Endpoint | Used by app for |
|---|---|
| `POST /api/payment/create-order` | Subscription purchase |
| `POST /api/payment/create-cart-order` | Cart checkout |
| `POST /api/payment/verify` | Post-payment verification |
| `POST /api/email/invite` | Manufacturer adds retailer |
| `GET /api/geocode/reverse` | Address from coordinates |
| `POST /api/resolve-maps-url` | Parse Google Maps share link |

---

*Document version: 1.0 — 2026-06-05*  
*Next step: Run `flutter create krishidukaan_app --org com.karanarjuntechnologies` in this directory and set up FlutterFire.*

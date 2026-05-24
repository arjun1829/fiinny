# KrishiDukan Mobile

Flutter mobile app for the KrishiDukan agri-commerce platform.
Shares roles, flows, and concepts with the web app in `../` (Next.js).

## Run

```bash
cd mobile
flutter pub get
flutter run            # picks first connected device/emulator
```

Or pick a device:

```bash
flutter devices
flutter run -d <device-id>
```

## Project layout

```
lib/
├── main.dart                     # MaterialApp.router + ProviderScope
├── app/
│   ├── router.dart               # go_router config + auth/onboarding redirects
│   └── shell.dart                # bottom nav, role-aware middle tab
├── core/
│   ├── constants.dart            # AppConstants, UserRole enum
│   ├── theme.dart                # AppColors + ThemeData
│   ├── i18n.dart                 # AppLocale (en/hi/mr) + Strings.t()
│   └── session.dart              # sessionProvider backed by SharedPreferences
├── shared/
│   ├── models.dart               # Product, Store, SubscriptionPlan
│   ├── mock_data.dart            # in-memory data — replace with API
│   └── constants_categories.dart
└── features/
    ├── splash/                   # routes based on session
    ├── welcome/                  # 3-slide intro carousel
    ├── auth/                     # phone entry + 6-digit OTP
    ├── onboarding/               # language → location → role
    ├── home/                     # market dashboard, product grid
    ├── product/                  # product detail
    ├── store_locator/            # nearby stores list (map placeholder)
    ├── profile/                  # account, preferences, support, sign out
    ├── subscription/             # 3 plans, Razorpay placeholder
    ├── retailer/                 # retailer dashboard
    └── manufacturer/             # manufacturer dashboard
```

## Flow

1. Splash → Welcome carousel → Login (phone) → OTP →
2. Onboarding (language → location permission → role pick) →
3. Main app with bottom nav:
   - Home, Stores, Profile (all roles)
   - Middle tab: **Cart** for customers, **Inventory** for retailers, **Catalog** for manufacturers
4. Retailers/Manufacturers see a "Subscribe" banner; tapping opens the plans screen.

## Wiring real services later

Search for `TODO:` in the code — those are the integration points:

- **Firebase Auth (phone OTP)** — `features/auth/otp_screen.dart`
  - Uncomment `firebase_core` / `firebase_auth` in `pubspec.yaml`.
  - Run `flutterfire configure` to generate `firebase_options.dart` and place
    `google-services.json` / `GoogleService-Info.plist`.
- **Razorpay** — `features/subscription/subscription_screen.dart`
  - Add `razorpay_flutter`. Use the existing web backend at
    `../app/api/payment/create-order` and `../app/api/payment/verify`.
- **Google Maps** — `features/store_locator/stores_screen.dart`
  - Add `google_maps_flutter` and the API key to native configs.
- **Backend API** — `core/constants.dart` → `apiBaseUrl`.
  - Replace `shared/mock_data.dart` with Dio calls or Firestore reads.

## Languages

English, हिन्दी, मराठी. Add more strings under `core/i18n.dart` → `Strings._data`.

## Quality

```bash
flutter analyze    # passes — 19 info-level lints, 0 warnings/errors
flutter test
```

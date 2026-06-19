# Testing on UAT — Teammate Guide

This is how to run the app against the **UAT** Firebase project (`karan-arjun-uat`)
so you can test your changes without ever touching production (`krishidukan-e8315`).

UAT has its own copy of the catalog/users data and uses **Razorpay test keys**
(no real money moves).

> The hosted URL `karan-arjun-uat.web.app` is **not** deployed — everyone runs
> the app locally as described below.

---

## 0. One-time prerequisites

- **Node.js** (same version as the project) and **Flutter** installed.
- **gcloud CLI** installed: https://cloud.google.com/sdk/docs/install
- **Access to the `karan-arjun-uat` project.** Ask Vinay to add your
  `@fiinny.com` account in Firebase Console → Project settings →
  Users and permissions (Editor is fine).

---

## 1. One-time setup

```bash
# 1. Get the latest code
git checkout main
git pull

# 2. Install dependencies
npm install
cd mobile && flutter pub get && cd ..

# 3. Log in to gcloud (both commands)
gcloud auth login
gcloud auth application-default login        # used by the server-side Admin SDK

# 4. Create your local UAT secrets file (gitignored)
cp .env.uat.local.example .env.uat.local
#    then open .env.uat.local and fill in the values — ask Vinay for:
#      RAZORPAY_KEY_SECRET   (Razorpay TEST secret)
#      SMTP_USER / SMTP_PASS (for email features)
```

You do **not** need a Firebase service-account key — the Admin SDK uses your
`gcloud auth application-default login` credentials.

---

## 2. Run the web app (Next.js) against UAT

```bash
npm run dev:uat
```

Opens on **http://localhost:3000**, pointed at the UAT Firebase project.
(`npm run dev` would point at production — use `dev:uat`.)

---

## 3. Run the mobile app (Flutter) against UAT

We test the Flutter app as a **web build** for now (Android comes later).
Start the web server in step 2 first, then:

```bash
cd mobile
flutter run -d web-server --web-port 8383 \
  --dart-define=APP_FLAVOR=uat \
  --dart-define=API_BASE_URL=http://localhost:3000
```

- `APP_FLAVOR=uat` → app uses the UAT Firebase project.
- `API_BASE_URL=http://localhost:3000` → payment/API calls go to your local
  Next.js server (required, since the hosted UAT URL isn't deployed).

Open the printed URL (e.g. `http://localhost:8383`).

---

## 4. Logging in

Login is phone + OTP. Two options:

- **Real phone** — you'll get a real SMS code.
- **Test number (no SMS)** — Firebase Console → `karan-arjun-uat` →
  Authentication → Sign-in method → Phone → *Phone numbers for testing*.
  Add a number + fixed code there, then use it to log in instantly.

To test seller features, log in with a phone that already owns products in UAT
(ask Vinay which test manufacturer/retailer phone to use).

---

## 5. Later: running on a real Android device

When you're ready to test natively (e.g. native Razorpay):

```bash
cd mobile
# Replace 192.168.x.x with your machine's LAN IP so the phone can reach your server
flutter run --flavor uat \
  --dart-define=APP_FLAVOR=uat \
  --dart-define=API_BASE_URL=http://192.168.x.x:3000
```

The UAT build installs as a separate app (`...krishidukan.uat`) so it can sit
next to the production app on the same device.

---

## Do / Don't

- ✅ Use `npm run dev:uat` and the `APP_FLAVOR=uat` Flutter flags.
- ✅ Test freely — UAT data and test payments are safe to mess with.
- ❌ Don't run the seed/copy scripts (`npm run seed:uat`, `copy:prod-to-uat`)
  unless you intend to reset/refresh UAT data for everyone.
- ❌ Don't point the app at production while testing.
- ❌ Don't deploy to UAT (`npm run deploy:uat`) casually — coordinate with Vinay,
  since rules/functions are shared by the whole team.

---

## Quick reference

| Task | Command |
|---|---|
| Web app on UAT | `npm run dev:uat` |
| Flutter web on UAT | `flutter run -d web-server --web-port 8383 --dart-define=APP_FLAVOR=uat --dart-define=API_BASE_URL=http://localhost:3000` |
| gcloud login | `gcloud auth login && gcloud auth application-default login` |
| Production web (for comparison) | `npm run dev` |

# KrishiDukan V2 — Environment Separation

Two Firebase projects, one codebase.

| | UAT | Production |
|---|---|---|
| **Firebase Project** | `karan-arjun-uat` | `krishidukan-e8315` |
| **Web URL** | `https://karan-arjun-uat.web.app` | `https://krishidukan.com` |
| **Razorpay** | Test keys (`rzp_test_*`) | Live keys (`rzp_live_*`) |
| **Payments** | No real charges | Real money |

---

## Local Development

### Against Production
```bash
npm run dev          # uses .env.local (already configured)
```

### Against UAT
```bash
npm run dev:uat      # uses .env.uat
```

The `--env-file .env.uat` flag (Next.js 14.1+) loads the UAT Firebase project config.
Secrets (SMTP, Razorpay secret) go in `.env.uat.local` (gitignored).

---

## Deployment

### Deploy UAT
```bash
npm run deploy:uat
```
Deploys Firestore rules, Storage rules, and Cloud Functions to `karan-arjun-uat`.

### Deploy Production
```bash
npm run deploy:prod
```
Deploys Firestore rules, Storage rules, and Cloud Functions to `krishidukan-e8315`.
The Next.js web app deploys automatically via Firebase App Hosting on `git push` to `main`.

---

## Seeding UAT with Test Data

```bash
# 1. Download UAT service account key from Firebase Console
#    karan-arjun-uat → Project Settings → Service Accounts → Generate new private key
#    Save as e.g. /tmp/uat-sa.json

# 2. Set credentials
export GOOGLE_APPLICATION_CREDENTIALS=/tmp/uat-sa.json

# 3. Run seed
npm run seed:uat
```

The seed script creates:
- 1 admin user (`uat-admin@test.com`)
- 1 manufacturer + company page + 3 products
- 1 retailer + 2 inventory copy products
- 1 consumer/farmer user

---

## Mobile (Flutter/Android)

Two build flavors: `prod` and `uat`.

```bash
# UAT build
flutter build apk --flavor uat --dart-define=API_BASE_URL=https://karan-arjun-uat.web.app --dart-define=RAZORPAY_KEY_ID=rzp_test_SmPxtEcNJ25LUj

# Production build
flutter build apk --flavor prod --dart-define=API_BASE_URL=https://krishidukan.com --dart-define=RAZORPAY_KEY_ID=rzp_live_S1aAwIHZXLMSDG
```

Each flavor picks up its own `google-services.json`:

| Flavor | google-services.json location |
|---|---|
| `prod` | `mobile/android/app/src/prod/google-services.json` |
| `uat` | `mobile/android/app/src/uat/google-services.json` |

The root `mobile/android/app/google-services.json` is kept as a fallback for unflavored builds.

> **Note:** UAT APKs have `applicationIdSuffix = ".uat"` so both apps can be installed side-by-side on the same device.

---

## Firebase Console Actions Required (Manual Steps)

These steps cannot be scripted and must be done manually in the Firebase Console.

### 1. Enable Authentication on UAT project
- Go to: **Firebase Console → karan-arjun-uat → Authentication → Sign-in method**
- Enable: **Phone** and **Email/Password** (same providers as production)

### 2. Create Firestore database on UAT
- Go to: **Firebase Console → karan-arjun-uat → Firestore Database**
- Click **Create database**
- Choose **Start in production mode** (rules deploy via CLI will secure it)
- Region: **asia-south1** (Mumbai — same as production)

### 3. Enable Firebase Storage on UAT
- Go to: **Firebase Console → karan-arjun-uat → Storage**
- Click **Get started**
- Region: **asia-south1**

### 4. Add authorized domains for UAT Authentication
- Go to: **Firebase Console → karan-arjun-uat → Authentication → Settings → Authorized domains**
- Add: `karan-arjun-uat.web.app`
- Add: `localhost` (should be there by default)

### 5. Generate UAT Service Account Key (for seed script + Admin SDK)
- Go to: **Firebase Console → karan-arjun-uat → Project Settings → Service Accounts**
- Click **Generate new private key**
- Save the JSON file securely (never commit it)
- Add to `.env.uat.local`:
  ```
  FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@karan-arjun-uat.iam.gserviceaccount.com
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
  ```

### 6. Store UAT secrets in Firebase Secret Manager (for App Hosting)
```bash
# Switch to UAT project first
firebase use uat

# Store UAT Razorpay test secret
firebase apphosting:secrets:set RAZORPAY_KEY_SECRET_UAT

# Store UAT Admin SDK credentials
firebase apphosting:secrets:set FIREBASE_CLIENT_EMAIL_UAT
firebase apphosting:secrets:set FIREBASE_PRIVATE_KEY_UAT

# Store UAT SMTP credentials (can reuse prod SMTP or use a test mailbox)
firebase apphosting:secrets:set SMTP_USER
firebase apphosting:secrets:set SMTP_PASS
```

### 7. Set up Firebase App Hosting backend for UAT (optional, for hosted UAT)
- Go to: **Firebase Console → karan-arjun-uat → Hosting → App Hosting**
- Click **Get started**
- Connect the same GitHub repo, set branch to a UAT branch (e.g. `develop` or `uat`)
- When prompted for the config file, note that `apphosting.uat.yaml` is the config to use
  (App Hosting currently uses `apphosting.yaml` by default — rename if deploying a separate backend)

### 8. Enable Google Analytics on UAT (optional)
- Go to: **Firebase Console → karan-arjun-uat → Project settings → Integrations**
- Link to a UAT Google Analytics property (separate from production)

---

## Environment Files Reference

| File | Committed | Purpose |
|---|---|---|
| `.env.local` | No (gitignored) | Production local dev secrets |
| `.env.uat` | **Yes** | UAT public Firebase config |
| `.env.uat.local` | No (gitignored) | UAT secrets (create manually) |
| `.env.example` | Yes | Template for onboarding |
| `apphosting.yaml` | Yes | Production App Hosting config |
| `apphosting.uat.yaml` | Yes | UAT App Hosting config |

---

## How the Config Switch Works

`app/firebase.ts` and `app/lib/firebase-client-server.ts` read `NEXT_PUBLIC_FIREBASE_*`
environment variables. These are baked into the Next.js bundle at build time:

- **Local dev (`npm run dev`)** → `.env.local` → production Firebase
- **Local dev (`npm run dev:uat`)** → `.env.uat` → UAT Firebase  
- **Deployed production** → `apphosting.yaml` → production Firebase
- **Deployed UAT** → `apphosting.uat.yaml` → UAT Firebase

Hardcoded fallbacks remain in the source so existing dev setups without
`NEXT_PUBLIC_FIREBASE_*` vars continue to work during the transition period.

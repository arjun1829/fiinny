#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# UAT Firebase Project — One-Time Setup Script
#
# Replicates all production configuration to karan-arjun-uat:
#   1. Secrets (Secret Manager)
#   2. Firestore rules + indexes
#   3. Storage rules
#   4. Cloud Functions
#
# Prerequisites:
#   • firebase CLI installed and logged in
#   • You have Owner/Editor on karan-arjun-uat
#   • Firestore DB already created in Firebase Console (asia-south1)
#   • Storage already enabled in Firebase Console (asia-south1)
#   • Authentication enabled (Phone + Email/Password)
#
# Run: bash scripts/setup-uat-project.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

UAT_PROJECT="karan-arjun-uat"
FIREBASE_CONFIG="firebase.uat.json"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   KrishiDukan UAT — Firebase Project Setup               ║"
echo "║   Project: $UAT_PROJECT                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "This script replicates all production Firebase config to UAT."
echo "It does NOT read from or write to the production project."
echo ""
read -r -p "Continue? (yes/no): " confirm
if [[ "$confirm" != "yes" ]]; then echo "Aborted."; exit 1; fi

# ─── Step 1: Secrets ─────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "STEP 1 — Secret Manager"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "Creating secrets in karan-arjun-uat Secret Manager..."
echo "You will be prompted to paste each value. Press Ctrl+D when done."
echo ""

echo "─── RAZORPAY_KEY_SECRET_UAT (your Razorpay TEST secret key) ───"
echo "  Format: rzp_test_XXXXXXXXXXXXXX"
firebase apphosting:secrets:set RAZORPAY_KEY_SECRET_UAT --project "$UAT_PROJECT"

echo ""
echo "─── FIREBASE_CLIENT_EMAIL_UAT (UAT service account email) ───"
echo "  Download from: Firebase Console → karan-arjun-uat → Project Settings → Service Accounts"
echo "  Format: firebase-adminsdk-xxxxx@karan-arjun-uat.iam.gserviceaccount.com"
firebase apphosting:secrets:set FIREBASE_CLIENT_EMAIL_UAT --project "$UAT_PROJECT"

echo ""
echo "─── FIREBASE_PRIVATE_KEY_UAT (UAT service account private key) ───"
echo "  Paste the full private key including -----BEGIN PRIVATE KEY-----"
firebase apphosting:secrets:set FIREBASE_PRIVATE_KEY_UAT --project "$UAT_PROJECT"

echo ""
echo "─── SMTP_USER (Gmail address for outgoing email) ───"
echo "  Can reuse production SMTP account or use a test mailbox"
firebase apphosting:secrets:set SMTP_USER --project "$UAT_PROJECT"

echo ""
echo "─── SMTP_PASS (Gmail App Password) ───"
firebase apphosting:secrets:set SMTP_PASS --project "$UAT_PROJECT"

echo ""
echo "✓ Secrets created."

# ─── Step 2: Grant App Hosting service account access to secrets ──────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "STEP 2 — Grant secret access to App Hosting service account"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "Granting Secret Accessor role for UAT App Hosting backend..."

firebase apphosting:secrets:grantaccess RAZORPAY_KEY_SECRET_UAT \
  --project "$UAT_PROJECT" || echo "  (skip — may require backend to exist first)"

firebase apphosting:secrets:grantaccess FIREBASE_CLIENT_EMAIL_UAT \
  --project "$UAT_PROJECT" || echo "  (skip — may require backend to exist first)"

firebase apphosting:secrets:grantaccess FIREBASE_PRIVATE_KEY_UAT \
  --project "$UAT_PROJECT" || echo "  (skip — may require backend to exist first)"

firebase apphosting:secrets:grantaccess SMTP_USER \
  --project "$UAT_PROJECT" || echo "  (skip — may require backend to exist first)"

firebase apphosting:secrets:grantaccess SMTP_PASS \
  --project "$UAT_PROJECT" || echo "  (skip — may require backend to exist first)"

echo ""
echo "✓ Secret access granted (or will be granted when backend is created)."

# ─── Step 3: Build functions ──────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "STEP 3 — Build Cloud Functions"
echo "══════════════════════════════════════════════════════════════"
echo ""
(cd functions && npm run build)
echo "✓ Functions built."

# ─── Step 4: Deploy Firestore rules ──────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "STEP 4 — Deploy Firestore Rules"
echo "══════════════════════════════════════════════════════════════"
echo ""
firebase deploy --only firestore:rules \
  --project "$UAT_PROJECT" \
  --config "$FIREBASE_CONFIG"
echo "✓ Firestore rules deployed."

# ─── Step 5: Deploy Firestore indexes ────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "STEP 5 — Deploy Firestore Indexes"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "Deploying 19 composite indexes (may take 5–10 min to build in background)..."
firebase deploy --only firestore:indexes \
  --project "$UAT_PROJECT" \
  --config "$FIREBASE_CONFIG"
echo "✓ Firestore indexes submitted (building in background)."

# ─── Step 6: Deploy Storage rules ────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "STEP 6 — Deploy Storage Rules"
echo "══════════════════════════════════════════════════════════════"
echo ""
firebase deploy --only storage \
  --project "$UAT_PROJECT" \
  --config "$FIREBASE_CONFIG"
echo "✓ Storage rules deployed."

# ─── Step 7: Deploy Cloud Functions ──────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "STEP 7 — Deploy Cloud Functions"
echo "══════════════════════════════════════════════════════════════"
echo ""
firebase deploy --only functions \
  --project "$UAT_PROJECT" \
  --config "$FIREBASE_CONFIG"
echo "✓ Cloud Functions deployed."

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   ✓ UAT PROJECT SETUP COMPLETE                           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "What was deployed to karan-arjun-uat:"
echo "  ✓ Secrets: RAZORPAY_KEY_SECRET_UAT, FIREBASE_CLIENT_EMAIL_UAT,"
echo "             FIREBASE_PRIVATE_KEY_UAT, SMTP_USER, SMTP_PASS"
echo "  ✓ Firestore rules  (firestore.rules)"
echo "  ✓ Firestore indexes (19 composite indexes — building in background)"
echo "  ✓ Storage rules     (storage.rules)"
echo "  ✓ Cloud Functions   (7 functions)"
echo ""
echo "REMAINING MANUAL STEPS:"
echo "  1. Verify Firestore index build status:"
echo "     firebase firestore:indexes --project karan-arjun-uat"
echo ""
echo "  2. Set up App Hosting backend for UAT (to serve the Next.js app):"
echo "     firebase apphosting:backends:create --project karan-arjun-uat"
echo "     # Connect to GitHub, point to your UAT branch (e.g. 'develop')"
echo "     # Specify apphosting.uat.yaml as the config file"
echo ""
echo "  3. Seed test data:"
echo "     export GOOGLE_APPLICATION_CREDENTIALS=/path/to/uat-sa.json"
echo "     npm run seed:uat"
echo ""
echo "  4. Create test Auth users in Firebase Console → karan-arjun-uat → Authentication"
echo "     (or use phone-auth with test numbers +91987654000[1-3])"
echo ""

#!/usr/bin/env bash
# Deploy to UAT (karan-arjun-uat)
# Usage: npm run deploy:uat
# Uses firebase.uat.json so only the UAT hosting target is touched.
set -euo pipefail

UAT_PROJECT="karan-arjun-uat"
FIREBASE_CONFIG="firebase.uat.json"

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   Deploying to UAT  ($UAT_PROJECT)  ║"
echo "╚════════════════════════════════════════════╝"
echo ""

echo "→ Building Cloud Functions..."
(cd functions && npm run build)

echo "→ Deploying Firestore rules to UAT..."
firebase deploy --only firestore:rules \
  --project "$UAT_PROJECT" \
  --config "$FIREBASE_CONFIG"

echo "→ Deploying Firestore indexes to UAT..."
firebase deploy --only firestore:indexes \
  --project "$UAT_PROJECT" \
  --config "$FIREBASE_CONFIG"

echo "→ Deploying Storage rules to UAT..."
firebase deploy --only storage \
  --project "$UAT_PROJECT" \
  --config "$FIREBASE_CONFIG"

echo "→ Deploying Cloud Functions to UAT..."
firebase deploy --only functions \
  --project "$UAT_PROJECT" \
  --config "$FIREBASE_CONFIG"

echo ""
echo "✓ UAT deploy complete."
echo "  Preview URL: https://$UAT_PROJECT.web.app"
echo ""
echo "To create/update the Next.js App Hosting backend for UAT:"
echo "  firebase apphosting:backends:create --project $UAT_PROJECT"
echo "  # Then link apphosting.uat.yaml to the backend"

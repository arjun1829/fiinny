#!/usr/bin/env bash
# Deploy to PRODUCTION (krishidukan-e8315)
# Usage: npm run deploy:prod
set -euo pipefail

PROD_PROJECT="krishidukan-e8315"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Deploying to PRODUCTION ($PROD_PROJECT)  ║"
echo "╚══════════════════════════════════════════╝"
echo ""
read -r -p "Are you sure? This deploys to PRODUCTION. Type 'yes' to confirm: " confirm
if [[ "$confirm" != "yes" ]]; then
  echo "Aborted."
  exit 1
fi

echo "→ Switching to project: $PROD_PROJECT"
firebase use prod

echo "→ Deploying Firestore rules + indexes..."
firebase deploy --only firestore --project "$PROD_PROJECT"

echo "→ Deploying Storage rules..."
firebase deploy --only storage --project "$PROD_PROJECT"

echo "→ Deploying Cloud Functions..."
firebase deploy --only functions --project "$PROD_PROJECT"

echo ""
echo "✓ Production deploy complete."
echo ""
echo "NOTE: The Next.js web app deploys automatically via Firebase App Hosting"
echo "when you push to the connected GitHub branch (main)."
echo "To trigger a manual App Hosting rollout:"
echo "  firebase apphosting:rollouts:create --project $PROD_PROJECT"

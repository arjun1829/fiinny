#!/usr/bin/env bash
# Reads WA credentials from wa-cloud-service/.env and upserts them
# into Google Cloud Secret Manager for the Firebase Functions deployment.
#
# Usage:
#   cd wa-cloud-service
#   bash scripts/provision-secrets.sh
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project krishidukan-e8315

set -eo pipefail

PROJECT="krishidukan-e8315"
ENV_FILE="$(dirname "$0")/../.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌  .env file not found at $ENV_FILE"
  exit 1
fi

# Load the .env file — skip comments and blank lines
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  # Strip surrounding quotes from value if present
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  export "$key=$value"
done < <(grep -v '^#' "$ENV_FILE" | grep -v '^$')

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Provisioning WA secrets → Secret Manager"
echo "  Project: $PROJECT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

upsert_secret() {
  local name="$1"
  local value="$2"

  if [[ -z "$value" ]]; then
    echo "⚠️   $name — empty in .env, skipping"
    return
  fi

  if gcloud secrets describe "$name" --project="$PROJECT" &>/dev/null; then
    echo -n "$value" | gcloud secrets versions add "$name" \
      --project="$PROJECT" --data-file=- --quiet
    echo "✅  $name — new version added"
  else
    echo -n "$value" | gcloud secrets create "$name" \
      --project="$PROJECT" --replication-policy="automatic" --data-file=- --quiet
    echo "✅  $name — created"
  fi
}

upsert_secret "WA_ACCESS_TOKEN"         "${WA_ACCESS_TOKEN:-}"
upsert_secret "WA_PHONE_NUMBER_ID"      "${WA_PHONE_NUMBER_ID:-}"
upsert_secret "WA_APP_SECRET"           "${WA_APP_SECRET:-}"
upsert_secret "WA_WEBHOOK_VERIFY_TOKEN" "${WA_WEBHOOK_VERIFY_TOKEN:-}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done. Run next:"
echo "  firebase deploy --only functions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

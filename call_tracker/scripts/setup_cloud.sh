#!/usr/bin/env bash
# One-time cloud setup for Call Tracker in lifemap-72b21, then a release build.
# Safe to re-run: every step checks before it creates.
#
#   cd call_tracker && bash scripts/setup_cloud.sh
#
# Needs `firebase login` done. Touches only:
#   - a new Android app "Call Tracker" (com.fiinny.calltracker)
#   - a new Firestore database "calltracker" and its rules
# Fiinny's app registration, (default) database and root rules are untouched.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=lifemap-72b21
PACKAGE=com.fiinny.calltracker
DB=calltracker
SECRETS=config/secrets.json

echo "== Android app"
APP_ID=$(firebase apps:list android --project "$PROJECT" --json |
  python -c "import json,sys; print(next((a['appId'] for a in json.load(sys.stdin)['result'] if a.get('packageName')=='$PACKAGE'), ''))")
if [ -z "$APP_ID" ]; then
  firebase apps:create android "Call Tracker" --package-name "$PACKAGE" --project "$PROJECT"
  APP_ID=$(firebase apps:list android --project "$PROJECT" --json |
    python -c "import json,sys; print(next(a['appId'] for a in json.load(sys.stdin)['result'] if a.get('packageName')=='$PACKAGE'))")
fi
echo "appId: $APP_ID"

echo "== Firestore database '$DB'"
if ! firebase firestore:databases:get "$DB" --project "$PROJECT" >/dev/null 2>&1; then
  # Same region as the project's (default) database.
  LOCATION=$(firebase firestore:databases:get "(default)" --project "$PROJECT" --json |
    python -c "import json,sys; print(json.load(sys.stdin)['result']['locationId'])")
  firebase firestore:databases:create "$DB" --location "$LOCATION" --project "$PROJECT"
fi

echo "== Rules for '$DB' only"
firebase deploy --only "firestore:$DB" --project "$PROJECT" --non-interactive

echo "== Build config ($SECRETS, gitignored)"
CONFIG=$(firebase apps:sdkconfig android "$APP_ID" --project "$PROJECT")
python - "$SECRETS" "$APP_ID" "$PROJECT" <<PY
import json, os, re, secrets, sys
path, app_id, project = sys.argv[1:]
cfg = json.loads(re.search(r'\{.*\}', '''$CONFIG''', re.S).group(0))
old = json.load(open(path)) if os.path.exists(path) else {}
client = next(c for c in cfg['client'] if c['client_info']['mobilesdk_app_id'] == app_id)
out = {
  'CT_FIREBASE_API_KEY': client['api_key'][0]['current_key'],
  'CT_FIREBASE_APP_ID': app_id,
  'CT_FIREBASE_SENDER_ID': cfg['project_info']['project_number'],
  'CT_FIREBASE_PROJECT_ID': project,
  'CT_FIREBASE_STORAGE_BUCKET': cfg['project_info'].get('storage_bucket', ''),
  # Keep an existing team code: changing it would split the team's data.
  'CT_TEAM_CODE': old.get('CT_TEAM_CODE') or secrets.token_urlsafe(32),
}
json.dump(out, open(path, 'w'), indent=2)
print('wrote', path)
PY

echo "== Release APK"
flutter build apk --release --dart-define-from-file="$SECRETS"
echo "APK: build/app/outputs/flutter-apk/app-release.apk"

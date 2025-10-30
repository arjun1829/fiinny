#!/usr/bin/env bash
set -euo pipefail
GSP_PATH="${GSP_PATH:-ios/Runner/GoogleService-Info.plist}"
ARCHIVE_DIR="${ARCHIVE_DIR:-build/ios/archive/Runner.xcarchive}"
UPLOADER="${UPLOADER:-ios/Pods/FirebaseCrashlytics/upload-symbols}"
if [[ -f "$UPLOADER" && -f "$GSP_PATH" ]]; then
  find "$ARCHIVE_DIR/dSYMs" -name "*.dSYM" -maxdepth 1 | while IFS= read -r dsym; do
    "$UPLOADER" -gsp "$GSP_PATH" -p ios "$dsym" || echo "warn: dSYM upload failed for $dsym"
  done
else
  echo "skip: Crashlytics uploader or GSP plist not found"
fi

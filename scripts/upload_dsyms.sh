#!/usr/bin/env bash
set -Eeuo pipefail

GSP_PATH="${GSP_PATH:-ios/Runner/GoogleService-Info.plist}"
ARCHIVE_DIR="${ARCHIVE_DIR:-build/ios/archive/Runner.xcarchive}"
UPLOADER="${UPLOADER:-ios/Pods/FirebaseCrashlytics/upload-symbols}"

echo "Crashlytics dSYM upload"
echo "GSP_PATH=$GSP_PATH"
echo "ARCHIVE_DIR=$ARCHIVE_DIR"
echo "UPLOADER=$UPLOADER"

if [[ ! -f "$GSP_PATH" ]]; then
  echo "::warning::GoogleService-Info.plist not found at $GSP_PATH. Skipping dSYM upload."
  exit 0
fi

if [[ ! -f "$UPLOADER" ]]; then
  echo "::warning::upload-symbols script not found at $UPLOADER. Did CocoaPods run? Skipping."
  exit 0
fi

if [[ ! -d "$ARCHIVE_DIR" ]]; then
  echo "::warning::Archive directory not found at $ARCHIVE_DIR. Skipping."
  exit 0
fi

mapfile -t DSYMS < <(find "$ARCHIVE_DIR/dSYMs" -type d -name "*.dSYM" | sort || true)
if (( ${#DSYMS[@]} == 0 )); then
  echo "::warning::No .dSYM folders found in $ARCHIVE_DIR/dSYMs. Skipping."
  exit 0
fi

for d in "${DSYMS[@]}"; do
  echo "Uploading $(basename "$d")"
  bash "$UPLOADER" -gsp "$GSP_PATH" -p ios "$d" || echo "::warning::upload failed for $d (continuing)"
done

echo "dSYM upload script finished."

# Crashlytics dSYM uploads

## Automatic (CI)
The `.github/workflows/ios-ipa.yml` workflow now:
1. Ensures the Crashlytics `upload-symbols` tool is available via CocoaPods.
2. Runs `scripts/upload_dsyms.sh` to upload every `.dSYM` bundle from `build/ios/archive/Runner.xcarchive/dSYMs`.
3. Stores the `.dSYM` bundles as a GitHub Actions artifact for optional manual download/backfill.

The uploader script is non-fatal—if required files are missing, the step logs a warning and the build continues.

## Backfill (historical builds)
Use the **“dSYM Backfill (App Store Connect)”** workflow when a historical Crashlytics build reports missing symbols.
Inputs:
- `version` (e.g. `1.0.0`)
- `build_number` (e.g. `193`)

Secrets required (App Store Connect API key):
- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_KEY_P8_BASE64` (base64-encoded `.p8` contents)

The workflow downloads the official dSYM archive from App Store Connect, uploads all `.dSYM` bundles with the Crashlytics uploader, and archives them as a workflow artifact.

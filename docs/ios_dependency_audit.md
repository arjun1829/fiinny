# iOS dependency audit

This document tracks Flutter/Dart packages that require native iOS integration work. It was prepared
while investigating the iOS 18 launch crash and the "black screen" reported after requesting
permissions.

## Summary

* No packages named `telephony` or similar Android-only SMS helpers are listed in `pubspec.yaml`.
* All declared plugins currently expose iOS implementations or document iOS support on pub.dev.
* Packages with additional iOS caveats have notes below so new team members can keep them working.

## Plugin notes

| Package | iOS support notes |
| --- | --- |
| `firebase_core`, `firebase_auth`, `cloud_firestore`, `firebase_storage`, `firebase_messaging` | Fully supported on iOS; ensure CocoaPods is installed and `pod repo update` is run before `pod install`. |
| `google_sign_in` | Requires configuring the reversed client ID in `Info.plist` (already present in the project). |
| `flutter_local_notifications` | iOS 13+ uses `UNUserNotificationCenter`; the plugin handles this once notification permissions are granted. |
| `permission_handler` | iOS support depends on adding the correct usage descriptions (already present for contacts, camera, microphone, etc.). |
| `flutter_contacts` | Supports iOS but should not request permissions directly on that platform. We rely on `permission_handler` and only call the plugin’s loader when access has been granted. |
| `google_ml_kit` | Ships as a federated plugin; iOS builds require Xcode 13+ and enabling the Google MLKit pods (handled automatically by the plugin). |
| `file_picker`, `image_picker`, `video_player`, `share_plus`, `url_launcher`, `package_info_plus` | All provide iOS implementations with no extra configuration beyond usage descriptions. |
| `google_mobile_ads` | Requires AdMob IDs configured in `Info.plist` before release builds. |
| `flutter_svg`, `google_fonts`, `animations`, `fl_chart`, `table_calendar`, `intl_phone_field`, `timezone`, `uuid`, `rxdart`, `http`, `path`, `sqflite`, `googleapis`, `googleapis_auth` | Pure Dart or already supporting iOS without extra setup. |

## Action items

1. Keep `ios/Runner/Info.plist` usage descriptions in sync with any new permission requests.
2. When adding future plugins, confirm their `platforms` entry on pub.dev includes `ios` and update this
   document if manual setup is required.


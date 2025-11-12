# AdMob setup checklist

This repo keeps the production AdMob identifiers in `lib/core/ads/ad_ids.dart`. The
runtime automatically switches to Google's public test IDs when
`--dart-define=FORCE_TEST_ADS=true` is supplied.

Follow these steps to finish the AdMob console warnings that mention
*app confirmation* and *app-ads.txt*.

## 1. Confirm the Android app in AdMob

1. Sign in to [AdMob](https://apps.admob.com/).
2. Open **Apps → Apps to confirm** and select **Fiinny (Android)**.
3. Choose **Finish setup** and enter the exact package name
   `com.KaranArjunTechnologies.lifemap` when prompted.
4. Double-check that the App ID shown in the console matches the
   hard-coded value in `android/app/src/main/AndroidManifest.xml`.

## 2. Host `app-ads.txt`

1. Create a site root (Firebase Hosting is fine) and place the provided
   `app-ads.txt` file at the root URL:

   ```
   google.com, pub-5891610127665684, DIRECT, f08c47fec0942fa0
   ```

2. Deploy so the file is publicly reachable, e.g.
   `https://<your-domain>/app-ads.txt`.
3. In AdMob open **Apps → app-ads.txt** and add the same URL as the
   developer website.
4. Update the Google Play store listing to reference that website so the
   crawler can associate the app and domain.

AdMob can take a few hours to re-check the file. The status should change
from "No app-ads.txt file found" to **Authorised** after the crawler
verifies it.

## 3. Optional diagnostics

With a debug build, `AdService` prints masked identifiers and the Google
Mobile Ads adapter statuses. Look for `[AdService]` and `[SleekAdCard]`
log lines to confirm which identifiers are active and whether banners
actually load. The logs stay disabled in release builds.

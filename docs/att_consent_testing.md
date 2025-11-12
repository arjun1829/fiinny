# ATT Consent QA Checklist

Use this checklist before every App Store submission to verify that App Tracking Transparency (ATT) works end-to-end.

## Manual test steps

1. Delete the existing app build from the iOS simulator/device.
2. Install the new build (iOS 14.5 or later) and launch Fiinny.
3. Observe the "Help keep Fiinny free" pre-prompt. Tap **Continue** and confirm the system ATT dialog appears immediately afterwards.
4. Choose **Allow** and verify that personalized ads render (AdMob loads without `nonPersonalizedAds`).
5. Force-quit the app, then reopen it. Confirm that the pre-prompt no longer appears and ads continue to load normally.
6. Navigate to **Settings → Privacy & Security → Tracking**, disable tracking for Fiinny, and relaunch the app.
7. Confirm that ads still load and `nonPersonalizedAds` is enabled (check debug logs) and that you see the reminder dialog with an **Open Settings** action.
8. Re-enable tracking in Settings, relaunch, and confirm the authorized path again.

## Demo screen recording

Record a 15–20 second clip showing the first-launch experience:

1. Start the recording before opening the app.
2. Capture the pre-prompt, select **Continue**, and accept the iOS ATT dialog.
3. Show an ad surface (e.g., an interstitial trigger or banner) to demonstrate that ads continue loading.
4. Stop the recording and save it as `docs/assets/att-demo.mov`.
5. Attach the file in App Store Connect review notes.

> Tip: If you ever need to re-request consent after a denial, guide the reviewer to **Settings → Privacy & Security → Tracking → Fiinny**. The in-app reminder includes a quick link to open Settings.

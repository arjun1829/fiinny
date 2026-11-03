# Call Tracker

Separate Android app (not part of Fiinny) for a small team taking 150+ calls a
day on a couple of phones. It reads each phone's call log, shows which
missed callers still need a call back, and shares that list across the
team's phones.

## What it does

- **Pending list**: one row per number, oldest waiting first, with a one-tap
  call-back button. Swipe left to mark "not needed".
  - 🔴 missed, nobody called back
  - 🟠 called back, didn't connect
  - 🟢 called back and connected, or they called again and got through
  - ⚪ marked not needed (turns red again if they miss-call again)
- **Home**: today's total, answered, missed, outgoing, called back and unique
  numbers; average call-back time; last 14 days; per-phone load.
- **All calls**: every call from every phone, one line each. Filter by type,
  pending only, date range and phone; search by name or number; export to
  CSV (opens in Excel).
- **Contacts**: every number seen plus ones added by hand. Name and notes
  are shared with the team **and** written into the phone's own contacts.
  Names already in a phone's contacts are shared to the team for numbers
  that called.
- **Backfill**: first launch imports everything still in the phone's call log
  (often only the last 500–1000 calls; Android trims older ones).
- **Sync**: on open, on return from a call, pull-to-refresh, and every 15 min
  in the background. The bar under the title shows "All synced" or
  "N waiting to upload". A notification shows "N calls still pending call back".

No login. Works offline; the phone's SQLite db is the source of truth.

## Kept separate from Fiinny

| | Call Tracker | Fiinny |
|---|---|---|
| Code | `call_tracker/` (own pubspec) | repo root |
| Android id | `com.fiinny.calltracker` | `com.KaranArjunTechnologies.lifemap` |
| Firestore | database **`calltracker`** in lifemap-72b21 | `(default)` |
| Rules | `call_tracker/firestore.rules` | root `firestore.rules` |

Data lives at `teams/{teamCode}/{calls|contacts|devices}`. The app signs in
anonymously, and the team code (32 random chars, in the gitignored
`config/secrets.json`) is what keeps the data private. `teams` can't be
listed. Don't commit `config/secrets.json`, `android/key.properties` or
`android/calltracker.jks`: this repo is public.

## Build

```bash
# local-only build (no cloud)
flutter build apk --release

# cloud setup + release build (needs `firebase login`)
bash scripts/setup_cloud.sh
```

Anonymous sign-in must be enabled in Firebase Console → Authentication →
Sign-in method for lifemap-72b21.

Install `build/app/outputs/flutter-apk/app-release.apk` on each phone (it
can't go on the Play Store: Google only allows call-log access for dialer apps).
Every team phone must get an APK built with the **same** `config/secrets.json`.

The release key is `android/calltracker.jks` with passwords in
`android/key.properties`. Back both up: updates must be signed with the same key.

## Tests

```bash
flutter test
```

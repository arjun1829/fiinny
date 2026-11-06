# Firestore rules tests

`shop-team.test.mjs` checks the shop team (helpers) rules in `../../firestore.rules`:
what a helper with each permission may read and write, that strangers, paused
helpers and a forged `kdStaff` claim get nothing, that owners are unaffected,
and that shoppers' hot paths (reel views/likes, product counters) stay free.

Run it against the Firestore emulator (needs Java). From `KrishiDukaan-V2/`:

```bash
npm i --no-save @firebase/rules-unit-testing firebase-tools
npx firebase emulators:exec --only firestore --project kd-rules-test \
  "node tests/firestore-rules/shop-team.test.mjs"
```

The test expects the emulator on port 8089: add
`"emulators": { "firestore": { "port": 8089 } }` to a local firebase.json, or
change the port at the top of the test.

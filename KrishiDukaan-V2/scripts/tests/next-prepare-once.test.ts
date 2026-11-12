// Guards the website-server memory-leak fix (next-prepare-once.js).
//
// Production runs Next behind Firebase's generated wrapper, which calls
// nextApp.prepare() on EVERY request. Unpatched, Next 14 rebuilds its router
// and adds process listeners each time (~0.6 MB leaked per request; the site
// was OOM-killed ~9x/hour on 12 Nov 2026). This test fails if a Next or
// firebase-frameworks upgrade changes the shapes the patch relies on, so the
// leak cannot silently come back.
//
//     npx tsx scripts/tests/next-prepare-once.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(__dirname, "..", "..");

// 1. The patch is wired into next.config.js (which Firebase bundles into the
//    function, and which Next loads during the first prepare()).
const config = fs.readFileSync(path.join(root, "next.config.js"), "utf8");
assert.match(config, /require\("\.\/next-prepare-once"\)\.applyNextPrepareOnce\(\)/,
  "next.config.js must call applyNextPrepareOnce()");

// 2. Inert outside the deployed function (no K_SERVICE / FUNCTION_TARGET).
delete process.env.K_SERVICE;
delete process.env.FUNCTION_TARGET;
const { applyNextPrepareOnce } = require(path.join(root, "next-prepare-once.js"));
const createServer = require("next");
const proto = Object.getPrototypeOf(createServer({ dev: false, dir: root }));
const original = proto.prepare;
assert.equal(typeof original, "function", "Next custom server must still have prepare()");
assert.equal(applyNextPrepareOnce(), false, "must not patch outside the Cloud Function");
assert.equal(proto.prepare, original, "prototype untouched outside the Cloud Function");

// 3. Next still sets `requestHandler` in prepare() — the field the patch uses
//    to know an instance is ready. If Next renames it, this fails.
const nextSrc = fs.readFileSync(require.resolve("next/dist/server/next.js"), "utf8");
assert.match(nextSrc, /this\.requestHandler\s*=\s*initResult\[0\]/,
  "NextCustomServer.prepare() no longer sets this.requestHandler — re-check next-prepare-once.js");

// 4. Patched: concurrent first calls share ONE initialisation, later calls are
//    free, and a failed initialisation is retried by the next request.
let calls = 0;
let fail = false;
proto.prepare = async function fakePrepare(this: { requestHandler?: unknown }) {
  calls++;
  await new Promise((r) => setTimeout(r, 10));
  if (fail) throw new Error("init failed");
  this.requestHandler = () => {};
};
assert.equal(applyNextPrepareOnce({ force: true }), true, "patch must apply");

(async () => {
  const app = createServer({ dev: false, dir: root });
  await Promise.all([app.prepare(), app.prepare(), app.prepare()]);
  assert.equal(calls, 1, "concurrent first prepare() calls must share one init");
  for (let i = 0; i < 50; i++) await app.prepare();
  assert.equal(calls, 1, "prepare() after init must not re-initialise (this was the leak)");

  const app2 = createServer({ dev: false, dir: root });
  fail = true;
  await assert.rejects(app2.prepare(), /init failed/);
  fail = false;
  await app2.prepare();
  assert.equal(calls, 3, "a failed init must be retried, then cached");
  await app2.prepare();
  assert.equal(calls, 3);

  // 5. The wrapper we are compensating for. If firebase-frameworks stops
  //    calling prepare() per request, the patch can be removed.
  const ffDir = path.join(root, ".firebase", "krishidukan-e8315", "functions",
    "node_modules", "firebase-frameworks", "dist", "next.js", "index.js");
  if (fs.existsSync(ffDir)) {
    const ff = fs.readFileSync(ffDir, "utf8");
    if (!/handle = async[\s\S]*await nextApp\.prepare\(\)/.test(ff)) {
      console.log("note: firebase-frameworks no longer calls prepare() per request — next-prepare-once.js may be removable");
    }
  }

  console.log("next-prepare-once: all checks passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

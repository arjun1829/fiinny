#!/usr/bin/env node
// Loads .env.uat then .env.uat.local (if present) and starts next dev.
// .env.uat.local values override .env.uat.
//
//   node scripts/dev-uat.js --check    prints where it WOULD point, then exits
//
// SAFETY: this must never run against production. Two things made that easy to
// do by accident, so both are closed here:
//
//  1. A missing .env.uat used to be skipped silently. app/firebase.ts and
//     app/lib/firebase-admin.ts then fall back to HARDCODED PRODUCTION values
//     (krishidukan-e8315), so "dev:uat" quietly ran the website — and its
//     server-side API routes, using your credentials — against live data.
//     .env.uat is gitignored (it was removed from git on purpose), so a fresh
//     checkout does not have it. Now: no UAT config -> refuse to start.
//
//  2. `next dev` also auto-loads .env.local, which holds PRODUCTION secrets
//     (live WhatsApp token, webhook secret, admin keys). Any key not set for
//     UAT would leak through. Those are blanked below unless a UAT file
//     defines them; an empty value is "defined", so Next will not refill it.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const UAT_PROJECT = "karan-arjun-uat";

function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  const vars = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function fail(msg) {
  console.error("\n\x1b[31m✖ dev:uat refused to start\x1b[0m\n  " + msg.replace(/\n/g, "\n  ") + "\n");
  process.exit(1);
}

const uatPublic = path.resolve(".env.uat");
if (!fs.existsSync(uatPublic)) {
  fail(
    ".env.uat not found, so this would fall back to PRODUCTION Firebase.\n" +
    "Create it with the UAT public config (see firebase.uat.json -> hosting ->\n" +
    "runConfig.environmentVariables) — it is gitignored and holds no secrets."
  );
}

const uatVars = { ...parseEnv(uatPublic), ...parseEnv(path.resolve(".env.uat.local")) };

// Production-only secrets that .env.local would otherwise inject.
const PROD_ONLY = [
  "WA_ACCESS_TOKEN", "WA_PHONE_NUMBER_ID", "WA_APP_SECRET", "WA_WEBHOOK_VERIFY_TOKEN",
  "RAZORPAY_WEBHOOK_SECRET", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY",
];
const blanked = [];
for (const k of PROD_ONLY) {
  if (!(k in uatVars)) { uatVars[k] = ""; blanked.push(k); }
}

const env = { ...process.env, ...uatVars };

for (const key of ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", "FIREBASE_PROJECT_ID"]) {
  if (env[key] !== UAT_PROJECT) {
    fail(`${key} is "${env[key] ?? "(unset)"}", expected "${UAT_PROJECT}".\n` +
         "Refusing to start a 'UAT' server that could touch another project.");
  }
}

console.log(`\n\x1b[32m✔ dev:uat -> ${UAT_PROJECT}\x1b[0m` +
  `\n  web SDK : ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}` +
  `\n  admin   : ${env.FIREBASE_PROJECT_ID} (${env.FIREBASE_CLIENT_EMAIL ? "UAT service account" : "your gcloud login"})` +
  `\n  razorpay: ${env.RAZORPAY_KEY_ID || "(unset)"}` +
  `\n  blanked production-only secrets: ${blanked.join(", ") || "none"}\n`);

if (process.argv.includes("--check")) process.exit(0);

const next = path.resolve("node_modules/.bin/next");
const result = spawnSync(next, ["dev"], { env, stdio: "inherit" });
process.exit(result.status ?? 1);

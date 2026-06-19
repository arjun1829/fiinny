#!/usr/bin/env node
// Loads .env.uat then .env.uat.local (if present) and starts next dev.
// .env.uat.local values override .env.uat.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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

const env = {
  ...process.env,
  ...parseEnv(path.resolve(".env.uat")),
  ...parseEnv(path.resolve(".env.uat.local")),
};

const next = path.resolve("node_modules/.bin/next");
const result = spawnSync(next, ["dev"], { env, stdio: "inherit" });
process.exit(result.status ?? 1);

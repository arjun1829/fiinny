/**
 * One-time script: sets the `superAdmin: true` custom claim on the
 * superadmin@fiinny.com Firebase Auth account.
 *
 * Usage:
 *   node scripts/set-super-admin.mjs
 *
 * firebase-admin is resolved from functions/node_modules (the repo root does not
 * install it), so run this after `npm --prefix functions install`.
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or ADC pointing at the TARGET project
 * (e.g. karanarjun-pvt-ltd for production). After running, the account must sign
 * out and sign back in to get a fresh token carrying the claim.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
// firebase-admin lives in functions/node_modules on this branch.
const admin = require(resolve(here, '..', 'functions', 'node_modules', 'firebase-admin'));

const SUPER_ADMIN_EMAIL = 'superadmin@fiinny.com';

// User-based ADC does not embed a project id, so detect it explicitly from a CLI
// arg or env, failing loudly rather than silently targeting the wrong project.
const projectId =
  process.argv[2] ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT;

if (!projectId) {
  console.error('✗ No project id. Pass it explicitly:');
  console.error('    node scripts/set-super-admin.mjs karanarjun-pvt-ltd');
  console.error('  or set GOOGLE_CLOUD_PROJECT=karanarjun-pvt-ltd');
  process.exit(1);
}

admin.initializeApp({ projectId });

const user = await admin.auth().getUserByEmail(SUPER_ADMIN_EMAIL);
await admin.auth().setCustomUserClaims(user.uid, { superAdmin: true });

console.log(`✓ superAdmin claim set on ${SUPER_ADMIN_EMAIL} (uid: ${user.uid})`);
console.log('  Project:', admin.app().options.projectId || process.env.GOOGLE_CLOUD_PROJECT || '(from ADC)');
console.log('  Ask the super admin to sign out and sign back in to pick up the new claim.');

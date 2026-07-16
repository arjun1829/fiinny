If the first check passes, the webhook is fine — the missing updates are the test number limitation.

  ---
  Part 2: Production Readiness Checklist

  WhatsApp / Meta Production Readiness

  Business Verification
  - [ ] Go to Meta Business Manager → Business Settings → Security Center
  - [ ] Submit business verification documents (GST certificate + business address proof)
  - [ ] Verification takes 1–5 business days
  - [ ] Without this: stuck at 1,000 messages/day limit, can't add production numbers

  WABA (WhatsApp Business Account)
  - [ ] WABA is already created (you're using it for the test number)
  - [ ] After business verification it auto-upgrades — no separate step needed

  Production Phone Number
  - [ ] Purchase a new SIM or use a landline (can't reuse a number that has WhatsApp installed)
  - [ ] Go to WhatsApp → Phone Numbers → Add Phone Number 
  - [ ] Complete OTP verification
  - [ ] Display name approval (takes 1–3 days — Meta reviews it)

  Payment Method
  - [ ] Go to Meta Business Manager → Billing → Payment Methods
  - [ ] Add a card (international Visa/Mastercard works)
  - [ ] WhatsApp Cloud API is billed per conversation (₹0.4–₹0.8 per conversation depending on type)
  - [ ] Without payment method: can only use test number

  Template Approval
  - [ ] All your templates (retailer_onboarding, product_assignment_onboarded, etc.) need approval per language
  - [ ] They're already approved under mr (Marathi) — confirm in WhatsApp → Message Templates
  - [ ] Utility templates (transactional) approve in minutes; Marketing templates take 24–48 hours
  - [ ] Rejected templates can be edited and resubmitted

  Webhook for Production
  - [ ] Your webhook at https://krishidukan-e8315.web.app/api/wa/webhook is already production-ready
  - [ ] It's already verified and subscribed to messages
  - [ ] No changes needed when switching from test → production number — same webhook URL

  Required Permissions
  - [ ] whatsapp_business_messaging — already have it (you're sending messages)
  - [ ] whatsapp_business_management — already have it
  - [ ] These are auto-approved for your own WABA; no App Review needed unless you manage other businesses' WA accounts

  ---
  What Can Be Tested With Test Number vs What Requires Production

  ┌─────────────────────────────────┬────────────────────────────────────┬───────────────────┐
  │           Capability            │            Test number             │ Production number │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Send template messages          │ ✅ (to verified test numbers only) │ ✅ (to anyone)          │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Send to unverified recipients   │ ❌                                 │ ✅                      │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ sent webhook                    │ ✅                                 │ ✅                      │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ delivered / read webhooks       │ ⚠️  Unreliable                      │ ✅ Reliable             │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Incoming messages               │ ✅                                 │ ✅                      │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ More than 5 test recipients     │ ❌                                 │ ✅                      │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Remove "Test" label in messages │ ❌                                 │ ✅                      │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Scale to 1000+ messages/day     │ ❌                                 │ ✅ (after Tier upgrade) │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Custom display name on phone    │ ❌                                 │ ✅                      │
  └─────────────────────────────────┴────────────────────────────────────┴─────────────────────────┘

  ---
  Recommended Execution Order

  Step 1 — Verify webhook works (5 min, do now)
    └── Run the curl POST test above
    └── Confirm Firestore doc gets updated

  Step 2 — Add payment method to Meta Business Manager
    └── Unblocks production number registration

  Step 3 — Submit business verification
    └── Upload GST certificate + address proof
    └── Wait 1–5 days (run parallel with Steps 4–5)

  Step 4 — Register production phone number
    └── Requires payment method (Step 2)
    └── Does NOT require business verification yet

  Step 5 — Get display name approved
    └── Submit during phone number registration
    └── Takes 1–3 days in parallel

  Step 6 — Business verification completes
    └── Message tier auto-upgrades to 1,000/day
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ More than 5 test recipients     │ ❌                                 │ ✅                      │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Remove "Test" label in messages │ ❌                                 │ ✅                      │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Scale to 1000+ messages/day     │ ❌                                 │ ✅ (after Tier upgrade) │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Custom display name on phone    │ ❌                                 │ ✅                      │
  └─────────────────────────────────┴────────────────────────────────────┴─────────────────────────┘

  ---
  Recommended Execution Order

  Step 1 — Verify webhook works (5 min, do now) ✅ 
    └── Run the curl POST test above
    └── Confirm Firestore doc gets updated

  Step 2 — Add payment method to Meta Business Manager
    └── Unblocks production number registration

  Step 3 — Submit business verification✅ 
    └── Upload GST certificate + address proof
    └── Wait 1–5 days (run parallel with Steps 4–5)

  Step 4 — Register production phone number
    └── Requires payment method (Step 2)
    └── Does NOT require business verification yet

  Step 5 — Get display name approved
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ More than 5 test recipients     │ ❌                                 │ ✅                      │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Remove "Test" label in messages │ ❌                                 │ ✅                      │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Scale to 1000+ messages/day     │ ❌                                 │ ✅ (after Tier upgrade) │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Custom display name on phone    │ ❌                                 │ ✅                      │
  └─────────────────────────────────┴────────────────────────────────────┴─────────────────────────┘

  ---
  Recommended Execution Order

  Step 1 — Verify webhook works (5 min, do now)
    └── Run the curl POST test above
    └── Confirm Firestore doc gets updated

  Step 2 — Add payment method to Meta Business Manager
    └── Unblocks production number registration

  Step 3 — Submit business verification
    └── Upload GST certificate + address proof
    └── Wait 1–5 days (run parallel with Steps 4–5)

  Step 4 — Register production phone number
    └── Requires payment method (Step 2)
    └── Does NOT require business verification yet

  Step 5 — Get display name approved
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ More than 5 test recipients     │ ❌                                 │ ✅                      │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Remove "Test" label in messages │ ❌                                 │ ✅                      │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Scale to 1000+ messages/day     │ ❌                                 │ ✅ (after Tier upgrade) │
  ├─────────────────────────────────┼────────────────────────────────────┼─────────────────────────┤
  │ Custom display name on phone    │ ❌                                 │ ✅                      │
  └─────────────────────────────────┴────────────────────────────────────┴─────────────────────────┘

  ---
  Recommended Execution Order

  Step 1 — Verify webhook works (5 min, do now)
    └── Run the curl POST test above
    └── Confirm Firestore doc gets updated

  Step 2 — Add payment method to Meta Business Manager
    └── Unblocks production number registration

  Step 3 — Submit business verification
    └── Upload GST certificate + address proof
    └── Wait 1–5 days (run parallel with Steps 4–5)

  Step 4 — Register production phone number
    └── Requires payment method (Step 2)
    └── Does NOT require business verification yet

  Step 5 — Get display name approved
    └── Submit during phone number registration
    └── Takes 1–3 days in parallel

  Step 6 — Business verification completes
    └── Message tier auto-upgrades to 1,000/day
    └── Can apply for Tier 2 (10,000/day) after sending 1,000

  Step 7 — Update WA_PHONE_NUMBER_ID in Secret Manager
    └── Old: test number ID
    └── New: production number ID
    └── Redeploy: firebase deploy --only functions:sendWaNotification,functions:retryWaNotifications

  Step 8 — Done. Same webhook, same templates, same code.

  The only production change to your codebase is updating WA_PHONE_NUMBER_ID in Secret Manager to the production phone number's
  ID. Everything else — webhook, functions, Firestore schema, templates — stays identical.

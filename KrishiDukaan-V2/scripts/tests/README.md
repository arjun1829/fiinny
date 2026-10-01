# Money-logic tests

Plain `node:assert` scripts for the pricing rules that decide what a customer is
charged (subscription plans and promos, cart GST and delivery, referral funnel).
No test runner is configured; run any of them with:

    npx tsx scripts/tests/cart-pricing.test.ts
    npx tsx scripts/tests/pricing.test.ts
    npx tsx scripts/tests/referrals.test.ts

The Flutter apps carry matching tests (mobile/test, sales_app/test) for their
Dart mirrors of these rules; when a rule changes, change all three places.

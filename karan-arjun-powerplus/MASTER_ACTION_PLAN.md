# Karan Arjun Power Plus — Master Action Plan

**Goal:** Ship a complete, production-grade e-commerce product website by **June 1, 2026**.  
**Today:** May 4, 2026  
**Live URL:** https://karanarjun-powerplus.web.app  
**Codebase:** `C:\lifemap\karan-arjun-powerplus`

---

## Plan Structure

| Phase | Owner | Theme |
|-------|-------|-------|
| **Phase 0** | Owner | Pre-work / accounts / decisions |
| **Phase 1** | Intern | Foundation — Firebase, models, restructure |
| **Phase 2** | Intern | Order Flow — `/order` page, Firestore, payments |
| **Phase 3** | Intern + ERP Dev | Admin dashboard + ERP sync |
| **Phase 4** | Intern | Delivery tracking + UX |
| **Phase 5** | Intern + Owner | SEO + content + Instagram |
| **Phase 6** | Owner | Pre-launch QA, legal, business setup |
| **Phase 7** | Owner | Launch & marketing |
| **Phase 8** | Owner | Post-launch operations |

---

# PHASE 0 — PRE-WORK (Owner, before May 4)

These must be done **before the intern can start.** Block on these.

| # | Task | Notes |
|---|------|-------|
| 0.1 | Create Firebase project `karanarjun-powerplus` | console.firebase.google.com |
| 0.2 | Verify Razorpay live account is active | Get key_id and secret |
| 0.3 | Create Shiprocket account (or share existing) | shiprocket.in — paid plan needed for API |
| 0.4 | Create domain `karanarjunpowerplus.in` (already configured?) | Confirm DNS pointing to Firebase Hosting |
| 0.5 | Decide list of admin emails | These get access to `/admin` |
| 0.6 | Get GST registration number for invoice generation | For tax-compliant invoices |
| 0.7 | Confirm Fiinny ERP webhook spec with ERP dev | Both teams agree on `Order` schema |
| 0.8 | Pick 4–5 Instagram Reel URLs to embed | From `@karanarjun_ksk_priyanka_mall` |
| 0.9 | Get high-quality photos: store, founder, before/after crops | Use existing in `/public/images/` first |

---

# PHASE 1 — FOUNDATION (May 4–10) · Intern

| # | Task | Output |
|---|------|--------|
| 1.1 | Project restructure (plug-and-play folders) | `src/app`, `src/components/{landing,order,admin,shared}`, `src/lib/{firebase,services,models}` |
| 1.2 | Firebase Client + Admin SDK setup | `lib/firebase/client.ts`, `lib/firebase/admin.ts`, `.env.example` |
| 1.3 | TypeScript data models | `Order.ts`, `Customer.ts`, `Payment.ts` (shared with ERP dev) |
| 1.4 | Razorpay secure setup + signature verification | No hardcoded keys, signature verified server-side |
| 1.5 | Firestore security rules | `firestore.rules` — only admin SDK writes orders |
| 1.6 | Set up `.env.example` and document all env vars | Reference in README |
| 1.7 | Update `README.md` with setup, dev, deploy instructions | New dev can clone → run in <10 min |

---

# PHASE 2 — ORDER FLOW (May 11–17) · Intern

| # | Task | Output |
|---|------|--------|
| 2.1 | Simplify landing-page Buy section to "Order Now" CTA | Redirects to `/order` |
| 2.2 | Build `/order` page with full form + product selector | Two-column desktop, stacked mobile |
| 2.3 | Language persistence via `localStorage` | Lang sticks across pages and refreshes |
| 2.4 | API route: `confirm-payment` (verify + save to Firestore) | Razorpay signature verified before save |
| 2.5 | Order ID generator (KAP-2026-XXXXX format) | Sequential, human-readable |
| 2.6 | `/order-success?orderId=XXX` page | Shows order summary + tracking link |
| 2.7 | Email/SMS receipt to customer (optional but recommended) | Use Firebase + MSG91 or Twilio |
| 2.8 | Pincode delivery check (input + lookup) | "We deliver to your area ✓" before form |
| 2.9 | Mobile sticky bottom CTA | Visible below hero, hidden on `/order` page itself |

---

# PHASE 3 — ADMIN + ERP (May 18–24) · Intern + ERP Dev

| # | Task | Owner | Output |
|---|------|-------|--------|
| 3.1 | Admin login page (Firebase Auth + email allowlist) | Intern | `/admin/login` |
| 3.2 | Admin layout with auth guard | Intern | `/admin/*` protected |
| 3.3 | Admin dashboard `/admin` (stats: revenue, orders, pending) | Intern | Cards + recent orders preview |
| 3.4 | Admin orders table `/admin/orders` (search, filter, sort) | Intern | Filter by state/date/status |
| 3.5 | Admin single order view `/admin/orders/[id]` | Intern | Full detail + status update |
| 3.6 | Admin: mark as shipped + enter tracking | Intern | Updates Firestore |
| 3.7 | Admin: export orders to CSV | Intern | For accounting |
| 3.8 | ERP webhook endpoint built on Fiinny ERP side | ERP Dev | `POST /api/webhooks/powerplus-order` |
| 3.9 | Website-side ERP push service | Intern | `lib/services/erp-service.ts` |
| 3.10 | Retry mechanism for failed ERP syncs | Intern | `erpSynced: false` → admin retry button |
| 3.11 | End-to-end ERP sync test | Both | Real order flows from website → ERP |

---

# PHASE 4 — DELIVERY & UX (May 25–28) · Intern

| # | Task | Output |
|---|------|--------|
| 4.1 | Shiprocket auth + token caching | `lib/services/shipping-service.ts` |
| 4.2 | Create shipment API (admin-triggered) | Returns shipment ID + tracking URL |
| 4.3 | Track shipment API | Returns courier, status, ETA |
| 4.4 | Customer tracking page `/track/[orderId]` | Timeline UI: Placed → Processing → Shipped → Delivered |
| 4.5 | Email/SMS notifications on status change | "Your order has shipped via XYZ courier" |
| 4.6 | Improve Benefits screen (visual yield comparison) | "70% → 92% yield" stat row |
| 4.7 | UI polish: SVG hamburger, globe icon for lang, step numbers in How-to-Use | Cleaner micro-UX |
| 4.8 | Loading states on all forms and async actions | No "frozen" buttons |
| 4.9 | Error boundaries on all routes | No white-screen crashes |
| 4.10 | Toast notification system (success/error messages) | Replace `alert()` calls |

---

# PHASE 5 — SEO + CONTENT + INSTAGRAM (May 29 – Jun 1) · Intern + Owner

| # | Task | Owner | Output |
|---|------|-------|--------|
| 5.1 | Comprehensive metadata on all pages | Intern | Title, description, OG tags, keywords |
| 5.2 | Product schema.org structured data | Intern | Google Shopping eligibility |
| 5.3 | Organization + LocalBusiness schema | Intern | For Karan Arjun KSK store info |
| 5.4 | FAQ schema for common questions | Intern | Targets featured snippets |
| 5.5 | Instagram Reels section on landing | Intern | 4 Reels embedded from `@karanarjun_ksk_priyanka_mall` |
| 5.6 | Provide Reel URLs to use | Owner | Send to intern by May 28 |
| 5.7 | Blog: 3 SEO articles | Owner / writer | "Humates for grapes", "Onion drought management", "How to use Power Plus" |
| 5.8 | Sitemap + robots.txt updated | Intern | Includes `/order`, `/track`, blog posts |
| 5.9 | Image optimization audit | Intern | All images use `next/image`, proper `sizes` |
| 5.10 | PageSpeed Insights ≥ 85 mobile | Intern | Fix Core Web Vitals |
| 5.11 | Alt text in all 3 languages | Intern | Accessibility + multilingual SEO |

---

# PHASE 6 — PRE-LAUNCH (May 28 – Jun 1) · Owner

| # | Task | Output |
|---|------|--------|
| 6.1 | Privacy Policy page `/privacy` | Required for Razorpay + ads |
| 6.2 | Terms & Conditions page `/terms` | Required for Razorpay |
| 6.3 | Refund Policy page `/refund-policy` | Required for Razorpay |
| 6.4 | Shipping Policy page `/shipping-policy` | Required for Razorpay |
| 6.5 | Contact Us page `/contact` | Address, phone, email, hours |
| 6.6 | About Us page `/about` | Founder story, KSK history |
| 6.7 | GST-compliant invoice template | Auto-generated PDF on order success |
| 6.8 | End-to-end UAT with real ₹1 order | Verify entire flow works in production |
| 6.9 | Cross-browser test (Chrome, Safari, Firefox, Samsung Internet) | Most farmers use Chrome/Samsung |
| 6.10 | Cross-device test (iPhone SE, Mid-range Android, iPad, Desktop) | Real device testing |
| 6.11 | Load test (50 concurrent orders) | Verify Firestore writes don't fail |
| 6.12 | Backup & disaster recovery plan | Daily Firestore exports to GCS |
| 6.13 | Set up Firebase Alerts (errors, billing, downtime) | Email alerts to owner |

---

# PHASE 7 — LAUNCH & MARKETING (June 1 onwards) · Owner

| # | Task | Output |
|---|------|--------|
| 7.1 | Soft launch to existing customer base via WhatsApp Broadcast | Test with 50 known customers |
| 7.2 | Instagram launch post + Reel | Use Karan Arjun KSK handle |
| 7.3 | Google My Business listing update with website link | Boost local SEO |
| 7.4 | Google Search Console verification + sitemap submit | Get indexed quickly |
| 7.5 | Bing Webmaster Tools setup | Secondary indexing |
| 7.6 | Google Ads campaign — search + shopping | Target "humates fertilizer" keywords |
| 7.7 | Meta Ads (Instagram + Facebook) — geo-targeted Maharashtra | Most likely buyer region |
| 7.8 | YouTube ads on `@KaranarjunKrushisevakendra6812` content | Cross-promote |
| 7.9 | WhatsApp Business catalog with website link | For repeat orders |
| 7.10 | Press release to agri publications (Krishi Jagran etc.) | Build authority |
| 7.11 | Influencer outreach — agri YouTubers/Instagram pages | Negotiate review videos |

---

# PHASE 8 — POST-LAUNCH OPERATIONS (Ongoing) · Owner

| # | Task | Cadence |
|---|------|---------|
| 8.1 | Daily: review new orders in admin | Daily |
| 8.2 | Daily: process shipments via Shiprocket | Daily |
| 8.3 | Weekly: review analytics (orders, revenue, traffic sources) | Weekly |
| 8.4 | Weekly: respond to customer queries (WhatsApp + email) | Daily |
| 8.5 | Monthly: customer feedback survey | Monthly |
| 8.6 | Monthly: review Razorpay settlement reports | Monthly |
| 8.7 | Monthly: GST filing | Monthly |
| 8.8 | Quarterly: SEO audit + content refresh | Quarterly |
| 8.9 | Quarterly: A/B test landing page CTAs | Quarterly |
| 8.10 | Bi-annual: third-party security audit | Twice yearly |

---

# CROSS-CUTTING WORKSTREAMS

## Analytics & Observability (anytime in Phase 2–5)

| # | Task |
|---|------|
| A.1 | PostHog or GA4 setup |
| A.2 | Funnel events: `landing_view`, `order_page_view`, `size_selected`, `quantity_changed`, `form_started`, `payment_initiated`, `payment_success`, `payment_failed` |
| A.3 | Sentry for error tracking |
| A.4 | Conversion dashboard (admin-only) |
| A.5 | Heatmap tool (Hotjar / Microsoft Clarity — Clarity is free) |

## Security Hardening (Phase 1–3)

| # | Task |
|---|------|
| S.1 | Firestore security rules: only Admin SDK can write to `powerplus-orders` |
| S.2 | Rate limiting on `/api/orders/*` endpoints (e.g., 10 req/min per IP) |
| S.3 | CORS lockdown — only allow same-origin |
| S.4 | Razorpay webhook signature verification |
| S.5 | Admin auth: 2FA mandatory (Firebase Auth supports this) |
| S.6 | Audit log: every admin action logged to `powerplus-admin-logs` |
| S.7 | Secrets rotation: Razorpay + Shiprocket every 6 months |
| S.8 | HTTPS-only — verify Firebase Hosting forces SSL |

## Performance (Phase 4–5)

| # | Task |
|---|------|
| P.1 | Lighthouse audit ≥ 85 on mobile |
| P.2 | Image WebP conversion + lazy loading |
| P.3 | Code splitting per route |
| P.4 | Font preload (`Outfit` font) |
| P.5 | Disable unnecessary client-side hydration |
| P.6 | CDN for static assets (Firebase Hosting handles this) |

## Accessibility (Phase 4)

| # | Task |
|---|------|
| AC.1 | All images have alt text |
| AC.2 | All forms have labels associated with inputs |
| AC.3 | Color contrast WCAG AA |
| AC.4 | Keyboard navigation works on all interactive elements |
| AC.5 | Screen reader test on order flow |
| AC.6 | Focus visible on all buttons |

## Documentation (Continuous, Phase 1 onwards)

| # | Task |
|---|------|
| D.1 | `README.md` — setup, dev, deploy |
| D.2 | `ARCHITECTURE.md` — system overview |
| D.3 | `API.md` — all endpoints documented |
| D.4 | `DEPLOYMENT.md` — Firebase deploy steps |
| D.5 | `RUNBOOK.md` — common issues + fixes |
| D.6 | Fiinny Wiki updated weekly |

---

# DELIVERABLES CHECKLIST (June 1 acceptance criteria)

The product is **done** when ALL of these are checked:

### Customer-Facing
- [ ] Landing page loads in <3s on mobile
- [ ] Order can be placed end-to-end with real payment
- [ ] Customer receives order confirmation (on-screen)
- [ ] Customer can track order status anytime via `/track/{orderId}`
- [ ] Site works in English, Hindi, Marathi
- [ ] Mobile-first design works on 375px screens
- [ ] All trust signals present (ISO badge, hologram, contact info)

### Admin-Facing
- [ ] Admin can log in securely
- [ ] Admin sees all orders in dashboard
- [ ] Admin can filter, search, export orders
- [ ] Admin can mark orders as shipped (creates Shiprocket shipment)
- [ ] Admin can see ERP sync status per order
- [ ] Admin can manually retry failed ERP syncs

### Backend
- [ ] All orders saved in Firestore in `Order` schema
- [ ] All orders pushed to Fiinny ERP within 5 seconds
- [ ] Razorpay payments verified server-side (no fake orders possible)
- [ ] Firestore security rules deny client writes to orders
- [ ] No secrets in committed code

### Operations
- [ ] Privacy Policy, T&C, Refund Policy, Shipping Policy live
- [ ] All env variables documented in `.env.example`
- [ ] `README.md` complete enough for handoff
- [ ] Fiinny Wiki has firebase schema, API docs, env var docs
- [ ] Daily Firestore backups configured
- [ ] Error monitoring (Sentry/Firebase) set up
- [ ] Owner has admin access tested

### Marketing-Ready
- [ ] Sitemap submitted to Google Search Console
- [ ] Product schema validated by Google Rich Results
- [ ] Open Graph preview works on WhatsApp share
- [ ] Instagram Reels section live
- [ ] At least 1 SEO blog article published

---

# RISKS & MITIGATIONS

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Razorpay test mode delays approval for live | Medium | High | Apply for live mode by May 10 |
| ERP dev delivers webhook late | Medium | High | Mock webhook on website side from May 11; switch when ready |
| Shiprocket API quota issues | Low | Medium | Cache token; use webhook instead of polling |
| Rural customers face Razorpay UPI failures | High | Medium | Show clear retry messaging + WhatsApp fallback for help |
| Domain DNS propagation delay | Low | Medium | Configure DNS by May 28 (3-day buffer) |
| Intern gets stuck on Firebase setup | Medium | High | Owner provides Firebase access by May 4; pair-program if blocked |
| Payment failures lose data | Medium | High | Save form data to localStorage on payment open; restore on retry |

---

# WEEK-BY-WEEK SUMMARY

| Week | Dates | Theme | Major Deliverable |
|------|-------|-------|-------------------|
| 1 | May 4–10 | Foundation | Firebase + Razorpay secure + project restructured |
| 2 | May 11–17 | Order Flow | End-to-end paid order saved to Firestore |
| 3 | May 18–24 | Admin + ERP | Admin dashboard live, ERP sync working |
| 4 | May 25–28 | Delivery + UX | Shiprocket integrated, UX polished |
| 5 | May 29–31 | SEO + Polish | Instagram, structured data, blog posts |
| Launch | June 1 | Go Live | Public soft launch with real customers |

---

# OWNER'S DAILY 5-MIN CHECK

Every morning, ask the intern:
1. What did you finish yesterday?
2. What are you doing today?
3. Are you blocked? (Resolve same-day)
4. Did you update the Fiinny Wiki?
5. Any decisions you need from me?

---

**Document this. Pin this. Review weekly.**

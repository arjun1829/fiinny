# Play Console listing — KrishiDukaan Sales

Copy-paste content for the store listing, plus the exact Data safety answers.
Everything here describes what the app *actually* does — the Data safety
declarations must keep matching the code, so if a module changes, change this too.

Track: **Internal testing** (see "Publishing to Play" in `README.md` for why).

---

## App name (30 char limit)

```
KrishiDukaan Sales
```
*18 characters.*

## Short description (80 char limit)

```
Field tool for the KrishiDukaan sales team: visits, attendance and expenses.
```
*75 characters.*

## Full description (4000 char limit)

```
KrishiDukaan Sales is the internal field tool for the KrishiDukaan sales team. It is not a shopping app — access is limited to sales executives with an account issued by a KrishiDukaan administrator.

Sales executives use it to record a working day as it happens, so that field activity, travel and expenses are captured once, on the spot, instead of being reconstructed from memory at the end of the week.

WHAT YOU CAN DO

Start and end your day
Open your working day with a single tap. The app records where you started, and when you close the day it records where you finished, how long you worked, and the road distance you covered.

Log dealer visits
Browse the shared list of retailers, distributors and manufacturers in your territory. Add new ones as you find them, then record each visit with its purpose — pitching, order collection, payment collection, delivery, follow-up, complaint resolution or stock verification — along with any notes worth keeping. Call a dealer or open directions to their shop straight from their card.

Review your day on a map
Every completed day is saved with a route map and a visit timeline, so you can see the shape of the day: where you began, each stop in order, and where you finished.

Mark your attendance
Starting your day marks you present automatically. Correct it when you need to — half day, leave, week off or holiday — and review your record for the week or the month.

Claim expenses
Submit travel, fuel, food, lodging, toll and mobile costs with a photo of the bill, and follow each claim through to approval. Claims that are still pending can be edited or withdrawn.

See how you are doing
A summary of your visits, dealers covered, days worked, hours, distance travelled and money claimed, for this week, this month or the last 30 days.

ABOUT PERMISSIONS

Location is required, not optional. Recording where field work took place is the entire point of the app, so starting a day, logging a visit and marking attendance each need location access.

Location is read only at the moment you perform one of those actions, and only while the app is open. The app does not request background location and does not follow your device continuously, outside working hours, or when it is closed.

Camera and photo access are used only to attach a bill image to an expense claim.

ACCESS

Accounts are created by a KrishiDukaan administrator. If you do not have one, this app will not work for you. Sales executives can see only their own records; administrators can see the whole team's.

KrishiDukaan is operated by Karanarjun Technologies.
```

---

## Data safety form

The app is login-gated and every record is tied to a signed-in executive, so all
of the below is **collected**, **linked to the user's identity**, and **not
shared** with third parties. Nothing is used for advertising, and none of it is
sold.

Answer **No** to "Do you provide a way for users to request data deletion?" only
if that is genuinely true — these are employment records retained for accounting
purposes; the policy (section 5 and 9) points staff at their administrator.

| Data type | Collected | Shared | Required | Purpose |
|---|---|---|---|---|
| **Location → Precise location** | Yes | No | Required | App functionality |
| **Personal info → Email address** | Yes | No | Required | Account management |
| **Personal info → Name** | Yes | No | Optional | Account management |
| **Personal info → Phone number** | Yes | No | Optional | Account management |
| **Photos and videos → Photos** | Yes | No | Optional | App functionality |
| **Financial info → Other financial info** (expense amounts) | Yes | No | Optional | App functionality |
| **App activity → Other actions** (visits, attendance) | Yes | No | Required | App functionality |

Security practices to declare:

- **Data is encrypted in transit** — Yes (all traffic is HTTPS to Firebase).
- **Users can request data deletion** — see the note above; answer honestly.

### Why "Precise location = Required"

Play asks whether collection is required or optional. It is **required** here:
the app refuses to start a day, log a visit or mark attendance without a fix.
Declaring it optional would contradict the app's behaviour.

### What you do NOT need to declare

- **No background location.** The manifest requests only foreground
  `ACCESS_FINE_LOCATION`. Declaring background location triggers a separate and
  much slower Play review, and would be inaccurate.
- **No advertising ID**, no analytics SDK, no third-party ad networks.

---

## Other console fields

| Field | Value |
|---|---|
| App category | Business |
| Tags | Business, Productivity |
| Contact email | support@krishidukan.com |
| Privacy policy URL | https://krishidukan.com/privacy |
| Content rating | Everyone (business tool, no user-generated public content) |
| Target audience | 18+ |
| Ads | No ads |
| In-app purchases | None |
| Government app | No |
| Financial features | None — expense claims are internal reimbursement records, not a financial product |

### Content rating questionnaire

Answer **No** to every question about violence, sexuality, profanity, controlled
substances, gambling and user-generated content shared publicly. Visit notes and
expense descriptions are visible only to the author and to administrators, which
is not "user-generated content" in the sense the questionnaire means.

### Screenshots

Play requires at least 2 phone screenshots (min 320px, max 3840px on any side).
Good candidates, in order:

1. Dashboard with a day in progress — shows Start/End Day and today's counts
2. Dealer list with the visit sheet open
3. Session detail with the route map and visit timeline
4. Expenses with the totals card
5. Reports

Sign in with a demo account and use throwaway dealer data — real dealer names,
phone numbers and addresses must not appear in public store assets.

---

## Reviewer notes

Play reviewers cannot get past the login screen, and an app that appears
non-functional can be rejected. Put credentials for a demo `salesExecutive`
account in **App content → App access → All functionality is restricted**, with
instructions:

```
This is an internal tool for the KrishiDukaan field sales team. Accounts are
created by an administrator; there is no public sign-up.

Demo account:
  Email:    <demo-rep@krishidukan.com>
  Password: <password>

Sign in with the credentials above to reach the dashboard. Location permission
is required to use the Start Day, dealer visit and attendance features.
```

Create that demo account before submitting, and keep it active for as long as
the app is on Play:

1. Sign in to the admin panel → **Users & Roles** → **Create user**.
2. Role: **Sales Executive (Field Team)**.
3. Give it an email and a password of at least 6 characters. Use a dedicated
   address (e.g. `play-review@krishidukan.com`), not a real rep's account — the
   credentials go into Play Console in plain text and are visible to reviewers.
4. Paste those credentials into the App access block above.

The account needs no seeded data to pass review: the dashboard, dealer list,
attendance, expenses and reports all render correctly for a brand-new rep with
no history, and the reviewer only has to get past the login screen.

Note that `functions/scripts/seed-sales-executives.ts` is NOT the tool for this
— it is a one-time migration that back-fills the `salesExecutive` role onto reps
who already have field activity, and it creates no new accounts.

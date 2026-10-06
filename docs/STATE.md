# Where the build is

## Pick up here (end of 2 Oct 2026)

- **Freshbites** (#171, #178): seven engine-priced signs plus Road Sign and
  Window Frosting (custom quote, Studio-drawn); Entrance Sign inactive.
  Packages, 7 signs each: Inline $2,767 + 1 custom (storefront, blade, lobby,
  menu, frosting, banner, A-frame); Endcap $3,334 + 1 (2× storefront, blade,
  lobby, menu, frosting, banner); Freestanding $2,867 + 2 (2× storefront, road
  sign, lobby, menu, frosting, banner); Drive-thru 11 (the Freestanding seven
  plus drive-thru menu board, pre-sell board, clearance bar, directional —
  custom quote, #181). Neon Leaf is the one add-on.
- **Two questions left with the owner:** engine prices run far below the old
  fixed ones (Neon Leaf $167 vs $1,600; Menu Board $667 vs $3,200) — raise
  margins per sign type on /admin/pricing? And which signs belong in the
  standard packages now?
- **Raised 5 Oct, parked:** the owner described submission as placing the
  order (no quote to accept); after walking the current flow they said "this
  is good for now". If it returns: corporate approval of add-ons, custom-quote
  signs, owner-only ordering, and retiring the confirmation switch need answers.
- **Next:** the planned build is done. Session 7 (Design Studio) landed as
  #166–#173; **Session 8 (the DID generator) is skipped for now** (owner,
  5 Oct; DECISIONS #174). What remains is the owner's calls and the items
  waiting on others below. Custom-quote mockups are built (#173): Window Frosting is designed locally but still inactive, and
  the Road Sign (pylon) is not designed yet — activating either is the
  owner's call. The quote-confirmation switch is on for Freshbites.
- **Waiting on others:** refined store images from the owner for the landing
  page (5 Oct); `SIGNIZE_SESSION_TOKEN` on Render; an `sz_live_` key
  from the owner's team (the session token expires; renewing needs their 2FA
  code); theme alignment; one real Resend send; review of spec v2.5/v2.6.
- **Local data:** REQ-0912 (Riverside) installed end to end; Oak Plaza and
  Cedar Park empty. Smoke needs `npm run dev:db:reset`, which wipes this.

## 6 Oct 2026 (later still): drive-thru, and the live catalog brought in line

- Drive-thru built locally (#181) and the same catalog structure applied to
  the **live** project through the catalog functions (logged as the first
  team account and the Freshbites brand admin): the four drive-thru catalog
  types, the Drive-thru store type, Freshbites' four drive-thru signs, and
  the Inline / Endcap / Freestanding (7 signs) and Drive-thru (11) packages.
- **Then designs and prices too** (#182): all 12 Freshbites designs were run
  through the engine against live from this machine with the local token;
  live packages now Inline $2,816 · Endcap $3,400 · Freestanding/Drive-thru
  $2,917 (+ custom quotes). Still to do by the owner: set
  `SIGNIZE_SESSION_TOKEN` on Render so the deployed Studio works.

## 6 Oct 2026 (later): smoke green; brand signs explained

- **Smoke: 331/331** on a freshly reset database (local data backed up from
  `.pglite/` first and restored after). Three checks were updated for today's
  changes: the landing gallery only when the brand has sign pictures, the new
  landing headline, and waiting for the quote-confirmation save (the box now
  moves before the save lands). Lesson: after several restarts the app's
  single PGlite connection jammed (ECONNREFUSED from Next while scripts still
  connected); killing every project node process and restarting fixed it.
- **Brand signs** show packages, history and engine cost/margin (#180).

## 6 Oct 2026: the team's catalog page reorganised

- `/admin/catalog` is three tabs (`?tab=review|brand|catalog`; opens on
  review when something waits, else brand signs). Brand signs show a "Price
  from" badge and mark engine prices. The Signage.com catalog is one table:
  search and filters (placement, price source, in use), each sign type a
  group row, variants in aligned columns (Price from select, brand signs,
  options, On/Off, Edit options, Switch off); options open as a full-width
  row; recent changes fold away below. `MasterCatalog.tsx` (client). Smoke's
  catalog steps now open `?tab=catalog`; not rerun.

## 5 Oct 2026 (late night): "Price from" per sign type

- `/admin/catalog`: each variant has **Price from** — Design Studio, Fixed
  price (new), Custom quote (DECISIONS #179). Fixed-price signs are drawn by
  the Studio and carry the team's current price. Migration
  `20261005110000_price_mode.sql`, applied locally and on live. Driven:
  Window Frosting switched to Fixed at $450 and shown in the Studio, then put
  back to Custom quote.
- Drive-thru: no store type or drive-thru sign types yet; the owner was asked
  whether to add them (they would be new master-catalog rows).

## 5 Oct 2026 (late night): Freshbites packages tidied

- Packages renamed Inline / Endcap / Freestanding; Freestanding now 2×
  Storefront, Lobby and the Road Sign (reinstated, designed in the Studio,
  custom quote): $1,733 + 1 custom. Local data only (DECISIONS #178).
- Fixed: a first Studio design's size limits now follow the size typed.

## 5 Oct 2026 (late night): store cards redesigned

- The stage track sits beside the store name (dots: done checked, current
  ringed); one status strip under it says what is next, with the one green
  button for the franchisee's move and "+ Request signage" as a secondary
  button once the store has started. Phone: "Step n of 6 · stage" under the
  dots. The card itself carries `data-testid="setup-tracker"` for smoke.

## 5 Oct 2026 (late night): stores can be edited

- **"Edit store"** on each card (owner and Signage.com): name, address,
  opening date; store type only until the first order (Signage.com any time).
  Every change logged in `location_events` and shown as the store's history
  (DECISIONS #177). Migration `20261005100000_location_events.sql`, applied
  locally and on live. Driven as Dana: Oak Plaza edited and restored;
  Riverside's type shown locked. 4 new unit tests, 1 new RLS check. No smoke
  case yet.

## 5 Oct 2026 (late night): "Choose your signs" loads the standard package

- A store with no order yet shows only "Choose your signs", which opens the
  setup checklist for that store (`/location/{id}/setup`); standard signs
  auto-approve (DECISIONS #176). "+ Request signage" appears after the first
  order. Driven as Dana on Oak Plaza: 2 standard signs auto-approved, card
  moved to Approvals; the test order (REQ-0981) was removed. No smoke case
  yet.
- Open with the owner: a per-sign "approve automatically" option, or more
  signs in the standard packages, to cut add-on reviews.

## 5 Oct 2026 (late night): every store card shows its stage

- **The setup tracker is on every store card** (owner: "which stage are they
  at?"): an open setup request's stage as before; all six done once its signs
  are installed; else "Store set up" with "Choose your signs". `storeProgress`
  in `src/lib/setup-progress.ts` (4 new unit tests). Smoke now expects a
  tracker per store (2 in the seed), not rerun.

## 5 Oct 2026 (night): a new landing page

- **The signed-out brand page** (`/freshbites`, `freshbites.localhost:3000/`)
  leads with the brand's own sign mockups, then what you get, the sign
  program gallery, how it works, the readiness example and an FAQ
  (DECISIONS #175). Pictures and names only, no prices. Query
  `getShowcaseSigns`. Checked at 1440 and 390 wide: no sideways scroll, no
  broken images. Smoke updated (two Sign in links now; gallery shown; no
  price), not rerun.

## 5 Oct 2026 (evening): the Studio draws custom-quote signs

- **Brand admins design a custom-quote sign for its picture** (DECISIONS
  #173): logo and size, drawn in the type's own style; no options, no
  price. The sign stays "Custom quote" for the team to price; its quote
  sheet says so. Types with no drawing style say so on the Design page.
- Driven in the browser: Window Frosting designed and saved (est_price still
  empty, spec line kept, "— custom quote" logged), the Signs tab and its quote
  sheet, Entrance Sign's no-style page. Checks: typecheck, lint, 220 unit.
  Smoke not rerun (it needs `dev:db:reset`) and has no case for this yet.

## 5 Oct 2026 (later): team confirmation of quotes, per brand

- **A switch per brand on `/admin/pricing`** (DECISIONS #172): "Team confirms
  quotes before they are sent", on by default. Off, a fully priced
  Signage.com package goes to the franchisee as the team routes the request
  (the system's event, the usual quote email); custom-quote items and
  external packages still wait as before. Migration
  `20261005090000_quote_confirmation.sql`, applied locally and on live.
- Driven in the browser on 5 Oct (toggle off, route, delivered as the system,
  toggle back on; the test request removed). Smoke: the single add-on request
  now routes with confirmation off; the split
  request still covers "Deliver quote to franchisee"; the toggle is checked in
  the margins section.

## 5 Oct 2026: the Studio in "request changes"

- **A sent-back design is adjusted and re-priced on resubmit:** the resubmit
  panel shows "Customize in Studio" for a sign with a brand design, authorized
  by the request link and the sign corporate sent back. The server checks and
  prices the new design as submission does, replaces the line's mockup and
  quote sheet, and logs the old and new price (`src/lib/designs/resubmit.ts`).
- Checks: **218 unit**, typecheck, lint. Smoke not rerun (it needs
  `dev:db:reset`, which would wipe Riverside).

## 2 Oct 2026 (late): a store set up and installed, start to finish, by hand

- **Local data reset** (owner's ask): every request, line, installed sign and
  order email removed; Oak Plaza and Cedar Park kept, empty. The brand admin
  designed Storefront Letters (24", 18–36 adjustable) and Lobby Letters (18",
  12–24) in the Studio with the Freshbites logo.
- **Dana set up Freshbites — Riverside** (Inline, lender, opens Jan 15 2027)
  through the normal screens: photos and notes per sign, Storefront Letters
  customised to 30" (00), Neon Leaf as an add-on. REQ-0912 then went
  through prep, corporate approval, routing, manual pricing, quote (,983),
  acceptance, invoice INV-0727, payment, production, shipping, installation.
  Screenshots: shots/flow-* (setup) and shots/life-* (after).
- **Bugs found and fixed** (#169, #170): uploads open to anyone; a phone
  photo over 1 MB crashed setup; opening dates a day early east of UTC; an
  as-designed sign carried no design or quote sheet; a designed line showed
  the brand's spec; the last "(s)" plurals; installed signs showed the
  brand's mockup, not the one ordered.
- **Local smoke runs need the demo orders back:** `npm run dev:db:reset`
  (which also removes Riverside). The live project was not touched.

## 2 Oct 2026 (night): the Design Studio, both sides (SPEC v2.6 §8)

- **Brand admins design a sign** (#166): "Design" on each sign in the Signs tab
  opens `/{brand}/corporate/design/{signId}` — logo (or the brand's own), options
  from the engine's data, one dimension, depth; Preview renders and prices
  (~15 s); Save re-prices on the server and sets the sign's price, spec line,
  design and what franchisees may change. The mockup becomes the sign's picture.
- **Franchisees adjust it while ordering** (#167): "Customize in Studio" in
  setup and "Add a new sign", within the brand's limits; outside them the
  sign goes to corporate. Submission checks and prices the design itself.
- **The engine:** `src/lib/signize/` (server only), session endpoint
  `/api/sign-pricing` with `SIGNIZE_SESSION_TOKEN`; one call returns cost and a
  mockup. Cost and margin live only in `engine_quotes` (team only).
- Migration `20261002100000_sign_designs.sql` applied locally and on live.
- **Sign quote sheets** (#168): a one-page PDF per designed sign, stored at
  submission and linked on the request card, corporate's review card and the
  console; preview sheets from both Studios; a brand's own sheet on the Signs
  tab; mockups added to the budgetary quote. Migration `20261002110000`.
- **Renewing the session:** when the engine answers 401 the Studio says it is
  unavailable; signing in to signize.ai again needs the owner's 2FA code.

## 2 Oct 2026 (evening): margins, and the Signize engine reached

- **Margins per brand and sign type** (#165): `/admin/pricing` (team only) sets
  a standard margin (40% to start), a default per brand, and a margin per brand
  and sign type; the most specific applies. Price = cost ÷ (1 − margin).
  Migration `20261002090000_pricing_margins.sql`; no brand role can read a
  margin or its log entry (new RLS check). Not applied to a price yet.
- **Signize engine reached:** the owner's signize.ai login (2FA verified) gives a
  session token, kept in `.env.local` as `SIGNIZE_SESSION_TOKEN`. The keyed v1
  API refuses it (needs an `sz_live_` key, which the owner's team is arranging);
  the session endpoint `/api/sign-pricing` priced 24" Halo Lit letters at 10
  cost, 14 days, in ~14 s. Findings: docs/signize-integration.md.
- Checks: **318 smoke**, **197 unit**, **65 schema** (44 behavioural), typecheck, lint.

## 2 Oct 2026 (later): accounts proven on the live Supabase project

- **docs/SUPABASE.md §7, steps 7.1.2–7.4, all pass against the live project**
  — real Supabase Auth and TOTP, links read from the live outbox: invite and
  two-factor setup, sign-in again, deactivation signs a second browser out on
  its next click, password reset from another device (old password refused),
  the owner backfill and "My stores", "Sign in to accept" on a signed-out
  link, brand admin and reviewer accounts, a dashboard approval recorded as
  the reviewer's session, a franchisee registered from People and signed up
  from the welcome email, and a manager scoped to one store, changed and
  deactivated from corporate. 41 checks.
- **`npm run prove:supabase -- --email-base <you@…>`** reruns it
  (`scripts/prove-supabase.mjs`; resumable, writes to the live project).
  The test accounts are listed in docs/SUPABASE.md §7 and were kept.
- Learned: on a request with one sign waiting, a dashboard approval completes
  the review, so that sign's email link says "This review is complete" rather
  than "already approved by…". §7.3.2 now says so.
- **Spec v2.6** (awaiting your review): §8 rewritten around the Design Studio
  flow (#164). Waiting on the Signize code and API, and a margin policy.
- Still owed: one real Resend send (§8).

## 2 Oct 2026: a UI pass across every role

- **Corporate's review card matches the demo:** Approve, Request changes (needs
  the note) and Decline act on one press. From an email link the pressed button
  is ringed, "press it to confirm"; opening a link still decides nothing.
- **Request items are rows in one card** on the franchisee's page (one card per
  status group, price on the right) and the team console (compact "Attach a
  mockup" link).
- **Store types** say "Standard package: …"; a sign held twice reads "× 2".
- **Smaller fixes:** "(s)" plurals gone (`plural()` in `src/lib/format.ts`);
  "addon" → "Add-on" for corporate and the team; installed-sign tiles no
  longer overflow the store card on a phone (every responsive grid now has a
  base `grid-cols-1`); no "§8b" on screen; team history dates formatted; the
  brand is not repeated before a location name that carries it; corporate
  reads "5 signs installed · 4-sign standard package".
- **Smoke's REQ-0016 rewind** now also removes its "Every package is accepted"
  rollup; 70 left by earlier runs were deleted from the local database.
- **Local dev database:** a failing SQL statement from a script jams PGlite for
  everyone, the app included (500s). Restart `npm run dev` if it happens.
- Checks: **313 smoke**, **192 unit**, typecheck, lint, shots.

## 1 Oct 2026: layout for big screens, clearer cards, and the review rule enforced

- **Pages widen with the screen** (#159): `page-wide` / `page` / `page-narrow`
  in `globals.css`; root font steps up from 1680px; both request pages go
  two-column from 1280px; the console header wraps on a phone.
- **Cards say each thing once** (#160): request items grouped by status, an
  Estimate card until a quote exists; corporate's approval tile is the link
  (banner gone), and each location lists its open requests with a stage bar.
  Light grey text darkened to pass WCAG AA.
- **Corporate's review opens at package prep** (#161). Decisions and change
  requests on an unprepared request now throw `ReviewNotOpenError` (before,
  a reviewer could approve a `submitted` request and skip prep), and every
  count follows `isReviewOpen()`. A resubmission returns to `submitted` but is
  open (package version > 1); whether it should go to `needs_review` instead is
  a spec question, noted in #161.
- **Footer credit** on every screen: "MVP v1.0 by Saad A." (`MVP_VERSION` in
  `src/app/layout.tsx`), hidden in print.
- **Status machine** (#162): every item declined → terminal `declined`;
  a resubmission returns to `needs_review`. Migration
  `20261001090000_request_declined.sql` (enum value + data correction).
- **Team queue**: time waiting in the current status, oldest first, amber from
  three days; one card per request on a phone.
- **Corporate dashboard** (#163): the duplicate registration panel is gone
  (People already had it); vendor policy is one line below the budget sheets.
- **Tooling**: `.prettierrc.json` + `npm run format -- <files>`;
  `npm run shots` (every role's screens at three widths, fails on sideways
  scroll).
- **Live project:** all 19 migrations applied (1 Oct; no live rows needed
  moving), and the Freshbites brand row now has its `logo_url`.
- **Spec v2.5** (awaiting your review): the schema divergences recorded since
  Session 1 and today's three status rules are written into SPEC.md, each
  citing its DECISIONS.md entry; see its changelog.
- **CI** (`.github/workflows/checks.yml`): typecheck, lint, unit tests and
  `db:verify` on every push, proven from a clean clone. Runs once pushed.
- Checks: **312 smoke**, **192 unit**, **64 schema**, typecheck, lint, shots.

## 30 Sep 2026 (evening): look and feel, and a faster dev sign-in

- **A drafting-board grid behind every page** (#158): brand-tinted on brand
  pages, neutral on the console, hidden in print; it glows around the pointer
  on the two signed-out front pages (mouse only, off under reduced motion).
- **The Signage.com logo** (`public/brands/signage/`, dark and light
  lettering) in the console header, as "Powered by" in brand headers, and on
  the front page, sign-in and two-factor. The product name is unchanged.
- **The brand header has no bar at the top of the page**: logo and links sit on
  the brand's colour wash, and a frosted white bar fades in once content
  scrolls under it (`HeaderShell.tsx`). A thin brand-colour stripe stays.
- **Password fields have a show/hide eye** (`PasswordInput.tsx`), on all five.
- **Dev sign-in picker**: without Supabase, each sign-in lists its seeded
  accounts as buttons that fill the form; two-factor's dev code has "Use this
  code". Never shown under Supabase.
- Checks on 1 Oct: **306 smoke**, **188 unit**, **63 schema** (43
  behavioural), typecheck, lint.

## 30 Sep 2026 (later): the catalog and packages, managed on screen (spec v2.4)

- **Signage.com: `/admin/catalog`.** Brands' proposals waiting on a price;
  each brand's signs with editable prices, retire and reinstate; the master
  catalog (77 variants) with on/off and "add a sign type or variant".
- **Corporate: a Signs tab.** Brand admins propose a sign from the Signage.com
  catalog, locking the choices it offers; it stays hidden from franchisees
  until the team prices and approves it. Declined proposals come back with the
  reason. Live signs can be retired at once. **Standard packages** per store
  type are edited in the same tab and are live at once. Reviewers read.
- Emails: the team on a proposal, the brand admin on the decision. Every change
  is in `catalog_events`.
- **Fixed on the way:** setup decided `standard` (auto-approve) from a browser
  flag; the server now checks it against the package (#152).
- **Then, on your answers:** store types are the brand's own — add
  "Drive-thru", rename, reorder, retire, each with its package (#156); a
  retired sign still installed can be replaced, through corporate (#155); the
  team edits each catalog sign's options on `/admin/catalog` (#154).
- **Sign pictures (#157):** brand admins upload a picture per sign on the Signs
  tab; the team uploads an icon per sign type on `/admin/catalog`. Shown
  everywhere a sign is drawn: its picture, else its type's icon, else the
  schematic.
- **Live project:** all 18 migrations applied on 30 Sep (`brand_catalog`,
  `store_types`, `sign_images` were the new three); a dry run reports nothing
  pending.
- Checks: **305 smoke**, **188 unit**, **63 schema** (43 behavioural), typecheck, lint.
- Decisions #148–157.

## 30 Sep 2026: the console and the brands on separate addresses

- **One deployment, two addresses** (#146). Set `APP_URL=https://admin.signage.com`
  and `BRAND_PORTAL_DOMAINS=signage.com`: the team works at
  `admin.signage.com`, Freshbites at `freshbites.signage.com`. Brand pages
  opened on the console's address are sent on to the brand's (old links still
  arrive); the console 404s on a brand's; the console's sign-in turns brand
  accounts away with the address to use; emails to a brand's people link to the
  brand's address. Off unless configured, so `localhost:3000` is unchanged.
  Once split, the Render address redirects to the console's, except `/api`
  (#147); Render's health check is now `/api/health`.
- **Try it locally:** `APP_URL=http://admin.localhost:3000 BRAND_PORTAL_DOMAINS=localhost npm run dev`,
  then `http://admin.localhost:3000` and `http://freshbites.localhost:3000`.
- **To go live:** wildcard DNS `*.signage.com` and a wildcard custom domain on
  Render, then those two variables — `docs/DEPLOY.md` §3.
- Checks: **270 smoke**, **182 unit**, typecheck, lint.

## 29 Sep 2026: package readiness, and a real front page for the brand portal

- **Package readiness** (#141): a card on the franchisee's request page and the
  team's console reading what the request already holds — location details,
  photos per sign, sizes/TBD, approvals, landlord criteria — as done, to follow
  up, or with corporate. Never gates; hides once a quote is accepted.
- **The brand portal's signed-out page is a landing page** (#142):
  `freshbites.localhost:3000` (and `/freshbites` signed out) now explains the
  program before asking for a password. Still invitation-only, still no store
  data.
- **`/` asks where to sign in** (#144): Signage.com (`/sign-in`, now "Sign in
  to Signage.com") or a brand, which opens that brand's portal sign-in
  (`freshbites.localhost:3000/sign-in` in development). The dev server no
  longer logs Server Action arguments (passwords appeared in the log).
- **A store mid-setup shows its six stages on "My stores"** (#145), with the
  opening-date countdown and a button when the next move is the franchisee's.
- **Freshbites wears its own logo** (`public/brands/freshbites/logo.png`, the
  seed's `logo_url`); set on the live project's brand row on 1 Oct.
- Both ideas came from an outside concept page; what was deliberately not taken,
  and the zone grouping waiting on a yes, is #143.
- Checks: **270 smoke**, **172 unit**, typecheck, lint, green build.
- **Supabase accounts check:** 7.0 done (all 15 migrations on the live
  project), 7.1 step 1 done (your platform admin). Steps 7.1.2–7.4 remain, in a
  browser, per `docs/SUPABASE.md` §7. Note `RESEND_API_KEY` is set in
  `.env.local`, so invitations are really sent — to the Resend account's own
  address only while the shared test sender is used.

## 28 Sep 2026 (later): phase D is built — staff, brand portals, and corporate manages franchisees

**§9b phase D is done and demoable, and with it all four accounts phases.** A
store manager sees one store of two; the owner changes that from Store staff and
the manager sees the change on their next click; and `freshbites.localhost:3000`
serves the brand at its root with a branded sign-in.

- **Sign in as store staff:** `riley@freshbites-austin.com` /
  `staff-dev-password` (Riley Chen, Oak Plaza only). Staff order and answer
  change requests for their stores; they cannot accept quotes or set up a store.
- **Owners manage their staff** at `/freshbites/staff`, linked from their home:
  invite to named stores, change stores, deactivate, withdraw (#139).
- **Brand admins manage every franchisee's people** (#140), from a Franchisees
  section on the corporate People tab: register a new franchisee (the same §8d
  panel as the Dashboard's), then per company deactivate or reactivate owners
  and manage store staff with the owner's own screen. Asked for on 28 Sep, and
  what §10.2 already said. Two calls for your view: brand admins **can
  deactivate an owner** (§10.2 is silent), and **cannot add an owner** —
  owners arrive only by the welcome email.
- **Brand portals** (#138): `src/proxy.ts` serves `/{brand}/…` on
  `{brand}.<BRAND_PORTAL_DOMAINS>`; `/corporate` is the dashboard, the console
  404s there, path-based URLs keep working, and each brand's session is its own.
  In development `*.localhost` needs no setup.
- Checks: **253 smoke** (sections for store staff, franchisee people from
  corporate, and portals), **154 unit** (the portal routing among them), **57
  schema** (37 behavioural — weakening the owner's invitation read and the
  brand admin's company read each went red), typecheck, lint, green build.
  Decisions #138–140.

**Correction to the phase C note below:** the portals need **no Supabase
redirect URL** — Supabase never redirects to this app. What they need is
wildcard DNS and a wildcard custom domain on the host; `docs/DEPLOY.md` §3 now
has the section. Emails still link to the path-based addresses.

**Still not proven: the Supabase half of accounts** (phases A–D). Same
checklist, `docs/SUPABASE.md` §7. That, and a real Resend key, are now the two
things between this build and a pilot.

**Next:** with §9b finished, Sessions 7 and 8 are what remain, and both are
still blocked outside the code — Session 7 on the Design Studio answers from
Usman, Session 8 on the v13 flow demo, corporate template sign-off and a Stripe
account. Meanwhile the most valuable work is proving accounts against the live
Supabase project.

## 28 Sep 2026: phase C is built — corporate signs in, and approves from the dashboard

**§9b phase C, corporate in-app, is done and demoable:** a reviewer approves
an item from the dashboard, and that item's button in the approval email then
opens a page that says "Neon Leaf was already approved by Jordan Reyes from the
dashboard". The smoke suite drives exactly that.

- **Sign in as corporate:** brand admin `brand@freshbites.com` /
  `corporate-dev-password` (Morgan Ellis), reviewer `reviewer@freshbites.com` /
  `reviewer-dev-password` (Jordan Reyes). Both land on `/freshbites/corporate`.
- **The dashboard is behind sign-in** and decides: the Approvals tab uses the
  same cards as the email's page, and both routes call one decision function
  (`src/lib/review/decide.ts`), which records who decided and whether by link
  or by session (#128–130).
- **Brand admins manage their own people** on a People tab: invite and
  deactivate brand admins and reviewers. They also keep the §8d registration
  panel. Reviewers read, decide and export the budget sheet (#134–135).
- **`corporate_links` is retired** (#131–132): every link revoked, the RLS
  helper that honoured them answers nothing, the "email me a link" form and its
  email are deleted, and an old link lands on "Dashboard links have been
  replaced — sign in". The table stays read-only for one release.
- **Approval emails go to every reviewer account (§10.7 D4, #133)**, one link
  each; `reviewer_email` is the fallback and the SLA escalation address. In dev
  that means the approval email now goes to `reviewer@freshbites.com`.
- Checks: **214 smoke** (the corporate section rewritten; letting a franchisee
  through the dashboard guard was tried on purpose and went red), **143 unit**,
  **55 schema** (35 behavioural — a retired link still live in the table, and a
  weakened registrations policy, each went red), typecheck, lint, green build.
  Decisions #128–137.

**Still not proven: the Supabase half of accounts** (phases A–C). Same
checklist, `docs/SUPABASE.md` §7. On the live project, also invite the pilot's
corporate people: `npm run invite -- <email> --role brand_admin --brand freshbites`
(and `brand_reviewer`).

**Next: phase D — staff and brand portals** (§9b): `franchisee_staff` screens
with store assignment, owners inviting staff, and `{brand}.signage.com`
routing. Phase D's subdomains need wildcard DNS and a Supabase redirect URL
from outside the code; the staff half needs nothing.

## 26 Sep 2026: phase B is built — franchisees have accounts

**§9b phase B, franchisee accounts, is done and demoable:** corporate (or the
team) registers a franchisee; the welcome email's main button is now "Create
your account"; sign-up asks whether the lease is signed and goes to store setup
or to the level-1 view (budget number + "Set up your first store"); and
`/freshbites` is "My stores" — behind sign-in, scoped to the franchisee's own
company.

- **Sign in as the pilot franchisee:** `dana@freshbites-austin.com` /
  `franchisee-dev-password` (no second factor — franchisees are never forced).
  Dana's company, *Freshbites Austin*, owns Oak Plaza and Cedar Park.
- **Closed a real exposure (#119):** the brand home used to list every store,
  with every request's private link, to anyone who opened it. Signed out it now
  names no store at all.
- **Accepting a quote needs the signed-in owner (#120, D1).** The request link
  still opens the page, answers change requests and downloads documents; it
  shows "Sign in to accept" instead of the button.
- **Existing stores get owners by `npm run backfill-owners`** — a dry run that
  prints the inferred owners; `-- --apply` does it (#125).
- Checks: **206 smoke** (13 new; the store-scope and accept-quote guards were
  broken on purpose and went red), **141 unit**, **52 schema** (32
  behavioural — the new policies are tested as each person, through SELECTs),
  typecheck, lint, green build. Decisions #119–127.

**Still not proven: the Supabase half of accounts** (phases A and B). Same
checklist, `docs/SUPABASE.md` §7; on the live project also run
`npm run backfill-owners` to give the already-seeded stores their owner.

*(Phase C followed on 28 Sep — see above.)*

## 25 Sep 2026 (later): phase A is built — everyone signs in with a password

**§9b phase A, the identity core, is done and demoable:** a Signage.com admin
invites a colleague from `/admin/team`; the colleague opens the emailed link,
creates their account with a password, sets up an authenticator app, and lands
on the console; signs out and back in with password + code; and is locked out
on their very next click when deactivated. Forgot-password works end to end.

- **Sign in:** http://localhost:3000/sign-in (and `/admin` sends you there) as
  `team@signage.com` / `signage-dev-password`. The two-factor page shows the
  current code **in dev only**; under Supabase it comes from the person's app.
- **The allowlist is gone.** `team_members` grants nothing; the team is a
  `platform_admin` membership. The magic-link sign-in and `/auth/callback` are
  removed. First admin on a real project: `npm run invite -- you@signage.com`.
- **The whole §10 schema is in** (migration `20260925090000_accounts.sql`), and
  the two helpers phases B–D will write policies against — `app.brand_role()`
  and `app.can_see_location()` — are tested for every role.
- **The dev database now applies new migrations** instead of skipping them when
  a schema exists (#118), and seeds the dev admin on every start.
- Checks: **193 smoke** (19 new; the two-factor and deactivation guards were
  each broken on purpose and went red), **141 unit** (RFC 6238 vectors among
  them), **48 schema** (29 behavioural), typecheck, lint, green build.
- Decisions #109–118 in `docs/DECISIONS.md`. #116 is a departure from §10.6
  worth your view: the old sign-in does NOT keep working during a transition.

**Not yet proven: the Supabase half of all this.** Account creation, password
sign-in, TOTP enrolment and challenge through Supabase Auth are written against
the documented API and have not run against the live project. `docs/SUPABASE.md`
§7 is rewritten as the checklist, and `docs/DEPLOY.md` §3 lists the four
Supabase Auth settings it needs (sign-ups OFF, TOTP on, min length 10, service
key).

*(Phase B followed on 26 Sep — see above.)*

## 25 Sep 2026: spec v2.3 — accounts — approved

**Direction change, approved 25 Sep:** logins. `docs/SPEC.md` is now **v2.3**
and §10 is rewritten: email-and-password accounts for everyone but vendors,
created only by invitation (Signage.com → brand admins → franchisees → store
staff; the invite link is the sign-up, and a franchisee continues into store
setup), five roles scoped by brand and by store, the §8d welcome email carrying
the franchisee's invitation, reviewers keeping their one-click email buttons,
and `{brand}.signage.com` addresses. The eight decisions are settled in §10.7,
all at the recommended defaults. CLAUDE.md is updated to match.

**Also built:** the root page is now a front door (one card per participant,
naming their way in; still no tokens on it), and `/admin/demo` is a walkthrough:
the flow demo's persona switcher over the real app, with four tabs framing the
live franchisee, team, reviewer-email and corporate views of one request. Team
allowlist; 174 smoke checks. The Render blueprint (`render.yaml`,
`docs/DEPLOY.md`) and `/admin/entry-points` landed on 28 Aug after the entry
below was written.

---

Last updated: 28 Aug 2026. **There is a Supabase project, and the schema, the
seed and the policies have all now run against it.**

Project `mvpiaounwuzwtvxpvhcz`, ap-northeast-1, Postgres 17.6. Steps 3, 4, 5 and
6 of `docs/SUPABASE.md` are done and step 7 is one click from done. **Standing
the project up found three bugs, all of them in code that had been written,
reviewed and never executed** — which is the whole argument for having done it:

- **A portability bug the local harness could not have caught.** Supabase keeps
  pgcrypto in an `extensions` schema; the dev database keeps it in `public`. So
  `app.corporate_brand()`, which pins `search_path` as a security-definer
  function should, resolved `digest()` locally and failed on Supabase. Migration
  11 was the only one affected and now names both schemas. **`npm run db:verify`
  was green throughout** — the harness models the roles faithfully and the
  extension layout not at all.
- **A broken bucket read as a franchisee who uploaded nothing.** `isNotFound()`
  matched `/not found/i` anywhere in the message — and Supabase answers a wrong
  key with **"Bucket not found"**, because a caller who cannot authenticate
  cannot see the bucket. So a misconfigured deployment returned `null`, which
  `/api/files` turns into a 404: exactly the confusion the layer exists to
  prevent, and exactly what its tests claimed to pin. They pinned an invented
  error shape (`Invalid JWT`, status 401); the real one is `Bucket not found`,
  status 400, statusCode "404" — identical to the absent-object case in
  everything but the message. Now `isMissingObject()`, tests rewritten against
  the observed shapes and confirmed to go red without the fix.
- **The magic link could never have signed anyone in.** There was no route
  handler to exchange the credential for a session — `supabaseEmail()`'s comment
  refers to one ("Refresh happens in the route handler that completes the magic
  link") that did not exist, and the link pointed at `/admin`, which cannot write
  a cookie. Added `src/app/auth/callback/route.ts`, accepting both the PKCE
  (`code`) and token-hash link shapes. **`signOut()` was also dev-only**: it
  deleted the dev cookie and left the Supabase session intact, so Sign out did
  nothing at all under the provider it mattered for.

- **The policies hold through real PostgREST**, which is what was actually owed
  since Session 6a. A franchisee's `x-access-token` returns their one request and
  nothing without it; a corporate link reads its brand's whole program and is
  refused every write — checked by UPDATE, INSERT and DELETE, and confirmed by
  reading the rows back afterwards rather than trusting a `204`.
- **Storage round-trips through the running app**: a file in the private bucket
  is served by `/api/files`, byte-identical, and an absent path is a 404 rather
  than a 500.

**`.env.local` rests in PGlite mode, and that is where it was left.** Four lines
turn Supabase mode on — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`DATABASE_URL` and `SUPABASE_STORAGE_BUCKET` — and they go together, or the app
reads one database while storing files against another. In that mode **`npm run
smoke` cannot run at all**: it signs in through the dev picker's `<select>`,
which the Supabase login page does not render. The file says so at each of them.

**The suite has been run against these changes**, in PGlite mode, after they were
made: 167 smoke checks, 123 unit tests, 39 schema checks, typecheck, lint. The
storage and auth fixes both touch paths the smoke suite drives, so this is the
check that matters and not a formality.

**Step 7 is done, bar one branch.** Nine checks pass in a single run against the
live project: the link completes at `/auth/callback`, a session cookie is
written, `/admin` renders the queue, **deactivating the `team_members` row locks
the caller out on the very next request**, reactivating lets them back in, Sign
out leaves no session cookie and `/admin` then redirects, and a bogus link is
refused with a message that says why. The deactivation check is the half of SPEC
§10 that actually decides access, and it had never executed before today.

The unproven remainder is the **PKCE (`?code=`) branch** of the callback. Those
checks drove the token-hash branch, which can be reconstructed from the database;
a real emailed link uses PKCE, and reproducing one needs a fresh `signInWithOtp`
in a live browser, which Supabase's built-in mailer rate-limited. The flow is
confirmed to be PKCE — the verifier cookies appear — but confirmed is not
executed. One click from a real inbox settles it. DECISIONS #107.

**A magic link only works in the browser that asked for it** (#108) — PKCE keeps
the verifier in a cookie. Fine for an operator console; a support question when
someone opens the mail on their phone. `sendMagicLink`'s header says so, and
names the remedy if it is ever wanted.

Previously: 25 Aug 2026. **Session 6 is complete, and the RLS gap is closed.**
Every interface SPEC §9 lists for MVP now exists except Design Studio (Session 7,
still blocked on the integration decisions) and the DID generator (Session 8,
still blocked on the v13 flow demo). All five participants can be demonstrated
end to end.

**The policies are now tested as behaviour, not just as valid SQL.** That had
been recorded as the largest untested assumption in the build since Session 1,
on the understanding that testing it needed Docker or a Supabase project. It
did not — PGlite has real roles, and RLS is enforced against any role that does
not own the table. `npm run db:verify` now runs 20 behavioural checks as `anon`
and `authenticated` (DECISIONS #84–89).

**The outbox is behind the allowlist**, not an environment flag — it renders
whole emails, and those emails carry live approval links (#97).

**And the Supabase path is now runnable rather than described.** The Storage
driver is written, `npm run migrate` applies the schema to a real Postgres (the
one thing no path could do before), and `docs/SUPABASE.md` turns the four
written-and-never-run items into a 30-minute checklist with the exact commands
(#90–96).

## Session 6 — the corporate dashboard, and a hardening pass

**The dashboard** (SPEC §9 interface 6) lives at `/{brand_slug}/corporate/{token}`,
opened by a magic link a franchisor asks for at `/{brand_slug}/corporate`. Only
an address already configured on the brand — its reviewer, secondary reviewer or
corporate contact — can be issued one, and the form says the same sentence
whether or not the address is on file, so it cannot be used to enumerate a
franchisor's staff.

It shows the demo's five metrics, the brand's vendor policy stated back to them,
the approval-alert banner, and one card per location comparing installed signs
against the length of the brand's own standard package. **Program spend is read
per package and means committed** — what someone has accepted. What is quoted
and not yet accepted is named separately rather than folded in, because they are
different claims (DECISIONS #77).

**The approvals tab shows everything and decides nothing.** A 30-day multi-use
bookmark must not be able to approve signage, so decisions stay in the signed,
single-use, 7-day links the approval email carries. The tab renders the same
detail the reviewer's own page renders and offers one action — send that email
again, to the address already on the brand (#75). The rule is enforced in the
database, not just in the UI: `verify-schema` reads `pg_policy` and fails if any
policy scoped by `app.corporate_brand()` is anything but SELECT.

**The §8b budget export and the §8d registration panel** now have the actor SPEC
names for them. Registering from the dashboard writes `registered_by =
'corporate'`, which is what #61 was waiting for. Both stay on `/admin` as well —
Signage.com operates this portal white-glove and every one of these is something
a franchisor phones about (#76).

**The hardening pass**, and two things it turned up:

- `error.tsx`, `global-error.tsx` and `not-found.tsx` now exist. Every 404 in
  this build means one thing — a token did not resolve — and the page says so
  rather than "check the address", which nobody can act on when the URL came
  from an email.
- **`loading.tsx` costs the 404.** A segment with one streams, and a streamed
  `notFound()` answers 200. Only `/admin` has a skeleton, because it is the only
  screen that never 404s (#79).
- **`npm run build` had never succeeded on this machine.** Next prerendered
  `/admin`, and `authProvider()` correctly refuses to run in production with no
  Supabase project. An authenticated console has no meaningful build-time
  render: `/admin` and `/dev` are now `force-dynamic`, and the build is green
  (#80).
- **`NotifyOutcome.sent` meant "the provider delivered it"**, which is false for
  every message this build has ever sent. Nothing had ever read it, so it had
  never been wrong out loud — the dashboard's re-send button was the first
  caller, and it told a franchisor the email had failed while the email sat in
  the outbox. `welcome.tsx` had already settled the convention (#62); notify and
  franchisee now agree with it (#81).

**`docs/QA.md` is new**: the demo storyline as a 25-minute manual pass, all five
participants, both tails, every document. `npm run smoke` proves most of it
automatically and sees none of the layout, copy or timing, which is what the
manual pass is for.

165 smoke checks, 113 unit tests, 19 schema checks, typecheck, lint, and a green
production build.

## Next: Session 7 or 8, both still gated

Neither can start on what is in the repo today:

- **Session 7 — Design Studio integration.** Needs the five requirements in SPEC
  §8 confirmed with Usman, and `docs/design-studio-findings.md` lists eight
  contradictions against the spec that need answers first. Until then mockups
  stay manual: `mockup_file_id` is written when the team uploads one, and the
  generic `render_key` thumbnail is the fallback everywhere.
- **Session 8 — the DID generator.** Needs the **v13 flow demo** in the repo
  (the file on disk is v12 and has no DID screens), corporate template sign-off,
  and a Stripe account. Any DID UX built before the demo lands is a guess.

**What could be done meanwhile**, in rough order of value:

1. ~~**A Supabase project.**~~ **Stood up on 28 Aug** — see the top of this file.
   The seed and PostgREST halves are done; what remains of it is the three steps
   that need the app itself pointed at Supabase: the Storage round-trip (step 4),
   the Auth path (step 7), and a real send (step 8). All three break
   `npm run smoke` while they are switched on, so they want to be done together,
   deliberately, and switched back.
2. **A real Resend key**, so that the mail path runs once against a provider
   rather than an outbox. Still outstanding, and now the only missing
   credential.
3. ~~**The `/dev` outbox's future.**~~ Answered in Session 6c: it earned its
   place and moved to `/admin/outbox`, behind the team allowlist (#97).

## The §6 amendment: fulfillment is package-level

DECISIONS #51 and #57 are answered and built. §4 has always been able to split
one request across recipients, but §6 offered the two tails only as
alternatives on a single request status — so a split request could be neither
accepted by the franchisee nor invoiced by Signage.com.

Fulfillment now belongs to the **quote package**, and the request status is a
rollup of its packages: **the request sits at the stage of its least advanced
package.** That is the pattern the spec already used one level up — approval is
item-level and the request status derives from it — so nothing new has to be
reconciled and there is no second status column.

- `quotes` gained `in_production_at`, `shipped_at`, `completed_at`, with five
  check constraints enforcing the order and one keeping production off the
  external tail. The stage is DERIVED from those dates, so it cannot disagree
  with the invoice, the receipt or the timeline, which are written from them.
- `transitionPackage` moves one package, writes its event, and lets the request
  follow — forwards only, guarded by `isFulfillmentAdvance`.
- `completed` still writes `installed_signs` and now writes only that package's
  items, so a split site's Signage.com signs land on the location record when
  Signage.com installs them.
- Both consoles became per-package: one action card per recipient on `/admin`,
  and an Accept button on the Signage.com card of the franchisee's status page.
- Every notification after routing carries that package's own numbers, and the
  install email stops claiming the site is finished when half of it is not.

The seeded split request (the pylon's `approved_vendor` override) is driven end
to end by the smoke suite: quote both halves, accept ours, **invoice ours while
theirs is still open**, install ours, and watch the location record grow by our
sign alone until the vendor finally reports in. DECISIONS #66–72.

## Session 5

- `7590170` — per-policy vendor contacts (answers DECISIONS #20) and the vendor
  quote-package email.
- `fd0867d` — **the franchisee notification set** (SPEC §9 interface 5), proven
  rather than just written: seven templates under
  `src/lib/email/templates/franchisee/` (submitted, changes-requested,
  review-decided, quote-ready, quote-accepted, shipped, installed) plus the
  shared `shell.tsx` and the dispatcher `src/lib/email/franchisee.tsx`, wired at
  all seven call sites.
- **The §8b budget one-pager** — the first of the lender documents, and the
  foundation the other three sit on: `src/lib/pdf/letterhead.tsx` is the shared
  Signage.com document shell, and `budget-one-pager.tsx` is the per-format
  signage number a franchisor hands a candidate before any site exists.
  Downloadable from `/admin` (see DECISIONS #44 for why it is gated there and
  not public).
- **The §8b budgetary quote** — the second lender document, and the first one a
  franchisee holds themselves: `src/lib/pdf/budgetary-quote.tsx`, downloaded
  from the tokenized status page at `/api/documents/quote/{token}` once a quote
  is priced. Built from `est_price_snapshot`, so it agrees with the quote email
  and the status page by construction rather than by recomputation.
- **The split-request accept bug**, found by the budgetary quote and fixed:
  `acceptQuote` picked its package with `order by created_at desc limit 1`, but
  routing inserts every package in one transaction and Postgres `now()` is
  transaction-start time — so the rows share a `created_at` and the franchisee's
  click landed on a package chosen by an arbitrary tie-break. It now takes the
  quote id from the card that was clicked. DECISIONS #50–51.

- **The §8b formal invoice and paid receipt** — the last two lender documents,
  in one component because a receipt is an invoice that has been paid:
  `src/lib/pdf/invoice.tsx`, issued from `/admin` once a quote is accepted and
  downloaded by the franchisee from their own status page. A new migration adds
  the invoice number, its date, and the payment record — no payment is
  processed; the team writes down what the bank statement says.

- **The §8d welcome email**, and with it level 1 of the two-level access model:
  `src/lib/email/templates/welcome.tsx`, sent the moment corporate registers a
  franchisee's email at agreement signing. Its payload is the two things that
  matter before there is a building — a signage number for the bank, and what
  happens when a site appears — and ordering is not merely hidden but absent.
  The link goes to `/{brand_slug}/welcome/{token}`, a level-1 landing page with
  the per-format budget figures and the one-pager behind each of them.
  Registration is performed from `/admin` (Registrations panel) until Session 6
  gives corporate a dashboard, and the same `registerFranchisee` serves both.

142 smoke checks, 113 unit tests, 17 schema checks, typecheck and lint — all green.

**§8d level 1 works end to end, and it is the first thing a franchisee sees.**
The welcome email's own destination in the spec is §8c's brand-email magic link,
which is Session 8 — so the registration carries a token of its own, on the same
convention as `requests.access_token`, and the DID appears as a described next
stage rather than a dead button. DECISIONS #58–65; #58 is a §8d amendment worth
making. The budget arithmetic moved to `src/lib/budget.ts` so the PDF, the email
and the page quote one number rather than three that agree today.

**§8b is complete: all four documents exist.** Budget one-pager (pre-site,
format-level), budgetary quote (site-specific, underwriting), formal invoice
(disbursement), paid receipt (proof). They share `letterhead.tsx`, and each one
is generated from data the portal already held.

**What the budgetary quote turned up.** The document covers a whole site, but
the status page had only ever shown `quotes[0]` — so a request routed two ways
(the seeded pylon override is exactly that case) showed the franchisee one
package's total while the PDF totalled both. The page now renders one card per
package, and the document names who is actually paid per section: Signage.com
issues the estimate, but an external package is invoiced to the franchisee by
the vendor directly, and a lender document that blurs that is wrong about the
one thing it exists to state. DECISIONS #46–49.

**What "proven" cost, and why it is worth knowing.** The set looked finished and
passed every check while sending almost nothing. Two reasons, both invisible
from the outside:

1. `add` and `replace` never captured a requester, so every request after the
   first had no `requester_email` — which `notifyFranchisee` correctly treats as
   "no recipient" and returns on. Fixed by carrying the contact forward from the
   location's most recent request (DECISIONS #41). The smoke suite now asserts
   the recipient **by address**, because "sent nothing" and "worked" were
   otherwise identical at every level.
2. The suite only ever drove the **external** tail. `deliverQuoteAction` and the
   `shipped` milestone were never called by anything, so `franchisee_quote_ready`
   and `franchisee_shipped` had no coverage at all. There is now a section that
   drives the **internal** tail end to end — a request holding only the Neon
   Leaf, the one add-on with no vendor override, routes to a single internal
   package — and asserts all seven notification kinds fire, that each is
   addressed to the requester, and that none of them carries a reviewer link.

Also fixed while there: a crashed smoke run used to poison the next one. The
opening cleanup was meant to cover that but could only name codes from its own
process, so an abandoned request that reached `completed` left Oak Plaza a sixth
installed sign and the next run failed on an assertion about a state the app had
produced correctly. The run now mirrors its codes to
`scripts/.smoke-leftovers.json` (gitignored) and clears the file only on a clean
finish.

## Session 5's handover note (kept for the trail)

Session 5 ended by naming Session 6 as next and nothing as blocking it, which
held. The one operational warning it left is still true of any stale checkout:
**the dev server skips migrations when a schema is already present**, so an
existing `.pglite/` will not have the newer tables. `npm run dev:db:reset`.

---

Previous update: 17 Aug 2026, end of Session 4.

Read this first when picking the work back up. `docs/SPEC.md` is still the
contract and `claude-code-sessions.md` is still the plan — this file only says
what is done, what runs, and what is next.

---

## Running it

```bash
npm install          # once
npm run dev          # starts the dev database AND the web server
```

| Surface | URL | Who |
|---|---|---|
| Franchisee | http://localhost:3000/freshbites | `dana@freshbites-austin.com` / `franchisee-dev-password`; request links still open one request |
| Store staff | http://localhost:3000/freshbites | `riley@freshbites-austin.com` / `staff-dev-password` — Oak Plaza only |
| Brand portal | http://freshbites.localhost:3000 | any Freshbites account; the brand at its own address |
| Signage.com team | http://localhost:3000/sign-in | `team@signage.com` / `signage-dev-password` + code |
| Corporate reviewer | from a link in the approval email, or the dashboard | `reviewer@freshbites.com` / `reviewer-dev-password` |
| Corporate dashboard | http://localhost:3000/freshbites/corporate | `brand@freshbites.com` / `corporate-dev-password` (brand admin) |
| Outbox | http://localhost:3000/admin/outbox | what was (or would have been) emailed; team sign-in |

Sign in as `team@signage.com` / `signage-dev-password`, then the six-digit
code the two-factor page shows. With no Supabase project the dev identity
provider holds real passwords and TOTP secrets in a `dev_auth` schema in the
local database; the code is displayed only because this is dev (DECISIONS #112).

| Command | What it does |
|---|---|
| `npm run dev` | dev database (port 5433) + Next (port 3000), together |
| `npm run dev:db` / `npm run dev:web` | either half on its own |
| `npm run dev:db:reset` | wipe `.pglite/` and re-seed from scratch |
| `npm run smoke` | drive the real flows in a browser — 253 checks (needs `npm run dev` up, and Supabase mode OFF) |
| `npm run shots` | screenshots of every role's main screens at 1920, 1280 and 390px into `shots/`; fails if any page scrolls sideways (needs `npm run dev` up; read-only) |
| `npm run format -- <files>` | format the files you touched in the house style (`.prettierrc.json`); the codebase is not reformatted wholesale |
| `npm run sla` | run the review-SLA timer once (also at `/api/cron/review-sla`) |
| `npm test` | 154 unit tests — the §6 machine and the package rollup, the seed pins, the §8b totals, the §8d welcome copy, the Storage driver's failure shapes |
| `npm run db:verify` | apply all migrations to a throwaway Postgres — 57 checks in three phases: shape, storyline, and **RLS behaviour** as the anon and authenticated roles |
| `npm run build` | production build — green as of Session 6, and worth keeping that way |
| `npm run migrate` | apply `supabase/migrations` to `DATABASE_URL` — `--dry-run` to look, `--baseline` for a database that already has the schema |
| `npm run seed` | seed a real target; set `DATABASE_URL` first |
| `npm run invite -- <email>` | mint an invitation and print its link — how the first admin exists on a new project (`--role`, `--brand` for others) |
| `npm run backfill-owners` | infer an owner for every unowned store and print the plan; `-- --apply` makes the companies and prints their accept links |

**There is no Docker on this machine**, so `supabase start` cannot run. Instead
PGlite (Postgres compiled to WASM) runs as its own process speaking the real
Postgres wire protocol, and the app connects with `pg`. Point `DATABASE_URL` at
a Supabase connection string and the identical SQL runs there.

**No mail is delivered.** With no `RESEND_API_KEY`, every message is rendered
and recorded in `sent_emails` instead of being sent, and `/admin/outbox` is how you read
it — including clicking the approval links a reviewer would click. Set the key
and the same code sends through Resend.

**The dev database serves one connection at a time.** The app's pool is capped
at one in dev and releases it after 500 ms idle, so a script can still connect
while `next dev` runs — but two clients at once get `ECONNRESET`. Anything that
talks SQL directly (the seed, the smoke test) should connect, work, disconnect,
and retry. If it starts refusing every connection, it has wedged — restart
`npm run dev:db`.

Uploaded files land in `.storage/` (gitignored) and are served from
`/api/files/…`. Setting `SUPABASE_STORAGE_BUCKET` makes the app refuse that path
on purpose — the Supabase driver is not written yet.

**`docs/QA.md` is the manual pass** — the demo storyline by hand, all five
participants, about 25 minutes. Run it before showing the product to anyone, and
after any change to status, routing or mail. It is the layout, copy and timing
that `npm run smoke` cannot see.

Also useful: the reference app at `reference/design-studio` (`npm run dev` inside
it, port 5173) serves `/demo` — the canonical v12 UX reference — and `/flow`.

---

## Done

**Session 0** — `docs/design-studio-findings.md`: what the retail Design Studio
can and cannot do, from its source, with eight flagged contradictions against
SPEC §8 and the question list for Usman. Plus `docs/FLOW.md` and `/flow`.

**Session 1** — Next.js 16 + TypeScript + Tailwind v4; the full SPEC §2–§5 schema
in five migrations including the §8b fields and §8c `did_requests`; the §10 RLS
policies; `src/lib/status/` as the single write path for request status; the seed
(taxonomy + Freshbites + Oak Plaza).

**Session 2 — the franchisee interface** (SPEC §9 interface 1), against the real
database: the co-branded home; the tokenized status page (per-item status,
prices, vendor chips, TBD and exception callouts, attached photos, quote card
with accept, production progress, timeline); the intent picker; the like-for-like
fast lane; add-signs; the four-step initial setup including the §8b financing
question and the lease sign exhibit; the change-request loop with real editing;
and real uploads behind `src/lib/storage/`.

**Session 3 — the team queue** (SPEC §9 interface 2) at **`/admin`**:

- Sign-in gated by the `team_members` allowlist, re-checked on every request.
- Queue bucketed by whose move it is (needs prep · with corporate · with
  franchisee · ready to route · in fulfillment · installed), with fast-lane
  badges and to-review / reopened / TBD rollups.
- Detail view with the whole action chain, showing only what is legal now:
  prepare package (with the §8b landlord criteria check), route for quote,
  manual pricing for standin items, per-item mockup upload, deliver quote,
  production → shipped → installed, and manual `landlord_approval` logging plus
  free-text notes.
- Both tails: internal drives production in-portal; external logs the vendor
  quote and the order placed with them, then the install.
- `Mark installed` performs the `installed_signs` writeback — replacements update
  the row they replace rather than duplicating it.

**Session 4 — the approval email and the reviewer's links** (SPEC §9 interface 3):

- The approval email, co-branded, leading with how many items are proceeding
  WITHOUT corporate and then one card per pending item — spec, origin, vendor,
  price, mockup, exception text, TBD note — with Approve / Request changes /
  Decline per item.
- Those buttons are signed links to `/review/{token}`: hashed in the database,
  expiring after 7 days, revoked the moment the package version changes, and
  retired once nothing is pending. Opening one decides nothing — mail scanners
  follow links, so the decision happens on the page.
- The re-review email on resubmission, which mints a new link and kills the old
  one.
- The SLA timer: `npm run sla`, `/api/cron/review-sla` (Bearer `CRON_SECRET`),
  and a daily Vercel cron. `remind` re-asks, `escalate` writes to the secondary
  reviewer or corporate, `auto_forward` records the brand's policy and tells the
  team to confirm — **nothing is ever approved by a clock**.
- `/dev` became the outbox: every message the system sent or would have sent.
  The reviewer stand-in that lived there is deleted — the real links replaced it.
  The outbox itself stays useful once mail is live ("what exactly did we send
  them"), but it is still guarded and still unauthenticated: keep it only if it
  earns its place, and put it behind `/admin` if it does.

---

**Session 5 — the outbound mail, the lender documents, and level 1**
(SPEC §9 interface 5, §8b, §8d):

- Per-policy vendor contacts (`brand_vendor_contacts`), which answers DECISIONS
  #20 — the pylon's `approved_vendor` override now has an address of its own
  instead of falling back to the brand's only vendor.
- The vendor quote-package email: one per recipient, carrying no credential of
  either kind, corporate CC'd per policy.
- The seven franchisee notifications, driven end to end on both tails.
- The four §8b lender documents: budget one-pager, budgetary quote, formal
  invoice, paid receipt.
- The §8d welcome email and the level-1 landing page it opens.
- The §6 amendment (spec v2.2): package-level fulfillment, and with it the
  split-request acceptance and invoice that DECISIONS #51/#57 had blocked.

**Session 6 — the corporate dashboard, and the hardening pass**
(SPEC §9 interface 6, §10):

- `corporate_links`: a brand-scoped, 30-day, multi-use, hashed credential, and
  `app.corporate_brand()` beside it in RLS. Read-only by construction, and
  asserted so against `pg_policy`.
- The magic-link request page, which recognises the brand's configured contacts
  and cannot be used to discover who they are.
- The dashboard itself: metrics, vendor policy, approval banner, per-location
  completeness cards; the approvals view that decides nothing; the §8b budget
  export and the §8d registration panel in corporate's own hands.
- `error.tsx`, `global-error.tsx`, `not-found.tsx`, and one `loading.tsx`.
- `docs/QA.md`, and a production build that succeeds for the first time.

**Session 6a — the RLS behaviour tests** (SPEC §10):

- `scripts/pglite-harness.ts`, extracted so two suites can each have their own
  throwaway database from the same migrations.
- `scripts/rls-behaviour.ts`: 20 checks as `anon` and `authenticated` against a
  two-brand fixture, covering the franchisee token, the corporate link, and the
  team allowlist. Proven to go red by deliberately weakening two policies.
- A schema check that had been passing while the policy it guarded was wide
  open, found by exactly that exercise and tightened (#87).

**Session 6b — the Supabase path** (SPEC §5.5, §10):

- The Supabase Storage driver, private bucket, service role, reads still through
  `/api/files`. Nine tests against a stubbed bucket pin the three failures that
  would otherwise be silent, and were checked by breaking the error mapping.
- `scripts/migrate.ts` and `npm run migrate`: a ledger table, one transaction per
  file, and a refusal to guess at a database whose schema arrived another way.
  Tested against a bare Postgres carrying only what Supabase supplies — 11
  applied, re-run clean, `npm run seed` then ran against it.
- `docs/SUPABASE.md`: the runbook for the four things written and never run.

**Session 6c — the outbox** (SPEC §10):

- `/dev` → `/admin/outbox`, behind the team allowlist rather than an environment
  flag. It renders whole emails, and those emails carry live credentials; the
  flag would have published all of them to anyone who set it in production
  (#97). Linked from the admin header, and two smoke checks on the gate.

---

## Owed, and worth clearing early

- **~~No behavioural RLS tests.~~ Closed.** `scripts/rls-behaviour.ts` runs 20
  checks as the `anon` and `authenticated` roles against a two-brand fixture:
  a franchisee's token reaches their own request and nothing else, a corporate
  link reaches one brand's program and cannot write to any of it, expired and
  revoked links open nothing, and a deactivated team member is locked out at
  once. Both policies were deliberately weakened to confirm the suite goes red
  (#86). What was still missing was **GoTrue and PostgREST themselves**.
  **PostgREST is now done** (28 Aug): the token pair and the corporate-link pair
  both ran against the live project, and the read-only claim was tested by
  attempting the writes rather than by reading the policy. One check passed for
  the wrong reason first — PostgREST rejects an UPDATE with no `WHERE` before
  RLS is ever consulted, so it had to be re-run with a filter to make the
  database be the thing that refused. **GoTrue is still untested**; it is step 7.
- **No mail has ever actually been sent.** The Resend path in
  `src/lib/email/send.ts` is written and unexercised; everything so far has gone
  to the outbox. The templates, links, triggers and SLA around it are exercised
  by the smoke suite.
- **The Supabase Auth path has never run.** `/admin` authenticates through a dev
  cookie here; the magic-link send and session read in `src/lib/auth/team.ts` are
  written against an API nothing on this machine has called. The allowlist half —
  the part that actually decides access — is exercised by the smoke suite.
- **~~The seed has never run against Supabase.~~ Closed** (28 Aug). `npm run
  migrate` applied all eleven migrations to the real project and `npm run seed
  -- --with-demo-requests` filled it: 77 catalog rows, 10 brand items, 2
  locations, REQ-0016…19. Owed since Session 1.
- **~~The Supabase Storage driver is unwritten.~~ Written, and unexercised
  against a real bucket.** Its logic is covered by nine tests against a stub;
  what no test can cover here is whether the bucket exists and the key works.
  The private `request-files` bucket **now exists** (28 Aug, `public: false`) and
  the secret key lists it, so what is left of step 4 is the round-trip: upload a
  site photo through the franchisee flow and open it from the status page.
  `SUPABASE_STORAGE_BUCKET` is deliberately still empty in `.env.local` — setting
  it makes the app refuse local disk with no fallback.
- **`src/lib/supabase/clients.ts` and `src/lib/env.ts` are still unused.** The
  Storage driver deliberately did not adopt them: `serverEnv()` validates the
  whole configuration at once, and storing a file must not require a Resend key
  (#93). They stay written-for-later.

All four are now steps in `docs/SUPABASE.md` rather than paragraphs here.

## Decisions waiting on you

In `docs/DECISIONS.md`, none blocking:

1. ~~Should SPEC §6 gain a terminal request-level `declined`?~~ **Answered and
   built** (#162, 1 Oct): yes, `needs_review → declined`.
2. ~~SPEC §5.4 should gain `changes_requested`.~~ **Written into spec v2.5**
   (1 Oct), with the other Session 1 schema divergences (#2–#5, #7).
3. Session 2's calls (entries 14–19): submission stopping at `submitted`, the
   structured address, optional sizing on add-ons, the note-on-timeline when no
   lease exhibit is provided, resolving the change request on resubmission, and
   storing uploads before the request exists.
4. ~~Entry 20 — per-policy vendor contacts.~~ **Answered and built** (entry 34):
   `brand_vendor_contacts`, one row per (brand, policy). Nothing already
   configured had to move. §3.1 now says so (spec v2.5).
5. Session 3's calls (entries 23–26), chiefly the split between swappable
   identity and fixed authorization in `/admin`.
6. Session 4's calls (entries 27–33), chiefly: **one link per email rather than
   per button** (a per-click link would break the other buttons in the same
   message), and **`auto_forward` never approving anything** — SPEC §3.1 offers
   it as a policy, and a timer that approves signage puts words in a
   franchisor's mouth.
7. Session 5's calls (entries 34–41), chiefly: **one `review_decided` email per
   review rather than the per-item pair SPEC §9 lists** — a reviewer decides a
   package in one sitting and a decline arrives buried if it is one of five
   messages; and **`in_production` sending nothing**, because the accept email
   already said production had started.

8. Session 5a's §6 amendment (entries 66–72). Built, not merely proposed:
   `docs/SPEC.md` is now **v2.2** and §6/§4 read accordingly. Worth your review
   as the contract change it is, chiefly **#66 — fulfillment is package-level
   and the request status is a rollup** — and **#68**, which drops the
   request-level tail check because a tail belongs to a package.
9. Session 5's §8d calls (entries 58–65), chiefly **#58: the welcome email
   carries a registration token, not the §8c magic link SPEC §8d names** —
   because that link authorizes DID generation and is Session 8. §8d should be
   amended to separate "how a franchisee reaches their page" from "what
   authorizes a DID"; the two are one sentence in v2.1 and they are not the same
   thing.

10. Session 6's calls (entries 73–83), chiefly two worth your explicit view:
    **#75 — the corporate dashboard shows the approvals view and cannot decide
    from it.** The demo lets corporate approve from their own screen; the
    product keeps that in the emailed links, because a 30-day multi-use bookmark
    with approval power is not the credential SPEC §10 describes. If a
    franchisor asks to approve from the dashboard, that is a spec conversation
    about the credential, not a UI change.
    And **#76 — the §8b export and the §8d registration panel are duplicated
    onto the dashboard rather than moved off `/admin`**, because Signage.com
    operates the portal white-glove. #44 and #61 read like a promise to move
    them; this is the deliberate departure.

11. Session 6d's calls (entries 99–106), from standing the Supabase project up.
    Most are forced rather than chosen — a bug found is not a decision — but
    three are worth your explicit view:
    **#100/#101 — a bad key and a wrong bucket are indistinguishable at the
    Storage API**, and both now throw rather than reporting an absent file. The
    franchisee-facing consequence is that a misconfigured deployment shows an
    error where it used to show "no photo uploaded", which is the right way
    round but is a visible change in behaviour.
    **#102 — `/auth/callback` deliberately does not check the allowlist**, so
    that membership stays decided in exactly one place. Adding a second check
    there would look safer and would be the beginning of drift.
    And **#106 — local development rests on PGlite, not on the real project**,
    because Supabase mode disables the only regression suite the build has.

And unchanged from CLAUDE.md: the Design Studio integration path, the pilot
brand's real vendor policy, the stamp decision, the business model, the DID fee
amount, and the v13 flow demo (Session 8 stays blocked on it).

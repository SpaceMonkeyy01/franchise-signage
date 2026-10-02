# Signize Studio — what the source shows, and how to embed it

Read 2 Oct 2026 from `frontend.signize.ai-main (1)/` (the owner's copy of the
signize.ai frontend; gitignored, never imported, never committed). Companion to
SPEC v2.6 §8 and `docs/design-studio-findings.md` (the older reconnaissance of
`reference/design-studio/`).

## What the folder is

The whole **signize.ai customer portal**, not just the Studio: a React 18 + Vite
SPA with its own accounts (login, 2FA), dashboards, estimates, orders, usage
billing, user management, **API keys**, an **API documentation** page, and the
Studio (`/studio`, `/studio/logo`, `/studio/text`). Every Studio route sits
behind `ProtectedRoute` — a Signize login. Backend: `https://api.signize.ai`.

**No API key is in the folder.** The `sz_live_…` strings are placeholders in
the docs page. Keys are created by a signed-in Signize user at
signize.ai → API Keys; the plaintext is shown once; usage is **billed to that
user's company**.

## Three ways in, and which one fits

| | What it is | Verdict |
|---|---|---|
| **A. iframe the Studio** | Frame `signize.ai/studio` | **No.** Needs a Signize login inside the frame, has no embed mode (no `postMessage`, nothing returns a result to a host page — the `src/embed/` patch in `reference/design-studio` is not in this codebase), and brings Signize's whole UI and theme. |
| **B. The provided embed form** | `public/embed/sign-pricing-form.html` + `.schema.json`: a standalone form driven by a declarative schema | **As a reference only.** Its own comment says to template the key into the HTML for a public embed — that puts our billed key in every franchisee's browser. |
| **C. Our own Studio screen on the keyed API** | A Studio panel in the portal, in our theme, calling the v1 API **from our server** | **Recommended.** |

**Why C.** The theme is ours from the start (the owner wants it aligned
anyway). The key stays server-side, which SPEC v2.6 §8 already requires for
prices ("the server fetches the price itself"). The locked / adjustable rules
are ours to enforce. And the form is small and already described as data: the
schema lists every field, when it shows, and how it maps into the request, and
its option lists come from `GET https://api.signize.ai/api/get/default/data`,
which needs no auth.

## The keyed API (v1)

Base `https://api.signize.ai/api/v1`, `Authorization: Bearer sz_live_…`,
`multipart/form-data`.

- `POST /sign/pricing/mockup` — pricing and mockup together, or one of them
  with `mode=pricing | mockup | both`.
- `POST /sign/pricing/mockup/stream` — the same, as server-sent events.
- `POST /sign/pricing/mockup/batch` — several sign types from one logo.
- `POST /vendor/b2/pricing`, `/vendor/usa-workshop/pricing` — vendor pricing
  only, no mockup.

**Inputs:** `signImage` (the logo, ≤ 2 MB, required) · `signWidthOrHeight` +
`userInputDimension` (width | height) + `dimensionUnit` (inch | ft) ·
`signDepthOrThickness` · `mainCategory` / `secondaryCategory` /
`tertiaryCategory` / `finishedCategory` · `mountingType` · `sceneImage` (the
background: a storefront photo, ≤ 2 MB — "select the background") ·
`destinationCountry`.

**Output** (`calculation.data`): `signWidth` / `signHeight` / `signDepth`,
`mountingType`, `sideViewImage`, `materialsList`, **`totalCost`**, `tATDays`,
`quotationId`; plus `mockupImageUrl` (a URL on Signize's host). Which fields
an account sees is set per account by Signize.

**Limits and cost:** API calls per minute per key and per company; every usage
event is billed at a rate Signize sets.

## How it lines up with what we have

- **The catalog matches exactly.** All 77 rows of `docs/sign-taxonomy.tsv`
  (placement → category → sign type → variant) are leaves of Signize's category
  tree under the same names, so `master_catalog` maps straight onto the four
  category fields with no translation table. Signize has 12 more: metallic
  finishes (polished/brushed gold, bronze, silver) on Illuminated Dimensional
  Letters and Illuminated Channel Letters — the team can add them on
  `/admin/catalog`.
- **`totalCost` is Signize's cost, not our price.** Signize's own estimates
  add `margin_percent` on top of `cost`; Signage.com is the reseller and sets
  its margin (SPEC v2.6 §12 Q12). Our price = cost × our margin, computed on
  our server.
- **Mockups:** copy `mockupImageUrl` into our Storage and set
  `mockup_file_id` (§8: never hot-link the engine).

## The gap to raise with Signize

**The keyed API takes far fewer options than the Studio screen.** The Studio
form (and the session-only `/api/sign-pricing` it uses) has material, trim,
return colour, paint finish, UL, neon colour, lightbox type, raceway depth and
height, backer offset, cabinet depth, shape, size. The v1 API takes the four
categories, mounting type, one dimension and depth. So a brand admin could
lock a sign's type, finish, mounting and logo through v1, but not its trim or
return colour — those would be priced at Signize's defaults. Ask Signize to
accept the Studio's option fields on v1 (or confirm what v1 assumes for them).

## What we need before building

1. **A key**: a `sz_live_` key created at signize.ai → API Keys under
   Signage.com's company, held only in server env (`SIGNIZE_API_KEY`), never
   in a page.
2. **Option parity** on v1, above — or a decision to live without it.
3. **Response fields**: confirm our account sees `totalCost`, `tATDays`,
   `materialsList`.
4. **The margin policy** (SPEC v2.6 §12 Q12).
5. **Standin types**: try a pylon, monument, awning and wayfinding sign once the
   key exists — the catalog prices them by hand today because the old engine
   had no model; v1 may.

## Build shape (when the above lands)

- `src/lib/signize/` — a server-only client: `price(config)`, `mockup(config,
  scene)`, with the key from env, retries, and a cache keyed on the
  configuration (calls are billed; debounce what the screen asks for).
- Route handlers the Studio panel calls; they apply the margin and return our
  price, never Signize's cost.
- A Studio panel (client component) rendered from the option data and the
  brand item's `design_rules`: brand admins set and lock; franchisees adjust
  within limits (SPEC v2.6 §8).
- At submission the server re-prices and re-checks the rules (§8 point 4–5).
- Nothing blocks on Signize: when the API is down, listed prices and generic
  renders, as today.

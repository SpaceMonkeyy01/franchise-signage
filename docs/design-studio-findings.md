# Design Studio reconnaissance — findings

Session 0 output. Source of every claim: `reference/design-studio/` at the current
working tree. Nothing in `reference/` was modified while producing this.

Read alongside SPEC.md §8. The last section lists where §8's assumptions do not
match the code.

---

## 0. What the reference copy actually is

The Signize retail portal stripped to the Design Studio and the API calls it runs
on; the NestJS CRM backend (orders, estimates, companies, users, **pricing
margins**) was removed (`README.md:6-9`). One backend remains: the Laravel API at
`https://api.signize.ai/api` (`src/json/API.json`, resolved through
`src/json/apiConfig.js:15-19`, override via `VITE_BACKEND_API_URL`).

Two studio paths, both under `/studio` (`README.md:13-19`):
- `/studio/logo` — upload a logo, the API extracts letter geometry, configure
  type/size/mounting/finish, get price + photorealistic mockup.
- `/studio/text` — type text, rendered client-side on a fabric.js canvas, then
  priced and mocked up identically.

**An embed-mode patch already exists in this copy** (`src/embed/`, three files)
plus a small `src/studio-bridge/` used by the flow demo. Treat both as prototypes
proving feasibility, not as shipped Signize product — see §6.

---

## 1. What inputs does the configurator accept, and can they be preset?

**Stock: no URL parameters at all.** "Stock, the studio takes no URL parameters —
all input comes from Redux via UI interaction" (`README.md:59`). Selection state
is built by the user clicking Placement → Category → Type → Variant in
`src/components/reusable/GlobalSign.jsx`, which dispatches into
`store/Slices/GlobalSignTypeSlice.js` and `store/Slices/SignFormSlice.js`.

**With the embed patch: yes, via query params.** `src/embed/embedParams.js:10-17`
documents the contract, parsed at `:21-34`:

| param | meaning |
|---|---|
| `embed` | `1`/`true` → embed mode: no header, no lead capture, preview-only |
| `signTypeId` | taxonomy leaf id — the precise variant to lock (preferred) |
| `signType` | canonical **pricing** name, e.g. `Halo Lit Channel Letters` |
| `brandText` | wordmark to render, e.g. `Freshbites` |
| `ref` | opaque host token (line-item id), echoed back on every message |
| `origin` | host origin for postMessage targeting |

`locked` is derived (`embedParams.js:32`): embed **and** a type param present.

Preset works by replaying the exact dispatch sequence a human click-through would
produce, so downstream pricing/mockup calls see identical Redux state
(`src/embed/useEmbedBootstrap.js:34-85`). It resolves the taxonomy leaf via
`findSignTypePath` (`embedParams.js:60-79`), then sets mockup renderer + finish
(`:52-57`), indoor/outdoor `application` (`:59-65`), the four breadcrumb levels
(`:67-70`), and the canonical `sign_type` used by the pricing engine (`:72-81`).
If the requested type isn't in the taxonomy it emits `studio:error` with reason
`sign_type_not_found` rather than failing silently (`:37-45`).

**Size is NOT presettable.** No `size`/`height` param exists in the contract. The
size input is a form field inside `MainLayout.jsx`. SPEC.md §8.3 asks for a "size
preset (from installed record for replacements)" — that param does not exist yet.

**Logo is NOT presettable as an asset.** `brandText` is a *string*, and the
bridge draws it to a canvas as a wordmark PNG
(`src/studio-bridge/generateBrandMockup.js:24-45`, duplicated in
`generateBrandPrice.js:48-65`) with a hardcoded `#2E7D32` default and Inter 800.
The comment is explicit that this is a stand-in: "Swap this for the real
brands.logo_url asset once brands exist in Supabase"
(`generateBrandMockup.js:22-23`). SPEC.md §3.1 says the brand logo is "the asset
used for all Design Studio generations" — there is no param for it.

---

## 2. Is the lead-capture form skippable?

**Yes, in embed mode — and it is already wired.**

The lead capture is `src/components/reusable/DesignPrepModal.jsx`: a modal that
opens on the rising edge of the price calculation (i.e. the Submit click) asking
name / email / phone / project name (`:23-35` schema, `:65-81` the trigger), and
that **cannot be dismissed until the design is fully prepared** (`:85-87`,
`:130-131`). It writes to `SignForm.customerInfo` (`:92-96`).

`readEmbedParams()` is called at `:53` and the entire effect short-circuits at
`:69-70`:

```js
useEffect(() => {
  if (embed) return;
```

with the rationale already matching SPEC.md §8.1 ("the franchisee is already
identified by their request token", `:66-68`).

**But skipping the form does not solve identity.** Every studio API call needs an
`Authorization: Bearer` token from `localStorage` — which is why the login screen
survived the prune (`README.md:38-42`). `embed=1` removes the *marketing* form,
not the *auth* requirement. See §5 and §6.

---

## 3. How is price computed — is there a headless pricing call?

**Yes: `POST /sign-pricing`, and it is already called headlessly** by
`src/studio-bridge/generateBrandPrice.js:81-130`, entirely outside the studio UI.

Request (`:97-111`) is `multipart/form-data`:
- `sign_image` — the wordmark PNG File (`:95-98`)
- `sign_width_or_height`, `user_input_dimension: "height"`, `sign_height`,
  `sign_width: "0"`, `size: ""`, `mockupCreationType: "false"`
- `sign_type` — the **canonical pricing name**, resolved via
  `pricingSignTypeFor(masterId)` (`:87`)
- the attribute set in `DEFAULT_ATTRS` (`:34-46`): `mounting_type`, `material`,
  `ul_mandatory`, `paint_finish`, `neon_color`, `uv_printing_needed`,
  `sign_depth`, `raceway_depth`, `raceway_height`, `backer_offset`,
  `backboard_cabinet_depth`
- header `Authorization: Bearer <token>` (`:109`)

Response (`:113-124`) reads `res.data.calculation.data`, returning `totalCost`,
`tATDays`, `signWidth`, `signHeight`.

Standin rows short-circuit before any network call: `if (!pricingSignType) return
null` (`:88-89`), matching the spec's manual-pricing rule.

**The critical finding: `totalCost` is the Signize FULFILLMENT COST, not a
customer price.** `generateBrandPrice.js:3-12` states it outright, and that "the
old studio drew its margin from a per-company table that was deleted with the CRM
backend". The margin is therefore an explicit placeholder:

```js
// PLACEHOLDER — see note above.
export const DEFAULT_MARGIN_PCT = 45;                    // :23-24
export const priceFromCost = (cost, marginPct = DEFAULT_MARGIN_PCT) => ...  // :26-29
```

Cost is staff-only and is hidden in embed mode by construction
(`QuoteAndMockupsResult.jsx:110-111`; `FulfillmentCost.jsx:9`). `AttachToRequest`
sends only `priceFromCost(cost)` back to the host
(`src/embed/AttachToRequest.jsx:29-31`).

There is also `POST /signize/calculate` (price + image-to-text combined) and
`POST /get/image-to-text` (logo → letter geometry) — `README.md:29-31`.

---

## 4. What is the "preview" output, and can it be extracted?

**A base64 PNG data URL. Yes, fully extractable.**

`POST /generate-mockup` returns an image **blob**
(`generateBrandMockup.js:91-102`, `responseType: "blob"`), converted by
`blobToBase64` (`:104`) and returned as `{ base64, signType }` (`:105`). In the
studio's own Redux state this lands as `SignForm.created_background_mockup_URL`,
which is what `AttachToRequest` hands back (`AttachToRequest.jsx:24-26`).

The call takes a `LogoImage` file, a `sceneImage` file (picked by placement —
`scene-outdoor.jpg` vs `scene.png`, `renderKeyMap.js:94-95`), and a render spec
object (`generateBrandMockup.js:86-89`).

The render spec vocabulary is enumerated in `src/utils/getMockupTypes.js` (~21
styles: `halo-lit-channel`, `face-lit-channel`, `fabricated-non-lit`, `led-neon`,
…) with per-style fields like `mountingType`, `faceLitTrimStyle`,
`faceLitReturnColor`, `fabricatedFinish`, `xPercent`/`yPercent`, `signSize`,
`isLightingOn`. `README.md:46-48` names this as the vocabulary behind
`master_catalog.render_key`.

There is also `POST /generate-mockups/batch-stream` for all sign types at once
(`README.md:33`), used by the staff "View All Mockups and Quotes" grid
(`QuoteAndMockupsResult.jsx:57-90`).

Full `studio:attach` payload (`AttachToRequest.jsx:22-45`): `mockupImage` (data
URL), `price`, `tatDays`, and `spec` = `{ signType, studioSignType,
studioVariant, width, height, depth, mountingType }`. That is a direct match for
SPEC.md §8.4.

**Fallback assets exist too:** `public/mockups/` holds reference renders in four
mounting-type folders (`flush-stud`, `raceway`, `flat-aluminum-backer`,
`3d-aluminum-backer`), indexed by `src/json/SideViews.json` — kept as the
ready-made source for the spec's generic per-`render_key` fallback thumbnails
(`README.md:49-53`). Note the README says "84 reference renders"; the actual
count on disk is **60 files**. Minor, but the README is stale here, so verify
coverage per render_key before relying on it as the fallback set.

---

## 5. What would a minimal "franchise embed mode" require?

**The UI work is done and is small; the auth work is not started and is the real
cost.**

The existing patch is three new files and four call-site edits:

| file | change |
|---|---|
| `src/embed/embedParams.js` | new — param parsing, `postToHost`, taxonomy walk |
| `src/embed/useEmbedBootstrap.js` | new — replay the selection into Redux |
| `src/embed/AttachToRequest.jsx` | new — terminal action, structured data out |
| `src/pages/Studio.jsx:16-22, 40` | read params, bootstrap, suppress header |
| `src/components/.../MainLayout.jsx:70, 1198, 1207` | hide path selector; replace picker with a read-only "Brand spec — locked" line |
| `src/components/.../QuoteAndMockupsResult.jsx:41, 111, 115` | hide fulfillment cost in embed; render `AttachToRequest` |
| `src/components/reusable/DesignPrepModal.jsx:53, 69-70` | skip lead capture |

Messages out: `studio:ready` (`useEmbedBootstrap.js:88-92`), `studio:attach` /
`studio:cancel` (`AttachToRequest.jsx:22-47`), `studio:error`
(`useEmbedBootstrap.js:39-43`). `postToHost` never targets `"*"` — it resolves
`origin` param → referrer origin → same-origin (`embedParams.js:36-55`), so the
payload can't leak to an arbitrary host.

What is **not** solved:

1. **Auth.** `README.md:38-42` — every endpoint needs a Bearer token. The only
   mechanism present is `src/utils/devBackendAuth.js`, which logs in with a
   shared service account whose credentials come from `.env.development.local`
   (`VITE_DEV_BACKEND_EMAIL` / `_PASSWORD`, see `.env.example`). Vite inlines
   `VITE_*` at build time, so this is browser-visible and **cannot ship**. The
   file says so itself (`devBackendAuth.js:1-8`: "DEV-ONLY", "a production build
   never loads"). It also flags itself as "the pattern to reuse server-side"
   (`.env.example`, `README.md:41-42`).
2. **Where the patch lives.** It is in *our read-only reference copy*, not in the
   Signize product. Nothing at `signize.ai` currently honours `?embed=1`.
3. **Untested end-to-end.** No iframe integration exists anywhere in the tree —
   `grep` for `iframe`/`postMessage` in `src/pages/FranchiseDemo.jsx` returns
   nothing. The demo instead imports the bridge functions directly through vite
   aliases (`docs/flow-demo.jsx:13-15`, `vite.config.js:20-24`), i.e. same-process
   calls, not a real embed. The host-side listener has never been written.
4. **Size and logo-asset params** (§1) still missing.

---

## 6. Contradictions with SPEC.md §8 — flagged, not resolved

1. **§8 assumes the integration exists as product; it exists only as our local
   patch.** §8 is written as "confirm each with Usman before building". The code
   shows requirements 1, 2, 4 and 5 are *demonstrably feasible* — they are
   implemented — but they live in `reference/design-studio/src/embed/`, which
   CLAUDE.md marks read-only and which we must never import from. Someone at
   Signize has to merge this upstream and host it, or the portal has nothing to
   frame. **This is the single biggest open item.**

2. **§8's "DS prices are the quote source for direct-priced items" is not
   currently true.** The engine returns fulfillment cost; the margin table was
   deleted with the CRM (`generateBrandPrice.js:3-12`). `DEFAULT_MARGIN_PCT = 45`
   is an admitted placeholder, "not a real commercial policy" (`:11-12, :23-24`).
   Until a margin policy exists, there is no customer-facing number, and
   `brand_items.est_price` must stay the source of truth. Do not wire DS pricing
   into quotes in Session 7 without this decision.

3. **§8.1's "pass-through auth param" does not exist.** Embed mode suppresses the
   lead form but the Bearer requirement is untouched (§5.1 above). §8.1 conflates
   two different problems — skipping lead capture (solved) and authenticating the
   API calls (not solved).

4. **§8.2's "$100-deposit checkout" is not in this copy at all.** A grep for
   `deposit|checkout|Purchase|stripe` finds only comments
   (`QuoteAndMockupsResult.jsx:38, 114`, `AttachToRequest.jsx:7`,
   `SignFormSlice.js:92`). The retail checkout was pruned with the CRM. So
   "suppress the deposit" is a no-op *here*, but presumably still live in the
   real Signize retail app — confirm which codebase franchise mode branches from.

5. **§2.1 treats `render_key` as one field; there are two independent
   vocabularies.** `renderKeyMap.js:18-24` is explicit: the mockup engine's slug
   (`halo-lit-channel`) and the pricing engine's canonical name (`Halo Lit
   Channel Letters`) are "NOT interchangeable", and a row can have one without
   the other. `in_vinyl` renders but has no pricing model
   (`renderKeyMap.js:58-60`), so it mocks up *and* quotes manually. The spec's
   `render_key` + `pricing_type` columns can carry both — but the seed script
   must populate them independently, and `pricing_basis: standin` must be driven
   by *pricing* availability, not renderer availability.

6. **`in_plaque` pricing is an admitted approximation.** "A standoff-mounted
   plaque is not cut letters; 'Flat Cut Acrylic Letters' is merely the nearest
   priced model" (`renderKeyMap.js:61-63`). Flag before it reaches a franchisee
   estimate.

7. **Standin set from the code** (`renderKeyMap.js`, `null` entries): awnings
   (`out_awning`), pylons (`out_pylon`), monuments (`out_monument`), wayfinding
   (`out_way`), digital menus (`in_menu`) — plus `in_vinyl` as pricing-only
   standin. This is the concrete answer to SPEC.md §12 Q2's "which standin
   categories to promote".

8. **Attribute defaults are guesses.** `DEFAULT_ATTRS`
   (`generateBrandPrice.js:31-46`) is sourced from "first option of each list" of
   `GET /get/default/data`. For real use these must come from
   `brand_items.pinned_attributes`, and the mapping from our attribute names to
   the engine's form-field names is currently undocumented anywhere but this
   constant.

---

## 7. Recommendation

**Hybrid: iframe embed + postMessage for the interactive call sites, headless
server-side API calls for everything non-interactive.** Not deep-link, not
headless-only.

*Why not deep-link.* A top-level navigate-away with `return_url` cannot carry the
result back: the mockup is a base64 PNG data URL (§4), far past any practical URL
length. Deep-link also drops the franchisee out of the portal mid-flow, which the
demo's UX does not do.

*Why iframe for the three §8 call sites.* The whole contract already exists and
fits: params in, `studio:attach` out with mockup + price + spec (§1, §4), no size
limit on postMessage, targeted origin rather than `"*"` (`embedParams.js:36-46`),
and the picker genuinely locked to the brand spec
(`MainLayout.jsx:1198, 1207`) rather than merely hidden. The portal writes the
returned data URL to Supabase Storage and sets `line_items.mockup_file_id` — it
must never hot-link the engine (`AttachToRequest.jsx:24-26`).

*Why headless server-side for the rest.* Package-prep thumbnails, catalog card
renders, and estimate refreshes have no UI to embed. `generateBrandPrice.js` /
`generateBrandMockup.js` prove both endpoints work as plain authenticated HTTP
calls; ported to a Next.js route handler with the token held in a server-only env
var, this solves the auth problem the browser version cannot (§5.1) and keeps
`totalCost` server-side where it belongs. Do this in Session 7 regardless of what
Usman says about the iframe — it is the part we can build unilaterally.

*Sequencing.* Nothing above changes Sessions 1–6: `mockup_file_id` stays
nullable, `brand_items.est_price` stays the price source, and the generic
`render_key` SVG fallback (with `public/mockups/`'s 60 renders as the asset
source, `README.md:49-53`) covers every screen.

### What to ask Usman — the code cannot answer these

1. **Will the `src/embed/` patch be merged into the Signize studio, at what URL,
   and who owns it after that?** Without it, there is nothing to frame. Also:
   which codebase does franchise mode branch from — this stripped copy, or the
   full retail app that still has the deposit checkout?
2. **Auth, the blocker.** Can Signize issue either (a) a short-lived scoped token
   the portal passes through for a franchisee session (§8.1), or (b) a
   server-to-server API key for `/sign-pricing` and `/generate-mockup`? The dev
   service account is not shippable. If neither, the iframe must rely on
   Signize's own session and franchisees would need Signize accounts — which
   breaks the "no accounts" model in CLAUDE.md.
3. **Margin.** What converts `totalCost` into a customer-facing price, per brand
   or globally? Without an answer there is no quote number and §8's pricing
   requirement cannot be built (§6.2).
4. **CORS and `frame-ancestors`.** Will `api.signize.ai` accept our Vercel
   origin, and will the studio permit being framed by it?
5. **Size and logo params.** Can `size`/`heightInches` and a brand logo **asset
   URL** be added to the embed contract (§8.3)? Today only `brandText` exists and
   the logo is a canvas-drawn wordmark.
6. **Throughput.** Rate limits and latency on `/generate-mockup` when a
   package-prep run needs 5–10 renders at once — and is
   `/generate-mockups/batch-stream` usable server-side?
7. **Attribute mapping.** Is there a documented mapping from taxonomy attributes
   to the pricing form fields, or is `DEFAULT_ATTRS` (§6.8) all there is?
8. **Confirm `in_plaque`'s pricing approximation** (§6.6) and which standin
   categories (§6.7) get real pricing models, and when.

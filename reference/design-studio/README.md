# Design Studio — the engine behind Franchise by Signage

Reference copy for the **Franchise by Signage** build (see `../../CLAUDE.md`).
Never import from here directly; the portal wraps this, per spec §8.

This is the Signize retail portal stripped down to the Design Studio and the API
calls it runs on. The NestJS CRM backend (orders, estimates, companies, users,
pricing margins) and every UI surface built on it were removed — the franchise
portal owns those records in Supabase instead.

## What it does

Two studio paths, both under `/studio`:

- **Logo** (`/studio/logo`) — upload a logo, the API extracts letter geometry and
  dimensions, configure sign type / size / mounting / finish, get a price and a
  photorealistic mockup rendered onto a storefront scene.
- **Text** (`/studio/text`) — type text, pick font/colour/height, rendered
  client-side on a fabric.js canvas, then priced and mocked up the same way.

## The one backend

Everything runs on the Laravel API at `https://api.signize.ai/api`, whose source
is **not** in this repo. Base URL lives in `src/json/API.json`, resolved through
`src/json/apiConfig.js` (override with `VITE_BACKEND_API_URL`).

| Endpoint | Purpose | Called from |
|---|---|---|
| `POST /get/image-to-text` | logo → letter objects, dimensions, line detection | `store/action/ImageToTextAPIAction.js` |
| `POST /sign-pricing` | pricing engine | `store/action/FormAction.js` |
| `POST /signize/calculate` | combined price + image-to-text | `store/action/FormAction.js` |
| `POST /generate-mockup` | one rendered mockup (returns an image blob) | `store/action/createSingleMockup.js` |
| `POST /generate-mockups/batch-stream` | all sign types at once | `store/action/MockupAndQuotes.js` |
| `GET /get/all/categories` | sign taxonomy | `store/action/GlobalSignTypesAction.js` |
| `GET /get/default/data` | attribute options per sign type | `store/action/UserLoginAction.js` |
| `POST /login`, `/verify-2fa`, `GET /user` | auth | `store/action/UserLoginAction.js` |

**Every one of these needs an `Authorization: Bearer` token** from
`localStorage`, which is why the login screen survived the prune. For a headless
integration, see `src/utils/devBackendAuth.js` — it logs in once with a shared
service account and uses that token for studio API calls. That is the pattern to
reuse server-side rather than embedding this UI.

## Notes for the portal build

- `src/utils/getMockupTypes.js` enumerates the ~21 render styles the mockup
  engine accepts (`halo-lit-channel`, `face-lit-channel`, `led-neon`, …). This is
  the vocabulary behind `master_catalog.render_key` in the spec.
- `public/mockups/` holds 84 reference renders keyed by mounting type
  (flush-stud / raceway / flat-aluminum-backer / 3d-aluminum-backer), indexed by
  `src/json/SideViews.json`. Currently referenced only from commented-out code
  here, but kept as the ready-made source for the spec's generic per-`render_key`
  fallback thumbnails.
- **Embed mode** (`src/embed/`) is the patch that made this host-drivable:
  `?embed=1&signType=…&brandText=…&ref=…&origin=…` in, and
  `studio:ready | attach | cancel | error` back over postMessage. It suppresses
  the studio chrome, locks the sign-type picker to the brand spec, hides
  fulfilment cost, and swaps checkout for "Attach to request". Stock, the studio
  takes no URL parameters — all input comes from Redux via UI interaction.

## Running it

```bash
npm install
npm run dev     # needs .env.development.local for the service-account token
npm run build
```

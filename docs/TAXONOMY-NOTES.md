# sign-taxonomy.tsv — provenance and caveats

`sign-taxonomy.tsv` is the `master_catalog` seed for spec §2.1. It was
**generated**, not hand-authored: the original taxonomy sheet referenced by
CLAUDE.md was never in this repo, so the file was rebuilt from the live Signize
API on 2026-08-06.

Source: `GET https://api.signize.ai/api/get/all/categories` (nested tree) plus
`GET /get/default/data` (attribute matrices), both authenticated with the dev
service account. Regenerate by re-running those two endpoints and re-flattening.

## Shape

77 leaf rows — spec §2.1 estimated "~70". The API returns a 4-level tree that
maps 1:1 onto the spec's hierarchy:

```
Placement (2)  →  Category (5)  →  Sign Type (23)  →  Variant (77 leaves)
Indoor/Outdoor    Illuminated,      Halo Lit Channel   Polished Gold,
                  Freestanding, …   Letters, …         Brushed Bronze, …
```

Six leaves sit at depth 3 (a sign type with no variants); their `variant` column
is empty.

| Column | Notes |
|---|---|
| `placement` | `indoor` \| `outdoor` |
| `category` | 5 distinct |
| `sign_type` | 23 distinct |
| `variant` | empty for the 6 variant-less rows |
| `pricing_type` | the canonical pricing-engine name — the exact string `POST /sign-pricing` expects in `sign_type` |
| `pricing_basis` | `direct` (50) \| `standin` (27) — derived, see below |
| `render_key` | the mockup engine's slug for `POST /generate-mockup`; empty for 18 rows |
| `fabricated_finish` | engine finish token (e.g. `goldenMirror`) where the variant is a finish |
| `source_id` | upstream node id, for re-syncing |
| `active` | from `is_active` |

## How `pricing_basis` was derived

It is **not** a field the API returns — it is inferred, and this is the one
judgment call in the file.

31 leaves declare `Halo Lit Channel Letters` as their pricing model, including
pylons, monuments, awnings, vinyl graphics, wayfinding, flags and vehicle wraps.
Those are not halo-lit channel letters; they are borrowing that pricing model as
a placeholder. This matches the convention the flow demo already documents:
*"standin = halo-lit stand-in pricing (manual quote for pilot)"*.

The rule applied: a row priced as `Halo Lit Channel Letters` is `direct` only if
it is genuinely a halo/side-lit channel-letter row, otherwise `standin`. That
isolates exactly 4 genuine rows, leaving 27 stand-ins. Every other pricing model
is taken as `direct`.

**Confirm this with Signize before the seed is treated as authoritative** — it
determines which items quote automatically and which route to manual team
pricing (spec §8), and it is inferred from a naming coincidence, not a flag.

## `sign-attribute-options.json`

Spec §2.1's `attribute_options` jsonb. Keyed by `pricing_type` (21 models),
because that is how the API's `filtered_data` is keyed — storing it per pricing
model instead of per row avoids duplicating the matrix 77 times. Join on the
TSV's `pricing_type` column when seeding.

## Two things to check

1. **18 rows have no `render_key`** — digital displays, awnings, wayfinding,
   flags, vehicle wraps, wall murals, PVC/laminate flat-cut, vacuum-formed.
   These need the generic per-`render_key` fallback art, or no thumbnail.
2. **30 distinct `render_key` values here vs 21 in the studio's
   `getMockupTypes.js`** — the taxonomy references renderers the studio UI never
   exposes (`pylon-sign-single-or-double`, `monument-stone-base`,
   `wall-plaques-*`, `yard-sign`, `post-panel-sign-*`, `vinyl-graphics-*`). Worth
   asking whether the engine can actually render those; if so, several rows
   currently treated as mockup-less could get real renders.

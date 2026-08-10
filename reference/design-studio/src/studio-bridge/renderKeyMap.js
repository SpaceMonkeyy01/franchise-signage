// Demo master row  →  Signize mockup-engine render key.
//
// The flow demo carries its own condensed catalog (MASTER in
// docs/flow-demo.jsx) whose `render` field is a coarse shape
// hint (channel / letters / box / pylon / menu / window) used only to pick an
// SVG placeholder. The real engine takes a much more specific `signType` — the
// same vocabulary enumerated in src/utils/getMockupTypes.js.
//
// This table is the join between them, and it is the thing spec §2.1 calls
// `master_catalog.render_key`. When the seed script imports the real taxonomy,
// this is the column it needs to populate.
//
// `null` = the engine has no equivalent renderer. Those rows are exactly the
// spec's `pricing_basis: standin` items (awnings, pylons, monuments,
// wayfinding, digital menus) — they fall back to the demo's SVG placeholder and
// are quoted manually, which is the behaviour spec §8 already prescribes.

// TWO vocabularies, deliberately kept separate:
//   render.signType  — the mockup engine's slug   ("halo-lit-channel")
//   pricingSignType  — the pricing engine's name  ("Halo Lit Channel Letters")
// They are NOT interchangeable. The canonical pricing names come from
// GET /get/default/data → data.sign_type[].name (23 of them); the render slugs
// from src/utils/getMockupTypes.js. A row can have one without the other:
// in_vinyl renders but has no pricing model, so it mocks up AND quotes manually.
export const RENDER_KEY_BY_MASTER_ID = {
  // Outdoor · Building / Wall
  out_ch_prem: { signType: "face-lit-channel", faceLitTrimStyle: "trim", faceLitReturnColor: "logo-match", pricingSignType: "Premium Face Lit Channel Letters - Metallic Trim" },
  out_ch_std: { signType: "face-lit-channel", faceLitTrimStyle: "trim", faceLitReturnColor: "logo-match", pricingSignType: "Standard Face Lit Letters - Plastic Trim" },
  out_ch_halo: { signType: "halo-lit-channel", pricingSignType: "Halo Lit Channel Letters" },
  out_ch_fh: { signType: "face-and-halo-lit-channel", faceLitTrimStyle: "trim", faceLitReturnColor: "logo-match", pricingSignType: "Face & Halo Lit Channel Letters" },
  out_fab: { signType: "fabricated-non-lit", fabricatedFinish: "goldenMirror", pricingSignType: "Fabricated Channel Letters - Non Illuminated" },
  out_flat: { signType: "flat-cut-pasted", pricingSignType: "Flat Cut Aluminum Letters" },
  out_box: { signType: "cut-to-shape-light-box", pricingSignType: "Fabricated Lightbox - Single Sided" },
  out_push: { signType: "push-through-face-lit", pricingSignType: "Fabricated Push Through - Single Sided" },
  out_neon: { signType: "open-face-neon-channel", pricingSignType: "Open Face Neon Channel Letters" },
  out_awning: null, // standin — no engine renderer, no pricing model

  // Outdoor · Freestanding
  out_pylon: null, // standin
  out_monument: null, // standin
  out_blade: { signType: "blade-projecting-sign-double-sided", pricingSignType: "Fabricated Blade Sign - Illuminated/Double Sided" },
  out_aframe: { signType: "a-frame-sign", pricingSignType: "A - Frame Sign" },
  out_way: null, // standin

  // Outdoor · Specialty
  out_banner: { signType: "vinyl-graphics-wall-wraps-full", pricingSignType: "Vinyl Banners" },

  // Indoor · Illuminated
  in_halo: { signType: "halo-lit-channel", pricingSignType: "Halo Lit Channel Letters" },
  in_face: { signType: "face-lit-channel", faceLitTrimStyle: "trim", faceLitReturnColor: "logo-match", pricingSignType: "Premium Face Lit Channel Letters - Metallic Trim" },
  in_box: { signType: "cut-to-shape-light-box", pricingSignType: "Fabricated Lightbox - Single Sided" },
  in_neon: { signType: "led-neon", pricingSignType: "Neon Sign" },
  in_menu: null, // standin

  // Indoor · Non-Illuminated
  in_fab: { signType: "fabricated-non-lit", fabricatedFinish: "goldenMirror", pricingSignType: "Fabricated Channel Letters - Non Illuminated" },
  in_flat: { signType: "flat-cut-pasted", pricingSignType: "Flat Cut Acrylic Letters" },
  // Renders as a wall wrap, but there is no vinyl-graphics pricing model (only
  // "Vinyl Banners"), so it stays a manual quote — matching the demo's `standin`.
  in_vinyl: { signType: "vinyl-graphics-wall-wraps-full", pricingSignType: null },
  // APPROXIMATION — confirm with Signize. A standoff-mounted plaque is not cut
  // letters; "Flat Cut Acrylic Letters" is merely the nearest priced model.
  in_plaque: { signType: "flat-cut-pasted", pricingSignType: "Flat Cut Acrylic Letters" },
};

// The canonical pricing name for a demo master row, or null when the row has no
// pricing model (spec's `pricing_basis: standin` → manual team pricing).
export const pricingSignTypeFor = (masterId) =>
  RENDER_KEY_BY_MASTER_ID[masterId]?.pricingSignType ?? null;

// Defaults every engine call needs alongside the render key. Mirrors the shape
// getMockupTypes.js builds for the studio's own "all mockups" grid.
const BASE_SPEC = {
  mountingType: "flush",
  xPercent: 50,
  yPercent: 50,
  signSize: 100,
  isLightingOn: true,
};

// Returns the full spec object to POST to /generate-mockup, or null when this
// master row has no engine renderer (caller should fall back to a placeholder).
export const specForMasterId = (masterId) => {
  const mapped = RENDER_KEY_BY_MASTER_ID[masterId];
  if (!mapped) return null;
  // pricingSignType belongs to the other engine — don't post it to /generate-mockup.
  // eslint-disable-next-line no-unused-vars
  const { pricingSignType, ...renderSpec } = mapped;
  return { ...BASE_SPEC, ...renderSpec };
};

// The studio picks its backdrop from the sign's placement; the demo's master
// rows carry the same indoor/outdoor split.
export const sceneFileFor = (placement) =>
  placement === "outdoor" ? "scene-outdoor.jpg" : "scene.png";

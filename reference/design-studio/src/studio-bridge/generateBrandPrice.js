// Live pricing for the franchise flow demo, via POST /sign-pricing.
//
// Returns BOTH numbers deliberately:
//   cost  — what the engine returns (`calculation.data.totalCost`). This is the
//           Signize FULFILLMENT COST. It must never be shown to a franchisee.
//   price — cost + margin, the customer-facing estimate. This is what maps to
//           brand_items.est_price / the quote total in the spec.
//
// The old studio drew its margin from a per-company table that was deleted with
// the CRM backend, so DEFAULT_MARGIN_PCT below is an explicit placeholder, not a
// real commercial policy. Replace it with the brand's agreed margin before this
// is shown to anyone outside the team.
//
// Best-effort like the mockup bridge: any failure returns null and the caller
// falls back to the demo's static price.

import axios from "axios";
import API from "../json/apiConfig.js";
import { localStorageTokenKey } from "../utils/localStorageTokenKey";
import { fetchDevBackendToken } from "../utils/devBackendAuth";
import { pricingSignTypeFor } from "./renderKeyMap";

// PLACEHOLDER — see note above.
export const DEFAULT_MARGIN_PCT = 45;

export const priceFromCost = (cost, marginPct = DEFAULT_MARGIN_PCT) => {
  if (!Number.isFinite(cost) || cost <= 0) return null;
  return Math.round(cost * (1 + marginPct / 100));
};

// Defaults sourced from GET /get/default/data (first option of each list) and
// the studio's own SignFormSlice initial state. The demo has no attribute
// pickers, so a franchise item's pinned_attributes would supply these for real.
const DEFAULT_ATTRS = {
  mounting_type: "Flush/Stud mounted",
  material: "Aluminium",
  ul_mandatory: "Yes",
  paint_finish: "Gloss/Satin",
  neon_color: "Simple",
  uv_printing_needed: "No",
  sign_depth: 3,
  raceway_depth: 2,
  raceway_height: 6,
  backer_offset: 2,
  backboard_cabinet_depth: 2,
};

const brandWordmarkFile = (brandText, color = "#2E7D32") =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("no 2d context"));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 200px Inter, Helvetica, Arial, sans-serif";
    ctx.fillText(brandText, canvas.width / 2, canvas.height / 2);
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("toBlob failed"));
      resolve(new File([blob], "brand-logo.png", { type: "image/png" }));
    }, "image/png");
  });

const resolveToken = async () => {
  const existing = localStorage.getItem(localStorageTokenKey);
  if (existing && !existing.startsWith("dev-mock:")) return existing;
  return await fetchDevBackendToken();
};

/**
 * @param {object} args
 * @param {string} args.masterId      demo MASTER row id
 * @param {string} args.brandText     wordmark rendered as the logo
 * @param {number} [args.heightInches] letter height driving the quote
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{cost:number, price:number, tatDays:*, signWidth:*, signHeight:*, pricingSignType:string}|null>}
 */
export const generateBrandPrice = async ({
  masterId,
  brandText,
  heightInches = 24,
  signal,
}) => {
  const pricingSignType = pricingSignTypeFor(masterId);
  // standin rows are quoted manually by the team — never auto-priced (spec §8).
  if (!pricingSignType) return null;

  try {
    const token = await resolveToken();
    if (!token) return null;

    const logoFile = await brandWordmarkFile(brandText || "Freshbites");

    const fd = new FormData();
    fd.append("sign_image", logoFile);
    fd.append("sign_width_or_height", String(heightInches));
    fd.append("user_input_dimension", "height");
    fd.append("sign_height", String(heightInches));
    fd.append("sign_width", "0");
    fd.append("sign_type", pricingSignType);
    fd.append("size", "");
    fd.append("mockupCreationType", "false");
    Object.entries(DEFAULT_ATTRS).forEach(([k, v]) => fd.append(k, String(v)));

    const res = await axios.post(`${API.BACKEND_API_URL}/sign-pricing`, fd, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });

    const data = res.data?.calculation?.data;
    const cost = Number(data?.totalCost);
    if (!Number.isFinite(cost) || cost <= 0) return null;

    return {
      cost,
      price: priceFromCost(cost),
      tatDays: data?.tATDays ?? null,
      signWidth: data?.signWidth ?? null,
      signHeight: data?.signHeight ?? null,
      pricingSignType,
    };
  } catch (error) {
    if (signal?.aborted) return null;
    console.warn("[studio-bridge] pricing failed:", error?.message);
    return null;
  }
};

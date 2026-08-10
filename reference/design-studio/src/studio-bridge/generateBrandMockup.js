// The bridge between the franchise flow demo and the real Signize mockup engine.
//
// The demo's Design Studio modal used to fake generation with a 900ms timeout
// and an inline SVG. This calls POST /generate-mockup for real and hands back a
// base64 PNG, so "Instant mockup" / "Design & add in Studio" produce genuine
// renders of the brand wordmark on a storefront.
//
// Everything here is best-effort: any failure (no token, standin sign type,
// network, engine error) returns null and the demo keeps its SVG placeholder.
// Nothing in the franchise flow is allowed to block on Design Studio being up —
// spec §8, "Do not block any flow on Design Studio availability."

import axios from "axios";
import API from "../json/apiConfig.js";
import { localStorageTokenKey } from "../utils/localStorageTokenKey";
import { fetchDevBackendToken } from "../utils/devBackendAuth";
import { blobToBase64 } from "../utils/blobToBase64";
import { specForMasterId, sceneFileFor } from "./renderKeyMap";

// Franchisees never upload logos — the brand's asset is used for every
// generation (spec §3.1). The demo has no logo file, so we draw the brand
// wordmark to a canvas and send that as the logo image. Swap this for the real
// brands.logo_url asset once brands exist in Supabase.
const brandWordmarkFile = (brandText, color = "#2E7D32") =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("no 2d context"));

    // Transparent background: the engine composites the logo onto the scene, so
    // any fill here would show up as a plate behind the letters.
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

// A real session token if the user is logged in, otherwise the dev service
// account (.env.development.local). Null means we cannot call the engine.
const resolveToken = async () => {
  const existing = localStorage.getItem(localStorageTokenKey);
  if (existing && !existing.startsWith("dev-mock:")) return existing;
  return await fetchDevBackendToken();
};

/**
 * Render a real mockup for a demo master-catalog row.
 *
 * @param {object}  args
 * @param {string}  args.masterId   demo MASTER row id, e.g. "out_ch_halo"
 * @param {string}  args.placement  "outdoor" | "indoor"
 * @param {string}  args.brandText  wordmark to render, e.g. "Freshbites"
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{base64: string, signType: string} | null>}
 */
export const generateBrandMockup = async ({
  masterId,
  placement,
  brandText,
  signal,
}) => {
  const spec = specForMasterId(masterId);
  // standin sign types have no engine renderer — quoted manually, placeholder art.
  if (!spec) return null;

  try {
    const token = await resolveToken();
    if (!token) return null;

    const sceneName = sceneFileFor(placement);
    const sceneResponse = await fetch(`/${sceneName}`, { signal });
    if (!sceneResponse.ok) return null;
    const sceneBlob = await sceneResponse.blob();

    const logoFile = await brandWordmarkFile(brandText || "Freshbites");

    const formData = new FormData();
    formData.append("LogoImage", logoFile);
    formData.append("sceneImage", sceneBlob, sceneName);
    Object.entries(spec).forEach(([k, v]) => formData.append(k, v));

    const response = await axios.post(
      `${API.BACKEND_API_URL}/generate-mockup`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
        responseType: "blob",
        signal,
      }
    );

    const base64 = await blobToBase64(response.data);
    return { base64, signType: spec.signType };
  } catch (error) {
    if (signal?.aborted) return null;
    console.warn("[studio-bridge] mockup generation failed:", error?.message);
    return null;
  }
};

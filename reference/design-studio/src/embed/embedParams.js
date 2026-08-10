// Embed mode — spec §8.
//
// The studio runs inside a franchise portal in an <iframe>. Everything the host
// needs to say comes in as URL params; everything it needs back goes out as a
// postMessage. Nothing else about the studio changes, and with no params present
// the app behaves exactly as the standalone tool.
//
//   /studio/logo?embed=1&signType=Halo%20Lit%20Channel%20Letters&ref=li_42
//
// | param      | meaning                                                        |
// |------------|----------------------------------------------------------------|
// | embed      | "1" → embed mode: no header, no lead capture, preview-only      |
// | signTypeId | taxonomy leaf id — the precise variant to lock (preferred)      |
// | signType   | canonical pricing name, e.g. "Halo Lit Channel Letters"         |
// | brandText  | wordmark to render, e.g. "Freshbites"                           |
// | ref        | opaque host token (line-item id) echoed back on every message   |
// | origin     | host origin for postMessage targeting; defaults to same-origin  |

export const MESSAGE_SOURCE = "signage-studio";

export const readEmbedParams = (search = window.location.search) => {
  const q = new URLSearchParams(search);
  const embed = q.get("embed") === "1" || q.get("embed") === "true";
  return {
    embed,
    signTypeId: q.get("signTypeId") ? Number(q.get("signTypeId")) : null,
    signType: q.get("signType") || null,
    brandText: q.get("brandText") || null,
    ref: q.get("ref") || null,
    origin: q.get("origin") || null,
    // A locked selection means the sign-type pickers are suppressed (spec §8.5).
    locked: embed && Boolean(q.get("signTypeId") || q.get("signType")),
  };
};

// Where to post. Prefer the explicit `origin` param, fall back to the referrer's
// origin, then same-origin. Never "*" — that would leak the payload to any host.
const resolveTarget = (params) => {
  if (params?.origin) return params.origin;
  try {
    if (document.referrer) return new URL(document.referrer).origin;
  } catch {
    /* malformed referrer — fall through */
  }
  return window.location.origin;
};

export const postToHost = (type, payload = {}, params = readEmbedParams()) => {
  if (!params.embed || window.parent === window) return false;
  window.parent.postMessage(
    { source: MESSAGE_SOURCE, type, ref: params.ref ?? null, payload },
    resolveTarget(params)
  );
  return true;
};

// Locate a taxonomy leaf in the GlobalSigns tree, returning the full ancestor
// chain so the studio's selection state can be reconstructed exactly as if the
// user had clicked through the picker.
export const findSignTypePath = (roots, { signTypeId, signType }) => {
  if (!Array.isArray(roots) || !roots.length) return null;
  let match = null;

  const walk = (node, trail) => {
    if (match) return;
    const path = [...trail, node];
    const kids = node?.types || [];
    if (!kids.length) {
      const byId = signTypeId != null && node?.id === signTypeId;
      const byName = signType && node?.sign_type?.name === signType;
      if (byId || byName) match = path;
      return;
    }
    kids.forEach((k) => walk(k, path));
  };

  roots.forEach((r) => walk(r, []));
  return match;
};

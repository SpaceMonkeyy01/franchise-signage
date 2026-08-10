import API from "./API.json";

// Single source of truth for the API base URL.
//
// One backend remains: the Laravel API at api.signize.ai, which serves auth and
// everything the studio runs on —
//   /get/image-to-text            logo → letter geometry, dimensions, lines
//   /sign-pricing, /signize/calculate   the pricing engine
//   /generate-mockup, /generate-mockups/batch-stream   rendered mockups
//   /get/all/categories, /get/default/data             sign taxonomy + options
//
// The NestJS data backend (VITE_DATA_API_URL) was removed along with the CRM.
// import.meta.env vars are inlined at build time, so this resolves once per
// build. Consumers keep importing `API` and reading `API.BACKEND_API_URL`.
const apiConfig = {
  ...API,
  BACKEND_API_URL: import.meta.env.VITE_BACKEND_API_URL || API.BACKEND_API_URL,
};

export default apiConfig;

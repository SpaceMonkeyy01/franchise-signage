// Per-company studio branding (logo shown top-right of the studio canvas), set
// on the Studio Config page. Frontend stub — the logo is stored as a data URL in
// localStorage per company until the backend ships a company-branding API.
// Keep logos small (a data URL counts against the ~5MB localStorage quota).

const KEY = (companyId) => `studio-logo-${companyId ?? 1}`;

export const getStudioLogo = (companyId) => {
  try {
    return localStorage.getItem(KEY(companyId)) || null;
  } catch {
    return null;
  }
};

export const setStudioLogo = (companyId, dataUrl) =>
  localStorage.setItem(KEY(companyId), dataUrl);

export const clearStudioLogo = (companyId) =>
  localStorage.removeItem(KEY(companyId));

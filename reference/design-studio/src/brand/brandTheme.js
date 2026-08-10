// Co-branded theming for the Design Studio.
//
// The studio is a WHITE-LABEL surface: it is embedded inside a franchise
// brand's portal, so the underlying vendor (Signize) must never be visible.
// What the franchisee sees is their own brand plus the operator, Signage.com —
// exactly the header in the flow demo ("Freshbites · Powered by SIGNAGE.com").
//
// Values map to spec §3.1 `brands.logo_url` / `brands.brand_colors`. Freshbites
// is the pilot; brand #2 supplies its own object and nothing else changes.

// The product name, as franchisees and corporate see it. Single source of
// truth — the browser title, the loading lockup, the login lockup and the
// notification "From" line all read from here. The engine vendor is never it.
export const PRODUCT_NAME = "Franchise by Signage";

export const FRESHBITES = {
  slug: "freshbites",
  name: "Freshbites",
  operator: "SIGNAGE.com",
  colors: {
    brand: "#2E7D32", // Freshbites green — CLAUDE.md
    brandDark: "#1B5E20",
    brandLight: "#E8F5E9",
    onBrand: "#FFFFFF", // text on a brand-filled surface
  },
};

export const DEFAULT_BRAND = FRESHBITES;

// Push a brand's colours onto :root so every themed token follows. Called at
// boot; call again with another brand to re-skin live (what an embed host would
// do after resolving the brand from the URL/token).
export const applyBrandTheme = (brand = DEFAULT_BRAND) => {
  const root = document.documentElement;
  const c = brand?.colors ?? DEFAULT_BRAND.colors;
  root.style.setProperty("--brand", c.brand);
  root.style.setProperty("--brand-dark", c.brandDark);
  root.style.setProperty("--brand-light", c.brandLight);
  root.style.setProperty("--brand-foreground", c.onBrand);
};

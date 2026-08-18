// The Freshbites pilot brand, configured exactly as docs/flow-demo.jsx has it.
//
// Freshbites is fictional; it is the brand the demo tells its storyline through,
// and the seed must reproduce that storyline so the app can be clicked through
// against the demo screen for screen.
//
// The one piece of translation: the demo carries its own condensed catalog
// (MASTER, ~25 rows with ids like `out_ch_prem`) while master_catalog is seeded
// from the real 77-row taxonomy. Each brand item therefore names the taxonomy
// row it pins by natural key, with the demo's master id recorded alongside so
// the two can be checked against each other.

import type { LocationFormat, VendorPolicy } from '../../src/lib/status/types';

export const FRESHBITES_GREEN = '#2E7D32';

export const brand = {
  name: 'Freshbites',
  slug: 'freshbites',
  logo_url: null as string | null,
  brand_colors: { primary: FRESHBITES_GREEN, primaryDark: '#1B5E20', primaryLight: '#E8F5E9' },
  status: 'live' as const,
  approval_mode: 'standard_model' as const,
  reviewer_email: 'brand@freshbites.com',
  reviewer_email_secondary: null as string | null,
  review_sla_days: 5,
  sla_action: 'remind' as const,
  // The demo's default preset. The `approved_vendor` preset exists to exercise
  // the external tail; the pilot brand's real policy is still unknown
  // (SPEC §12 Q3), so both tails must work.
  vendor_policy: 'signage_com' as VendorPolicy,
  vendor_name: 'Signage.com Manufacturing',
  vendor_email: 'quotes@signage.com',
  corporate_cc: true,
  corporate_email: 'brand@freshbites.com',
  default_tat: '14 working days',
  did_allowed_email_domains: ['freshbites.com'],
  // Null → the platform placeholder in DID_FEE_CENTS. Not a constant anywhere.
  did_fee_cents: null as number | null,
};

/**
 * Per-policy vendor contacts (SPEC §3.1; docs/DECISIONS.md #20).
 *
 * The brand routes to Signage.com, but the pylon overrides to `approved_vendor`
 * — so routing splits the request into two packages, and until this existed the
 * second one had no address but the first one's. The `approved_vendor` row here
 * is what makes that split real: two packages, two companies, two emails you can
 * read side by side in `/dev`.
 *
 * `signage_com` is deliberately NOT listed: it is the brand's own policy, so it
 * resolves through brands.vendor_name/vendor_email, which is the fallback path
 * this table has to keep working.
 */
export const vendorContacts = [
  {
    policy: 'approved_vendor' as VendorPolicy,
    vendor_name: 'Meridian Sign Co.',
    vendor_email: 'quotes@meridiansign.example',
    // Corporate is copied on outside vendors' packages, which is the case the
    // brand-level flag exists for; left null it would follow the brand anyway,
    // but stating it is the point of a per-contact override.
    corporate_cc: true,
    tat: null as string | null,
    notes: 'Freshbites-approved fabricator for pylon and monument work.',
  },
];

export interface BrandItemSeed {
  /** The demo's master id, kept for cross-checking against docs/flow-demo.jsx. */
  demoMasterId: string;
  /** Natural key into master_catalog: [placement, sign_type, variant]. */
  master: [string, string, string | null];
  name: string;
  spec_summary: string;
  site_variables: string[];
  pinned_attributes: Record<string, unknown>;
  /** Null ⟺ the pinned master row is standin-priced: "Custom quote". */
  est_price: number | null;
  vendor_policy_override: VendorPolicy | null;
  sort_order: number;
}

export const brandItems: BrandItemSeed[] = [
  {
    demoMasterId: 'out_ch_prem',
    master: ['outdoor', 'Illuminated Channel Letters', 'Face Lit (Premium Channel Letters)'],
    name: 'Freshbites Storefront Letters',
    spec_summary: 'Trimless · match-logo returns · gloss · standard raceway · UL listed',
    site_variables: ['size', 'mounting'],
    pinned_attributes: {
      trim: 'trimless',
      return_color: 'match_logo',
      finish: 'gloss',
      mounting_type: 'Standard Raceway',
      ul_mandatory: true,
    },
    est_price: 8400,
    vendor_policy_override: null,
    sort_order: 10,
  },
  {
    demoMasterId: 'in_vinyl',
    master: ['indoor', 'Vinyl Graphics', 'Window Frosting'],
    name: 'Freshbites Window Frosting',
    spec_summary: 'Leaf pattern frost · full lower pane coverage',
    site_variables: ['pane_count'],
    pinned_attributes: { pattern: 'leaf', coverage: 'full_lower_pane' },
    // Renders, but has no pricing model — mocks up AND quotes manually
    // (docs/design-studio-findings.md §6.5).
    est_price: null,
    vendor_policy_override: null,
    sort_order: 20,
  },
  {
    demoMasterId: 'in_halo',
    master: ['indoor', 'Illuminated Dimensional Letters', 'Halo-Lit (Back-lit)'],
    name: 'Freshbites Lobby Letters',
    spec_summary: 'Halo-lit · brushed aluminum · flush mounted',
    site_variables: ['size'],
    pinned_attributes: { finish: 'brushed_aluminum', mounting_type: 'Flush/Stud mounted' },
    est_price: 2900,
    vendor_policy_override: null,
    sort_order: 30,
  },
  {
    demoMasterId: 'out_way',
    master: ['outdoor', 'Wayfinding & Directional', 'Entrance Signs'],
    name: 'Freshbites Entrance Sign',
    spec_summary: 'Entrance wayfinding · brand green panel',
    site_variables: ['mounting'],
    pinned_attributes: { panel_color: FRESHBITES_GREEN },
    est_price: null,
    vendor_policy_override: null,
    sort_order: 40,
  },
  {
    demoMasterId: 'out_pylon',
    master: ['outdoor', 'Pylon Signs', 'Single or Double Pole'],
    name: 'Freshbites Road Sign',
    spec_summary: 'Single pole pylon · illuminated cabinet panel',
    site_variables: ['height'],
    pinned_attributes: { pole: 'single', illuminated: true },
    est_price: null,
    // The per-item routing override from SPEC §4: pylons always go to a local
    // fabricator regardless of the brand's policy. This is the row that proves
    // one request can split across two recipients.
    vendor_policy_override: 'approved_vendor',
    sort_order: 50,
  },
  {
    demoMasterId: 'in_box',
    master: ['indoor', 'Lightbox/Cabinet Signs', 'Standard Cabinet (Square/Rectangle)'],
    name: 'Freshbites Menu Board',
    spec_summary: '3-panel lightbox · matte diffuser',
    site_variables: ['panel_count'],
    pinned_attributes: { panels: 3, diffuser: 'matte' },
    est_price: 3200,
    vendor_policy_override: null,
    sort_order: 60,
  },
  {
    demoMasterId: 'out_blade',
    master: ['outdoor', 'Blade/Projecting Signs', 'Double-Sided'],
    name: 'Freshbites Blade Sign',
    spec_summary: 'Double-sided · bracket mounted · brand green',
    site_variables: ['projection'],
    pinned_attributes: { sides: 2, mounting_type: 'bracket', color: FRESHBITES_GREEN },
    est_price: 1850,
    vendor_policy_override: null,
    sort_order: 70,
  },
  {
    demoMasterId: 'out_aframe',
    master: ['outdoor', 'A-Frame Sign', null],
    name: 'Freshbites Sidewalk A-Frame',
    spec_summary: 'Standard A-frame · swappable insert',
    site_variables: [],
    pinned_attributes: { insert: 'swappable' },
    est_price: 420,
    vendor_policy_override: null,
    sort_order: 80,
  },
  {
    demoMasterId: 'in_neon',
    master: ['indoor', 'LED Neon Signs', 'Custom Bent LED Flex Tubing'],
    name: 'Freshbites Neon Leaf',
    spec_summary: 'LED flex neon · leaf mark · simple green',
    site_variables: ['size'],
    pinned_attributes: { neon_color: 'green', motif: 'leaf' },
    est_price: 1600,
    vendor_policy_override: null,
    sort_order: 90,
  },
  {
    demoMasterId: 'out_banner',
    master: ['outdoor', 'Banners & Flags', 'Vinyl Banners'],
    name: 'Freshbites Opening Banner',
    spec_summary: `Vinyl · 'Now Open' template`,
    site_variables: ['size'],
    pinned_attributes: { template: 'now_open' },
    est_price: 380,
    vendor_policy_override: null,
    sort_order: 100,
  },
];

export interface PackageSeed {
  format: LocationFormat;
  label: string;
  description: string;
  /** Ordered brand-item names. Duplicates are meaningful (SPEC §3.2). */
  items: string[];
}

export const packages: PackageSeed[] = [
  {
    format: 'inline',
    label: 'Inline storefront',
    description: 'Standard strip-center unit',
    items: [
      'Freshbites Storefront Letters',
      'Freshbites Window Frosting',
      'Freshbites Lobby Letters',
      'Freshbites Entrance Sign',
    ],
  },
  {
    format: 'endcap',
    label: 'Endcap',
    description: 'Corner unit, two elevations',
    items: [
      // Twice, deliberately: an endcap has two elevations to sign.
      'Freshbites Storefront Letters',
      'Freshbites Storefront Letters',
      'Freshbites Window Frosting',
      'Freshbites Lobby Letters',
      'Freshbites Entrance Sign',
    ],
  },
  {
    format: 'freestanding',
    label: 'Freestanding',
    description: 'Standalone building with road sign',
    items: [
      'Freshbites Storefront Letters',
      'Freshbites Road Sign',
      'Freshbites Window Frosting',
      'Freshbites Lobby Letters',
      'Freshbites Entrance Sign',
    ],
  },
];

/** LOC-0007 from the demo, with the installed-sign record that makes the fast lane work. */
export const oakPlaza = {
  name: 'Freshbites — Oak Plaza',
  address: { line1: '88 Oak Plaza Dr', city: 'Austin', state: 'TX', zip: '78701' },
  format: 'inline' as LocationFormat,
  opening_date: '2025-09-15',
  installedSigns: [
    { brandItem: 'Freshbites Storefront Letters', sizing: `22' frontage · 30" letters`, installed_at: '2025-09-01' },
    { brandItem: 'Freshbites Window Frosting', sizing: '4 panes', installed_at: '2025-09-01' },
    { brandItem: 'Freshbites Lobby Letters', sizing: '36" wall set', installed_at: '2025-09-01' },
    { brandItem: 'Freshbites Entrance Sign', sizing: 'Wall mounted', installed_at: '2025-09-01' },
    // Added a month after opening — the row REQ-0017's like-for-like
    // replacement targets.
    { brandItem: 'Freshbites Menu Board', sizing: '3 panels', installed_at: '2025-10-01' },
  ],
};

/** LOC-0008 from the demo: signed, not yet open, no installed signs. */
export const cedarPark = {
  name: 'Freshbites — Cedar Park',
  address: { line1: '412 Whitestone Blvd', city: 'Cedar Park', state: 'TX', zip: '78613' },
  format: 'inline' as LocationFormat,
  opening_date: '2026-10-01',
  installedSigns: [] as Array<{ brandItem: string; sizing: string; installed_at: string }>,
};

/** Signage.com operators who can reach /admin (SPEC §10). */
export const teamMembers = [{ email: 'team@signage.com', name: 'Signage.com Team' }];

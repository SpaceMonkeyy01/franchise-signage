// Read queries behind the franchisee flow (SPEC §9 interface 1).
//
// Written as SQL against the schema rather than through supabase-js, so the same
// statements run on the dev database and on Supabase (whose direct connection
// speaks the same protocol). Every query that returns franchisee-visible data
// takes the access token and filters on it in the statement itself — the same
// predicate the RLS policy applies, so the two cannot drift apart.

import { query, queryOne } from './pool';
import type {
  LineItemOrigin,
  LineItemStatus,
  LocationFormat,
  RequestIntent,
  RequestStatus,
  VendorPolicy,
} from '../status/types';

const rows = query;
const maybeOne = queryOne;

// ------------------------------------------------------------------- brands

export interface BrandPublic {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_colors: { primary?: string; primaryDark?: string; primaryLight?: string };
  vendor_policy: VendorPolicy;
  vendor_name: string | null;
  default_tat: string | null;
}

/** The co-branded entry page. Reads the view, never the row — no contact emails. */
export function getBrandBySlug(slug: string): Promise<BrandPublic | null> {
  return maybeOne<BrandPublic>(
    `select id, name, slug, logo_url, brand_colors, vendor_policy, vendor_name, default_tat
       from brands_public where slug = $1`,
    [slug],
  );
}

// ---------------------------------------------------------------- locations

export interface InstalledSignRow {
  id: string;
  brand_item_id: string;
  brand_item_name: string;
  spec_summary: string | null;
  render_key: string | null;
  sizing: string | null;
  installed_at: string;
  est_price: string | null;
  vendor_policy_override: VendorPolicy | null;
}

export interface LocationRow {
  id: string;
  code: string;
  name: string;
  address: { line1?: string; city?: string; state?: string; zip?: string };
  format: LocationFormat;
  opening_date: string | null;
  installed_signs: InstalledSignRow[];
  open_requests: OpenRequestRow[];
}

export interface OpenRequestRow {
  id: string;
  code: string;
  intent: RequestIntent;
  status: RequestStatus;
  access_token: string;
  item_count: number;
}

/**
 * "Your locations" — the franchisee home.
 *
 * There are no accounts (SPEC §10), so a franchisee's identity is the set of
 * tokens they hold. This lists every location they can reach through any one of
 * them, which is what "your locations" means without a login.
 */
export async function getLocationsForBrand(brandId: string): Promise<LocationRow[]> {
  const locations = await rows<Omit<LocationRow, 'installed_signs' | 'open_requests'>>(
    `select id, code, name, address, format, opening_date
       from locations where brand_id = $1 order by created_at`,
    [brandId],
  );
  if (locations.length === 0) return [];

  const ids = locations.map((l) => l.id);

  const signs = await rows<InstalledSignRow & { location_id: string }>(
    `select s.id, s.location_id, s.brand_item_id, bi.name as brand_item_name,
            bi.spec_summary, bi.est_price, bi.vendor_policy_override,
            mc.render_key, s.sizing, s.installed_at
       from installed_signs s
       join brand_items bi on bi.id = s.brand_item_id
       join master_catalog mc on mc.id = bi.master_catalog_id
      where s.location_id = any($1) and s.status = 'active'
      order by bi.sort_order`,
    [ids],
  );

  const requests = await rows<OpenRequestRow & { location_id: string }>(
    `select r.id, r.location_id, r.code, r.intent, r.status, r.access_token,
            (select count(*) from line_items li where li.request_id = r.id)::int as item_count
       from requests r
      where r.location_id = any($1) and r.status <> 'draft'
      order by r.created_at desc`,
    [ids],
  );

  return locations.map((location) => ({
    ...location,
    installed_signs: signs.filter((s) => s.location_id === location.id),
    open_requests: requests.filter((r) => r.location_id === location.id),
  }));
}

// ----------------------------------------------------------------- requests

export interface LineItemRow {
  id: string;
  brand_item_id: string;
  brand_item_name: string;
  spec_summary: string | null;
  /** Which attributes stay per-site — what the resubmission form asks for. */
  site_variables: string[];
  render_key: string | null;
  origin: LineItemOrigin;
  item_status: LineItemStatus;
  sizing: string | null;
  site_notes: string | null;
  tbd_fields: string[];
  exception_issue: string | null;
  review_note: string | null;
  est_price_snapshot: string | null;
  vendor_policy_override: VendorPolicy | null;
  files: RequestFileRow[];
}

export interface RequestFileRow {
  id: string;
  line_item_id: string | null;
  kind: string;
  storage_path: string;
  file_name: string | null;
  content_type: string | null;
}

export interface QuoteRow {
  id: string;
  recipient_kind: VendorPolicy;
  priced_total: string | null;
  priced_count: number;
  manual_count: number;
  external: boolean;
  tat: string | null;
  delivered_at: string | null;
  accepted_at: string | null;
}

export interface EventRow {
  id: string;
  kind: string;
  actor: string;
  summary: string;
  created_at: string;
}

export interface RequestDetail {
  id: string;
  code: string;
  intent: RequestIntent;
  status: RequestStatus;
  access_token: string;
  package_version: number;
  financing_involved: boolean | null;
  submitted_at: string | null;
  location: { id: string; code: string; name: string; format: LocationFormat };
  brand: BrandPublic;
  items: LineItemRow[];
  quotes: QuoteRow[];
  events: EventRow[];
  change_request: { comment: string; line_item_ids: string[] } | null;
  /** Request-level files — the lease sign exhibit and anything else not per item. */
  files: RequestFileRow[];
}

/**
 * The status page, resolved from a token alone.
 *
 * The token is the only credential (SPEC §10) and it is applied in the WHERE
 * clause, not checked afterwards: an unknown token returns null rather than a
 * request someone else owns.
 */
export async function getRequestByToken(token: string): Promise<RequestDetail | null> {
  const request = await maybeOne<{
    id: string;
    code: string;
    intent: RequestIntent;
    status: RequestStatus;
    access_token: string;
    package_version: number;
    financing_involved: boolean | null;
    submitted_at: string | null;
    location_id: string;
    location_code: string;
    location_name: string;
    location_format: LocationFormat;
    brand_slug: string;
  }>(
    `select r.id, r.code, r.intent, r.status, r.access_token, r.package_version,
            r.financing_involved, r.submitted_at,
            l.id as location_id, l.code as location_code, l.name as location_name,
            l.format as location_format, b.slug as brand_slug
       from requests r
       join locations l on l.id = r.location_id
       join brands b on b.id = r.brand_id
      where r.access_token = $1`,
    [token],
  );
  if (!request) return null;

  const brand = await getBrandBySlug(request.brand_slug);
  if (!brand) return null;

  const files = await rows<RequestFileRow>(
    `select id, line_item_id, kind, storage_path, file_name, content_type
       from request_files where request_id = $1 order by created_at`,
    [request.id],
  );

  const items = await rows<Omit<LineItemRow, 'files'>>(
    `select li.id, li.brand_item_id, bi.name as brand_item_name, bi.spec_summary,
            bi.site_variables, bi.vendor_policy_override, mc.render_key,
            li.origin, li.item_status,
            li.sizing, li.site_notes, li.tbd_fields, li.exception_issue,
            li.review_note, li.est_price_snapshot
       from line_items li
       join brand_items bi on bi.id = li.brand_item_id
       join master_catalog mc on mc.id = bi.master_catalog_id
      where li.request_id = $1
      order by li.sort_order, li.created_at`,
    [request.id],
  );

  const quotes = await rows<QuoteRow>(
    `select id, recipient_kind, priced_total, priced_count, manual_count,
            external, tat, delivered_at, accepted_at
       from quotes where request_id = $1 order by created_at`,
    [request.id],
  );

  const events = await rows<EventRow>(
    `select id, kind, actor, summary, created_at
       from request_events where request_id = $1 order by created_at`,
    [request.id],
  );

  const changeRequest = await maybeOne<{ comment: string; line_item_ids: string[] }>(
    `select comment, line_item_ids from change_requests
      where request_id = $1 and resolved_at is null
      order by created_at desc limit 1`,
    [request.id],
  );

  return {
    id: request.id,
    code: request.code,
    intent: request.intent,
    status: request.status,
    access_token: request.access_token,
    package_version: request.package_version,
    financing_involved: request.financing_involved,
    submitted_at: request.submitted_at,
    files: files.filter((file) => file.line_item_id === null),
    location: {
      id: request.location_id,
      code: request.location_code,
      name: request.location_name,
      format: request.location_format,
    },
    brand,
    items: items.map((item) => ({
      ...item,
      files: files.filter((file) => file.line_item_id === item.id),
    })),
    quotes,
    events,
    change_request: changeRequest,
  };
}

/** The same detail as getRequestByToken, reached by id instead of a token. */
export async function getRequestById(requestId: string): Promise<RequestDetail | null> {
  const row = await maybeOne<{ access_token: string }>(
    `select access_token from requests where id = $1`,
    [requestId],
  );
  return row ? getRequestByToken(row.access_token) : null;
}

// ---------------------------------------------------------------- operations

export interface QueueRow {
  id: string;
  code: string;
  intent: RequestIntent;
  status: RequestStatus;
  access_token: string;
  submitted_at: string | null;
  brand_slug: string;
  brand_name: string;
  location_name: string;
  item_count: number;
  pending_count: number;
  changes_count: number;
  tbd_count: number;
  quote_count: number;
  /** True when nothing needed corporate — the fast lane (SPEC §7). */
  fast_lane: boolean;
}

/**
 * Every request, newest first — the operator's queue.
 *
 * Not token-scoped, because this is the Signage.com side: the team sees all
 * brands. The temporary console (src/app/dev) is the only caller today; the real
 * queue in Session 3 sits behind Supabase Auth and the team_members allowlist.
 */
export function getRequestQueue(): Promise<QueueRow[]> {
  return rows<QueueRow>(
    `select r.id, r.code, r.intent, r.status, r.access_token, r.submitted_at,
            b.slug as brand_slug, b.name as brand_name, l.name as location_name,
            count(li.id)::int as item_count,
            count(*) filter (where li.item_status = 'pending_review')::int as pending_count,
            count(*) filter (where li.item_status = 'changes_requested')::int as changes_count,
            count(*) filter (where cardinality(li.tbd_fields) > 0)::int as tbd_count,
            (select count(*) from quotes q where q.request_id = r.id)::int as quote_count,
            bool_and(li.item_status = 'auto_approved') as fast_lane
       from requests r
       join brands b on b.id = r.brand_id
       join locations l on l.id = r.location_id
       left join line_items li on li.request_id = r.id
      where r.status <> 'draft'
      group by r.id, b.slug, b.name, l.name
      order by r.created_at desc`,
  );
}

// ------------------------------------------------------------------ catalog

export interface BrandItemRow {
  id: string;
  name: string;
  spec_summary: string | null;
  site_variables: string[];
  est_price: string | null;
  render_key: string | null;
  vendor_policy_override: VendorPolicy | null;
  sort_order: number;
}

export function getBrandCatalog(brandId: string): Promise<BrandItemRow[]> {
  return rows<BrandItemRow>(
    `select bi.id, bi.name, bi.spec_summary, bi.site_variables, bi.est_price,
            bi.vendor_policy_override, mc.render_key, bi.sort_order
       from brand_items bi
       join master_catalog mc on mc.id = bi.master_catalog_id
      where bi.brand_id = $1 and bi.active
      order by bi.sort_order`,
    [brandId],
  );
}

export interface PackageRow {
  format: LocationFormat;
  label: string;
  description: string | null;
  items: BrandItemRow[];
}

/** The standard package for a format, expanded — duplicates preserved. */
export async function getPackageForFormat(
  brandId: string,
  format: LocationFormat,
): Promise<PackageRow | null> {
  const pkg = await maybeOne<{
    format: LocationFormat;
    label: string;
    description: string | null;
    items: string[];
  }>(
    `select format, label, description, items
       from brand_packages where brand_id = $1 and format = $2`,
    [brandId, format],
  );
  if (!pkg) return null;

  const catalog = await getBrandCatalog(brandId);
  const byId = new Map(catalog.map((item) => [item.id, item]));

  return {
    format: pkg.format,
    label: pkg.label,
    description: pkg.description,
    // Map rather than filter: an endcap's two storefront sets are two entries.
    items: pkg.items.map((id) => byId.get(id)).filter((item): item is BrandItemRow => !!item),
  };
}

/**
 * Every format's package, expanded — what the setup screen offers.
 *
 * All formats at once, not the chosen one: switching format on step 1 reloads
 * the whole checklist, and a franchisee comparing an inline unit against an
 * endcap should not wait on a round trip to see what changes.
 */
export async function getPackagesForBrand(brandId: string): Promise<PackageRow[]> {
  const packages = await rows<{
    format: LocationFormat;
    label: string;
    description: string | null;
    items: string[];
  }>(
    `select format, label, description, items
       from brand_packages where brand_id = $1 order by format`,
    [brandId],
  );
  const catalog = await getBrandCatalog(brandId);
  const byId = new Map(catalog.map((item) => [item.id, item]));

  return packages.map((pkg) => ({
    format: pkg.format,
    label: pkg.label,
    description: pkg.description,
    // Map rather than filter: an endcap's two storefront sets are two entries.
    items: pkg.items.map((id) => byId.get(id)).filter((item): item is BrandItemRow => !!item),
  }));
}

export function getInstalledSignsForLocation(locationId: string): Promise<InstalledSignRow[]> {
  return rows<InstalledSignRow>(
    `select s.id, s.brand_item_id, bi.name as brand_item_name, bi.spec_summary,
            bi.est_price, bi.vendor_policy_override, mc.render_key, s.sizing, s.installed_at
       from installed_signs s
       join brand_items bi on bi.id = s.brand_item_id
       join master_catalog mc on mc.id = bi.master_catalog_id
      where s.location_id = $1 and s.status = 'active'
      order by bi.sort_order`,
    [locationId],
  );
}

export function getLocationById(locationId: string): Promise<{
  id: string;
  code: string;
  name: string;
  format: LocationFormat;
  brand_id: string;
} | null> {
  return maybeOne(
    `select id, code, name, format, brand_id from locations where id = $1`,
    [locationId],
  );
}

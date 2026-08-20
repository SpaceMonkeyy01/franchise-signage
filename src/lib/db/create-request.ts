// Creating a request — the one write path every franchisee flow funnels into.
//
// Three screens submit requests (initial setup, add signs, replace like-for-like)
// and they differ only in which line items they build. Everything after that is
// identical and is here: the initial item statuses come from the SPEC §7 rules in
// src/lib/status/machine.ts, the price snapshot is taken from the catalog, and
// the request reaches `submitted` through submitRequest() so the timeline gets
// its event like every other transition.
//
// The franchisee flows have no login (SPEC §10) — a POST carries whatever ids the
// browser sends — so every id is re-checked against the brand here rather than
// trusted from the form. That is why this is a single transaction with its own
// lookups instead of a thin insert helper.

import { createPgStatusStore } from './pg-status-store';
import { transaction } from './pool';
import { deriveInitialItemStatus } from '../status/machine';
import { submitRequest } from '../status/transition';
import type { StoredObject } from '../storage';
import type {
  ApprovalMode,
  LineItemOrigin,
  LineItemStatus,
  LocationFormat,
  ReplaceReason,
  RequestIntent,
  VendorPolicy,
} from '../status/types';

type Exec = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

export interface NewRequestItem {
  brandItemId: string;
  origin: LineItemOrigin;
  sizing?: string | null;
  siteNotes?: string | null;
  /** Fields the franchisee marked TBD. Never blocks submission (SPEC §5.4). */
  tbdFields?: string[];
  /** Required ⟺ origin is 'exception'. */
  exceptionIssue?: string | null;
  /** Required ⟺ origin is 'replacement'. */
  replacesSignId?: string | null;
  replaceReason?: ReplaceReason | null;
  /**
   * Uploaded photos to attach to this item. A file of kind `mockup` also becomes
   * the item's mockup_file_id — the column is nullable everywhere and the
   * generic render for the master render_key is the fallback (CLAUDE.md), so no
   * flow ever blocks on one being present.
   */
  files?: NewRequestFile[];
}

export interface NewRequestFile {
  kind: 'placement_photo' | 'condition_photo' | 'mockup' | 'site_file' | 'landlord_criteria';
  storagePath: string;
  fileName?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
}

/**
 * A stored upload, tagged with what it is.
 *
 * The kind is chosen by the server action, never by the browser: an upload is an
 * anonymous POST, and the file kind is what decides whether something is a site
 * photo or the lease exhibit that gates the landlord check (SPEC §8b).
 */
export function toRequestFile(kind: NewRequestFile['kind'], stored: StoredObject): NewRequestFile {
  return {
    kind,
    storagePath: stored.storagePath,
    fileName: stored.fileName,
    contentType: stored.contentType,
    sizeBytes: stored.sizeBytes,
  };
}

export interface NewRequestInput {
  brandId: string;
  locationId: string;
  intent: RequestIntent;
  requester?: { name?: string | null; email?: string | null; phone?: string | null };
  /** §8b: null means "not asked", which is not the same as "answered no". */
  financingInvolved?: boolean | null;
  landlordContact?: { name?: string; email?: string; phone?: string } | null;
  items: NewRequestItem[];
  /** Request-level files: the lease sign exhibit, a site plan. */
  files?: NewRequestFile[];
  /**
   * Franchisee notes logged alongside the submission — "lease sign exhibit still
   * TBD", and anything else the team needs to chase. Events rather than columns
   * because they are follow-ups, and the timeline is where follow-ups belong.
   */
  notes?: string[];
  /**
   * Timeline wording for the submission event, phrased as docs/flow-demo.jsx
   * phrases it. Takes the derived counts because the sentence depends on them.
   */
  summary: (counts: SubmissionCounts) => string;
}

export interface SubmissionCounts {
  total: number;
  autoApproved: number;
  pendingReview: number;
}

export interface CreatedRequest extends SubmissionCounts {
  id: string;
  code: string;
  accessToken: string;
}

/**
 * Create a request from a franchisee screen and submit it in one transaction.
 *
 * Leaves the request at `submitted`, NOT at its derived status: deriving is the
 * team's package-prep step (SPEC §6), and the fast lane collapsing to `approved`
 * is something the team does, not something submission does.
 */
export async function createAndSubmitRequest(input: NewRequestInput): Promise<CreatedRequest> {
  return transaction((exec) => insertAndSubmit(exec, input));
}

async function insertAndSubmit(exec: Exec, input: NewRequestInput): Promise<CreatedRequest> {
  if (input.items.length === 0) {
    throw new Error('A request needs at least one sign.');
  }

  {
    const brand = await one<{ approval_mode: ApprovalMode; vendor_policy: VendorPolicy }>(
      exec,
      `select approval_mode, vendor_policy from brands where id = $1`,
      [input.brandId],
      'Unknown brand',
    );

    // The location must belong to the brand in the URL — otherwise a guessed
    // location id would attach a request to another brand's site.
    await one(
      exec,
      `select id from locations where id = $1 and brand_id = $2`,
      [input.locationId, input.brandId],
      'Unknown location',
    );

    // Only the initial-setup form asks who the franchisee is. `add` and
    // `replace` are reached from the location's own page, where that question
    // has already been answered once and asking it again would be a form
    // standing between a franchisee and a two-click replacement. So the contact
    // is carried forward from the most recent request on this location that has
    // one — which is also the only reason the notification set (SPEC §9
    // interface 5) reaches anyone after the first request.
    const requester = input.requester?.email
      ? input.requester
      : ((
          await exec.query<{ name: string | null; email: string | null; phone: string | null }>(
            `select requester_name as name, requester_email as email, requester_phone as phone
               from requests
              where location_id = $1 and requester_email is not null
              order by created_at desc limit 1`,
            [input.locationId],
          )
        )[0] ?? input.requester);

    const catalog = await loadBrandItems(
      exec,
      input.brandId,
      input.items.map((item) => item.brandItemId),
    );
    const installed = await loadInstalledSigns(exec, input.locationId, input.items);

    const [request] = await exec.query<{ id: string; code: string; access_token: string }>(
      `insert into requests
         (brand_id, location_id, intent, status, requester_name, requester_email,
          requester_phone, financing_involved, landlord_contact)
       values ($1,$2,$3,'draft',$4,$5,$6,$7,$8)
       returning id, code, access_token`,
      [
        input.brandId,
        input.locationId,
        input.intent,
        requester?.name ?? null,
        requester?.email ?? null,
        requester?.phone ?? null,
        input.financingInvolved ?? null,
        input.landlordContact ? JSON.stringify(input.landlordContact) : null,
      ],
    );

    const counts: SubmissionCounts = { total: 0, autoApproved: 0, pendingReview: 0 };
    let sortOrder = 0;

    for (const item of input.items) {
      const brandItem = catalog.get(item.brandItemId)!;
      const itemStatus = deriveInitialItemStatus(
        item.origin,
        { approvalMode: brand.approval_mode, vendorPolicy: brand.vendor_policy },
        { requiresReviewOverride: brandItem.requires_review_override },
      );
      tally(counts, itemStatus);

      const replacesSignId = item.origin === 'replacement' ? item.replacesSignId! : null;
      if (replacesSignId && installed.get(replacesSignId) !== item.brandItemId) {
        // Like-for-like means the same brand item. A different one is a modify
        // (v1.1) or an add, and both take a different approval path.
        throw new Error('A replacement must name the installed sign it replaces');
      }

      const [lineItem] = await exec.query<{ id: string }>(
        `insert into line_items
           (request_id, brand_item_id, origin, item_status, sizing, site_notes,
            tbd_fields, exception_issue, replaces_sign_id, replace_reason,
            est_price_snapshot, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         returning id`,
        [
          request.id,
          item.brandItemId,
          item.origin,
          itemStatus,
          blankToNull(item.sizing),
          blankToNull(item.siteNotes),
          item.tbdFields ?? [],
          item.origin === 'exception' ? (blankToNull(item.exceptionIssue) ?? 'Flagged at submission') : null,
          replacesSignId,
          item.origin === 'replacement' ? (item.replaceReason ?? 'damaged') : null,
          // The snapshot, not a live join: the catalog price moves, the number a
          // franchisee saw must not (SPEC §5.4).
          brandItem.est_price,
          sortOrder,
        ],
      );
      sortOrder += 10;

      for (const file of item.files ?? []) {
        const fileId = await insertFile(exec, request.id, lineItem.id, file);
        if (file.kind === 'mockup') {
          await exec.query(`update line_items set mockup_file_id = $2 where id = $1`, [
            lineItem.id,
            fileId,
          ]);
        }
      }
    }

    for (const file of input.files ?? []) {
      await insertFile(exec, request.id, null, file);
    }

    const store = createPgStatusStore(exec);
    await submitRequest(store, request.id, input.summary(counts));

    for (const note of input.notes ?? []) {
      await store.insertEvent({
        requestId: request.id,
        kind: 'note_added',
        actor: 'franchisee',
        summary: note,
      });
    }

    return { id: request.id, code: request.code, accessToken: request.access_token, ...counts };
  }
}

// ------------------------------------------------------------------ locations

export interface NewLocationInput {
  name: string;
  address: { line1?: string; line2?: string; city?: string; state?: string; zip?: string };
  format: LocationFormat;
  /** Free text from the form; unparseable dates are simply not recorded. */
  openingDate?: string | null;
}

export interface CreatedLocation {
  id: string;
  code: string;
}

/**
 * Initial setup: a new location and its first request, together.
 *
 * One transaction because a half-finished setup is worse than none — a location
 * with no request is invisible to the team queue but appears on the franchisee's
 * home screen as a site that is somehow already set up.
 */
export async function createLocationWithRequest(input: {
  brandId: string;
  location: NewLocationInput;
  request: Omit<NewRequestInput, 'brandId' | 'locationId'>;
}): Promise<{ location: CreatedLocation; request: CreatedRequest }> {
  return transaction(async (exec) => {
    const [location] = await exec.query<CreatedLocation>(
      `insert into locations (brand_id, name, address, format, opening_date)
       values ($1,$2,$3,$4,$5)
       returning id, code`,
      [
        input.brandId,
        input.location.name,
        JSON.stringify(input.location.address),
        input.location.format,
        parseDate(input.location.openingDate),
      ],
    );

    const request = await insertAndSubmit(exec, {
      ...input.request,
      brandId: input.brandId,
      locationId: location.id,
    });
    return { location, request };
  });
}

/**
 * Opening dates are typed free-hand ("Oct 1, 2026", "spring", ""). The column is
 * a date, so anything unparseable is dropped rather than rejected — a target
 * opening date is never worth blocking a submission over.
 */
function parseDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

// -------------------------------------------------------------------- helpers

interface BrandItemPricing {
  id: string;
  est_price: string | null;
  requires_review_override: boolean | null;
}

async function loadBrandItems(
  exec: Exec,
  brandId: string,
  ids: string[],
): Promise<Map<string, BrandItemPricing>> {
  const unique = [...new Set(ids)];
  const rows = await exec.query<BrandItemPricing>(
    `select id, est_price, requires_review_override
       from brand_items where brand_id = $1 and id = any($2) and active`,
    [brandId, unique],
  );
  if (rows.length !== unique.length) {
    throw new Error('A requested sign is not in this brand’s catalog');
  }
  return new Map(rows.map((row) => [row.id, row]));
}

/** installed_sign_id → brand_item_id, for the replacement items only. */
async function loadInstalledSigns(
  exec: Exec,
  locationId: string,
  items: readonly NewRequestItem[],
): Promise<Map<string, string>> {
  const ids = items
    .filter((item) => item.origin === 'replacement')
    .map((item) => item.replacesSignId);
  if (ids.length === 0) return new Map();
  if (ids.some((id) => !id)) {
    throw new Error('A replacement must name the installed sign it replaces');
  }

  const rows = await exec.query<{ id: string; brand_item_id: string }>(
    `select id, brand_item_id from installed_signs
      where location_id = $1 and id = any($2) and status = 'active'`,
    [locationId, ids],
  );
  return new Map(rows.map((row) => [row.id, row.brand_item_id]));
}

async function insertFile(
  exec: Exec,
  requestId: string,
  lineItemId: string | null,
  file: NewRequestFile,
): Promise<string> {
  const [row] = await exec.query<{ id: string }>(
    `insert into request_files
       (request_id, line_item_id, kind, storage_path, file_name, content_type, size_bytes)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning id`,
    [
      requestId,
      lineItemId,
      file.kind,
      file.storagePath,
      file.fileName ?? null,
      file.contentType ?? null,
      file.sizeBytes ?? null,
    ],
  );
  return row.id;
}

function tally(counts: SubmissionCounts, status: LineItemStatus): void {
  counts.total += 1;
  if (status === 'pending_review') counts.pendingReview += 1;
  else counts.autoApproved += 1;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function one<T>(exec: Exec, text: string, params: unknown[], message: string): Promise<T> {
  const rows = await exec.query<T>(text, params);
  if (!rows[0]) throw new Error(message);
  return rows[0];
}

// The three in-flight requests docs/flow-demo.jsx opens with — REQ-0016,
// REQ-0017 and REQ-0018.
//
// Brand configuration (apply.ts) is what a real brand gets at white-glove
// setup. This file is different: it is demo STATE, so that a freshly seeded
// database opens on the same screen the demo does instead of an empty shell.
// It is seeded in dev by default and behind --with-demo-requests elsewhere.

import type { SeededBrand, SqlExec } from './apply';

const TOKENS = {
  'REQ-0016': 'demo-cedar-park-initial-setup',
  'REQ-0017': 'demo-oak-plaza-menu-replacement',
  'REQ-0018': 'demo-oak-plaza-neon-addon',
  'REQ-0019': 'demo-oak-plaza-changes-requested',
} as const;

interface ItemSpec {
  brandItem: string;
  origin: 'standard' | 'addon' | 'exception' | 'replacement';
  status: 'auto_approved' | 'pending_review' | 'approved' | 'declined' | 'changes_requested';
  sizing: string | null;
  tbd?: string[];
  reviewNote?: string;
  replacesBrandItem?: string;
  replaceReason?: 'damaged' | 'worn' | 'vandalized';
}

export async function seedDemoRequests(db: SqlExec, brand: SeededBrand): Promise<void> {
  const oakPlaza = brand.locationIdByName.get('Freshbites — Oak Plaza')!;
  const cedarPark = brand.locationIdByName.get('Freshbites — Cedar Park')!;

  const priceOf = new Map<string, number | null>();
  const { rows: itemPrices } = await db.query<{ name: string; est_price: string | null }>(
    `select name, est_price from brand_items where brand_id = $1`,
    [brand.brandId],
  );
  for (const row of itemPrices) {
    priceOf.set(row.name, row.est_price === null ? null : Number(row.est_price));
  }

  const create = async (spec: {
    code: keyof typeof TOKENS;
    locationId: string;
    intent: 'initial_setup' | 'add' | 'replace_like';
    status: string;
    financing?: boolean;
    items: ItemSpec[];
    /** An open reviewer change request, against the items flagged below. */
    changeRequest?: { comment: string; flagged: string[] };
    quote?: {
      recipientKind: string;
      /** Who the address belongs to — matches docs/flow-demo.jsx:176. */
      recipientName: string;
      recipientEmail: string;
      ccEmail: string | null;
      total: number;
      pricedCount: number;
      manualCount: number;
      external: boolean;
      tat: string;
      deliveredAt?: string;
      acceptedAt?: string;
      /**
       * The package's own tail (SPEC §6, amended v2.2).
       *
       * Set these to match the request status above. The stage is DERIVED from
       * these dates, so a demo request seeded at in_production whose package
       * has no in_production_at would show the team a Start production button
       * for work already under way.
       */
      inProductionAt?: string;
      shippedAt?: string;
      completedAt?: string;
    };
    events: Array<[string, string, string, string]>; // [timestamp, kind, actor, summary]
  }) => {
    // Idempotent: a re-seed replaces the demo request wholesale. Deleting it
    // cascades into request_events, which the append-only trigger refuses — so
    // the trigger comes off for exactly this statement. That protection is doing
    // its job; demo state is the one thing allowed to be rewritten.
    await db.query(`alter table request_events disable trigger request_events_append_only`);
    try {
      await db.query(`delete from requests where code = $1`, [spec.code]);
    } finally {
      await db.query(`alter table request_events enable trigger request_events_append_only`);
    }

    const { rows } = await db.query<{ id: string }>(
      `insert into requests
         (brand_id, location_id, code, intent, access_token, status,
          requester_name, requester_email, financing_involved, submitted_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id`,
      [
        brand.brandId, spec.locationId, spec.code, spec.intent, TOKENS[spec.code],
        spec.status, 'Dana Whitfield', 'dana@freshbites-austin.com',
        spec.financing ?? null, spec.events[0][0],
      ],
    );
    const requestId = rows[0].id;

    let sortOrder = 0;
    const lineItemIdByBrandItem = new Map<string, string>();
    for (const item of spec.items) {
      const brandItemId = brand.itemIdByName.get(item.brandItem);
      if (!brandItemId) throw new Error(`Unknown brand item "${item.brandItem}"`);

      let replacesSignId: string | null = null;
      if (item.origin === 'replacement') {
        const target = item.replacesBrandItem ?? item.brandItem;
        const targetId = brand.itemIdByName.get(target)!;
        const found = await db.query<{ id: string }>(
          `select id from installed_signs
            where location_id = $1 and brand_item_id = $2 and status = 'active' limit 1`,
          [spec.locationId, targetId],
        );
        if (!found.rows[0]) throw new Error(`No installed "${target}" to replace`);
        replacesSignId = found.rows[0].id;
      }

      const { rows: created } = await db.query<{ id: string }>(
        `insert into line_items
           (request_id, brand_item_id, origin, item_status, sizing, tbd_fields,
            replaces_sign_id, replace_reason, est_price_snapshot, review_note, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         returning id`,
        [
          requestId, brandItemId, item.origin, item.status, item.sizing,
          item.tbd ?? [], replacesSignId, item.replaceReason ?? null,
          priceOf.get(item.brandItem) ?? null, item.reviewNote ?? null, sortOrder,
        ],
      );
      lineItemIdByBrandItem.set(item.brandItem, created[0].id);
      sortOrder += 10;
    }

    if (spec.changeRequest) {
      await db.query(
        `insert into change_requests
           (request_id, line_item_ids, comment, raised_by, package_version)
         values ($1,$2,$3,'reviewer',1)`,
        [
          requestId,
          spec.changeRequest.flagged.map((name) => lineItemIdByBrandItem.get(name)!),
          spec.changeRequest.comment,
        ],
      );
    }

    if (spec.quote) {
      const q = spec.quote;
      await db.query(
        `insert into quotes
           (request_id, recipient_kind, recipient_name, recipient_email, cc_email,
            line_item_ids, priced_total, priced_count, manual_count, external, tat,
            sent_at, delivered_at, accepted_at, in_production_at, shipped_at, completed_at)
         values ($1,$2,$3,$4,$5,
                 (select coalesce(array_agg(id), '{}') from line_items where request_id = $1),
                 $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          requestId, q.recipientKind, q.recipientName, q.recipientEmail, q.ccEmail, q.total,
          q.pricedCount, q.manualCount, q.external, q.tat,
          spec.events[0][0], q.deliveredAt ?? null, q.acceptedAt ?? null,
          q.inProductionAt ?? null, q.shippedAt ?? null, q.completedAt ?? null,
        ],
      );
    }

    for (const [at, kind, actor, summary] of spec.events) {
      await db.query(
        `insert into request_events (request_id, kind, actor, summary, created_at)
         values ($1,$2,$3,$4,$5)`,
        [requestId, kind, actor, summary, at],
      );
    }
  };

  // REQ-0018 — an add-on waiting on corporate. The only thing corporate sees.
  await create({
    code: 'REQ-0018',
    locationId: oakPlaza,
    intent: 'add',
    status: 'needs_review',
    items: [
      { brandItem: 'Freshbites Neon Leaf', origin: 'addon', status: 'pending_review', sizing: '48" back wall' },
    ],
    events: [
      ['2026-08-04T09:12:00Z', 'request_submitted', 'franchisee',
       '1 new sign requested for existing location — needs corporate approval'],
      ['2026-08-04T11:30:00Z', 'package_prepared', 'team', 'Package prepared · 1 sent for review'],
      ['2026-08-04T11:31:00Z', 'review_email_sent', 'system',
       'Approval email sent to corporate reviewer'],
    ],
  });

  // REQ-0019 — the change-request loop, mid-loop. Corporate has sent one item
  // back with a note and the ball is with the franchisee; the sibling item keeps
  // its approval, which is the whole point of line-item review (SPEC §7). The
  // reviewer screens are Session 4, so without this row the resubmission loop
  // cannot be reached from the franchisee side at all.
  await create({
    code: 'REQ-0019',
    locationId: oakPlaza,
    intent: 'add',
    status: 'changes_requested',
    items: [
      {
        brandItem: 'Freshbites Blade Sign',
        origin: 'addon',
        status: 'changes_requested',
        sizing: '36" projection',
        reviewNote: 'Projection exceeds our standard — confirm the landlord allows 36".',
      },
      {
        brandItem: 'Freshbites Sidewalk A-Frame',
        origin: 'addon',
        status: 'approved',
        sizing: 'Standard',
        reviewNote: 'Approved.',
      },
    ],
    changeRequest: {
      comment: 'Confirm the projection with the landlord before we quote the blade sign.',
      flagged: ['Freshbites Blade Sign'],
    },
    events: [
      ['2026-08-10T10:02:00Z', 'request_submitted', 'franchisee',
       '2 new sign(s) requested for existing location — needs corporate approval'],
      ['2026-08-10T14:40:00Z', 'package_prepared', 'team', 'Package prepared · 2 sent for review'],
      ['2026-08-11T09:05:00Z', 'item_approved', 'reviewer',
       'Freshbites Sidewalk A-Frame approved by corporate'],
      ['2026-08-11T09:07:00Z', 'changes_requested', 'reviewer',
       'Changes requested on 1 item(s): Confirm the projection with the landlord before we quote the blade sign.'],
    ],
  });

  // REQ-0017 — the fast lane, already in production. Corporate never saw it.
  await create({
    code: 'REQ-0017',
    locationId: oakPlaza,
    intent: 'replace_like',
    status: 'in_production',
    items: [
      {
        brandItem: 'Freshbites Menu Board',
        origin: 'replacement',
        status: 'auto_approved',
        sizing: '3 panels',
        replaceReason: 'damaged',
      },
    ],
    quote: {
      recipientKind: 'signage_com',
      recipientName: 'Signage.com Manufacturing',
      recipientEmail: 'quotes@signage.com',
      ccEmail: 'brand@freshbites.com',
      total: 3200,
      pricedCount: 1,
      manualCount: 0,
      external: false,
      tat: '14 working days',
      deliveredAt: '2026-07-29T10:05:00Z',
      acceptedAt: '2026-07-29T13:40:00Z',
      // Matches the production_started event below: the request is at
      // in_production because its one package is.
      inProductionAt: '2026-07-30T08:00:00Z',
    },
    events: [
      ['2026-07-28T15:02:00Z', 'request_submitted', 'franchisee',
       'Like-for-like replacement: Freshbites Menu Board (Damaged) — pinned spec + sizing pulled from installed record'],
      ['2026-07-28T16:15:00Z', 'package_prepared', 'team', 'Package prepared · no review needed'],
      ['2026-07-28T16:16:00Z', 'quote_sent', 'system',
       'Quote package emailed to Signage.com Manufacturing <quotes@signage.com> · cc brand@freshbites.com — 1 priced item(s) $3,200'],
      ['2026-07-29T10:05:00Z', 'quote_delivered', 'team', 'Quote delivered to franchisee — $3,200'],
      ['2026-07-29T13:40:00Z', 'quote_accepted', 'franchisee', 'Quote accepted by franchisee'],
      ['2026-07-30T08:00:00Z', 'production_started', 'team', 'Production started'],
    ],
  });

  // REQ-0016 — a full initial setup, quote out, one add-on approved with a note.
  await create({
    code: 'REQ-0016',
    locationId: cedarPark,
    intent: 'initial_setup',
    status: 'quote_ready',
    financing: true,
    items: [
      { brandItem: 'Freshbites Storefront Letters', origin: 'standard', status: 'auto_approved', sizing: `18' frontage` },
      { brandItem: 'Freshbites Window Frosting', origin: 'standard', status: 'auto_approved', sizing: '3 panes' },
      { brandItem: 'Freshbites Lobby Letters', origin: 'standard', status: 'auto_approved', sizing: null, tbd: ['sizing'] },
      { brandItem: 'Freshbites Entrance Sign', origin: 'standard', status: 'auto_approved', sizing: 'Post mounted' },
      {
        brandItem: 'Freshbites Neon Leaf',
        origin: 'addon',
        status: 'approved',
        sizing: '42" dining wall',
        reviewNote: 'Approved — dining area only.',
      },
    ],
    quote: {
      recipientKind: 'signage_com',
      recipientName: 'Signage.com Manufacturing',
      recipientEmail: 'quotes@signage.com',
      ccEmail: 'brand@freshbites.com',
      total: 12900,
      pricedCount: 3,
      manualCount: 2,
      external: false,
      tat: '14 working days',
      deliveredAt: '2026-07-25T11:45:00Z',
    },
    events: [
      ['2026-07-22T14:20:00Z', 'request_submitted', 'franchisee',
       'Initial setup submitted (4 standard + 1 needing review)'],
      ['2026-07-22T17:01:00Z', 'package_prepared', 'team',
       'Package prepared · 4 auto-approved, 1 sent for review'],
      ['2026-07-23T09:14:00Z', 'item_approved', 'reviewer',
       'Freshbites Neon Leaf approved by corporate'],
      ['2026-07-23T09:20:00Z', 'quote_sent', 'system',
       'Quote package emailed to Signage.com Manufacturing <quotes@signage.com> · cc brand@freshbites.com — 3 priced item(s) $12,900 + 2 manual-priced'],
      ['2026-07-25T11:45:00Z', 'quote_delivered', 'team',
       'Quote delivered to franchisee — $12,900 + 2 custom items'],
    ],
  });

  // These four take their codes from the demo rather than from the sequence, so
  // the sequence has to be moved past them — otherwise the 16th real request
  // generated in this database would be handed 'REQ-0016' and collide with the
  // unique constraint.
  await db.query(
    `select setval('request_code_seq',
       greatest((select last_value from request_code_seq), $1::bigint))`,
    [Object.keys(TOKENS).length + 15],
  );
}

export const DEMO_TOKENS = TOKENS;

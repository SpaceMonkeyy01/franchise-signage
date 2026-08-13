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
    quote?: {
      recipientKind: string;
      recipientEmail: string;
      ccEmail: string | null;
      total: number;
      pricedCount: number;
      manualCount: number;
      external: boolean;
      tat: string;
      deliveredAt?: string;
      acceptedAt?: string;
    };
    events: Array<[string, string, string, string]>; // [timestamp, kind, actor, summary]
  }) => {
    // Idempotent: a re-seed replaces the demo request wholesale.
    await db.query(`delete from requests where code = $1`, [spec.code]);

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

      await db.query(
        `insert into line_items
           (request_id, brand_item_id, origin, item_status, sizing, tbd_fields,
            replaces_sign_id, replace_reason, est_price_snapshot, review_note, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          requestId, brandItemId, item.origin, item.status, item.sizing,
          item.tbd ?? [], replacesSignId, item.replaceReason ?? null,
          priceOf.get(item.brandItem) ?? null, item.reviewNote ?? null, sortOrder,
        ],
      );
      sortOrder += 10;
    }

    if (spec.quote) {
      const q = spec.quote;
      await db.query(
        `insert into quotes
           (request_id, recipient_kind, recipient_email, cc_email, line_item_ids,
            priced_total, priced_count, manual_count, external, tat,
            sent_at, delivered_at, accepted_at)
         values ($1,$2,$3,$4,
                 (select coalesce(array_agg(id), '{}') from line_items where request_id = $1),
                 $5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          requestId, q.recipientKind, q.recipientEmail, q.ccEmail, q.total,
          q.pricedCount, q.manualCount, q.external, q.tat,
          spec.events[0][0], q.deliveredAt ?? null, q.acceptedAt ?? null,
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
      recipientEmail: 'quotes@signage.com',
      ccEmail: 'brand@freshbites.com',
      total: 3200,
      pricedCount: 1,
      manualCount: 0,
      external: false,
      tat: '14 working days',
      deliveredAt: '2026-07-29T10:05:00Z',
      acceptedAt: '2026-07-29T13:40:00Z',
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
}

export const DEMO_TOKENS = TOKENS;

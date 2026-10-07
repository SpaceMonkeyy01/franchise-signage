// Package readiness: what the request carries, read in one place.
//
// The card it feeds never gates anything (TBD is always allowed, SPEC §3), so
// what is pinned here is that each row reads the right fact, that rows appear
// only for the requests that collect them, and that "review-ready" means every
// row is done — a flag, not a blocker.

import { describe, expect, it } from 'vitest';

import type { LineItemRow, RequestDetail, RequestFileRow } from '../db/queries';
import { packageReadiness } from '../readiness';

function file(kind: string, lineItemId: string | null = null): RequestFileRow {
  return { id: `${kind}-${lineItemId}`, line_item_id: lineItemId, kind, storage_path: 'x', file_name: null, content_type: null };
}

function item(id: string, overrides: Partial<LineItemRow> = {}): LineItemRow {
  return {
    id,
    brand_item_id: `bi-${id}`,
    brand_item_name: `Sign ${id}`,
    sign_type: 'Sign',
    spec_summary: null,
    site_variables: [],
    pinned_attributes: {},
    render_key: null,
    image_path: null,
    pricing_basis: 'direct',
    origin: 'standard',
    item_status: 'auto_approved',
    sizing: '10 ft',
    site_notes: null,
    tbd_fields: [],
    exception_issue: null,
    review_note: null,
    est_price_snapshot: '100',
    vendor_policy_override: null,
    files: [file('placement_photo', id)],
    ...overrides,
  };
}

type Input = Parameters<typeof packageReadiness>[0];

function setup(overrides: Partial<Input> = {}): Input {
  return {
    intent: 'initial_setup',
    location: {
      id: 'loc',
      code: 'L1',
      name: 'Freshbites — Cedar Park',
      format: 'inline',
      address: { line1: '412 Whitestone Blvd', city: 'Cedar Park', state: 'TX', zip: '78613' },
      opening_date: '2026-10-01',
    } as RequestDetail['location'],
    items: [item('a'), item('b')],
    files: [file('landlord_criteria')],
    events: [],
    ...overrides,
  };
}

const row = (input: Input, key: string) => packageReadiness(input).rows.find((r) => r.key === key);

describe('packageReadiness', () => {
  it('calls a complete new-store package review-ready', () => {
    const readiness = packageReadiness(setup());
    expect(readiness.rows.map((r) => r.key)).toEqual(['location', 'photos', 'sizing', 'approvals', 'landlord']);
    expect(readiness.reviewReady).toBe(true);
    expect(readiness.followUps).toBe(0);
  });

  it('names the location details still to confirm', () => {
    const input = setup({
      location: { ...setup().location, address: { line1: '1 Main St', state: 'TX' }, opening_date: null },
    });
    expect(row(input, 'location')).toMatchObject({ state: 'follow_up', value: 'City, ZIP, opening date to confirm' });
  });

  it('counts photos per sign', () => {
    const input = setup({ items: [item('a'), item('b', { files: [] }), item('c')] });
    expect(row(input, 'photos')).toMatchObject({ state: 'follow_up', value: '2 of 3 signs' });
  });

  it('treats TBD or missing sizing as open, never as blocking', () => {
    const input = setup({ items: [item('a', { tbd_fields: ['sizing'] }), item('b', { sizing: null })] });
    const readiness = packageReadiness(input);
    expect(row(input, 'sizing')).toMatchObject({ state: 'follow_up', value: '2 TBD' });
    expect(readiness.reviewReady).toBe(false);
    expect(readiness.followUps).toBe(1);
  });

  it('shows items with corporate as waiting, not as something to chase', () => {
    const input = setup({ items: [item('a'), item('b', { item_status: 'pending_review' })] });
    const readiness = packageReadiness(input);
    expect(row(input, 'approvals')).toMatchObject({ state: 'with_corporate', value: '1 of 2 approved · 1 with corporate' });
    expect(readiness.followUps).toBe(0);
    expect(readiness.reviewReady).toBe(false);
  });

  it('flags items sent back for changes, and leaves declined items out of the count', () => {
    const input = setup({
      items: [item('a'), item('b', { item_status: 'changes_requested' }), item('c', { item_status: 'declined' })],
    });
    expect(row(input, 'approvals')).toMatchObject({
      state: 'follow_up',
      value: '1 of 2 approved · 1 needs changes · 1 declined',
    });
  });

  it('flags a missing lease exhibit, and credits the team’s criteria review', () => {
    expect(row(setup({ files: [] }), 'landlord')).toMatchObject({ state: 'follow_up', value: 'Flagged for follow-up' });
    expect(row(setup(), 'landlord')).toMatchObject({ state: 'done', value: 'Lease exhibit attached' });
    const reviewed = setup({
      events: [
        { id: 'e', kind: 'landlord_criteria_reviewed', actor: 'team', summary: '', detail: { result: 'yes' }, created_at: '' },
      ],
    });
    expect(row(reviewed, 'landlord')).toMatchObject({ state: 'done', value: 'Reviewed by Signage.com' });
  });

  it('asks a later request only about its signs', () => {
    expect(packageReadiness(setup({ intent: 'add' })).rows.map((r) => r.key)).toEqual(['photos', 'sizing', 'approvals']);
  });

  it('reads a replacement’s condition photo, and skips sizing it inherits', () => {
    const input = setup({
      intent: 'replace_like',
      items: [item('a', { origin: 'replacement', sizing: null, files: [file('condition_photo', 'a')] })],
    });
    const readiness = packageReadiness(input);
    expect(readiness.rows.map((r) => r.key)).toEqual(['photos', 'approvals']);
    expect(row(input, 'photos')).toMatchObject({ label: 'Condition photos', state: 'done', value: '1 of 1 sign' });
    expect(readiness.reviewReady).toBe(true);
  });
});

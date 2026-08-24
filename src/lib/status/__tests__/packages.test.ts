// The package lifecycle and the rollup (SPEC §6, amended v2.2).
//
// This is the answer to DECISIONS #51: §4 has always been able to split one
// request across recipients, but §6 offered the two tails only as alternatives
// on a single request status — so accepting the Signage.com half would have
// dragged the whole request to `accepted` and stranded the vendor half's "log
// order placed", which is gated on quote_ready. A split request could therefore
// be neither accepted nor invoiced (#57).
//
// The rule that replaced it is one line — the request sits at the stage of its
// least advanced package — and the two things that make it safe are pinned here:
// the derivation reads the package's own dates, and the rollup only ever
// advances.

import { describe, expect, it } from 'vitest';

import {
  canPackageTransition,
  derivePackageStatus,
  deriveRequestStatusFromPackages,
  isFulfillmentAdvance,
} from '../machine';
import { pkg } from './memory-store';

const at = (day: number) => new Date(`2026-08-0${day}T12:00:00Z`);

describe('derivePackageStatus', () => {
  it('reads the newest date that is set', () => {
    expect(derivePackageStatus(pkg({ id: 'p', deliveredAt: null }))).toBe('sent_for_quote');
    expect(derivePackageStatus(pkg({ id: 'p' }))).toBe('quote_ready');
    expect(derivePackageStatus(pkg({ id: 'p', acceptedAt: at(2) }))).toBe('accepted');
    expect(derivePackageStatus(pkg({ id: 'p', acceptedAt: at(2), inProductionAt: at(3) }))).toBe(
      'in_production',
    );
    expect(
      derivePackageStatus(
        pkg({ id: 'p', acceptedAt: at(2), inProductionAt: at(3), shippedAt: at(4) }),
      ),
    ).toBe('shipped');
    expect(derivePackageStatus(pkg({ id: 'p', acceptedAt: at(2), completedAt: at(5) }))).toBe(
      'completed',
    );
  });

  it('lets the external tail skip production entirely', () => {
    // The vendor fabricates off-platform, so their package goes accepted →
    // completed with nothing in between. Derived, not stored, so this cannot
    // disagree with the dates the timeline is written from.
    const vendor = pkg({ id: 'v', external: true, acceptedAt: at(2), completedAt: at(5) });
    expect(derivePackageStatus(vendor)).toBe('completed');
  });
});

describe('canPackageTransition', () => {
  it('is where the two tails actually diverge (SPEC §4)', () => {
    expect(canPackageTransition('accepted', 'in_production', 'internal')).toBe(true);
    expect(canPackageTransition('accepted', 'completed', 'internal')).toBe(false);
    expect(canPackageTransition('accepted', 'completed', 'external')).toBe(true);
    expect(canPackageTransition('accepted', 'in_production', 'external')).toBe(false);
  });

  it('refuses to skip a step on either tail', () => {
    expect(canPackageTransition('quote_ready', 'in_production', 'internal')).toBe(false);
    expect(canPackageTransition('sent_for_quote', 'accepted', 'internal')).toBe(false);
    expect(canPackageTransition('completed', 'shipped', 'internal')).toBe(false);
  });

  it('never lets an external package claim in-portal production', () => {
    // The database refuses this too (quotes_external_has_no_production). Both,
    // because a production date on a vendor's package would say Signage.com
    // fabricated a sign it never touched.
    expect(canPackageTransition('in_production', 'shipped', 'external')).toBe(false);
    expect(canPackageTransition('shipped', 'completed', 'external')).toBe(false);
  });
});

describe('the rollup', () => {
  it('is null before routing, when there are no packages to roll up', () => {
    expect(deriveRequestStatusFromPackages([])).toBeNull();
  });

  it('follows the single package on the pilot’s ordinary request', () => {
    expect(deriveRequestStatusFromPackages([pkg({ id: 'p', acceptedAt: at(2) })])).toBe('accepted');
  });

  it('sits at the LEAST advanced package on a split', () => {
    // The seeded §4 case: the pylon routes to the brand's approved vendor and
    // everything else stays with Signage.com.
    const ours = pkg({ id: 'ours', acceptedAt: at(2), inProductionAt: at(3) });
    const theirs = pkg({ id: 'theirs', external: true, recipientName: 'Meridian Sign Co.' });

    expect(deriveRequestStatusFromPackages([ours, theirs])).toBe('quote_ready');
  });

  it('walks the split storyline the spec table describes', () => {
    const vendor = (over = {}) => pkg({ id: 'v', external: true, recipientName: 'Meridian', ...over });
    const ours = (over = {}) => pkg({ id: 'o', ...over });
    const roll = (a: ReturnType<typeof ours>, b: ReturnType<typeof vendor>) =>
      deriveRequestStatusFromPackages([a, b]);

    expect(roll(ours(), vendor())).toBe('quote_ready');
    // We accept ours; the request does NOT move, because their half is untouched.
    expect(roll(ours({ acceptedAt: at(2) }), vendor())).toBe('quote_ready');
    // Their order is logged: now everything is committed.
    expect(roll(ours({ acceptedAt: at(2) }), vendor({ acceptedAt: at(2) }))).toBe('accepted');
    // We fabricate and install ours; the site is still not finished.
    expect(
      roll(ours({ acceptedAt: at(2), inProductionAt: at(3), completedAt: at(5) }), vendor({ acceptedAt: at(2) })),
    ).toBe('accepted');
    // Their sign goes up last.
    expect(
      roll(
        ours({ acceptedAt: at(2), inProductionAt: at(3), completedAt: at(5) }),
        vendor({ acceptedAt: at(2), completedAt: at(6) }),
      ),
    ).toBe('completed');
  });

  it('is monotonic: a package only advances, so the minimum only advances', () => {
    // The claim the whole design rests on. If it were false, a franchisee could
    // watch their request go backwards.
    const stages = [
      { id: 'p' },
      { id: 'p', acceptedAt: at(2) },
      { id: 'p', acceptedAt: at(2), inProductionAt: at(3) },
      { id: 'p', acceptedAt: at(2), inProductionAt: at(3), shippedAt: at(4) },
      { id: 'p', acceptedAt: at(2), inProductionAt: at(3), shippedAt: at(4), completedAt: at(5) },
    ];
    const rolled = stages.map((s) => deriveRequestStatusFromPackages([pkg(s)])!);

    for (let i = 1; i < rolled.length; i += 1) {
      expect(isFulfillmentAdvance(rolled[i - 1], rolled[i])).toBe(true);
    }
  });
});

describe('isFulfillmentAdvance', () => {
  it('ranks anything before routing below every fulfillment stage', () => {
    expect(isFulfillmentAdvance('approved', 'sent_for_quote')).toBe(true);
    expect(isFulfillmentAdvance('submitted', 'quote_ready')).toBe(true);
  });

  it('refuses to move a request backwards', () => {
    // The guard for data the rollup did not write — a hand-edited row, a
    // backfilled migration. The package's own event is still recorded; the
    // request simply stays where it is.
    expect(isFulfillmentAdvance('shipped', 'accepted')).toBe(false);
    expect(isFulfillmentAdvance('completed', 'in_production')).toBe(false);
    expect(isFulfillmentAdvance('accepted', 'accepted')).toBe(false);
  });
});

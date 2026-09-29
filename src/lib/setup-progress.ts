// Where a new store's setup is, for the franchisee's store card.
//
// The request status already says it (SPEC §6 — on a split request, the stage
// of its least advanced package); this names it the way a franchisee thinks
// about opening a store: set up, approvals, quote, production, shipped,
// installed. One stage is current, and a line says what is happening now and
// whether it is the franchisee's move.

import type { RequestStatus } from './status/types';

export const SETUP_STAGES = [
  'Store set up',
  'Approvals',
  'Quote',
  'Production',
  'Shipped',
  'Installed',
] as const;

export interface SetupProgress {
  /** Index into SETUP_STAGES of the stage under way; every earlier one is done. */
  current: number;
  /** What is happening now, in a sentence. */
  now: string;
  /** Set when the next move is the franchisee's: the button's label. */
  action: string | null;
}

const STATUS_PROGRESS: Record<Exclude<RequestStatus, 'draft' | 'completed'>, SetupProgress> = {
  submitted: { current: 1, now: 'Signage.com is preparing your sign package.', action: null },
  needs_review: {
    current: 1,
    now: 'Corporate is reviewing your add-ons and exceptions. Standard signs are already approved.',
    action: null,
  },
  changes_requested: {
    current: 1,
    now: 'Corporate asked for changes on some items. Everything else keeps its approval.',
    action: 'Update the flagged items',
  },
  approved: { current: 2, now: 'Approved. Signage.com is preparing your quote.', action: null },
  sent_for_quote: { current: 2, now: 'Your quote is being prepared.', action: null },
  quote_ready: { current: 2, now: 'Your quote is ready.', action: 'Review your quote' },
  accepted: { current: 3, now: 'Quote accepted. Signage.com is scheduling production.', action: null },
  in_production: { current: 3, now: 'Your signs are in production.', action: null },
  shipped: { current: 4, now: 'Your signs have shipped. Installation is next.', action: null },
};

/** Null once the store is installed (or before anything was submitted). */
export function setupProgress(status: RequestStatus): SetupProgress | null {
  if (status === 'draft' || status === 'completed') return null;
  return STATUS_PROGRESS[status];
}

/** "Opens Oct 1 · in 2 days", "Opened Sep 15", or null with no date. */
export function openingLine(
  openingDate: string | Date | null,
  today: Date = new Date(),
): string | null {
  if (!openingDate) return null;
  // The date is a calendar day with no time zone: compare days, not instants.
  // `pg` hands a `date` column over as a Date at local midnight; a string is
  // `YYYY-MM-DD`. Either way, take the day it names.
  const [y, m, d] =
    openingDate instanceof Date
      ? [openingDate.getFullYear(), openingDate.getMonth() + 1, openingDate.getDate()]
      : openingDate.slice(0, 10).split('-').map(Number);
  const opening = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((opening - now) / 86_400_000);
  const label = new Date(opening).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (days < 0) return `Opened ${label}`;
  if (days === 0) return `Opens today, ${label}`;
  return `Opens ${label} · in ${days} ${days === 1 ? 'day' : 'days'}`;
}

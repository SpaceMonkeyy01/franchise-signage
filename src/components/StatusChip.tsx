// Status chips, worded and coloured as docs/flow-demo.jsx words them.
//
// The wording matters more than the colour: `auto_approved` reads as
// "Pre-approved" to a franchisee, because the promise of the program is that
// their standard signs never wait on corporate. Never surface the raw enum.

import type { LineItemStatus, RequestStatus } from '@/lib/status/types';

const ITEM: Record<LineItemStatus, { label: string; className: string }> = {
  auto_approved: { label: 'Pre-approved', className: 'bg-green-100 text-green-800' },
  pending_review: { label: 'Needs corporate approval', className: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-800' },
  declined: { label: 'Declined', className: 'bg-rose-100 text-rose-800' },
  changes_requested: { label: 'Changes requested', className: 'bg-rose-100 text-rose-800' },
};

const REQUEST: Record<RequestStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800' },
  needs_review: { label: 'Needs review', className: 'bg-amber-100 text-amber-800' },
  changes_requested: { label: 'Changes requested', className: 'bg-rose-100 text-rose-800' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-800' },
  sent_for_quote: { label: 'Sent for quote', className: 'bg-emerald-100 text-emerald-800' },
  quote_ready: { label: 'Quote ready', className: 'bg-indigo-100 text-indigo-800' },
  accepted: { label: 'Quote accepted', className: 'bg-emerald-100 text-emerald-800' },
  in_production: { label: 'In production', className: 'bg-purple-100 text-purple-800' },
  shipped: { label: 'Shipped', className: 'bg-sky-100 text-sky-800' },
  completed: { label: 'Installed', className: 'bg-gray-200 text-gray-700' },
};

export function ItemStatusChip({ status }: { status: LineItemStatus }) {
  return <Chip {...ITEM[status]} />;
}

export function RequestStatusChip({ status }: { status: RequestStatus }) {
  return <Chip {...REQUEST[status]} />;
}

function Chip({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {label}
    </span>
  );
}

/**
 * Which vendor fulfils this item (SPEC §4).
 *
 * Shown next to every price because it is the thing that changes what happens
 * next: Signage.com items run the automated tail, external items leave the
 * portal and come back as manually logged milestones.
 */
export function VendorChip({
  policy,
  vendorName,
  brandPolicy,
}: {
  policy: string;
  vendorName: string | null;
  /**
   * The brand's own policy, when the caller knows it.
   *
   * `brands` carries ONE vendor identity, so an item whose override resolves to
   * a different policy has no name on file — and printing the brand's vendor
   * name there tells a franchisee their pylon is going somewhere it is not.
   * Passing this makes the chip fall back to the honest generic label. See
   * docs/DECISIONS.md #20.
   */
  brandPolicy?: string;
}) {
  const external = policy !== 'signage_com';
  const named = brandPolicy === undefined || policy === brandPolicy ? vendorName : null;
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-medium"
      style={
        external
          ? { background: '#EDE9FE', color: '#5B21B6' }
          : { background: 'var(--color-brand-light)', color: 'var(--color-brand-dark)' }
      }
    >
      {external ? (named ?? 'External vendor') : 'Signage.com'}
    </span>
  );
}

/** Prices are estimates until a quote exists; null means "Custom quote". */
export function formatPrice(value: string | number | null): string {
  if (value === null) return 'Custom quote';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return 'Custom quote';
  return `$${amount.toLocaleString('en-US')}`;
}

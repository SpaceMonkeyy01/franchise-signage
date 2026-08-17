'use client';

import { useState, useTransition } from 'react';

import { ItemStatusChip, RequestStatusChip, formatPrice, VendorChip } from '@/components/StatusChip';
import type { LineItemRow, RequestDetail } from '@/lib/db/queries';

import {
  decideItemAction,
  deliverQuoteAction,
  logAcceptanceAction,
  logLandlordEventAction,
  milestoneAction,
  prepPackageAction,
  priceItemAction,
  requestChangesAction,
  routeAction,
} from '../../actions';

export function Console({ request }: { request: RequestDetail }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Every action reports failure the same way; success re-renders the page. */
  const act = (fn: () => Promise<{ error: string } | undefined>) => {
    setError(null);
    startTransition(async () => {
      const failure = await fn();
      if (failure) setError(failure.error);
    });
  };

  return (
    <div className={pending ? 'pointer-events-none opacity-60' : undefined}>
      <div className="mt-4 flex items-center gap-2">
        <RequestStatusChip status={request.status} />
        {pending && <span className="text-xs text-gray-400">working…</span>}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      <TeamPanel request={request} act={act} />
      <ItemsPanel request={request} act={act} />
      <LandlordPanel request={request} act={act} />
      <TimelinePanel request={request} />
    </div>
  );
}

type Act = (fn: () => Promise<{ error: string } | undefined>) => void;

// ------------------------------------------------------------ Signage.com team

function TeamPanel({ request, act }: { request: RequestDetail; act: Act }) {
  const [criteria, setCriteria] = useState<'yes' | 'no' | 'not_provided'>('not_provided');
  const quotes = request.quotes;
  const external = quotes.length > 0 && quotes.some((quote) => quote.external);

  return (
    <Section title="Signage.com team">
      {request.status === 'submitted' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Preparing the package derives the request forward: all-auto-approved goes straight to
            approved (the fast lane), anything pending goes to corporate.
          </p>
          <label className="block text-xs text-gray-600">
            §8b landlord sign criteria reviewed
            <select
              value={criteria}
              onChange={(event) => setCriteria(event.target.value as typeof criteria)}
              className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs"
            >
              <option value="not_provided">not provided</option>
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </label>
          <Button onClick={() => act(() => prepPackageAction(request.id, criteria))}>
            Prepare package
          </Button>
        </div>
      )}

      {request.status === 'needs_review' && (
        <p className="text-xs text-gray-500">
          With corporate — {request.items.filter((i) => i.item_status === 'pending_review').length}{' '}
          item(s) awaiting a decision below.
        </p>
      )}

      {request.status === 'changes_requested' && (
        <p className="text-xs text-gray-500">
          With the franchisee: they edit the flagged items on their status page and resubmit.
        </p>
      )}

      {request.status === 'approved' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Routing resolves each item&rsquo;s vendor (item override ?? brand policy) and creates one
            quote package per recipient — a request with a pylon splits in two.
          </p>
          <Button onClick={() => act(() => routeAction(request.id))}>Route for quote</Button>
        </div>
      )}

      {request.status === 'sent_for_quote' && (
        <Button onClick={() => act(() => deliverQuoteAction(request.id))}>
          Deliver quote to franchisee
        </Button>
      )}

      {request.status === 'quote_ready' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            {external
              ? 'External tail: the franchisee accepts with the vendor directly and the team logs it.'
              : 'Internal tail: the franchisee accepts on their own status page.'}
          </p>
          {external && (
            <Button onClick={() => act(() => logAcceptanceAction(request.id))}>
              Log acceptance
            </Button>
          )}
        </div>
      )}

      {request.status === 'accepted' && (
        <div className="flex flex-wrap gap-2">
          {!external && (
            <Button onClick={() => act(() => milestoneAction(request.id, 'in_production'))}>
              Start production
            </Button>
          )}
          {external && (
            <Button onClick={() => act(() => milestoneAction(request.id, 'completed'))}>
              Mark installed
            </Button>
          )}
        </div>
      )}

      {request.status === 'in_production' && (
        <Button onClick={() => act(() => milestoneAction(request.id, 'shipped'))}>
          Mark shipped
        </Button>
      )}

      {request.status === 'shipped' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            The only transition that writes installed_signs — after this, the location&rsquo;s record
            carries these signs and future requests are lookups.
          </p>
          <Button onClick={() => act(() => milestoneAction(request.id, 'completed'))}>
            Mark installed
          </Button>
        </div>
      )}

      {request.status === 'completed' && (
        <p className="text-xs text-gray-500">
          Done. The location record was updated on this transition.
        </p>
      )}

      {quotes.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs text-gray-600">
          {quotes.map((quote) => (
            <li key={quote.id}>
              {quote.recipient_kind.replace(/_/g, ' ')} · {formatPrice(quote.priced_total)} ·{' '}
              {quote.priced_count} priced
              {quote.manual_count > 0 && ` · ${quote.manual_count} custom`}
              {quote.external && ' · external tail'}
              {quote.delivered_at && ' · delivered'}
              {quote.accepted_at && ' · accepted'}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------- items + corporate

function ItemsPanel({ request, act }: { request: RequestDetail; act: Act }) {
  return (
    <Section title="Line items">
      <div className="space-y-3">
        {request.items.map((item) => (
          <ItemRow key={item.id} request={request} item={item} act={act} />
        ))}
      </div>
    </Section>
  );
}

function ItemRow({
  request,
  item,
  act,
}: {
  request: RequestDetail;
  item: LineItemRow;
  act: Act;
}) {
  const [note, setNote] = useState('');
  const [price, setPrice] = useState('');
  const decidable = item.item_status === 'pending_review';
  // Standin-priced items carry no estimate and must be priced by hand (§2.1).
  const needsPricing = item.est_price_snapshot === null && item.item_status !== 'declined';

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900">
          {item.brand_item_name}
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
            {item.origin}
          </span>
          <VendorChip
            policy={item.vendor_policy_override ?? request.brand.vendor_policy}
            vendorName={request.brand.vendor_name}
            brandPolicy={request.brand.vendor_policy}
          />
          <span className="text-xs font-normal text-gray-500">
            {formatPrice(item.est_price_snapshot)}
          </span>
        </span>
        <ItemStatusChip status={item.item_status} />
      </div>

      <p className="mt-1 text-xs text-gray-500">
        {item.sizing ?? 'no sizing'}
        {item.tbd_fields.length > 0 && ` · TBD: ${item.tbd_fields.join(', ')}`}
        {item.exception_issue && ` · issue: ${item.exception_issue}`}
      </p>
      {item.review_note && (
        <p className="mt-1 text-xs text-gray-600">Reviewer note: {item.review_note}</p>
      )}

      {needsPricing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-amber-50 px-2 py-1.5">
          <span className="text-[11px] text-amber-900">Custom quote — price it by hand:</span>
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="e.g. 2400"
            inputMode="decimal"
            className="w-28 rounded border border-amber-300 bg-white px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={!price.trim()}
            onClick={() => act(() => priceItemAction(request.id, item.id, Number(price)))}
            className="rounded bg-amber-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
          >
            Set price
          </button>
        </div>
      )}

      {decidable && (
        <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2">
          <p className="mb-1.5 text-[11px] font-medium text-gray-700">Corporate decision</p>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note (required to request changes)"
            className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => act(() => decideItemAction(request.id, item.id, 'approved', note))}
              className="rounded px-2.5 py-1 text-[11px] font-medium text-white"
              style={{ background: 'var(--color-brand, #2E7D32)' }}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={!note.trim()}
              onClick={() => act(() => requestChangesAction(request.id, [item.id], note))}
              className="rounded bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40"
            >
              Request changes
            </button>
            <button
              type="button"
              onClick={() => act(() => decideItemAction(request.id, item.id, 'declined', note))}
              className="rounded bg-rose-600 px-2.5 py-1 text-[11px] font-medium text-white"
            >
              Decline
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------- §8b landlord

function LandlordPanel({ request, act }: { request: RequestDetail; act: Act }) {
  const [note, setNote] = useState('');

  return (
    <Section title="Landlord approval (§8b — tracked, never automated)">
      <p className="text-xs text-gray-500">
        Logged by hand. Nothing here promises a compliance or approval outcome; the events exist so
        the timeline can answer &ldquo;where is this with the landlord&rdquo;.
      </p>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional note"
        className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {(['sent', 'approved', 'rejected'] as const).map((outcome) => (
          <button
            key={outcome}
            type="button"
            onClick={() => act(() => logLandlordEventAction(request.id, outcome, note))}
            className="rounded border border-gray-300 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:border-gray-400"
          >
            Log {outcome}
          </button>
        ))}
      </div>
    </Section>
  );
}

// -------------------------------------------------------------------- shared

function TimelinePanel({ request }: { request: RequestDetail }) {
  return (
    <Section title={`History (${request.events.length})`}>
      <ol className="space-y-2">
        {request.events.map((event) => (
          <li key={event.id} className="text-xs">
            <span className="text-gray-800">{event.summary}</span>
            <span className="ml-1.5 text-gray-400">
              — {event.actor} · {new Date(event.created_at).toLocaleString('en-US')}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
    >
      {children}
    </button>
  );
}

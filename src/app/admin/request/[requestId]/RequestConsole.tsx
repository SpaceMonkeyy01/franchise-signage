'use client';

// The action chain, and the state it acts on.
//
// Only the actions that are legal right now are rendered. The §6 machine would
// reject the rest anyway, so showing them would be offering an operator a button
// that cannot work — the queue's "next step" column and this panel say the same
// thing, and both come from the request's own status.

import { useState, useTransition } from 'react';

import { PhotoUpload } from '@/components/PhotoUpload';
import { SignThumbnail } from '@/components/SignThumbnail';
import { formatPrice, ItemStatusChip, RequestStatusChip, VendorChip } from '@/components/StatusChip';
import type { LineItemRow, RequestDetail } from '@/lib/db/queries';
import { fileUrl } from '@/lib/storage/url';

import {
  addNoteAction,
  attachMockupAction,
  deliverQuoteAction,
  logExternalOrderAction,
  logExternalQuoteAction,
  logLandlordEventAction,
  milestoneAction,
  prepPackageAction,
  priceItemAction,
  routeAction,
} from '../../actions';

type Act = (fn: () => Promise<{ error: string } | undefined>) => void;

const FILE_KIND_LABEL: Record<string, string> = {
  placement_photo: 'Placement photo',
  condition_photo: 'Condition photo',
  mockup: 'Mockup',
  site_file: 'Site file',
  landlord_criteria: 'Lease sign exhibit',
  package_pdf: 'Package',
};

export function RequestConsole({ request }: { request: RequestDetail }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act: Act = (fn) => {
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
        {request.financing_involved && (
          <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-900">
            §8b lender documents needed
          </span>
        )}
        {pending && <span className="text-xs text-gray-400">working…</span>}
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <ActionPanel request={request} act={act} />
      <ItemsPanel request={request} act={act} />
      <FilesPanel request={request} />
      <LandlordPanel request={request} act={act} />
      <TimelinePanel request={request} act={act} />
    </div>
  );
}

// -------------------------------------------------------------- action chain

function ActionPanel({ request, act }: { request: RequestDetail; act: Act }) {
  const [criteria, setCriteria] = useState<'yes' | 'no' | 'not_provided'>('not_provided');
  const [externalTotal, setExternalTotal] = useState('');
  const [note, setNote] = useState('');

  // Which tail this request is on is a property of its quotes (SPEC §4): any
  // external package means fabrication happens off-platform and the team logs
  // milestones by hand instead of driving them.
  const external = request.quotes.length > 0 && request.quotes.some((quote) => quote.external);
  const hasLandlordExhibit = request.files.some((file) => file.kind === 'landlord_criteria');

  return (
    <Section title="Next step">
      {request.status === 'submitted' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Preparing derives the request forward: every item auto-approved goes straight to
            approved and corporate is never emailed; anything pending goes to them.
          </p>
          <label className="block text-xs text-gray-600">
            §8b · lease sign criteria reviewed{' '}
            <span className="text-gray-400">
              ({hasLandlordExhibit ? 'exhibit attached below' : 'no exhibit provided'})
            </span>
            <select
              value={criteria}
              onChange={(event) => setCriteria(event.target.value as typeof criteria)}
              className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs"
            >
              <option value="not_provided">not provided</option>
              <option value="yes">yes — package fits</option>
              <option value="no">no — conflict found</option>
            </select>
          </label>
          <p className="text-[11px] text-gray-400">
            A conflict is not recorded here: flag the offending item as an exception so corporate
            decides it through the normal review path.
          </p>
          <Button onClick={() => act(() => prepPackageAction(request.id, criteria))}>
            Prepare package
          </Button>
        </div>
      )}

      {request.status === 'needs_review' && (
        <Waiting>
          With corporate — {request.items.filter((i) => i.item_status === 'pending_review').length}{' '}
          item(s) awaiting a decision. The approval email has gone to the brand&rsquo;s reviewer
          with a link that expires in seven days; the SLA timer chases it after the brand&rsquo;s
          review window. With no mail provider configured, the message is in the outbox at{' '}
          <code className="rounded bg-gray-100 px-1">/dev</code>.
        </Waiting>
      )}

      {request.status === 'changes_requested' && (
        <Waiting>
          With the franchisee: they edit the flagged items on their status page and resubmit, which
          returns those items — and only those — to corporate.
        </Waiting>
      )}

      {request.status === 'approved' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Routing resolves each item&rsquo;s vendor (item override ?? brand policy) and creates one
            package per recipient. A request whose items disagree splits into several.
          </p>
          <Button onClick={() => act(() => routeAction(request.id))}>Route for quote</Button>
        </div>
      )}

      {request.status === 'sent_for_quote' && !external && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Internal tail — price any custom items below first, then send the quote to the
            franchisee.
          </p>
          <Button onClick={() => act(() => deliverQuoteAction(request.id))}>
            Deliver quote to franchisee
          </Button>
        </div>
      )}

      {request.status === 'sent_for_quote' && external && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            External tail — the vendor quotes off-platform. Log what they came back with.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={externalTotal}
              onChange={(event) => setExternalTotal(event.target.value)}
              placeholder="Vendor total"
              inputMode="decimal"
              className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Reference / note"
              className="min-w-40 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <Button
              onClick={() =>
                act(() => logExternalQuoteAction(request.id, Number(externalTotal), note))
              }
            >
              Log vendor quote
            </Button>
          </div>
        </div>
      )}

      {request.status === 'quote_ready' && !external && (
        <Waiting>
          With the franchisee — they accept on their own status page, which starts production.
        </Waiting>
      )}

      {request.status === 'quote_ready' && external && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            The franchisee orders with the vendor directly. Log it when they confirm.
          </p>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="PO / reference"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <Button onClick={() => act(() => logExternalOrderAction(request.id, note))}>
            Log order placed
          </Button>
        </div>
      )}

      {request.status === 'accepted' && (
        <div className="space-y-2">
          {external ? (
            <>
              <p className="text-xs text-gray-500">
                External tail: no production stages to drive — the vendor fabricates and installs,
                and this is the milestone that matters.
              </p>
              <Button onClick={() => act(() => milestoneAction(request.id, 'completed'))}>
                Mark installed
              </Button>
            </>
          ) : (
            <Button onClick={() => act(() => milestoneAction(request.id, 'in_production'))}>
              Start production
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
            The only transition that writes installed_signs. After it, this location&rsquo;s record
            carries these signs and every future request against them is a lookup.
          </p>
          <Button onClick={() => act(() => milestoneAction(request.id, 'completed'))}>
            Mark installed
          </Button>
        </div>
      )}

      {request.status === 'completed' && (
        <Waiting>Installed. The location record was updated on this transition.</Waiting>
      )}

      {request.quotes.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs text-gray-600">
          {request.quotes.map((quote) => (
            <li key={quote.id}>
              <span className="font-medium">{quote.recipient_kind.replace(/_/g, ' ')}</span> ·{' '}
              {formatPrice(quote.priced_total)} · {quote.priced_count} priced
              {quote.manual_count > 0 && ` · ${quote.manual_count} custom`}
              {quote.external ? ' · external tail' : ' · Signage.com fulfils'}
              {quote.delivered_at && ' · delivered'}
              {quote.accepted_at && ' · accepted'}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// -------------------------------------------------------------------- items

function ItemsPanel({ request, act }: { request: RequestDetail; act: Act }) {
  const manual = request.items.filter(
    (item) => item.est_price_snapshot === null && item.item_status !== 'declined',
  );

  return (
    <Section title={`Line items (${request.items.length})`}>
      {manual.length > 0 && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>{manual.length} item(s) need manual pricing.</strong> Their catalog rows have no
          pricing model, so the franchisee sees &ldquo;Custom quote&rdquo; until someone here puts a
          number on them.
        </p>
      )}
      <div className="space-y-3">
        {request.items.map((item) => (
          <ItemRow key={item.id} request={request} item={item} act={act} />
        ))}
      </div>
    </Section>
  );
}

function ItemRow({ request, item, act }: { request: RequestDetail; item: LineItemRow; act: Act }) {
  const [price, setPrice] = useState('');
  const needsPricing = item.est_price_snapshot === null && item.item_status !== 'declined';
  const mockup = item.files.find((file) => file.kind === 'mockup');

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex gap-3">
        <SignThumbnail
          renderKey={item.render_key}
          label={item.brand_item_name}
          className="h-12 w-16 shrink-0 rounded"
        />
        <div className="min-w-0 flex-1">
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
              <span className="text-xs font-normal text-gray-600">
                {formatPrice(item.est_price_snapshot)}
              </span>
            </span>
            <ItemStatusChip status={item.item_status} />
          </div>

          <p className="mt-1 text-xs text-gray-500">
            {item.spec_summary}
            {item.sizing && ` · ${item.sizing}`}
          </p>
          {item.tbd_fields.length > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              TBD: {item.tbd_fields.join(', ')} — chase the franchisee before fabrication.
            </p>
          )}
          {item.exception_issue && (
            <p className="mt-1 text-xs text-rose-700">Exception: {item.exception_issue}</p>
          )}
          {item.site_notes && <p className="mt-1 text-xs text-gray-600">{item.site_notes}</p>}
          {item.review_note && (
            <p className="mt-1 text-xs text-green-800">Corporate: {item.review_note}</p>
          )}

          {needsPricing && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-amber-50 px-2 py-1.5">
              <span className="text-[11px] text-amber-900">Custom quote — price it:</span>
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

          {/* Manual mockup upload — the whole mockup story until Session 7. */}
          <div className="mt-2 max-w-sm">
            {mockup ? (
              <p className="text-[11px] text-gray-600">
                Mockup attached:{' '}
                <a
                  href={fileUrl(mockup.storage_path)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {mockup.file_name ?? 'view'}
                </a>
              </p>
            ) : (
              <PhotoUpload
                label="Attach a mockup for this item"
                prefix={request.brand.slug}
                value={null}
                onChange={(file) => {
                  if (file) act(() => attachMockupAction(request.id, item.id, file));
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- files

function FilesPanel({ request }: { request: RequestDetail }) {
  const files = [...request.files, ...request.items.flatMap((item) => item.files)];
  if (files.length === 0) return null;

  return (
    <Section title={`Files (${files.length})`}>
      <ul className="space-y-1 text-xs text-gray-600">
        {files.map((file) => (
          <li key={file.id}>
            <a
              href={fileUrl(file.storage_path)}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {FILE_KIND_LABEL[file.kind] ?? file.kind}: {file.file_name ?? 'view'}
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ----------------------------------------------------------------- §8b landlord

function LandlordPanel({ request, act }: { request: RequestDetail; act: Act }) {
  const [note, setNote] = useState('');

  return (
    <Section title="Landlord approval (§8b — tracked, never automated)">
      <p className="text-xs text-gray-500">
        Logged by hand. Nothing here promises a compliance or approval outcome; the events exist so
        the timeline can answer &ldquo;where is this with the landlord&rdquo;. Permit stages are
        phase 2 and are deliberately not modelled.
      </p>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional note"
        className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
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

// ------------------------------------------------------------------ timeline

function TimelinePanel({ request, act }: { request: RequestDetail; act: Act }) {
  const [note, setNote] = useState('');

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

      <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add a note to the record"
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          disabled={!note.trim()}
          onClick={() => {
            act(() => addNoteAction(request.id, note));
            setNote('');
          }}
          className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 disabled:opacity-40"
        >
          Add note
        </button>
      </div>
    </Section>
  );
}

// -------------------------------------------------------------------- shared

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-gray-500">{children}</p>;
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

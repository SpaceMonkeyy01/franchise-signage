'use client';

// The switcher. Each tab frames a real screen at the address its participant
// would actually open, so what is shown is what they see — including every
// action they can take. Acting in one tab and switching to another reloads that
// frame, which is the demo's "shared state" made real: it is the same database.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export interface DemoRequest {
  id: string;
  code: string;
  brandSlug: string;
  brandName: string;
  locationName: string;
  status: string;
  accessToken: string;
  /** The latest approval email in the outbox, if this request ever needed corporate. */
  approvalEmailId: string | null;
}

type Persona = 'franchisee' | 'team' | 'reviewer' | 'corporate';

const PERSONAS: Array<{ id: Persona; label: string; how: string }> = [
  {
    id: 'franchisee',
    label: 'Franchisee',
    how: 'No account. Opens the private link for this request, from any email the portal sends them.',
  },
  {
    id: 'team',
    label: 'Signage.com team',
    how: 'Signs in to the operator console. Preps, routes, prices and fulfils.',
  },
  {
    id: 'reviewer',
    label: 'Corporate reviewer',
    how: 'No account. Decides from the approval email: each button is a signed, single-use, 7-day link.',
  },
  {
    id: 'corporate',
    label: 'Corporate dashboard',
    how: 'No account. A 30-day, read-only link emailed to a contact on the brand.',
  },
];

export function Walkthrough({
  requests,
  brands,
  initialPersona,
  initialRequestId,
}: {
  requests: DemoRequest[];
  brands: Array<{ slug: string; name: string }>;
  initialPersona?: string;
  initialRequestId?: string;
}) {
  const router = useRouter();
  const [persona, setPersona] = useState<Persona>(
    PERSONAS.find((p) => p.id === initialPersona)?.id ?? 'franchisee',
  );
  const [requestId, setRequestId] = useState<string | null>(
    requests.find((r) => r.id === initialRequestId)?.id ?? requests[0]?.id ?? null,
  );
  // Sub-views: the request itself, or where that participant starts from.
  const [atHome, setAtHome] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Keep the address in step, so a reload or a shared URL lands on this view.
  useEffect(() => {
    const params = new URLSearchParams({ as: persona });
    if (requestId) params.set('req', requestId);
    window.history.replaceState(null, '', `?${params}`);
  }, [persona, requestId]);

  const request = requests.find((r) => r.id === requestId) ?? null;
  const brandSlug = request?.brandSlug ?? brands[0]?.slug ?? null;
  const brandName = request?.brandName ?? brands[0]?.name ?? '';

  const src = frameSource();
  const current = PERSONAS.find((p) => p.id === persona)!;

  function frameSource(): string | null {
    switch (persona) {
      case 'franchisee':
        if (atHome || !request) return brandSlug ? `/${brandSlug}` : null;
        return `/${request.brandSlug}/request/${request.accessToken}`;
      case 'team':
        if (atHome || !request) return '/admin';
        return `/admin/request/${request.id}`;
      case 'reviewer':
        return request?.approvalEmailId ? `/admin/outbox/${request.approvalEmailId}` : null;
      case 'corporate':
        // Behind sign-in since phase C; the operator's own session opens it,
        // and Signage.com sees what a brand admin sees.
        return brandSlug ? `/${brandSlug}/corporate` : null;
    }
  }

  function refresh() {
    setNonce((n) => n + 1);
    router.refresh();
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPersona(p.id);
                  setAtHome(false);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  persona === p.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <select
            value={requestId ?? ''}
            onChange={(event) => {
              setRequestId(event.target.value || null);
              setAtHome(false);
            }}
            aria-label="Request"
            className="min-w-0 max-w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
          >
            {requests.length === 0 && <option value="">No requests yet</option>}
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.locationName} · {r.status.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={refresh}
              className="text-gray-600 underline-offset-2 hover:underline"
            >
              Refresh
            </button>
            {src && (
              <Link
                href={src}
                target="_blank"
                className="text-gray-600 underline-offset-2 hover:underline"
              >
                Open in new tab
              </Link>
            )}
          </div>
        </div>

        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3 text-xs sm:px-6">
          <p className="text-gray-500">{current.how}</p>
          {(persona === 'franchisee' || persona === 'team') && (
            <div className="flex gap-2">
              <SubTab
                active={!atHome && !!request}
                disabled={!request}
                onClick={() => setAtHome(false)}
              >
                This request
              </SubTab>
              <SubTab active={atHome || !request} onClick={() => setAtHome(true)}>
                {persona === 'franchisee' ? `${brandName} home` : 'The queue'}
              </SubTab>
            </div>
          )}
        </div>
      </div>

      {src ? (
        <iframe
          key={`${src}#${nonce}`}
          src={src}
          title={`${current.label} view`}
          className="w-full flex-1 border-0 bg-white"
          style={{ minHeight: '70vh' }}
        />
      ) : (
        <div className="mx-auto w-full max-w-xl px-4 py-16 text-center text-sm leading-relaxed text-gray-500">
          {persona === 'reviewer' &&
            (request ? (
              <>
                No approval email has gone out for {request.code}. Either nothing on it needs
                corporate — standard and like-for-like items take the fast lane — or the team has
                not prepared its package yet. Prepare it from the Signage.com team tab and the email
                appears here. (The seeded demo requests were written straight to the database, so
                they never sent one.)
              </>
            ) : (
              'No request selected.'
            ))}
          {persona === 'corporate' && 'No brand to show.'}
          {persona === 'franchisee' && 'No brand configured.'}
        </div>
      )}
    </main>
  );
}

function SubTab({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-2.5 py-0.5 ${
        active
          ? 'border-gray-900 bg-gray-900 text-white'
          : 'border-gray-300 text-gray-600 hover:border-gray-400'
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

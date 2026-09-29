// The package readiness card — one component for the franchisee's status page
// and the team's request console, so the two never describe the same package
// differently. No hooks and no server-only imports: it renders in either.

import type { Readiness, ReadinessState } from '@/lib/readiness';

const STATE_STYLE: Record<ReadinessState, { value: string; label: string }> = {
  done: { value: 'text-emerald-800', label: 'Done' },
  follow_up: { value: 'text-amber-800', label: 'To follow up' },
  with_corporate: { value: 'text-sky-800', label: 'With corporate' },
};

export function ReadinessCard({
  readiness,
  audience,
  className = 'mt-5',
}: {
  readiness: Readiness;
  audience: 'franchisee' | 'team';
  /** Spacing from what sits above it; the landing page frames it instead. */
  className?: string;
}) {
  const chip = readiness.reviewReady
    ? { text: 'Review-ready', className: 'bg-emerald-100 text-emerald-900' }
    : readiness.followUps > 0
      ? {
          text: `${readiness.followUps} to follow up`,
          className: 'bg-amber-100 text-amber-900',
        }
      : { text: 'With corporate', className: 'bg-sky-100 text-sky-900' };

  return (
    <section
      className={`${className} rounded-xl border border-gray-200 bg-white p-4`}
      aria-labelledby="readiness-heading"
      data-testid="readiness"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="readiness-heading" className="text-sm font-semibold text-gray-900">
          Package readiness
        </h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>
          {chip.text}
        </span>
      </div>

      <ul className="mt-3 divide-y divide-gray-100">
        {readiness.rows.map((row) => (
          <li key={row.key} className="flex items-center gap-3 py-2" data-state={row.state}>
            <StateIcon state={row.state} />
            <span className="flex-1 text-sm text-gray-800">{row.label}</span>
            <span className={`text-right text-xs font-medium ${STATE_STYLE[row.state].value}`}>
              {row.value}
            </span>
          </li>
        ))}
      </ul>

      {!readiness.reviewReady && (
        <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
          {audience === 'franchisee'
            ? 'Nothing here holds up your request. Signage.com follows up on anything flagged before quote preparation.'
            : 'Flags never block: chase what is open before the package goes out for quote.'}
        </p>
      )}
    </section>
  );
}

function StateIcon({ state }: { state: ReadinessState }) {
  const label = STATE_STYLE[state].label;
  if (state === 'done') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" role="img" aria-label={label} className="shrink-0">
        <circle cx="9" cy="9" r="9" fill="#D1FAE5" />
        <path d="M5.5 9.2l2.3 2.3 4.7-4.9" stroke="#047857" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === 'follow_up') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" role="img" aria-label={label} className="shrink-0">
        <circle cx="9" cy="9" r="9" fill="#FEF3C7" />
        <path d="M9 5v5" stroke="#B45309" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="9" cy="12.8" r="1.1" fill="#B45309" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" role="img" aria-label={label} className="shrink-0">
      <circle cx="9" cy="9" r="9" fill="#E0F2FE" />
      <path d="M9 5.2V9l2.6 1.6" stroke="#0369A1" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

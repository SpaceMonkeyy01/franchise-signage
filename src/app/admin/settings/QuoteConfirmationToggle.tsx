'use client';

import { useState, useTransition } from 'react';

import { setQuoteConfirmationAction } from './actions';

/**
 * Whether the team confirms a brand's quotes before the franchisee sees them
 * (DECISIONS #172). Saved on change: it is one switch, not a form.
 */
export function QuoteConfirmationToggle({
  brandId,
  brandName,
  teamConfirms,
}: {
  brandId: string;
  brandName: string;
  teamConfirms: boolean;
}) {
  // Shown at once and put back on failure: the box should move when pressed,
  // not a round trip later.
  const [checked, setChecked] = useState(teamConfirms);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    setError(null);
    setChecked(next);
    startTransition(async () => {
      const result = await setQuoteConfirmationAction(brandId, next);
      if (result?.error) {
        setChecked(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(e) => change(e.target.checked)}
          className="mt-0.5"
          aria-label={`Team confirms ${brandName} quotes`}
        />
        <span>
          <span className="block text-sm text-gray-900">Team confirms quotes before they are sent</span>
          <span className="block text-xs text-gray-500">
            {checked
              ? `Every Signage.com quote for ${brandName} waits for "Deliver quote to franchisee".`
              : `A fully priced Signage.com quote goes to the franchisee as soon as the request is routed. One with a custom-quote item still waits for the team to price it.`}
          </span>
        </span>
      </label>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

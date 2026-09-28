'use client';

// "Send the approval email again."
//
// For the reviewer who would rather decide from their inbox, or a colleague
// nudging one. It goes to the brand's reviewers and nowhere else — the person
// clicking cannot redirect it to themselves.

import { useState, useTransition } from 'react';

import { resendApprovalEmailAction } from './actions';

export function ResendApproval({
  brandSlug,
  requestId,
}: {
  brandSlug: string;
  requestId: string;
}) {
  const [state, setState] = useState<'idle' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resend = () => {
    setError(null);
    startTransition(async () => {
      const failure = await resendApprovalEmailAction(brandSlug, requestId);
      if (failure) return setError(failure.error);
      setState('sent');
    });
  };

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {state === 'sent' ? (
        <p className="text-xs text-gray-500">
          Sent. The new message replaces the previous link, so approve from the one that just
          arrived.
        </p>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={pending}
          className="text-xs text-gray-500 underline-offset-2 transition-colors hover:text-gray-900 hover:underline disabled:opacity-40"
        >
          {pending ? 'Sending…' : 'Send the approval email again'}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

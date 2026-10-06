'use client';

// Paste a new Design Studio session token (DECISIONS #183). The field is a
// password field and is cleared on save; the token is never shown back.

import { useState, useTransition } from 'react';

import { saveEngineTokenAction } from './actions';

export function EngineTokenForm({ hasToken }: { hasToken: boolean }) {
  const [open, setOpen] = useState(!hasToken);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        Replace token
      </button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await saveEngineTokenAction(token);
          if (result?.error) setMessage({ tone: 'error', text: result.error });
          else {
            setToken('');
            setOpen(false);
            setMessage({ tone: 'ok', text: 'Saved. The Studio uses it within a minute.' });
          }
        });
      }}
    >
      <input
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="Paste the signize.ai session token"
        aria-label="Signize session token"
        autoComplete="off"
        className="min-w-72 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={pending || !token.trim()}
        className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {pending ? 'Saving…' : 'Save token'}
      </button>
      {hasToken && (
        <button type="button" onClick={() => setOpen(false)} className="px-1 py-1.5 text-sm text-gray-500">
          Cancel
        </button>
      )}
      {message && (
        <p className={`w-full text-xs ${message.tone === 'error' ? 'text-rose-700' : 'text-green-800'}`}>{message.text}</p>
      )}
    </form>
  );
}

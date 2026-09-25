'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { fieldClass, labelClass, primaryButtonClass } from '@/components/AuthCard';

import { askForReset } from './actions';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      await askForReset(email);
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          If an account exists for {email}, a reset link is on its way. Check your inbox.
        </p>
        <Link href="/sign-in" className="block text-center text-sm font-medium text-gray-900 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className={labelClass}>
        Email
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
          required
        />
      </label>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Sending…' : 'Email me a reset link'}
      </button>
      <Link href="/sign-in" className="block text-center text-sm text-gray-500 hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}

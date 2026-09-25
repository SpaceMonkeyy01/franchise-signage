'use client';

import { useState, useTransition } from 'react';

import { FormError, fieldClass, labelClass, primaryButtonClass } from '@/components/AuthCard';
import type { TotpEnrollment } from '@/lib/auth/identity';

import { confirmTwoFactor, startEnrollment } from './actions';

type Enrollment = TotpEnrollment & { devCode: string | null };

export function TwoFactorForm({
  mode,
  factorId,
  next,
  devCode,
}: {
  mode: 'challenge' | 'enroll';
  factorId: string | null;
  next: string | null;
  devCode: string | null;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeFactor = mode === 'challenge' ? factorId : (enrollment?.factorId ?? null);
  const shownDevCode = mode === 'challenge' ? devCode : (enrollment?.devCode ?? null);

  function begin() {
    setError(null);
    startTransition(async () => {
      const result = await startEnrollment();
      if ('error' in result) setError(result.error);
      else setEnrollment(result);
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!activeFactor) return;
    setError(null);
    startTransition(async () => {
      const failure = await confirmTwoFactor(activeFactor, code, next);
      if (failure) setError(failure.error);
    });
  }

  if (mode === 'enroll' && !enrollment) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-gray-600">
          You&rsquo;ll need an authenticator app on your phone — Google Authenticator, 1Password,
          Authy or similar. It shows a new six-digit code every 30 seconds.
        </p>
        {error && <FormError>{error}</FormError>}
        <button type="button" onClick={begin} disabled={pending} className={primaryButtonClass}>
          {pending ? 'Preparing…' : 'Set up my authenticator'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {enrollment && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-900">1. Add this account to your app</p>
          {enrollment.qrCode ? (
            // Supabase supplies the QR code as an SVG data URI.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={enrollment.qrCode} alt="QR code for your authenticator app" className="mt-3 h-44 w-44" />
          ) : (
            <p className="mt-1 text-xs text-gray-500">Scan isn&rsquo;t available here — enter the key by hand.</p>
          )}
          <p className="mt-3 text-xs text-gray-500">Or enter this key:</p>
          <code
            data-testid="totp-secret"
            className="mt-1 block break-all rounded bg-gray-100 px-2 py-1 text-xs text-gray-900"
          >
            {enrollment.secret}
          </code>
          <p className="mt-4 text-sm font-medium text-gray-900">2. Enter the code it shows</p>
        </div>
      )}

      {shownDevCode && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>Development only:</strong> the current code is{' '}
          <span data-testid="dev-totp-code" className="font-mono font-semibold">
            {shownDevCode}
          </span>
          . Under Supabase the code comes from your app and is never shown here.
        </p>
      )}

      <label className={labelClass}>
        Six-digit code
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className={`${fieldClass} font-mono tracking-widest`}
          required
        />
      </label>

      {error && <FormError>{error}</FormError>}

      <button type="submit" disabled={pending || !code.trim()} className={primaryButtonClass}>
        {pending ? 'Checking…' : mode === 'enroll' ? 'Turn on two-factor' : 'Continue'}
      </button>
    </form>
  );
}

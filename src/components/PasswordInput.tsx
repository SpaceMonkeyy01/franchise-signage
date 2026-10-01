'use client';

// A password field with a show/hide eye. Every password box in the app —
// sign-in, accepting an invitation, resetting a password — uses this, so they
// behave the same. The toggle is a real button with a spoken label, never
// submits the form, and each field keeps its own visibility.

import { useState, type InputHTMLAttributes } from 'react';

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
      />
      <circle cx="12" cy="12" r="3" />
      {!open && <path strokeLinecap="round" d="M4 4l16 16" />}
    </svg>
  );
}

export function PasswordInput({
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={visible ? 'text' : 'password'} className={`${className} pr-10`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-gray-500 hover:text-gray-700 focus-visible:text-gray-900 focus-visible:outline-none"
      >
        <EyeIcon open={!visible} />
      </button>
    </span>
  );
}

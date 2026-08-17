// The Resend client.
//
// Constructed only when RESEND_API_KEY is set — src/lib/email/send.ts imports
// this module lazily, so a machine with no key never loads it and never needs
// one. The From-line rules live in ./sender.ts, which every template path uses
// whether or not a provider exists.

import { Resend } from 'resend';

let cached: Resend | null = null;

export function resend(): Resend {
  if (!cached) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    cached = new Resend(key);
  }
  return cached;
}

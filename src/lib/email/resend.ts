// Resend transport. One template file per notification type lands in Session 4
// and Session 5; this is only the client and the brand-sender rule.

import { Resend } from 'resend';

import { serverEnv } from '../env';

let cached: Resend | null = null;

export function resend(): Resend {
  if (!cached) cached = new Resend(serverEnv().RESEND_API_KEY);
  return cached;
}

/**
 * The From line for franchisee-facing mail.
 *
 * SPEC §8d: the welcome email — and by extension everything a franchisee
 * receives — is sent AS THE BRAND, not as Signage.com. The franchisee has a
 * relationship with their franchisor; Signage.com is the operator behind it.
 * Vendor and team mail is the exception and uses the platform sender.
 */
export function brandSender(brand: { name: string }, address?: string | null): string {
  return `${brand.name} <${address ?? serverEnv().RESEND_FROM_EMAIL}>`;
}

export function platformSender(): string {
  return `Signage.com <${serverEnv().RESEND_FROM_EMAIL}>`;
}

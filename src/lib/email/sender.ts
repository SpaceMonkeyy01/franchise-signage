// Who mail comes from.
//
// SPEC §8d: franchisee- and franchisor-facing mail is sent AS THE BRAND, not as
// Signage.com. They have a relationship with their franchisor; Signage.com is
// the operator behind it. Vendor and internal mail is the exception.
//
// Reads process.env directly rather than through serverEnv(): that validator
// demands a full Supabase and Resend configuration, and rendering an email into
// the outbox must work on a machine that has neither.

export function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'noreply@signage.com';
}

export function brandSender(brandName: string): string {
  return `${brandName} <${fromAddress()}>`;
}

export function platformSender(): string {
  return `Signage.com <${fromAddress()}>`;
}

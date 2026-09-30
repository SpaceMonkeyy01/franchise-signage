// How the catalog reads (SPEC v2.4 §2.3). Pure, so the corporate Signs tab's
// browser code can use it without pulling in the database.

export type ReviewStatus = 'pending' | 'approved' | 'declined';

/** How a sign's state reads on either screen, with its chip colours. */
export function signStatus(sign: { review_status: ReviewStatus; active: boolean }): {
  label: string;
  tone: string;
} {
  if (sign.review_status === 'pending') return { label: 'Awaiting review', tone: 'bg-amber-50 text-amber-800' };
  if (sign.review_status === 'declined') return { label: 'Declined', tone: 'bg-rose-50 text-rose-700' };
  return sign.active
    ? { label: 'Live', tone: 'bg-green-50 text-green-800' }
    : { label: 'Retired', tone: 'bg-gray-100 text-gray-600' };
}

/** `mounting_type` → "Mounting type". */
export function attributeLabel(attribute: string): string {
  const words = attribute.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The spec line a proposal starts with: its locked choices, in order. */
export function summarize(pinned: Record<string, unknown>): string | null {
  const parts = Object.values(pinned)
    .map((value) => (typeof value === 'boolean' ? null : String(value).trim()))
    .filter((value): value is string => !!value);
  return parts.length > 0 ? parts.join(' · ') : null;
}


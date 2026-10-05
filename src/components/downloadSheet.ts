// Download a preview quote sheet for the design on screen (DECISIONS #168).
// A POST, because the design is the body; the server prices it again.

import type { SignDesign } from '@/lib/designs/design';

export async function downloadPreviewSheet(body: {
  brandSlug: string;
  as: 'brand' | 'franchisee';
  locationId?: string | null;
  resubmit?: { token: string; lineItemId: string } | null;
  brandItemId: string;
  design: SignDesign;
}): Promise<string | null> {
  const response = await fetch('/api/studio/sheet', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) return (await response.text()) || 'The quote sheet could not be made.';
  const name =
    response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'quote-sheet-preview.pdf';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return null;
}

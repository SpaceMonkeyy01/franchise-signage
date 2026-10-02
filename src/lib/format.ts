// Small wording helpers shared by screens, emails and timeline summaries.

/** "1 sign", "3 signs" — never "3 sign(s)". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** How a line item came onto the request, worded for people (never the raw enum). */
export const ORIGIN_LABEL: Record<string, string> = {
  standard: 'Standard package',
  addon: 'Add-on',
  exception: 'Exception',
  replacement: 'Like-for-like replacement',
};

export function originLabel(origin: string): string {
  return ORIGIN_LABEL[origin] ?? origin;
}

/**
 * "Freshbites — Oak Plaza", not "Freshbites · Freshbites — Oak Plaza": the
 * brand is named only when the location's own name does not already carry it.
 */
export function brandAndLocation(brandName: string, locationName: string): string {
  return locationName.toLowerCase().startsWith(brandName.toLowerCase())
    ? locationName
    : `${brandName} · ${locationName}`;
}

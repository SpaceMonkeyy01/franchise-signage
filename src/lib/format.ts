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

/**
 * A store's name inside its brand's own portal: "Oak Plaza", not
 * "Freshbites — Oak Plaza" (DECISIONS #195). The brand is in the header of
 * every page there, so repeating it on each store is noise. Emails, PDFs and
 * the Signage.com console keep the full name, where several brands meet.
 */
export function storeName(locationName: string, brandName: string): string {
  const escaped = brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const short = locationName.replace(new RegExp(`^${escaped}\\s*[—–\\-·:|]\\s*`, 'i'), '').trim();
  return short || locationName;
}

/**
 * A sign's name inside its brand's portal: "Storefront Letters", not
 * "Freshbites Storefront Letters" (DECISIONS #197) — the same rule as
 * storeName(). Emails, PDFs and the console keep the full name.
 */
export function signName(name: string, brandName: string): string {
  const trimmed = name.toLowerCase().startsWith(`${brandName.toLowerCase()} `)
    ? name.slice(brandName.length + 1).trim()
    : name;
  return trimmed || name;
}

/** "Illuminated Channel Letters · 24" high · trimless", the type first (#197). */
export function typeAndSpec(signType: string | null | undefined, spec: string | null | undefined): string {
  return [signType, spec].filter((part) => part && part.trim()).join(' · ');
}

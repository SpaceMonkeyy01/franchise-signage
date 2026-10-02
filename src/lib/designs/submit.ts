// A franchisee's adjusted designs at submission (SPEC v2.6 §8 points 3–5).
//
// Runs BEFORE the request's transaction: pricing takes ~15 s, and a database
// transaction must not wait on a network call. For each item that carries a
// design, the server — not the browser — checks it against the brand admin's
// rules and prices it. Within the limits the item keeps its route; outside
// them a standard sign becomes an exception and an add-on says why in its
// notes (it is reviewed anyway). SERVER ONLY.

import type { LineItemOrigin } from '../status/types';
import { breaches, type SignDesign } from './design';
import { getDesignableSign, quoteDesign } from './studio';

export interface DesignedItemIn {
  brandItemId: string;
  origin: LineItemOrigin;
  design?: SignDesign | null;
  siteNotes?: string | null;
  exceptionIssue?: string | null;
}

export interface DesignedItemOut {
  origin: LineItemOrigin;
  design: SignDesign | null;
  estPrice: number | null;
  priceSource: 'engine' | null;
  siteNotes: string | null;
  exceptionIssue: string | null;
  mockup: { storagePath: string; fileName: string; contentType: string } | null;
}

/** Same order as `items`. Items with no design come back unchanged. */
export async function prepareDesignedItems(
  brandId: string,
  items: readonly DesignedItemIn[],
): Promise<DesignedItemOut[]> {
  const out: DesignedItemOut[] = [];
  for (const item of items) {
    const unchanged: DesignedItemOut = {
      origin: item.origin,
      design: null,
      estPrice: null,
      priceSource: null,
      siteNotes: item.siteNotes ?? null,
      exceptionIssue: item.exceptionIssue ?? null,
      mockup: null,
    };
    // Like-for-like replaces what is installed; the Studio adjusts new signs.
    if (item.origin === 'replacement') {
      out.push(unchanged);
      continue;
    }
    const sign = await getDesignableSign(item.brandItemId, brandId);
    if (!sign?.design) {
      out.push(unchanged);
      continue;
    }
    // Ordered as the brand designed it: the line still carries that design,
    // its price and mockup (and so gets its quote sheet). Already priced when
    // the brand admin saved it, so no engine call.
    if (!item.design) {
      out.push({
        ...unchanged,
        design: sign.design,
        estPrice: sign.design.price ?? null,
        priceSource: 'engine',
        mockup: sign.design.mockupPath
          ? { storagePath: sign.design.mockupPath, fileName: `${sign.name} mockup.jpg`, contentType: 'image/jpeg' }
          : null,
      });
      continue;
    }

    const found = breaches(sign.design, sign.design_rules, item.design);
    const priced = await quoteDesign(sign, item.design);
    const reason = found.length > 0 ? `Outside the brand's design limits: ${found.join(' ')}` : null;

    out.push({
      origin: reason && item.origin === 'standard' ? 'exception' : item.origin,
      design: priced,
      estPrice: priced.price ?? null,
      priceSource: 'engine',
      siteNotes:
        reason && item.origin === 'addon'
          ? [item.siteNotes, reason].filter(Boolean).join('\n')
          : (item.siteNotes ?? null),
      exceptionIssue:
        reason && item.origin === 'standard'
          ? reason
          : reason && item.origin === 'exception'
            ? [item.exceptionIssue, reason].filter(Boolean).join('\n')
            : (item.exceptionIssue ?? null),
      mockup: priced.mockupPath
        ? { storagePath: priced.mockupPath, fileName: `${sign.name} mockup.jpg`, contentType: 'image/jpeg' }
        : null,
    });
  }
  return out;
}

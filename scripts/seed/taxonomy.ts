// docs/sign-taxonomy.tsv → master_catalog rows (SPEC §2.1).
//
// Parsing is separated from writing so the mapping is unit-testable without a
// database, and so the brand-item pins in freshbites.ts can be resolved against
// the same rows the seed inserts.
//
// Provenance and the one judgment call in the file (how pricing_basis was
// inferred) are documented in docs/TAXONOMY-NOTES.md. Confirm with Signize
// before treating the split as authoritative — it decides which items quote
// automatically and which route to manual team pricing.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Placement, PricingBasis } from '../../src/lib/status/types';

export interface MasterCatalogRow {
  placement: Placement;
  category: string;
  sign_type: string;
  variant: string | null;
  attribute_options: Record<string, unknown>;
  pricing_type: string | null;
  pricing_basis: PricingBasis;
  render_key: string | null;
  fabricated_finish: string | null;
  source_id: number | null;
  active: boolean;
}

/** Natural key — source_id is NOT unique in the live taxonomy. */
export function masterKey(row: {
  placement: string;
  sign_type: string;
  variant: string | null;
}): string {
  return `${row.placement}|${row.sign_type}|${row.variant ?? ''}`;
}

const REPO_ROOT = join(__dirname, '..', '..');
const TAXONOMY_TSV = join(REPO_ROOT, 'docs', 'sign-taxonomy.tsv');
const ATTRIBUTE_OPTIONS_JSON = join(REPO_ROOT, 'docs', 'sign-attribute-options.json');

export function parseTaxonomy(
  tsv = readFileSync(TAXONOMY_TSV, 'utf8'),
  attributeOptions: Record<string, Record<string, unknown>> = JSON.parse(
    readFileSync(ATTRIBUTE_OPTIONS_JSON, 'utf8'),
  ),
): MasterCatalogRow[] {
  const lines = tsv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines[0].split('\t');
  const index = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`sign-taxonomy.tsv is missing the "${name}" column`);
    return i;
  };

  const cols = {
    placement: index('placement'),
    category: index('category'),
    sign_type: index('sign_type'),
    variant: index('variant'),
    pricing_type: index('pricing_type'),
    pricing_basis: index('pricing_basis'),
    render_key: index('render_key'),
    fabricated_finish: index('fabricated_finish'),
    source_id: index('source_id'),
    active: index('active'),
  };

  const blank = (value: string | undefined) => {
    const trimmed = (value ?? '').trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const rows = lines.slice(1).map((line, i) => {
    const cell = line.split('\t');
    const placement = blank(cell[cols.placement]);
    const signType = blank(cell[cols.sign_type]);
    const basis = blank(cell[cols.pricing_basis]);

    if (placement !== 'indoor' && placement !== 'outdoor') {
      throw new Error(`Row ${i + 2}: placement must be indoor|outdoor, got "${placement}"`);
    }
    if (!signType) throw new Error(`Row ${i + 2}: sign_type is required`);
    if (basis !== 'direct' && basis !== 'standin') {
      throw new Error(`Row ${i + 2}: pricing_basis must be direct|standin, got "${basis}"`);
    }

    const pricingType = blank(cell[cols.pricing_type]);
    const sourceId = blank(cell[cols.source_id]);

    return {
      placement,
      category: blank(cell[cols.category]) ?? '',
      sign_type: signType,
      variant: blank(cell[cols.variant]),
      // Keyed by pricing model, so every row sharing a model shares its matrix.
      // A standin row has no model and therefore no options of its own.
      attribute_options: (pricingType && attributeOptions[pricingType]) || {},
      pricing_type: pricingType,
      pricing_basis: basis,
      render_key: blank(cell[cols.render_key]),
      fabricated_finish: blank(cell[cols.fabricated_finish]),
      source_id: sourceId === null ? null : Number(sourceId),
      active: blank(cell[cols.active]) !== 'false',
    } satisfies MasterCatalogRow;
  });

  const seen = new Set<string>();
  for (const row of rows) {
    const key = masterKey(row);
    if (seen.has(key)) {
      throw new Error(`Duplicate master_catalog natural key: ${key}`);
    }
    seen.add(key);
  }

  return rows;
}

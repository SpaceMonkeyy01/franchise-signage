// Rendering and keeping sign quote sheets (DECISIONS #168). SERVER ONLY.
//
// At submission every Studio-designed line gets its sheet, stored as a
// request file of kind `quote_sheet` on that line, so the franchisee,
// corporate and the team open the same record of what was chosen and priced.
// Previews and a brand's own sheet are rendered on request and not kept.

import { query } from '../db/pool';
import type { PdfBrand } from '../pdf/letterhead';
import { renderPdf } from '../pdf/letterhead';
import { SignQuoteSheet, sheetImage, type SheetImage } from '../pdf/sign-quote-sheet';
import { getUpload, putUpload } from '../storage';
import type { SignDesign } from './design';

async function image(path: string | null | undefined): Promise<SheetImage | null> {
  if (!path) return null;
  const file = await getUpload(path);
  return file ? sheetImage(file.body, file.contentType) : null;
}

export async function renderSignSheet(input: {
  brand: PdfBrand;
  signName: string;
  signType: string;
  design: SignDesign;
  reference: string;
  preparedFor: string | null;
  preview?: boolean;
}): Promise<Buffer> {
  const [mockup, sideView] = await Promise.all([image(input.design.mockupPath), image(input.design.sideViewPath)]);
  return renderPdf(
    <SignQuoteSheet {...input} issuedAt={new Date()} mockup={mockup} sideView={sideView} />,
  );
}

/** "Freshbites Storefront Letters" → "freshbites-storefront-letters". */
export function fileSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/**
 * Give every designed line of a request its stored sheet. Called after the
 * request is committed; a failure is logged and leaves the request whole —
 * the sheet can be made again, a lost submission cannot.
 */
export async function attachQuoteSheets(requestId: string): Promise<number> {
  const lines = await query<{
    id: string;
    design: SignDesign;
    sign_name: string;
    sign_type: string;
    code: string;
    location_name: string;
    brand_name: string;
    brand_slug: string;
    brand_colors: PdfBrand['brand_colors'];
  }>(
    `select li.id, li.design, bi.name as sign_name, mc.sign_type, r.code, l.name as location_name,
            b.name as brand_name, b.slug as brand_slug, b.brand_colors
       from line_items li
       join requests r on r.id = li.request_id
       join locations l on l.id = r.location_id
       join brands b on b.id = r.brand_id
       join brand_items bi on bi.id = li.brand_item_id
       join master_catalog mc on mc.id = bi.master_catalog_id
      where li.request_id = $1 and li.design is not null
        and not exists (select 1 from request_files f where f.line_item_id = li.id and f.kind = 'quote_sheet')
      order by li.sort_order`,
    [requestId],
  );

  let made = 0;
  for (const [index, line] of lines.entries()) {
    try {
      const pdf = await renderSignSheet({
        brand: { name: line.brand_name, brand_colors: line.brand_colors },
        signName: line.sign_name,
        signType: line.sign_type,
        design: line.design,
        reference: `${line.code} · sign ${index + 1}`,
        preparedFor: line.location_name,
      });
      const fileName = `${line.code.toLowerCase()}-${fileSlug(line.sign_name)}-quote-sheet.pdf`;
      const stored = await putUpload(
        new File([new Uint8Array(pdf)], fileName, { type: 'application/pdf' }),
        `${line.brand_slug}/quote-sheets`,
      );
      await query(
        `insert into request_files (request_id, line_item_id, kind, storage_path, file_name, content_type, size_bytes)
         values ($1, $2, 'quote_sheet', $3, $4, 'application/pdf', $5)`,
        [requestId, line.id, stored.storagePath, fileName, stored.sizeBytes],
      );
      made += 1;
    } catch (error) {
      console.error(`quote sheet for line ${line.id} failed`, error);
    }
  }
  return made;
}

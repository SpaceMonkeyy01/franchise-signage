import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { renderPdf } from '../letterhead';
import { SignQuoteSheet, sheetImage } from '../sign-quote-sheet';

const LOGO = readFileSync(join(process.cwd(), 'public', 'brands', 'freshbites', 'logo.png'));

const PROPS = {
  brand: { name: 'Freshbites', brand_colors: { primary: '#2E7D32' } },
  signName: 'Freshbites Storefront Letters',
  signType: 'Illuminated Channel Letters',
  design: {
    logo: { path: 'x', fileName: 'logo.png', contentType: 'image/png' },
    options: { trim_type: 'Trimless', ul_mandatory: 'Yes' },
    dimension: { axis: 'height' as const, inches: 30 },
    depthInches: null,
    price: 900,
    turnaroundDays: 14,
    widthInches: 19.17,
    heightInches: 30,
    materials: ['0.08 inch Aluminium - Durable for Sign Face.'],
  },
  reference: 'REQ-0001 · sign 1',
  preparedFor: 'Freshbites — Oak Plaza',
  issuedAt: new Date('2026-10-02T12:00:00Z'),
};

describe('the sign quote sheet (#168)', () => {
  it('renders a PDF with its mockup and side view', async () => {
    const image = sheetImage(LOGO, 'image/png');
    const pdf = await renderPdf(createElement(SignQuoteSheet, { ...PROPS, mockup: image, sideView: image }));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(5_000);
  });

  it('renders without images, and as a preview', async () => {
    const pdf = await renderPdf(createElement(SignQuoteSheet, { ...PROPS, mockup: null, sideView: null, preview: true }));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('only draws PNG and JPEG', () => {
    expect(sheetImage(LOGO, 'image/png')?.format).toBe('png');
    expect(sheetImage(LOGO, 'image/jpeg')?.format).toBe('jpg');
    expect(sheetImage(LOGO, 'image/webp')).toBeNull();
  });
});

describe('the sign quote sheet layout', () => {
  it('fits one page with a full specification and materials list', async () => {
    const image = sheetImage(LOGO, 'image/png');
    const options = Object.fromEntries(
      ['trim_type', 'application', 'paint_finish', 'return_color', 'ul_mandatory', 'mounting_type', 'raceway_depth', 'raceway_height', 'backboard_cabinet_depth', 'material', 'neon_color', 'lightbox_type'].map((name) => [name, 'Standard option value']),
    );
    const materials = Array.from({ length: 10 }, (_, i) => `0.0${i} inch Aluminium - Durable for part ${i}.`);
    const pdf = await renderPdf(
      createElement(SignQuoteSheet, {
        ...PROPS,
        design: { ...PROPS.design, options, materials, depthInches: 3 },
        mockup: image,
        sideView: image,
      }),
    );
    const pages = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages).toHaveLength(1);
  });
});

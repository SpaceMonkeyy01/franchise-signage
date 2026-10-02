import { describe, expect, it } from 'vitest';

import { EngineRejectedError, designKey, mockupFields, pricingFields, readPricing, type EngineDesign } from '../engine';

const ALLOWED = {
  mounting_type: [{ value: 'Flush/Stud mounted' }, { value: 'Standard Raceway' }],
  paint_finish: [{ value: 'Gloss/Satin' }, { value: 'Matte' }],
  avg_char_height: [{ value: 'Less than 24 inches' }],
  basic_fields: [{ value: 'sign_width_or_height' }],
};

const LOGO = { bytes: Buffer.from('logo'), contentType: 'image/png', fileName: 'logo.png' };

const DESIGN: EngineDesign = {
  pricingType: 'Halo Lit Channel Letters',
  options: { mounting_type: 'Standard Raceway', paint_finish: 'Not an option' },
  dimension: { axis: 'height', inches: 30 },
  depthInches: 3,
  logo: LOGO,
};

// The shape POST /api/sign-pricing returned on 2 Oct 2026, trimmed.
const RESPONSE = {
  success: true,
  mockupImageUrl: 'https://api.signize.ai/projects/quotations/88193/mockup/output.jpg',
  outputImageData: Buffer.from('x'.repeat(200)).toString('base64'),
  outputMimeType: 'image/jpeg',
  calculation: {
    success: true,
    data: {
      signWidth: '19.17',
      signHeight: '30',
      signDepth: '1',
      mountingType: 'Flush/Stud mounted',
      materialsList: ['Aluminium face', 'LED modules'],
      totalCost: 340,
      tATDays: 14,
      quotationId: '88193',
      sideViewImage: 'https://api.signize.ai/mockups/flush-stud/flush-stud-halo-lit-channel-letters.png',
      vendorName: 'internal — must not leak',
    },
  },
};

describe('the Signize engine request (SPEC v2.6 §8)', () => {
  it('sends the sign type, the one dimension, and every option the type offers', () => {
    const fields = Object.fromEntries(pricingFields(DESIGN, ALLOWED));
    expect(fields).toMatchObject({
      sign_type: 'Halo Lit Channel Letters',
      sign_width_or_height: '30',
      user_input_dimension: 'height',
      sign_height: '30',
      sign_width: '0',
      sign_depth: '3',
      mounting_type: 'Standard Raceway',
    });
  });

  it('replaces a value the type does not allow with its first allowed one, and skips non-options', () => {
    const fields = Object.fromEntries(pricingFields(DESIGN, ALLOWED));
    expect(fields.paint_finish).toBe('Gloss/Satin');
    expect(fields).not.toHaveProperty('avg_char_height');
    expect(fields).not.toHaveProperty('basic_fields');
  });

  it('refuses a design with no size', () => {
    expect(() => pricingFields({ ...DESIGN, dimension: { axis: 'width', inches: 0 } }, ALLOWED)).toThrow(EngineRejectedError);
  });

  it('keys the cache on the fields and the logo, not their order', () => {
    const fields = pricingFields(DESIGN, ALLOWED);
    expect(designKey([...fields].reverse(), LOGO)).toBe(designKey(fields, LOGO));
    expect(designKey(fields, { ...LOGO, bytes: Buffer.from('other') })).not.toBe(designKey(fields, LOGO));
  });
});

describe('the Signize engine response', () => {
  it('reads cost, size, turnaround and the mockup — and nothing internal', () => {
    const quote = readPricing(RESPONSE);
    expect(quote).toMatchObject({
      cost: 340,
      turnaroundDays: 14,
      widthInches: 19.17,
      heightInches: 30,
      depthInches: 1,
      mounting: 'Flush/Stud mounted',
      materials: ['Aluminium face', 'LED modules'],
      quotationId: '88193',
      sideViewUrl: 'https://api.signize.ai/mockups/flush-stud/flush-stud-halo-lit-channel-letters.png',
    });
    expect(quote.mockup?.contentType).toBe('image/jpeg');
    expect(JSON.stringify({ ...quote, mockup: null })).not.toContain('internal');
  });

  it('throws the engine’s reason when it priced nothing', () => {
    expect(() => readPricing({ success: false, message: 'Sign type not found' })).toThrow('Sign type not found');
    expect(() => readPricing({ success: true, calculation: { data: { totalCost: 0 } } })).toThrow(EngineRejectedError);
    expect(() => readPricing(null)).toThrow(EngineRejectedError);
  });
});

describe('the Signize mockup request', () => {
  const scene = { bytes: Buffer.from('scene'), contentType: 'image/jpeg', fileName: 'outdoor.jpg' };
  it('draws the sign in its own style, centred, lit', () => {
    expect(Object.fromEntries(mockupFields({ style: 'a-frame-sign', logo: LOGO, scene }))).toEqual({
      signType: 'a-frame-sign',
      mountingType: 'flush',
      xPercent: '50',
      yPercent: '50',
      signSize: '100',
      isLightingOn: 'true',
    });
  });
  it('passes the trim and finish where the style uses them', () => {
    const faceLit = Object.fromEntries(mockupFields({ style: 'face-lit-channel', logo: LOGO, scene, trimless: true }));
    expect(faceLit).toMatchObject({ faceLitTrimStyle: 'trimless', faceLitReturnColor: 'logo-match' });
    const fabricated = Object.fromEntries(mockupFields({ style: 'fabricated-non-lit', logo: LOGO, scene, fabricatedFinish: 'goldenMirror' }));
    expect(fabricated.fabricatedFinish).toBe('goldenMirror');
  });
});

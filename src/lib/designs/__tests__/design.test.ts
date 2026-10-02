import { describe, expect, it } from 'vitest';

import { breaches, defaultRules, designSummary, label, validRules, type DesignRules, type SignDesign } from '../design';

const BASE: SignDesign = {
  logo: { path: 'freshbites/logo.png', fileName: 'logo.png', contentType: 'image/png' },
  options: { mounting_type: 'Standard Raceway', paint_finish: 'Gloss/Satin' },
  dimension: { axis: 'height', inches: 30 },
  depthInches: 3,
};

const RULES: DesignRules = {
  size: { mode: 'range', min: 24, max: 36 },
  mounting_type: { mode: 'choices', values: ['Standard Raceway', 'Flush/Stud mounted'] },
};

describe('design limits (SPEC v2.6 §8, §7)', () => {
  it('starts with every option locked and the size a quarter either way', () => {
    expect(defaultRules(BASE)).toEqual({ size: { mode: 'range', min: 22.5, max: 37.5 } });
  });

  it('accepts changes within the limits, so the sign keeps its approval route', () => {
    const within = { ...BASE, dimension: { axis: 'height' as const, inches: 34 }, options: { ...BASE.options, mounting_type: 'Flush/Stud mounted' } };
    expect(breaches(BASE, RULES, within)).toEqual([]);
    expect(breaches(BASE, RULES, BASE)).toEqual([]);
  });

  it('names every change outside them, which makes the sign an exception', () => {
    const outside = {
      ...BASE,
      logo: { ...BASE.logo, path: 'other.png' },
      dimension: { axis: 'height' as const, inches: 40 },
      options: { ...BASE.options, paint_finish: 'Matte', mounting_type: 'Flat Backer' },
      depthInches: 5,
    };
    expect(breaches(BASE, RULES, outside)).toEqual([
      'The logo was changed.',
      'Mounting type changed from Standard Raceway to Flat Backer.',
      'Paint finish changed from Gloss/Satin to Matte.',
      'Height 40" is outside 24–36".',
      `Depth 5" is outside the brand's 3".`,
    ]);
  });

  it('treats sizing by the other dimension as a change', () => {
    expect(breaches(BASE, RULES, { ...BASE, dimension: { axis: 'width', inches: 30 } })).toEqual([
      'Sized by width instead of height.',
    ]);
  });

  it('stores only sensible rules from the browser', () => {
    expect(validRules({ paint_finish: { mode: 'choices', values: ['Matte'] } }, BASE)).toEqual({
      paint_finish: { mode: 'choices', values: ['Gloss/Satin', 'Matte'] },
    });
    expect(validRules({ paint_finish: { mode: 'choices', values: [] } }, BASE)).toEqual({});
    expect(() => validRules({ size: { mode: 'range', min: 32, max: 40 } }, BASE)).toThrow(RangeError);
    expect(validRules({ size: { mode: 'locked' } }, BASE)).toEqual({});
  });
});

describe('a design, as people read it', () => {
  it('names acronyms properly', () => {
    expect(label('ul_mandatory')).toBe('UL mandatory');
    expect(label('uv_printing_needed')).toBe('UV printing needed');
    expect(label('return_color')).toBe('Return color');
  });

  it('gives the size and the options that say something on their own', () => {
    expect(
      designSummary({
        ...BASE,
        options: { trim_type: 'Trimless', ul_mandatory: 'Yes', uv_printing_needed: 'No', raceway_depth: '2', mounting_type: 'Standard Raceway' },
      }),
    ).toBe('30" high · Trimless · UL listed · Standard Raceway');
  });
});

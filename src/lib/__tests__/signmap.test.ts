import { describe, expect, it } from 'vitest';

import { pinsFor, slotFor, VIEWS } from '../signmap';

describe('slotFor', () => {
  it('places Freshbites signs where they are made to go', () => {
    expect(slotFor('Illuminated Channel Letters', 'Face Lit (Premium Channel Letters)', 'outdoor')).toBe('fascia');
    expect(slotFor('Illuminated Dimensional Letters', 'Halo-Lit (Back-lit)', 'indoor')).toBe('lobby');
    expect(slotFor('Blade/Projecting Signs', 'Double-Sided', 'outdoor')).toBe('blade');
    expect(slotFor('Vinyl Graphics', 'Window Frosting', 'indoor')).toBe('window');
    expect(slotFor('A-Frame Sign', null, 'outdoor')).toBe('sidewalk');
    expect(slotFor('Banners & Flags', 'Vinyl Banners', 'outdoor')).toBe('banner');
    expect(slotFor('Pylon Signs', 'Single or Double Pole', 'outdoor')).toBe('road');
    expect(slotFor('Lightbox/Cabinet Signs', 'Standard Cabinet (Square/Rectangle)', 'indoor')).toBe('menuboard');
    expect(slotFor('LED Neon Signs', 'Custom Bent LED Flex Tubing', 'indoor')).toBe('neon');
    expect(slotFor('Wayfinding & Directional', 'Entrance Signs', 'outdoor')).toBe('entrance');
  });

  it('sorts the drive-thru signs onto the lane', () => {
    expect(slotFor('Drive-Thru Signs', 'Outdoor Menu Board', 'outdoor')).toBe('dt-menu');
    expect(slotFor('Drive-Thru Signs', 'Pre-Sell Board', 'outdoor')).toBe('presell');
    expect(slotFor('Drive-Thru Signs', 'Clearance Bar', 'outdoor')).toBe('clearance');
    expect(slotFor('Drive-Thru Signs', 'Directional Signs', 'outdoor')).toBe('directional');
  });

  it('pins nothing it cannot place', () => {
    expect(slotFor('Vehicle Graphics/Wraps', 'Standard', 'outdoor')).toBeNull();
  });
});

describe('pinsFor', () => {
  it('numbers pins in the drawing order, side by side on a shared spot', () => {
    const storefront = VIEWS.find((view) => view.key === 'storefront')!;
    const pins = pinsFor(storefront, [
      { id: 'a', slot: 'sidewalk' as const },
      { id: 'b', slot: 'fascia' as const },
      { id: 'c', slot: 'fascia' as const },
      { id: 'd', slot: 'lobby' as const },
    ]);
    expect(pins.map((pin) => [pin.sign.id, pin.number])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
    expect(pins[1].x - pins[0].x).toBe(30);
  });
});

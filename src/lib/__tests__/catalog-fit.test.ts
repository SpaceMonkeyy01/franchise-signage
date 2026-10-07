import { describe, expect, it } from 'vitest';

import { suitsStore } from '../catalog/fit';

describe('suitsStore', () => {
  it('offers drive-thru signs only to a drive-thru store', () => {
    expect(suitsStore('Drive-Thru Signs', 'drive_thru')).toBe(true);
    expect(suitsStore('Drive-Thru Signs', 'inline')).toBe(false);
    expect(suitsStore('Drive-Thru Signs', 'pad', 'Drive-through pad')).toBe(true);
  });

  it('offers every other sign to every store', () => {
    expect(suitsStore('LED Neon Signs', 'inline')).toBe(true);
    expect(suitsStore('Pylon Signs', 'endcap')).toBe(true);
    expect(suitsStore('Freestanding Signs', 'inline')).toBe(true);
    expect(suitsStore('Pylon Signs', null)).toBe(true);
  });
});

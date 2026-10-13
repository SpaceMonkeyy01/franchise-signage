// Where each sign goes on a building (DECISIONS #203).
//
// The landing page draws a store in three views and pins every live sign of
// the brand to the spot it is made for. Which spot is decided by the catalog —
// the sign type and variant say what a sign is — so a new brand's signs land in
// the right places with nothing configured. A sign that fits no spot is simply
// not pinned.
//
// Coordinates are in the drawings' own space (VIEW_W × VIEW_H), so a pin stays
// on its sign at any width.

export const VIEW_W = 800;
export const VIEW_H = 480;

export type Slot =
  | 'fascia'
  | 'blade'
  | 'banner'
  | 'window'
  | 'entrance'
  | 'sidewalk'
  | 'road'
  | 'dt-menu'
  | 'presell'
  | 'clearance'
  | 'directional'
  | 'lobby'
  | 'menuboard'
  | 'neon';

export type ViewKey = 'storefront' | 'drivethru' | 'inside';

export interface SignMapView {
  key: ViewKey;
  label: string;
  /** The spots on this drawing, in reading order, with where the pin sits. */
  slots: { slot: Slot; x: number; y: number }[];
}

export const VIEWS: SignMapView[] = [
  {
    key: 'storefront',
    label: 'Storefront',
    slots: [
      { slot: 'fascia', x: 470, y: 168 },
      { slot: 'banner', x: 492, y: 236 },
      { slot: 'blade', x: 560, y: 212 },
      { slot: 'window', x: 262, y: 336 },
      { slot: 'entrance', x: 214, y: 322 },
      { slot: 'sidewalk', x: 318, y: 372 },
    ],
  },
  {
    key: 'drivethru',
    label: 'Drive-thru',
    slots: [
      { slot: 'road', x: 168, y: 92 },
      { slot: 'fascia', x: 512, y: 192 },
      { slot: 'dt-menu', x: 724, y: 220 },
      { slot: 'presell', x: 646, y: 292 },
      { slot: 'clearance', x: 712, y: 336 },
      { slot: 'directional', x: 584, y: 410 },
    ],
  },
  {
    key: 'inside',
    label: 'Inside',
    slots: [
      { slot: 'lobby', x: 512, y: 70 },
      { slot: 'menuboard', x: 560, y: 124 },
      { slot: 'neon', x: 736, y: 132 },
    ],
  },
];

/** The spot a sign is made for, from what the catalog says it is. */
export function slotFor(signType: string, variant: string | null, placement: 'indoor' | 'outdoor'): Slot | null {
  const type = signType.toLowerCase();
  const kind = (variant ?? '').toLowerCase();
  const indoor = placement === 'indoor';

  if (/drive[\s-]?thru|drive[\s-]?through/.test(type)) {
    if (kind.includes('menu')) return 'dt-menu';
    if (kind.includes('pre-sell') || kind.includes('presell')) return 'presell';
    if (kind.includes('clearance')) return 'clearance';
    return 'directional';
  }
  if (type.includes('channel letter')) return 'fascia';
  if (type.includes('dimensional') || type.includes('flat cut') || type.includes('fabricated')) {
    return indoor ? 'lobby' : 'fascia';
  }
  if (type.includes('blade') || type.includes('projecting')) return 'blade';
  if (type.includes('vinyl') || type.includes('window')) return 'window';
  if (type.includes('a-frame')) return 'sidewalk';
  if (type.includes('banner') || type.includes('flag')) return 'banner';
  if (type.includes('pylon') || type.includes('monument') || type.includes('post & panel')) return 'road';
  if (type.includes('wayfinding') || type.includes('directional')) {
    return kind.includes('entrance') ? 'entrance' : 'directional';
  }
  if (type.includes('neon')) return 'neon';
  if (type.includes('lightbox') || type.includes('cabinet') || type.includes('digital') || type.includes('menu')) {
    return indoor ? 'menuboard' : 'fascia';
  }
  return null;
}

export interface Pinned<T> {
  sign: T;
  number: number;
  x: number;
  y: number;
}

/**
 * The pins for one view: each sign whose spot is on this drawing, numbered in
 * the drawing's reading order. Two signs on one spot sit side by side.
 */
export function pinsFor<T extends { slot: Slot | null }>(view: SignMapView, signs: T[]): Pinned<T>[] {
  const pins: Pinned<T>[] = [];
  for (const spot of view.slots) {
    const here = signs.filter((sign) => sign.slot === spot.slot);
    here.forEach((sign, index) => {
      pins.push({ sign, number: pins.length + 1, x: spot.x + index * 30, y: spot.y });
    });
  }
  return pins;
}

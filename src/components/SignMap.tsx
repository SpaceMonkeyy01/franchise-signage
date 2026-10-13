'use client';

// "Where each sign goes" (DECISIONS #203): a drawn store in three views —
// storefront, drive-thru, inside — with a numbered pin on every live sign of
// the brand. Hover or tap a pin, or its line in the list beside, and both light
// up; the open line says what the sign is and where it is standard. No prices:
// this is the signed-out landing page.
//
// The drawings are SVG in the drafting-board style of the rest of the portal,
// coloured by the brand through var(--color-brand). Pins are HTML buttons laid
// over the drawing in its own coordinates, so they stay on their signs at any
// width and can be reached by keyboard.

import { useMemo, useState } from 'react';

import { pinsFor, VIEW_H, VIEW_W, VIEWS, type Slot, type ViewKey } from '@/lib/signmap';

export interface MapSign {
  id: string;
  /** Short name: "Storefront Letters". */
  name: string;
  /** Type and variant: "Illuminated Channel Letters · Face Lit (Premium)". */
  kind: string;
  spec: string | null;
  image: string | null;
  /** Store types whose standard package includes it. */
  standardIn: string[];
  slot: Slot | null;
}

export function SignMap({ brandName, signs }: { brandName: string; signs: MapSign[] }) {
  const views = useMemo(
    () =>
      VIEWS.map((view) => ({ view, pins: pinsFor(view, signs) })).filter(
        (entry) => entry.pins.length > 0,
      ),
    [signs],
  );
  const [viewKey, setViewKey] = useState<ViewKey | null>(views[0]?.view.key ?? null);
  const current = views.find((entry) => entry.view.key === viewKey) ?? views[0];
  const [selected, setSelected] = useState<string | null>(current?.pins[0]?.sign.id ?? null);
  const [hovered, setHovered] = useState<string | null>(null);

  if (!current) return null;
  const lit = hovered ?? selected;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Views of the store"
        className="flex flex-wrap justify-center gap-1.5"
      >
        {views.map(({ view, pins }) => {
          const active = view.key === current.view.key;
          return (
            <button
              key={view.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setViewKey(view.key);
                setSelected(pins[0]?.sign.id ?? null);
                setHovered(null);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'text-white shadow-sm'
                  : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:text-gray-900'
              }`}
              style={active ? { background: 'var(--color-brand)' } : undefined}
            >
              {view.label}
              <span className={`ml-1.5 text-xs ${active ? 'text-white/80' : 'text-gray-400'}`}>
                {pins.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div
          className="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
          style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        >
          <Drawing
            view={current.view.key}
            brandName={brandName}
            has={new Set(signs.map((sign) => sign.slot))}
          />
          {current.pins.map((pin) => {
            const on = lit === pin.sign.id;
            return (
              <div
                key={pin.sign.id}
                className="absolute"
                style={{
                  left: `${(pin.x / VIEW_W) * 100}%`,
                  top: `${(pin.y / VIEW_H) * 100}%`,
                  zIndex: on ? 3 : 2,
                }}
              >
                <button
                  type="button"
                  aria-label={`${pin.number}: ${pin.sign.name}`}
                  aria-pressed={selected === pin.sign.id}
                  onMouseEnter={() => setHovered(pin.sign.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(pin.sign.id)}
                  onBlur={() => setHovered(null)}
                  onClick={() => setSelected(pin.sign.id)}
                  className={`flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold text-white shadow-md ring-2 ring-white transition-transform ${
                    on ? 'scale-125' : 'hover:scale-110'
                  }`}
                  style={{ background: on ? 'var(--color-brand-dark)' : 'var(--color-brand)' }}
                >
                  {pin.number}
                </button>
                {on && (
                  <span
                    className="pointer-events-none absolute bottom-[48px] left-0 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900/90 px-2 py-1 text-[11px] font-medium text-white shadow"
                    role="tooltip"
                  >
                    {pin.sign.name}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <ol className="space-y-2">
          {current.pins.map((pin) => {
            const open = selected === pin.sign.id;
            const on = lit === pin.sign.id;
            return (
              <li key={pin.sign.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHovered(pin.sign.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(open ? null : pin.sign.id)}
                  aria-expanded={open}
                  className={`w-full rounded-xl border bg-white px-3 py-2.5 text-left transition-colors ${
                    on ? 'border-gray-300 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={open ? { borderColor: 'var(--color-brand)' } : undefined}
                >
                  <span className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{
                        background: on || open ? 'var(--color-brand-dark)' : 'var(--color-brand)',
                      }}
                    >
                      {pin.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900">
                        {pin.sign.name}
                      </span>
                      <span className="block text-xs text-gray-500">{pin.sign.kind}</span>
                    </span>
                  </span>
                  {open && (
                    <span className="mt-3 flex gap-3 border-t border-gray-100 pt-3">
                      {pin.sign.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={pin.sign.image}
                          alt=""
                          loading="lazy"
                          className="h-16 w-20 shrink-0 rounded-lg object-cover ring-1 ring-gray-200"
                        />
                      )}
                      <span className="min-w-0 text-xs leading-relaxed text-gray-600">
                        {pin.sign.spec && <span className="block">{pin.sign.spec}</span>}
                        <span
                          className="mt-1 block font-medium"
                          style={{ color: 'var(--color-brand-dark)' }}
                        >
                          {pin.sign.standardIn.length > 0
                            ? `Standard for ${pin.sign.standardIn.join(', ')} stores`
                            : `An add-on: ${brandName} approves it before it is quoted`}
                        </span>
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ drawings

const WALL = '#efece8';
const WALL_SIDE = '#d9d5cf';
const ROOF = '#e6e2dc';
const LINE = '#b8b1a8';
const DARK = '#1f2937';
const POST = '#6b7280';

function Glow({ id }: { id: string }) {
  return (
    <filter id={id} x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

function Glass({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#dbe9f1" />
      <stop offset="0.55" stopColor="#c3d7e3" />
      <stop offset="1" stopColor="#aec6d6" />
    </linearGradient>
  );
}

/** Which spots the brand has a sign for: the drawing shows only those (#203). */
type Has = Set<Slot | null>;

function Drawing({ view, brandName, has }: { view: ViewKey; brandName: string; has: Has }) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="absolute inset-0 h-full w-full"
      role="img"
      aria-label={`${brandName} ${view === 'inside' ? 'interior' : view === 'drivethru' ? 'drive-thru building' : 'storefront'}, drawn`}
    >
      {view === 'storefront' && <Storefront brandName={brandName} has={has} />}
      {view === 'drivethru' && <DriveThru brandName={brandName} has={has} />}
      {view === 'inside' && <Inside brandName={brandName} has={has} />}
    </svg>
  );
}

function Storefront({ brandName, has }: { brandName: string; has: Has }) {
  return (
    <>
      <defs>
        <Glow id="sm-sf-glow" />
        <Glass id="sm-sf-glass" />
        <pattern id="sm-sf-frost" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#ffffff" opacity="0.55" />
          <circle cx="6" cy="6" r="1.6" fill="var(--color-brand)" opacity="0.25" />
        </pattern>
      </defs>
      <rect width={VIEW_W} height={VIEW_H} fill="#f7f6f3" />
      {/* Road and sidewalk */}
      <rect x="0" y="430" width={VIEW_W} height="50" fill="#e4e4e7" />
      <rect x="0" y="400" width={VIEW_W} height="30" fill="#f1f0ec" />
      <line x1="0" y1="430" x2={VIEW_W} y2="430" stroke={LINE} />
      {/* The strip: roof, side, front */}
      <polygon points="20,150 700,150 760,110 80,110" fill={ROOF} stroke={LINE} />
      <polygon points="700,150 760,110 760,360 700,400" fill={WALL_SIDE} stroke={LINE} />
      <rect x="20" y="150" width="680" height="250" fill={WALL} stroke={LINE} />
      {/* Neighbours, quiet */}
      {[20, 510].map((x) => (
        <g key={x} opacity="0.7">
          <rect x={x + 12} y="165" width={x === 20 ? 186 : 166} height="50" rx="3" fill="#d6d3d1" />
          <rect
            x={x + 20}
            y="248"
            width={x === 20 ? 170 : 150}
            height="147"
            fill="url(#sm-sf-glass)"
            stroke={POST}
            strokeWidth="2"
          />
          <line
            x1={x + (x === 20 ? 105 : 95)}
            y1="248"
            x2={x + (x === 20 ? 105 : 95)}
            y2="395"
            stroke={POST}
            strokeWidth="2"
          />
        </g>
      ))}
      <line x1="230" y1="150" x2="230" y2="400" stroke={LINE} strokeWidth="2" />
      <line x1="510" y1="150" x2="510" y2="400" stroke={LINE} strokeWidth="2" />
      {/* 1. Storefront letters on the fascia */}
      <rect x="242" y="160" width="256" height="60" rx="3" fill={DARK} />
      <text
        x="370"
        y="201"
        textAnchor="middle"
        fontSize="30"
        fontWeight="800"
        fill="#ffffff"
        filter="url(#sm-sf-glow)"
        style={{ letterSpacing: '0.5px' }}
      >
        {brandName}
      </text>
      {has.has('banner') && (
        <>
          {/* Banner under the fascia */}
          <rect x="262" y="226" width="216" height="18" rx="2" fill="var(--color-brand)" />
          <text
            x="370"
            y="239"
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill="#ffffff"
            style={{ letterSpacing: '2px' }}
          >
            GRAND OPENING
          </text>
        </>
      )}
      {/* Glass, door, window frosting */}
      <rect
        x="246"
        y="250"
        width="90"
        height="145"
        fill="url(#sm-sf-glass)"
        stroke={POST}
        strokeWidth="2"
      />
      <rect
        x="404"
        y="250"
        width="90"
        height="145"
        fill="url(#sm-sf-glass)"
        stroke={POST}
        strokeWidth="2"
      />
      {has.has('window') && (
        <>
          <rect x="246" y="330" width="90" height="65" fill="url(#sm-sf-frost)" />
          <rect x="404" y="330" width="90" height="65" fill="url(#sm-sf-frost)" />
        </>
      )}
      <rect x="342" y="262" width="56" height="138" fill="#cfe0ea" stroke={POST} strokeWidth="2" />
      <rect x="388" y="322" width="4" height="22" rx="2" fill={POST} />
      <polygon points="252,256 290,256 262,300 252,300" fill="#ffffff" opacity="0.35" />
      <polygon points="410,256 448,256 420,300 410,300" fill="#ffffff" opacity="0.35" />
      {has.has('blade') && (
        <>
          {/* Blade sign, projecting from the corner */}
          <line x1="510" y1="232" x2="552" y2="208" stroke={POST} strokeWidth="3" />
          <polygon
            points="514,244 552,220 552,270 514,294"
            fill="#ffffff"
            stroke={DARK}
            strokeWidth="2"
          />
          <polygon points="521,252 545,237 545,262 521,277" fill="var(--color-brand)" />
        </>
      )}
      {has.has('entrance') && (
        <>
          {/* Entrance sign, on a post */}
          <rect x="194" y="322" width="40" height="26" rx="3" fill="var(--color-brand)" />
          <rect x="200" y="331" width="22" height="3" rx="1.5" fill="#ffffff" />
          <rect x="200" y="337" width="14" height="3" rx="1.5" fill="#ffffff" opacity="0.7" />
          <rect x="212" y="348" width="4" height="62" fill={POST} />
        </>
      )}
      {has.has('sidewalk') && (
        <>
          {/* A-frame on the sidewalk */}
          <polygon points="300,422 314,378 328,422" fill="#374151" />
          <rect x="306" y="384" width="16" height="28" rx="1" fill="#ffffff" />
          <rect x="309" y="389" width="10" height="2" fill="var(--color-brand)" />
          <rect x="309" y="394" width="8" height="2" fill="#9ca3af" />
        </>
      )}
    </>
  );
}

function DriveThru({ brandName, has }: { brandName: string; has: Has }) {
  return (
    <>
      <defs>
        <Glow id="sm-dt-glow" />
        <Glass id="sm-dt-glass" />
      </defs>
      <rect width={VIEW_W} height={VIEW_H} fill="#eef3ea" />
      {/* Lot and lane */}
      <rect x="0" y="430" width={VIEW_W} height="50" fill="#e4e4e7" />
      <polygon points="540,480 680,480 800,392 800,292" fill="#d4d4d8" />
      <line
        x1="610"
        y1="480"
        x2="800"
        y2="342"
        stroke="#ffffff"
        strokeWidth="3"
        strokeDasharray="14 12"
      />
      {/* Building */}
      <polygon points="250,190 520,190 590,145 320,145" fill={ROOF} stroke={LINE} />
      <polygon points="520,190 590,145 590,335 520,380" fill={WALL_SIDE} stroke={LINE} />
      <rect x="250" y="190" width="270" height="190" fill={WALL} stroke={LINE} />
      <rect x="262" y="198" width="246" height="48" rx="3" fill={DARK} />
      <text
        x="385"
        y="231"
        textAnchor="middle"
        fontSize="26"
        fontWeight="800"
        fill="#ffffff"
        filter="url(#sm-dt-glow)"
      >
        {brandName}
      </text>
      <rect
        x="270"
        y="270"
        width="90"
        height="100"
        fill="url(#sm-dt-glass)"
        stroke={POST}
        strokeWidth="2"
      />
      <rect x="380" y="280" width="46" height="100" fill="#cfe0ea" stroke={POST} strokeWidth="2" />
      <rect
        x="436"
        y="270"
        width="72"
        height="100"
        fill="url(#sm-dt-glass)"
        stroke={POST}
        strokeWidth="2"
      />
      <polygon
        points="540,250 574,228 574,276 540,298"
        fill="url(#sm-dt-glass)"
        stroke={POST}
        strokeWidth="2"
      />
      {has.has('road') && (
        <>
          {/* Road sign: a pylon by the street */}
          <rect x="102" y="164" width="8" height="250" fill={POST} />
          <rect x="88" y="410" width="36" height="14" rx="2" fill="#9ca3af" />
          <rect x="60" y="92" width="96" height="72" rx="5" fill={DARK} />
          <rect
            x="66"
            y="98"
            width="84"
            height="60"
            rx="3"
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="2"
            opacity="0.8"
          />
          <text
            x="108"
            y="134"
            textAnchor="middle"
            fontSize="15"
            fontWeight="800"
            fill="#ffffff"
            filter="url(#sm-dt-glow)"
          >
            {brandName}
          </text>
        </>
      )}
      {has.has('dt-menu') && (
        <>
          {/* Menu board by the window */}
          <rect x="670" y="268" width="5" height="46" fill={POST} />
          <rect x="716" y="268" width="5" height="46" fill={POST} />
          <rect x="660" y="220" width="70" height="50" rx="4" fill={DARK} />
          {[230, 241, 252].map((y) => (
            <g key={y}>
              <rect x="667" y={y} width="26" height="5" rx="1" fill="#ffffff" opacity="0.85" />
              <rect
                x="698"
                y={y}
                width="24"
                height="5"
                rx="1"
                fill="var(--color-brand)"
                opacity="0.9"
              />
            </g>
          ))}
        </>
      )}
      {has.has('presell') && (
        <>
          {/* Pre-sell board, before the order point */}
          <rect x="628" y="326" width="4" height="46" fill={POST} />
          <rect x="612" y="294" width="36" height="32" rx="3" fill={DARK} />
          <rect x="617" y="300" width="26" height="6" rx="1" fill="var(--color-brand)" />
          <rect x="617" y="310" width="20" height="4" rx="1" fill="#ffffff" opacity="0.8" />
        </>
      )}
      {has.has('clearance') && (
        <>
          {/* Clearance bar over the lane entrance */}
          <line x1="650" y1="452" x2="650" y2="388" stroke={POST} strokeWidth="5" />
          <line x1="744" y1="388" x2="744" y2="326" stroke={POST} strokeWidth="5" />
          <line
            x1="650"
            y1="388"
            x2="744"
            y2="326"
            stroke="var(--color-brand)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <line
            x1="650"
            y1="388"
            x2="744"
            y2="326"
            stroke="#ffffff"
            strokeWidth="10"
            strokeDasharray="8 10"
            opacity="0.6"
          />
        </>
      )}
      {has.has('directional') && (
        <>
          {/* Directional sign at the lane */}
          <rect x="584" y="436" width="4" height="34" fill={POST} />
          <rect
            x="566"
            y="414"
            width="40"
            height="22"
            rx="3"
            fill="#ffffff"
            stroke="var(--color-brand)"
            strokeWidth="2"
          />
          <path
            d="M574 425 h18 m-6 -5 l6 5 l-6 5"
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </>
  );
}

function Inside({ brandName, has }: { brandName: string; has: Has }) {
  return (
    <>
      <defs>
        <Glow id="sm-in-glow" />
      </defs>
      {/* Back wall, side wall, floor */}
      <rect x="0" y="0" width="690" height="330" fill="#f3efe9" />
      <polygon points="690,0 800,0 800,480 690,330" fill="#e7e0d6" />
      <polygon points="0,330 690,330 800,480 0,480" fill="#d8c9b4" />
      {[360, 395, 435].map((y) => (
        <line key={y} x1="0" y1={y} x2={690 + ((y - 330) * 110) / 150} y2={y} stroke="#cbb89f" />
      ))}
      {has.has('lobby') && (
        <>
          {/* Lobby letters on the wall behind the counter, halo-lit */}
          <text
            x="400"
            y="96"
            textAnchor="middle"
            fontSize="36"
            fontWeight="800"
            fill="var(--color-brand-dark)"
            filter="url(#sm-in-glow)"
          >
            {brandName}
          </text>
        </>
      )}
      {has.has('menuboard') && (
        <>
          {/* Menu boards above the counter */}
          {[250, 355, 460].map((x) => (
            <g key={x}>
              <rect x={x} y="122" width="95" height="70" rx="4" fill={DARK} />
              <rect x={x + 7} y="129" width="81" height="56" rx="2" fill="#ffffff" />
              {[138, 150, 162, 174].map((y) => (
                <g key={y}>
                  <rect x={x + 13} y={y} width="44" height="4" rx="1" fill="#9ca3af" />
                  <rect x={x + 64} y={y} width="16" height="4" rx="1" fill="var(--color-brand)" />
                </g>
              ))}
            </g>
          ))}
        </>
      )}
      {/* Counter */}
      <rect x="200" y="240" width="400" height="14" rx="2" fill="#a3835f" />
      <rect x="212" y="254" width="376" height="76" fill="#8b6b4a" />
      <rect x="232" y="268" width="336" height="48" rx="2" fill="#7a5d40" opacity="0.6" />
      {has.has('neon') && (
        <>
          {/* Neon leaf on the dining wall */}
          <g filter="url(#sm-in-glow)">
            <path
              d="M724 214 C704 184 716 150 752 140 C756 176 746 202 724 214 Z"
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <path
              d="M724 214 C732 190 742 168 752 140"
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth="2.5"
            />
          </g>
        </>
      )}
      {/* Dining tables */}
      {[
        [700, 400],
        [600, 430],
        [120, 410],
      ].map(([cx, cy]) => (
        <g key={cx}>
          <ellipse cx={cx} cy={cy} rx="34" ry="10" fill="#f8f5f0" stroke="#bfae97" />
          <rect x={cx - 3} y={cy} width="6" height="30" fill="#9c8a72" />
        </g>
      ))}
    </>
  );
}

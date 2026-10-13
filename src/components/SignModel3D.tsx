'use client';

// "Where each sign goes", in 3D (DECISIONS #204). A second take on #203's
// drawing, shown below it so the owner can choose: a freestanding drive-thru
// restaurant modelled in three.js, in a CAD style (light materials, outlined
// edges, a drafting grid), with every live sign of the brand on it and a
// numbered pin on each.
//
// One building carries all fourteen spots — storefront, road pylon, the lane,
// and the inside, which shows when the roof and front lift away. Drag to turn
// it; click a number (on the model or in the list) and the camera glides to the
// sign and lights it. The wheel is left to the page, so scrolling past never
// gets caught; zoom is on buttons. It turns slowly when left alone, unless the
// visitor asked for reduced motion.
//
// Loaded only on the landing page, through SignModelSection's dynamic import,
// so three.js costs nothing anywhere else.

import { CameraControls, Edges, Grid } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import CameraControlsImpl from 'camera-controls';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import type { Slot } from '@/lib/signmap';

import type { MapSign } from './SignMap';

type Vec = [number, number, number];

/**
 * Each spot: where its pin floats, what the camera looks at, and where it looks
 * from. `inside` spots show only with the roof and front lifted away.
 */
const SPOTS: Record<Slot, { pin: Vec; target: Vec; eye: Vec; inside?: boolean }> = {
  road: { pin: [-9.2, 7.7, 9], target: [-11, 6.4, 9], eye: [-5, 8, 23] },
  fascia: { pin: [4.4, 4.7, 4.8], target: [0, 3.9, 4.7], eye: [-2, 5, 16] },
  banner: { pin: [3.4, 3.15, 4.9], target: [0, 3.1, 4.7], eye: [-1, 4, 14] },
  blade: { pin: [5.7, 3.4, 5.3], target: [5.7, 2.7, 5.2], eye: [10, 4, 13] },
  window: { pin: [-3.1, 1.3, 4.9], target: [-3.1, 1.2, 4.5], eye: [-4, 3, 13] },
  entrance: { pin: [-6.8, 2.5, 5.9], target: [-6.8, 1.8, 5.9], eye: [-8, 3.5, 14] },
  sidewalk: { pin: [-2.2, 1.6, 6.3], target: [-2.2, 0.7, 6.3], eye: [-3, 3, 13] },
  presell: { pin: [10.6, 2.3, 2.5], target: [10.6, 1.4, 2.5], eye: [18, 4, 8] },
  'dt-menu': { pin: [10.6, 3.0, -1], target: [10.6, 1.9, -1], eye: [19, 4.5, 3] },
  clearance: { pin: [8.5, 3.7, 6.6], target: [8.5, 3.1, 6.6], eye: [14, 5, 17] },
  directional: { pin: [10.9, 1.7, 8.6], target: [10.9, 0.9, 8.6], eye: [15, 3.5, 16] },
  lobby: { pin: [3.2, 4.1, -4.1], target: [0, 3.5, -4.3], eye: [0, 6.5, 7], inside: true },
  menuboard: { pin: [3.6, 3.0, -4.0], target: [0, 2.4, -4.3], eye: [0, 5.5, 6], inside: true },
  neon: { pin: [-5.6, 3.3, -1], target: [-5.8, 2.6, -1], eye: [1, 6, 5], inside: true },
};

/** The order pins are numbered in: round the building, then inside. */
const ORDER: Slot[] = [
  'road', 'fascia', 'banner', 'blade', 'window', 'entrance', 'sidewalk',
  'presell', 'dt-menu', 'clearance', 'directional', 'lobby', 'menuboard', 'neon',
];

const VIEWS = [
  { key: 'front', label: 'Front', eye: [-9, 10, 27] as Vec, target: [0, 2.5, 2] as Vec, inside: false },
  { key: 'lane', label: 'Drive-thru', eye: [24, 9, 15] as Vec, target: [6, 1.8, 1] as Vec, inside: false },
  { key: 'inside', label: 'Inside', eye: [0, 9, 12] as Vec, target: [0, 2.2, -2.5] as Vec, inside: true },
] as const;

type ViewKey = (typeof VIEWS)[number]['key'];

interface Pin {
  sign: MapSign;
  number: number;
  slot: Slot;
  position: Vec;
}

export default function SignModel3D({ brandName, signs }: { brandName: string; signs: MapSign[] }) {
  const pins = useMemo(() => {
    const out: Pin[] = [];
    for (const slot of ORDER) {
      signs
        .filter((sign) => sign.slot === slot)
        .forEach((sign, index) => {
          const [x, y, z] = SPOTS[slot].pin;
          out.push({ sign, number: out.length + 1, slot, position: [x + index * 0.7, y, z] });
        });
    }
    return out;
  }, [signs]);
  const has = useMemo(() => new Set(pins.map((pin) => pin.slot)), [pins]);

  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>('front');
  const [inside, setInside] = useState(false);
  const controls = useRef<CameraControlsImpl | null>(null);
  // Read once: this component only ever renders in the browser (ssr: false).
  const [brand] = useState(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim() || '#2e7d32',
  );
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [webgl] = useState(() => {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
      return false;
    }
  });
  // The pin elements, placed each frame by PinTracker through placePins.
  const pinElements = useRef<(HTMLDivElement | null)[]>([]);
  const placePins = (points: { x: number; y: number; visible: boolean }[]) => {
    points.forEach((point, index) => {
      const element = pinElements.current[index];
      if (!element) return;
      element.style.transform = `translate(${point.x}px, ${point.y}px)`;
      element.style.visibility = point.visible ? 'visible' : 'hidden';
    });
  };
  // Bumped whenever the visitor touches the model; the idle turn waits for quiet.
  const [activity, setActivity] = useState(0);
  const touch = () => setActivity((count) => count + 1);

  const litSlot = pins.find((pin) => pin.sign.id === (hovered ?? selected))?.slot ?? null;

  const lookAt = (eye: Vec, target: Vec) => {
    touch();
    void controls.current?.setLookAt(...eye, ...target, !reduced);
  };

  const zoom = (amount: number) => {
    touch();
    void controls.current?.dolly(amount, !reduced);
  };

  const goView = (key: ViewKey) => {
    const preset = VIEWS.find((entry) => entry.key === key)!;
    setView(key);
    setInside(preset.inside);
    setSelected(null);
    lookAt(preset.eye, preset.target);
  };

  const focus = (pin: Pin) => {
    const spot = SPOTS[pin.slot];
    setSelected(pin.sign.id);
    setInside(Boolean(spot.inside));
    setView(spot.inside ? 'inside' : pin.slot === 'presell' || pin.slot === 'dt-menu' || pin.slot === 'clearance' || pin.slot === 'directional' ? 'lane' : 'front');
    lookAt(spot.eye, spot.target);
  };

  if (!webgl) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
        This browser cannot show the 3D model. The drawing above shows the same signs.
      </p>
    );
  }

  return (
    <div>
      <div role="tablist" aria-label="Camera views" className="flex flex-wrap justify-center gap-1.5">
        {VIEWS.map((entry) => {
          const active = entry.key === view;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => goView(entry.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active ? 'text-white shadow-sm' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:text-gray-900'
              }`}
              style={active ? { background: 'var(--color-brand)' } : undefined}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-[#f6f7f5] shadow-sm" style={{ aspectRatio: '16 / 11' }}>
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: VIEWS[0].eye, fov: 38 }}
            onPointerDown={touch}
          >
            <color attach="background" args={['#f6f7f5']} />
            <ambientLight intensity={0.55} />
            <hemisphereLight args={['#ffffff', '#dfe3d8', 1.1]} />
            <directionalLight position={[12, 18, 14]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]}>
              <orthographicCamera attach="shadow-camera" args={[-20, 20, 20, -20, 1, 60]} />
            </directionalLight>
            <CameraControls
              ref={(instance) => {
                controls.current = instance;
                if (instance) {
                  instance.setTarget(...VIEWS[0].target, false);
                  instance.mouseButtons.wheel = CameraControlsImpl.ACTION.NONE;
                  instance.minDistance = 5;
                  instance.maxDistance = 38;
                  instance.maxPolarAngle = Math.PI / 2.15;
                }
              }}
              onStart={touch}
            />
            <IdleTurn controls={controls} activity={activity} enabled={!reduced} />
            <Grid
              position={[0, 0, 0]}
              args={[60, 60]}
              cellSize={1}
              cellColor="#d6d9d2"
              sectionSize={5}
              sectionColor="#b9beb3"
              fadeDistance={55}
              infiniteGrid
            />
            <Restaurant brandName={brandName} brand={brand} has={has} lit={litSlot} inside={inside} />
            <PinTracker positions={pins.map((pin) => pin.position)} place={placePins} />
          </Canvas>

          {/* The pins: page elements laid over the model, moved each frame to
              where their spot is on screen (PinTracker). Kept out of the 3D
              scene so no extra React roots come and go with it. */}
          <div className="pointer-events-none absolute inset-0">
            {pins.map((pin, index) => {
              const on = pin.sign.id === (hovered ?? selected);
              // Inside pins only with the roof off, outside pins only with it on.
              const shown = Boolean(SPOTS[pin.slot].inside) === inside;
              return (
                <div
                  key={pin.sign.id}
                  ref={(element) => {
                    pinElements.current[index] = element;
                  }}
                  className="absolute left-0 top-0"
                  style={{ display: shown ? undefined : 'none', visibility: 'hidden', zIndex: on ? 3 : 2 }}
                >
                  <div
                    className="relative -translate-x-1/2 -translate-y-1/2 transition-opacity"
                    // With a sign chosen, the rest step back so it stands out.
                    style={{ opacity: selected && !on ? 0.35 : 1 }}
                  >
                    <button
                      type="button"
                      aria-label={`${pin.number}: ${pin.sign.name}`}
                      onMouseEnter={() => setHovered(pin.sign.id)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => focus(pin)}
                      className={`pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow-md ring-2 ring-white transition-transform ${
                        on ? 'scale-125' : 'hover:scale-110'
                      }`}
                      style={{ background: on ? 'var(--color-brand-dark)' : 'var(--color-brand)' }}
                    >
                      {pin.number}
                    </button>
                    {on && (
                      <span className="pointer-events-none absolute bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900/90 px-2 py-1 text-[11px] font-medium text-white shadow">
                        {pin.sign.name}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="absolute bottom-3 right-3 flex gap-1.5">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => zoom(3)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-base font-semibold text-gray-700 shadow ring-1 ring-gray-200 hover:text-gray-900"
            >
              +
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => zoom(-3)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-base font-semibold text-gray-700 shadow ring-1 ring-gray-200 hover:text-gray-900"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => goView(view)}
              className="h-8 rounded-lg bg-white px-2.5 text-xs font-medium text-gray-700 shadow ring-1 ring-gray-200 hover:text-gray-900"
            >
              Reset view
            </button>
          </div>
          <p className="pointer-events-none absolute left-3 top-3 rounded-md bg-white/85 px-2 py-1 text-[11px] text-gray-500 shadow-sm">
            Drag to turn · click a number
          </p>
        </div>

        <ol className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
          {pins.map((pin) => {
            const open = selected === pin.sign.id;
            const on = (hovered ?? selected) === pin.sign.id;
            return (
              <li key={pin.sign.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHovered(pin.sign.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => (open ? setSelected(null) : focus(pin))}
                  aria-expanded={open}
                  className={`w-full rounded-xl border bg-white px-3 py-2.5 text-left transition-colors ${
                    on ? 'border-gray-300 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={open ? { borderColor: 'var(--color-brand)' } : undefined}
                >
                  <span className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: on || open ? 'var(--color-brand-dark)' : 'var(--color-brand)' }}
                    >
                      {pin.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900">{pin.sign.name}</span>
                      <span className="block text-xs text-gray-500">{pin.sign.kind}</span>
                    </span>
                  </span>
                  {open && (
                    <span className="mt-3 flex gap-3 border-t border-gray-100 pt-3">
                      {pin.sign.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pin.sign.image} alt="" loading="lazy" className="h-16 w-20 shrink-0 rounded-lg object-cover ring-1 ring-gray-200" />
                      )}
                      <span className="min-w-0 text-xs leading-relaxed text-gray-600">
                        {pin.sign.spec && <span className="block">{pin.sign.spec}</span>}
                        <span className="mt-1 block font-medium" style={{ color: 'var(--color-brand-dark)' }}>
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

/** Each frame, where every pin's spot falls on screen. */
function PinTracker({
  positions,
  place,
}: {
  positions: Vec[];
  place: (points: { x: number; y: number; visible: boolean }[]) => void;
}) {
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    place(
      positions.map(([x, y, z]) => {
        point.set(x, y, z).project(camera);
        return {
          x: ((point.x + 1) / 2) * size.width,
          y: ((1 - point.y) / 2) * size.height,
          // Behind the camera, or off the canvas: hide it.
          visible: point.z < 1 && Math.abs(point.x) < 1.05 && Math.abs(point.y) < 1.05,
        };
      }),
    );
  });
  return null;
}

/** A slow turn round the building after a few still seconds. */
function IdleTurn({
  controls,
  activity,
  enabled,
}: {
  controls: React.RefObject<CameraControlsImpl | null>;
  activity: number;
  enabled: boolean;
}) {
  const seen = useRef(-1);
  const quietSince = useRef(0);
  useFrame(({ clock }, delta) => {
    if (seen.current !== activity) {
      seen.current = activity;
      quietSince.current = clock.elapsedTime;
    }
    if (!enabled || !controls.current) return;
    if (clock.elapsedTime - quietSince.current < 6) return;
    controls.current.rotate(delta * 0.06, 0, false);
  });
  return null;
}

// --------------------------------------------------------------------- model

const WALL = '#f6f4f0';
const WALL_EDGE = '#8f8880';
const DARK = '#1f2937';
const STEEL = '#6b7280';

/** Text drawn onto a canvas, for signs: no font files to fetch. */
function useTextTexture(text: string, color: string, background: string | null, width = 1024, height = 256, weight = 800) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    let size = height * 0.62;
    const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
    do {
      context.font = `${weight} ${size}px ${family}`;
      size -= 4;
    } while (context.measureText(text).width > width * 0.9 && size > 10);
    context.fillText(text, width / 2, height / 2 + height * 0.03);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [text, color, background, width, height, weight]);
}

function Box({
  size,
  position,
  color,
  edges = true,
  rotation,
  emissive,
  opacity,
}: {
  size: Vec;
  position: Vec;
  color: string;
  edges?: boolean;
  rotation?: Vec;
  emissive?: string | null;
  opacity?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.85}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissive ? 0.55 : 0}
        transparent={opacity !== undefined}
        opacity={opacity ?? 1}
      />
      {edges && <Edges threshold={15} color={WALL_EDGE} />}
    </mesh>
  );
}

function Restaurant({
  brandName,
  brand,
  has,
  lit,
  inside,
}: {
  brandName: string;
  brand: string;
  has: Set<Slot>;
  lit: Slot | null;
  inside: boolean;
}) {
  const glow = (slot: Slot) => (lit === slot ? brand : null);
  const letters = useTextTexture(brandName, '#ffffff', null, 2048, 256);
  const lobbyLetters = useTextTexture(brandName, brand, null, 2048, 256);
  const opening = useTextTexture('GRAND OPENING', '#ffffff', null, 2048, 128, 700);
  const pylonFace = useTextTexture(brandName, '#ffffff', DARK, 512, 256);

  return (
    <group>
      {/* Lot, sidewalk and the drive-thru lane */}
      <Box size={[30, 0.04, 24]} position={[0, -0.02, 0]} color="#e9ece6" edges={false} />
      <Box size={[16, 0.1, 2.6]} position={[-1, 0.05, 6.1]} color="#f3f2ee" />
      <Box size={[3.2, 0.06, 18]} position={[8.6, 0.03, 0]} color="#d4d4d8" edges={false} />

      {/* Shell: back and side walls stay; roof and front lift for "Inside" */}
      <Box size={[12, 4.5, 0.25]} position={[0, 2.25, -4.5]} color={WALL} />
      <Box size={[0.25, 4.5, 9]} position={[-6, 2.25, 0]} color={WALL} />
      <Box size={[0.25, 4.5, 9]} position={[6, 2.25, 0]} color={WALL} />
      {/* Drive-thru window on the lane side */}
      <Box size={[0.08, 1.2, 1.6]} position={[6.14, 1.8, 0.8]} color="#bcd4e2" opacity={0.6} />

      <group visible={!inside}>
        <Box size={[12.6, 0.35, 9.6]} position={[0, 4.68, 0]} color="#e2ded7" />
        {/* Front wall around the openings */}
        <Box size={[1, 2.9, 0.25]} position={[-5.5, 1.45, 4.5]} color={WALL} />
        <Box size={[1, 2.9, 0.25]} position={[5.5, 1.45, 4.5]} color={WALL} />
        <Box size={[0.4, 2.9, 0.25]} position={[-1, 1.45, 4.5]} color={WALL} />
        <Box size={[0.4, 2.9, 0.25]} position={[1, 1.45, 4.5]} color={WALL} />
        <Box size={[12, 1.6, 0.25]} position={[0, 3.7, 4.5]} color={WALL} />
        {/* Glass and door */}
        <Box size={[3.8, 2.8, 0.06]} position={[-3.1, 1.45, 4.48]} color="#bcd4e2" opacity={0.55} />
        <Box size={[3.8, 2.8, 0.06]} position={[3.1, 1.45, 4.48]} color="#bcd4e2" opacity={0.55} />
        <Box size={[1.6, 2.7, 0.08]} position={[0, 1.35, 4.5]} color="#cfe0ea" opacity={0.75} />

        {/* Storefront letters on a dark fascia */}
        {has.has('fascia') && (
          <group>
            <Box size={[8.4, 1.0, 0.12]} position={[0, 3.95, 4.68]} color={DARK} emissive={glow('fascia')} />
            <mesh position={[0, 3.95, 4.75]}>
              <planeGeometry args={[7.6, 0.95]} />
              <meshBasicMaterial map={letters} transparent toneMapped={false} />
            </mesh>
          </group>
        )}
        {has.has('banner') && (
          <group>
            <Box size={[6, 0.38, 0.04]} position={[0, 3.12, 4.66]} color={brand} emissive={glow('banner')} />
            <mesh position={[0, 3.12, 4.69]}>
              <planeGeometry args={[5.6, 0.35]} />
              <meshBasicMaterial map={opening} transparent toneMapped={false} />
            </mesh>
          </group>
        )}
        {has.has('window') && (
          <group>
            <Box size={[3.8, 1.0, 0.03]} position={[-3.1, 0.6, 4.53]} color="#ffffff" opacity={0.8} emissive={glow('window')} edges={false} />
            <Box size={[3.8, 1.0, 0.03]} position={[3.1, 0.6, 4.53]} color="#ffffff" opacity={0.8} emissive={glow('window')} edges={false} />
          </group>
        )}
        {has.has('blade') && (
          <group>
            <Box size={[0.08, 0.08, 1.2]} position={[5.7, 3.25, 5.1]} color={STEEL} edges={false} />
            <Box size={[0.1, 1.0, 0.9]} position={[5.7, 2.65, 5.15]} color="#ffffff" emissive={glow('blade')} />
            <Box size={[0.12, 0.6, 0.55]} position={[5.7, 2.65, 5.15]} color={brand} edges={false} />
          </group>
        )}
      </group>

      {has.has('entrance') && (
        <group>
          <Box size={[0.12, 1.6, 0.12]} position={[-6.8, 0.8, 5.9]} color={STEEL} edges={false} />
          <Box size={[1.1, 0.7, 0.08]} position={[-6.8, 1.8, 5.9]} color={brand} emissive={glow('entrance')} />
        </group>
      )}
      {has.has('sidewalk') && (
        <group>
          <Box size={[0.7, 1.1, 0.05]} position={[-2.2, 0.6, 6.05]} rotation={[-0.22, 0, 0]} color="#374151" emissive={glow('sidewalk')} />
          <Box size={[0.7, 1.1, 0.05]} position={[-2.2, 0.6, 6.55]} rotation={[0.22, 0, 0]} color="#374151" />
          <Box size={[0.5, 0.75, 0.02]} position={[-2.2, 0.62, 6.0]} rotation={[-0.22, 0, 0]} color="#ffffff" edges={false} />
        </group>
      )}

      {/* Road sign: a pylon by the street */}
      {has.has('road') && (
        <group>
          <Box size={[0.3, 6, 0.3]} position={[-11, 3, 9]} color={STEEL} edges={false} />
          <Box size={[3.2, 1.9, 0.5]} position={[-11, 6.6, 9]} color={DARK} emissive={glow('road')} />
          <mesh position={[-11, 6.6, 9.27]}>
            <planeGeometry args={[3, 1.5]} />
            <meshBasicMaterial map={pylonFace} toneMapped={false} />
          </mesh>
        </group>
      )}

      {/* The lane: pre-sell board, menu board, clearance bar, directional */}
      {has.has('presell') && (
        <group>
          <Box size={[0.1, 1.0, 0.1]} position={[10.6, 0.5, 2.5]} color={STEEL} edges={false} />
          <Box size={[0.25, 1.0, 0.9]} position={[10.6, 1.45, 2.5]} color={DARK} emissive={glow('presell')} />
        </group>
      )}
      {has.has('dt-menu') && (
        <group>
          <Box size={[0.1, 1.2, 0.1]} position={[10.6, 0.6, -2]} color={STEEL} edges={false} />
          <Box size={[0.1, 1.2, 0.1]} position={[10.6, 0.6, 0]} color={STEEL} edges={false} />
          <Box size={[0.3, 1.5, 2.4]} position={[10.6, 1.9, -1]} color={DARK} emissive={glow('dt-menu')} />
          {[-1.6, -1.0, -0.4, 0.2].map((offset) => (
            <Box key={offset} size={[0.02, 0.18, 1.8]} position={[10.44, 2.4 + offset * 0.5, -1]} color="#ffffff" edges={false} />
          ))}
        </group>
      )}
      {has.has('clearance') && (
        <group>
          <Box size={[0.18, 3, 0.18]} position={[6.9, 1.5, 6.6]} color={STEEL} edges={false} />
          <Box size={[0.18, 3, 0.18]} position={[10.2, 1.5, 6.6]} color={STEEL} edges={false} />
          <Box size={[3.5, 0.3, 0.3]} position={[8.55, 3.1, 6.6]} color={brand} emissive={glow('clearance')} />
        </group>
      )}
      {has.has('directional') && (
        <group>
          <Box size={[0.08, 0.7, 0.08]} position={[10.9, 0.35, 8.6]} color={STEEL} edges={false} />
          <Box size={[0.9, 0.45, 0.06]} position={[10.9, 0.95, 8.6]} color="#ffffff" emissive={glow('directional')} />
          <Box size={[0.5, 0.08, 0.07]} position={[10.9, 0.95, 8.62]} color={brand} edges={false} />
        </group>
      )}

      {/* Inside: lobby letters, menu boards, counter, neon on the dining wall */}
      {has.has('lobby') && (
        <mesh position={[0, 3.6, -4.35]}>
          <planeGeometry args={[6.4, 0.8]} />
          <meshBasicMaterial map={lobbyLetters} transparent toneMapped={false} color={lit === 'lobby' ? '#ffffff' : '#e8e8e8'} />
        </mesh>
      )}
      {has.has('menuboard') &&
        [-2.2, 0, 2.2].map((x) => (
          <group key={x}>
            <Box size={[1.9, 1.15, 0.12]} position={[x, 2.4, -4.3]} color={DARK} emissive={glow('menuboard')} />
            <Box size={[1.6, 0.9, 0.02]} position={[x, 2.4, -4.23]} color="#ffffff" edges={false} />
          </group>
        ))}
      <Box size={[7, 1.1, 1]} position={[0, 0.55, -2.5]} color="#8b6b4a" />
      {has.has('neon') && (
        <mesh position={[-5.82, 2.6, -1]} rotation={[0, Math.PI / 2, 0.6]}>
          <torusGeometry args={[0.55, 0.05, 12, 48, Math.PI * 1.3]} />
          <meshStandardMaterial color={brand} emissive={brand} emissiveIntensity={lit === 'neon' ? 2.2 : 1.2} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

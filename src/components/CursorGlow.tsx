'use client';

// The drafting grid, lit where the pointer is — on every page (owner, 6 Oct;
// DECISIONS #193), rendered once by the root layout. It takes the page's
// colour: the brand's on a brand's pages, Signage blue everywhere else.
//
// It draws the same grid as body::before (globals.css), stronger, with a soft
// wash of the brand colour, masked to a circle that follows the pointer. Only
// for a real mouse, and never when the visitor has asked for reduced motion.
//
// Resting on bare grid, the squares around the pointer start to breathe
// (DECISIONS #202): after a still moment, one random square nearby fills with a
// darker shade of the page colour and fades out, then another, a few at a time.
// Never over content — a card, a form, a heading — where it would distract, and
// it stops the moment the pointer moves, the page scrolls or a key is pressed.

import { useEffect, useRef } from 'react';

/** The grid's square (body::before), and where its lines fall: x = 24k − 1. */
const CELL = 24;
/** How long the pointer rests before the squares start. */
const IDLE_MS = 1500;
/** A new square this often, each lasting PULSE_MS, at most MAX_LIT at once. */
const EVERY_MS = 250;
const PULSE_MS = 1500;
const MAX_LIT = 7;
/** How far from the pointer, in squares. */
const REACH = 4;
/** Peak strength: subtle, a tint rather than a block. */
const PEAK = 0.22;

/** The page grid fades toward the bottom and sides; the squares fade with it. */
const PAGE_MASK = 'radial-gradient(ellipse 110% 90% at 50% 0%, #000 45%, transparent 100%)';

const CONTENT = /^(A|BUTTON|INPUT|TEXTAREA|SELECT|LABEL|IMG|SVG|VIDEO|IFRAME|TABLE|P|H[1-6]|LI|DT|DD|CODE)$/;

/** True when the pointer rests on the page's own grid, not on anything placed on it. */
function onBareGrid(x: number, y: number): boolean {
  let node = document.elementFromPoint(x, y);
  if (!node) return false;
  for (; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    if (CONTENT.test(node.tagName.toUpperCase())) return false;
    const background = getComputedStyle(node).backgroundColor;
    if (background && background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') return false;
  }
  return true;
}

export function CursorGlow({ color = 'var(--color-brand)' }: { color?: string }) {
  const layer = useRef<HTMLDivElement>(null);
  const squares = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = layer.current;
    const field = squares.current;
    if (!el || !field) return;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!finePointer || reduced) return;

    let frame = 0;
    let x = 0;
    let y = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let ticking: ReturnType<typeof setInterval> | undefined;
    let lit = 0;
    let last = '';

    const paint = () => {
      frame = 0;
      el.style.setProperty('--glow-x', `${x}px`);
      el.style.setProperty('--glow-y', `${y}px`);
      el.style.opacity = '1';
    };

    const spawn = () => {
      if (lit >= MAX_LIT) return;
      const baseX = Math.floor(x / CELL);
      const baseY = Math.floor(y / CELL);
      let dx = 0;
      let dy = 0;
      let key = '';
      for (let tries = 0; tries < 6; tries++) {
        dx = Math.round((Math.random() * 2 - 1) * REACH);
        dy = Math.round((Math.random() * 2 - 1) * REACH);
        key = `${baseX + dx},${baseY + dy}`;
        if (dx * dx + dy * dy <= REACH * REACH && key !== last) break;
      }
      last = key;
      const square = document.createElement('div');
      square.className = 'absolute';
      square.style.left = `${(baseX + dx) * CELL}px`;
      square.style.top = `${(baseY + dy) * CELL}px`;
      square.style.width = `${CELL - 1}px`;
      square.style.height = `${CELL - 1}px`;
      square.style.background = `color-mix(in srgb, ${color} 70%, black)`;
      square.style.opacity = '0';
      field.appendChild(square);
      lit += 1;
      const animation = square.animate([{ opacity: 0 }, { opacity: PEAK }, { opacity: 0 }], {
        duration: PULSE_MS,
        easing: 'ease-in-out',
      });
      animation.onfinish = () => {
        square.remove();
        lit -= 1;
      };
    };

    const stop = () => {
      if (idle) clearTimeout(idle);
      if (ticking) clearInterval(ticking);
      idle = undefined;
      ticking = undefined;
    };

    const rest = () => {
      stop();
      idle = setTimeout(() => {
        if (!onBareGrid(x, y)) return;
        spawn();
        ticking = setInterval(spawn, EVERY_MS);
      }, IDLE_MS);
    };

    const move = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
      rest();
    };
    const leave = () => {
      el.style.opacity = '0';
      stop();
    };
    const hidden = () => {
      if (document.hidden) stop();
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('scroll', stop, { passive: true, capture: true });
    window.addEventListener('keydown', stop);
    window.addEventListener('pointerdown', stop);
    document.addEventListener('visibilitychange', hidden);
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('scroll', stop, { capture: true });
      window.removeEventListener('keydown', stop);
      window.removeEventListener('pointerdown', stop);
      document.removeEventListener('visibilitychange', hidden);
      document.documentElement.removeEventListener('pointerleave', leave);
      if (frame) cancelAnimationFrame(frame);
      stop();
    };
  }, [color]);

  const mask = 'radial-gradient(260px circle at var(--glow-x) var(--glow-y), #000, transparent 70%)';
  return (
    <>
      <div
        ref={layer}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 opacity-0 transition-opacity duration-500 print:hidden"
        style={{
          backgroundImage: [
            `radial-gradient(260px circle at var(--glow-x) var(--glow-y), color-mix(in srgb, ${color} 10%, transparent), transparent 70%)`,
            `linear-gradient(color-mix(in srgb, ${color} 22%, transparent) 1px, transparent 1px)`,
            `linear-gradient(90deg, color-mix(in srgb, ${color} 22%, transparent) 1px, transparent 1px)`,
          ].join(','),
          backgroundSize: 'auto, 24px 24px, 24px 24px',
          backgroundPosition: '0 0, -1px -1px, -1px -1px',
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
      {/* The breathing squares, faded toward the page's edges like the grid. */}
      <div
        ref={squares}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden"
        style={{ maskImage: PAGE_MASK, WebkitMaskImage: PAGE_MASK }}
      />
    </>
  );
}

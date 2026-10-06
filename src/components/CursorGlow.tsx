'use client';

// The drafting grid, lit where the pointer is: the two signed-out front pages
// (`/` and a brand's landing page) in the brand colour, and the Signage.com
// console in Signage blue (owner, 6 Oct). Brand working screens stay still.
//
// It draws the same grid as body::before (globals.css), stronger, with a soft
// wash of the brand colour, masked to a circle that follows the pointer. Only
// for a real mouse, and never when the visitor has asked for reduced motion.

import { useEffect, useRef } from 'react';

export function CursorGlow({ color = 'var(--color-brand)' }: { color?: string }) {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!finePointer || reduced) return;

    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      el.style.setProperty('--glow-x', `${x}px`);
      el.style.setProperty('--glow-y', `${y}px`);
      el.style.opacity = '1';
    };
    const move = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => {
      el.style.opacity = '0';
    };
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const mask = 'radial-gradient(260px circle at var(--glow-x) var(--glow-y), #000, transparent 70%)';
  return (
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
  );
}

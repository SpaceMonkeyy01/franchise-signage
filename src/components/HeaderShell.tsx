'use client';

// The brand header's surface. At the top of the page there is no bar at all —
// the logo sits on the brand's colour wash like the rest of the page. Once the
// page scrolls under it, a frosted bar with a soft shadow fades in so the
// logo stays readable over content. Stays in view; prints plain.

import { useEffect, useState } from 'react';

export function HeaderShell({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className={`sticky top-0 z-30 border-b transition-[background-color,box-shadow,border-color] duration-200 print:static print:border-gray-200 print:bg-white print:shadow-none ${
        scrolled
          ? 'border-gray-200/70 bg-white/85 shadow-[0_1px_12px_rgb(15_23_42/0.06)] backdrop-blur-lg'
          : 'border-transparent bg-transparent'
      }`}
    >
      {children}
    </header>
  );
}

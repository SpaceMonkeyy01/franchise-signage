'use client';

// The 3D model, loaded only when this section is on the page (DECISIONS #204):
// three.js is heavy, and nothing else needs it.

import dynamic from 'next/dynamic';

import type { MapSign } from './SignMap';

const SignModel3D = dynamic(() => import('./SignModel3D'), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-2xl border border-gray-200 bg-[#f6f7f5] text-sm text-gray-500"
      style={{ aspectRatio: '16 / 11' }}
    >
      Loading the 3D model…
    </div>
  ),
});

export function SignModelSection({ brandName, signs }: { brandName: string; signs: MapSign[] }) {
  return <SignModel3D brandName={brandName} signs={signs} />;
}

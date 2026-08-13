// Generic per-render_key thumbnails (SPEC §8: "mockup_file_id stays nullable and
// the team curates mockups manually — everything else works").
//
// Until the Design Studio integration lands, this is what a franchisee sees on
// every sign card. It is deliberately a drawn SVG rather than a photo: it reads
// as a schematic, so nobody mistakes it for a rendering of their actual sign.
//
// master_catalog.render_key carries ~20 engine slugs; they collapse into six
// silhouettes, the same coarse shapes docs/flow-demo.jsx uses.

type Shape = 'channel' | 'letters' | 'box' | 'pylon' | 'menu' | 'window';

function shapeFor(renderKey: string | null): Shape {
  if (!renderKey) return 'box';
  if (renderKey.includes('pylon') || renderKey.includes('post-panel')) return 'pylon';
  if (renderKey.includes('monument')) return 'box';
  if (renderKey.includes('vinyl') || renderKey.includes('window')) return 'window';
  if (renderKey.includes('light-box') || renderKey.includes('marquee')) return 'menu';
  if (renderKey.includes('channel') || renderKey.includes('neon')) return 'channel';
  if (renderKey.includes('flat-cut') || renderKey.includes('plaque')) return 'letters';
  return 'box';
}

export function SignThumbnail({
  renderKey,
  className = '',
  label,
}: {
  renderKey: string | null;
  className?: string;
  label?: string;
}) {
  const shape = shapeFor(renderKey);

  return (
    <svg
      viewBox="0 0 64 44"
      className={className}
      role="img"
      aria-label={label ? `${label} — schematic` : 'Sign schematic'}
    >
      {/* Wall / ground plane, so every silhouette sits on something. */}
      <rect width="64" height="44" rx="3" fill="#f3f4f6" />

      {shape === 'channel' && (
        <>
          <rect x="8" y="26" width="48" height="3" rx="1.5" fill="#9ca3af" />
          {[11, 21, 31, 41].map((x) => (
            <rect key={x} x={x} y="14" width="8" height="12" rx="1.5" fill="var(--color-brand)" />
          ))}
          <rect x="8" y="12" width="48" height="1" fill="#e5e7eb" />
        </>
      )}

      {shape === 'letters' && (
        <>
          {[12, 22, 32, 42].map((x, i) => (
            <rect
              key={x}
              x={x}
              y={16 + (i % 2)}
              width="8"
              height="13"
              rx="1"
              fill="#6b7280"
              opacity={0.85}
            />
          ))}
          <rect x="8" y="31" width="48" height="1.5" rx="0.75" fill="#d1d5db" />
        </>
      )}

      {shape === 'box' && (
        <>
          <rect x="12" y="13" width="40" height="18" rx="2.5" fill="var(--color-brand)" />
          <rect x="16" y="18" width="20" height="3" rx="1.5" fill="#ffffff" opacity="0.9" />
          <rect x="16" y="23" width="13" height="2.5" rx="1.25" fill="#ffffff" opacity="0.6" />
        </>
      )}

      {shape === 'pylon' && (
        <>
          <rect x="29" y="20" width="6" height="18" fill="#9ca3af" />
          <rect x="18" y="6" width="28" height="16" rx="2.5" fill="var(--color-brand)" />
          <rect x="22" y="11" width="14" height="3" rx="1.5" fill="#ffffff" opacity="0.9" />
          <rect x="14" y="37" width="36" height="2.5" rx="1.25" fill="#d1d5db" />
        </>
      )}

      {shape === 'menu' && (
        <>
          <rect x="8" y="12" width="48" height="21" rx="2" fill="#374151" />
          {[11, 27, 43].map((x) => (
            <rect key={x} x={x} y="15" width="13" height="15" rx="1" fill="var(--color-brand-light)" />
          ))}
        </>
      )}

      {shape === 'window' && (
        <>
          <rect x="8" y="8" width="48" height="29" rx="2" fill="#ffffff" stroke="#d1d5db" />
          <rect x="8" y="24" width="48" height="13" fill="var(--color-brand-light)" />
          <line x1="32" y1="8" x2="32" y2="37" stroke="#d1d5db" strokeWidth="1" />
          {[14, 38].map((x) => (
            <circle key={x} cx={x + 5} cy="30" r="3" fill="var(--color-brand)" opacity="0.55" />
          ))}
        </>
      )}
    </svg>
  );
}

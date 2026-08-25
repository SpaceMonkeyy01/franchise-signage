// Loading UI, shared so that every screen waits in the same way.
//
// The shapes are deliberately generic rather than a per-screen replica of what
// is coming. A skeleton that mimics the real layout too closely promises a
// specific page, and this product's pages differ by how much data a franchisee
// actually has — an accurate skeleton for one location is a lie for four.
//
// What they do promise is honest and worth promising: something is loading, it
// is roughly this shape, and the screen has not broken.

export function SkeletonBar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-100 ${className}`} />;
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <SkeletonBar className="h-4 w-40" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }, (_, index) => (
          <SkeletonBar key={index} className={index === lines - 1 ? 'h-3 w-1/2' : 'h-3 w-3/4'} />
        ))}
      </div>
    </div>
  );
}

/** A page's worth of waiting: a heading, then a few cards. */
export function SkeletonPage({
  cards = 3,
  width = 'max-w-4xl',
}: {
  cards?: number;
  width?: string;
}) {
  return (
    <main className={`mx-auto w-full ${width} flex-1 px-4 py-8 sm:px-6`} aria-busy="true">
      <span className="sr-only">Loading…</span>
      <SkeletonBar className="h-6 w-56" />
      <SkeletonBar className="mt-2 h-3 w-72" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: cards }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    </main>
  );
}

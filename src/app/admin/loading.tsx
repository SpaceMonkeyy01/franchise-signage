// The queue reads every request across every brand, so it is the one screen an
// operator opens cold each morning and waits on.
//
// It is also the ONLY segment with a skeleton, and the reason is worth keeping:
// `loading.tsx` makes a segment stream, and a streamed response has already
// flushed its shell by the time `notFound()` is called — so Next answers 200
// instead of 404. Every other page in this build resolves a credential and
// calls `notFound()` when it fails, and on those "this link is dead" is worth
// more than a shimmer on a page that renders in a few hundred milliseconds
// (DECISIONS #79). This one authenticates by redirect and never 404s.
import { SkeletonPage } from '@/components/Skeleton';

export default function Loading() {
  return <SkeletonPage cards={4} width="max-w-6xl" />;
}

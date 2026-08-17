// Where a stored file is served from.
//
// Its own module, and free of imports, because both server and CLIENT components
// need it: src/lib/storage/index.ts reaches for node:fs, and pulling that into a
// browser bundle fails the build. Keeping the pure string function separate is
// what lets a client component link to a file without dragging the driver along.

export function fileUrl(storagePath: string): string {
  return `/api/files/${storagePath}`;
}

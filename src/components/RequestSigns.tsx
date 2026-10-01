// The signs on a request, for the rows that list requests under a location —
// the franchisee's store cards and corporate's location cards. A request code
// says nothing at a glance; the signs it asks for do.
//
// Two pieces: a strip of thumbnails that sits in the row itself, and the full
// list the row expands to. Both draw the same picture every other sign card
// does (its picture, else its type's icon, else the schematic — #157).

import { SignThumbnail } from '@/components/SignThumbnail';
import { ItemStatusChip } from '@/components/StatusChip';
import type { RequestSign } from '@/lib/db/queries';

/** Up to `max` thumbnails, then "+N" for the rest. Names on hover. */
export function SignStrip({ signs, max = 4 }: { signs: RequestSign[]; max?: number }) {
  if (signs.length === 0) return null;
  const shown = signs.slice(0, max);
  const more = signs.length - shown.length;
  return (
    <span
      className="flex items-center gap-1"
      aria-label={signs.map((sign) => sign.name).join(', ')}
    >
      {shown.map((sign, index) => (
        <span key={`${sign.name}-${index}`} title={sign.name} aria-hidden="true">
          <SignThumbnail
            renderKey={sign.render_key}
            imagePath={sign.image_path}
            label={sign.name}
            className={`h-6 w-8 rounded ${sign.item_status === 'declined' ? 'opacity-40' : ''}`}
          />
        </span>
      ))}
      {more > 0 && (
        <span className="ml-0.5 text-xs font-medium text-gray-500" aria-hidden="true">
          +{more}
        </span>
      )}
    </span>
  );
}

/** Every sign on the request, in the request's order, with where each stands. */
export function RequestSignList({ signs }: { signs: RequestSign[] }) {
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-2">
      {signs.map((sign, index) => (
        <li
          key={`${sign.name}-${index}`}
          className="flex min-w-0 items-center gap-2.5 rounded-lg bg-gray-50 px-2 py-1.5"
        >
          <SignThumbnail
            renderKey={sign.render_key}
            imagePath={sign.image_path}
            label={sign.name}
            className="h-8 w-11 shrink-0 rounded"
          />
          {/* On a phone the chip goes under the name; side by side has room
              for neither. */}
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <span className="w-full min-w-0 truncate text-sm text-gray-800 sm:w-auto">
              {sign.name}
            </span>
            <ItemStatusChip status={sign.item_status} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The row's expand control: a chevron that turns when its <details> opens. */
export function ExpandChevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180"
      aria-hidden="true"
    >
      <path
        d="M5 8l5 5 5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

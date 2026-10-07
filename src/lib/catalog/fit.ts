// Which add-ons make sense for a store (DECISIONS #197).
//
// A drive-thru menu board offered to an inline unit in a strip center is noise
// at best and a mistaken order at worst. The catalog's sign type says what a
// sign is ("Drive-Thru Signs" — its category is the broader "Freestanding
// Signs"); the store type says whether the building has a lane. Store types are
// the brand's own list, so a drive-thru one is recognised by its key or label.

const DRIVE_THRU = /drive[\s_-]?thru|drive[\s_-]?through/i;

export function isDriveThruStore(storeType: string | null, label?: string | null): boolean {
  return DRIVE_THRU.test(storeType ?? '') || DRIVE_THRU.test(label ?? '');
}

/** True when a sign of this catalog sign type suits this store type. */
export function suitsStore(signType: string, storeType: string | null, label?: string | null): boolean {
  if (!DRIVE_THRU.test(signType)) return true;
  return isDriveThruStore(storeType, label);
}

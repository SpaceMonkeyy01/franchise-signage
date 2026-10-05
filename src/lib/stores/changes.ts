// What an edit to a store changes, and whether it may (DECISIONS #177). Pure:
// the edit page and the server share it, and the server decides.

export interface StoreFields {
  name: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
  /** YYYY-MM-DD, or '' for none. */
  openingDate: string;
  /** The store type's key (brand_store_types.key). */
  format: string;
}

export interface StoreChange {
  field: keyof StoreFields | 'address';
  summary: string;
}

/**
 * Store type decides which signs are standard and auto-approve (SPEC §7), so
 * an owner may change it only before the store's first order; Signage.com may
 * at any time, and orders already placed keep the approvals they have.
 */
export function mayChangeType(started: boolean, isTeam: boolean): boolean {
  return isTeam || !started;
}

/** One line per thing that changed, worded for the store's history. */
export function storeChanges(
  before: StoreFields,
  after: StoreFields,
  typeLabel: (key: string) => string,
): StoreChange[] {
  const changes: StoreChange[] = [];
  const clean = (value: string) => value.trim();

  if (clean(after.name) !== clean(before.name)) {
    changes.push({ field: 'name', summary: `Renamed from "${clean(before.name)}" to "${clean(after.name)}"` });
  }
  const address = (f: StoreFields) => [f.line1, f.city, f.state, f.zip].map(clean).filter(Boolean).join(', ');
  if (address(after) !== address(before)) {
    changes.push({ field: 'address', summary: `Address changed to ${address(after) || 'none'}` });
  }
  if (clean(after.openingDate) !== clean(before.openingDate)) {
    changes.push({
      field: 'openingDate',
      summary: after.openingDate ? `Opening date set to ${clean(after.openingDate)}` : 'Opening date cleared',
    });
  }
  if (after.format !== before.format) {
    changes.push({
      field: 'format',
      summary: `Store type changed from ${typeLabel(before.format)} to ${typeLabel(after.format)}`,
    });
  }
  return changes;
}

// Editing a store's details (DECISIONS #177). SERVER ONLY. Who may edit is the
// caller's to check (the action does); this loads, decides whether the store
// type may change, saves, and writes one location_events row per change.

import { parseDate } from '../db/create-request';
import { query, queryOne, transaction } from '../db/pool';
import { mayChangeType, storeChanges, type StoreFields } from './changes';

export class StoreEditError extends Error {}

export interface EditableStore {
  id: string;
  brand_id: string;
  fields: StoreFields;
  /** Has an order that was not declined, or signs installed. */
  started: boolean;
  /** The brand's live store types, plus the store's own if it was retired. */
  types: { key: string; label: string }[];
}

export async function getEditableStore(locationId: string): Promise<EditableStore | null> {
  const row = await queryOne<{
    id: string;
    brand_id: string;
    name: string;
    address: { line1?: string; city?: string; state?: string; zip?: string } | null;
    opening_date: string | null;
    format: string;
    started: boolean;
  }>(
    `select l.id, l.brand_id, l.name, l.address, to_char(l.opening_date, 'YYYY-MM-DD') as opening_date,
            l.format,
            exists (select 1 from requests r
                     where r.location_id = l.id and r.status <> 'declined')
            or exists (select 1 from installed_signs s where s.location_id = l.id) as started
       from locations l where l.id = $1`,
    [locationId],
  );
  if (!row) return null;
  const types = await query<{ key: string; label: string }>(
    `select key, label from brand_store_types
      where brand_id = $1 and (active or key = $2)
      order by sort_order, label`,
    [row.brand_id, row.format],
  );
  return {
    id: row.id,
    brand_id: row.brand_id,
    started: row.started,
    types,
    fields: {
      name: row.name,
      line1: row.address?.line1 ?? '',
      city: row.address?.city ?? '',
      state: row.address?.state ?? '',
      zip: row.address?.zip ?? '',
      openingDate: row.opening_date ?? '',
      format: row.format,
    },
  };
}

export async function updateStore(
  actor: { profileId: string; label: string; isTeam: boolean },
  store: EditableStore,
  input: StoreFields,
): Promise<number> {
  const next: StoreFields = {
    name: input.name.trim(),
    line1: input.line1.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    zip: input.zip.trim(),
    openingDate: input.openingDate.trim() ? (parseDate(input.openingDate) ?? '') : '',
    format: input.format,
  };
  if (!next.name) throw new StoreEditError('Give the store a name.');
  if (input.openingDate.trim() && !next.openingDate) {
    throw new StoreEditError('That opening date is not a date. Use the date picker, or leave it empty.');
  }
  if (!store.types.some((type) => type.key === next.format)) {
    throw new StoreEditError('That store type is not one of this brand’s.');
  }
  if (next.format !== store.fields.format && !mayChangeType(store.started, actor.isTeam)) {
    throw new StoreEditError(
      'This store already has an order, so its type can no longer be changed here. Ask Signage.com to change it.',
    );
  }

  const label = (key: string) => store.types.find((type) => type.key === key)?.label ?? key;
  const changes = storeChanges(store.fields, next, label);
  if (changes.length === 0) return 0;

  await transaction(async (exec) => {
    await exec.query(
      `update locations
          set name = $2, address = coalesce(address, '{}'::jsonb) || $3::jsonb, opening_date = $4, format = $5
        where id = $1`,
      [
        store.id,
        next.name,
        JSON.stringify({ line1: next.line1, city: next.city, state: next.state, zip: next.zip }),
        next.openingDate || null,
        next.format,
      ],
    );
    for (const change of changes) {
      await exec.query(
        `insert into location_events (location_id, actor_profile_id, actor_label, summary, detail)
         values ($1, $2, $3, $4, $5)`,
        [
          store.id,
          actor.profileId,
          actor.label,
          change.summary,
          JSON.stringify({ field: change.field, team: actor.isTeam }),
        ],
      );
    }
  });
  return changes.length;
}

/** The store's change history, newest first. */
export async function getStoreHistory(locationId: string) {
  return query<{ id: string; actor_label: string; summary: string; created_at: string }>(
    `select id, actor_label, summary, created_at from location_events
      where location_id = $1 order by created_at desc limit 50`,
    [locationId],
  );
}

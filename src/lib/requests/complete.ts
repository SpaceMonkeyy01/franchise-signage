// Completing a submitted package (DECISIONS #186). The readiness card lists
// what is still to follow up; until the quote, the franchisee can add those
// things themselves: a sign's site photo, its size in place of TBD, and the
// lease sign exhibit with the property manager's contact. Each addition is a
// request_events row, so the team sees it on the timeline and in the console.
//
// Authorised like the rest of the request page and the change-request panel:
// the request's link. Nothing here commits money or changes an approval.
// SERVER ONLY.

import { toRequestFile } from '../db/create-request';
import { queryOne, transaction } from '../db/pool';
import type { StoredObject } from '../storage';

export class CompleteError extends Error {}

/** Before the quote reaches the franchisee: what they add can still shape it. */
export const COMPLETABLE = ['submitted', 'needs_review', 'changes_requested', 'approved', 'sent_for_quote'];

interface Open {
  id: string;
  intent: string;
}

async function openRequest(token: string): Promise<Open> {
  const request = await queryOne<{ id: string; intent: string; status: string }>(
    `select id, intent, status from requests where access_token = $1`,
    [token],
  );
  if (!request) throw new CompleteError('That link did not open a request.');
  if (!COMPLETABLE.includes(request.status)) {
    throw new CompleteError('This request has its quote already. Reply to the quote email to change anything.');
  }
  return request;
}

async function lineOf(requestId: string, lineItemId: string) {
  const line = await queryOne<{ id: string; name: string; tbd_fields: string[] }>(
    `select li.id, bi.name, li.tbd_fields from line_items li
       join brand_items bi on bi.id = li.brand_item_id
      where li.id = $1 and li.request_id = $2 and li.item_status <> 'declined'`,
    [lineItemId, requestId],
  );
  if (!line) throw new CompleteError('That sign is not on this request.');
  return line;
}

export async function addSitePhoto(token: string, lineItemId: string, file: StoredObject, by: string): Promise<void> {
  const request = await openRequest(token);
  const line = await lineOf(request.id, lineItemId);
  const kind = request.intent === 'replace_like' ? 'condition_photo' : 'placement_photo';
  const stored = toRequestFile(kind, file);
  await transaction(async (exec) => {
    await exec.query(
      `insert into request_files
         (request_id, line_item_id, kind, storage_path, file_name, content_type, size_bytes, uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7,'franchisee')`,
      [request.id, line.id, stored.kind, stored.storagePath, stored.fileName, stored.contentType, stored.sizeBytes],
    );
    await exec.query(
      `insert into request_events (request_id, line_item_id, kind, actor, summary, detail)
       values ($1,$2,'details_added','franchisee',$3,$4)`,
      [request.id, line.id, `${by} added a ${kind === 'condition_photo' ? 'condition' : 'site'} photo for ${line.name}`, JSON.stringify({ field: 'photo' })],
    );
  });
}

export async function setSignSize(token: string, lineItemId: string, sizing: string, by: string): Promise<void> {
  const value = sizing.trim();
  if (!value) throw new CompleteError('Enter the size, for example 30" high or 8 ft wide.');
  if (value.length > 200) throw new CompleteError('Keep the size under 200 characters.');
  const request = await openRequest(token);
  const line = await lineOf(request.id, lineItemId);
  await transaction(async (exec) => {
    await exec.query(
      `update line_items set sizing = $2, tbd_fields = array_remove(tbd_fields, 'sizing') where id = $1`,
      [line.id, value],
    );
    await exec.query(
      `insert into request_events (request_id, line_item_id, kind, actor, summary, detail)
       values ($1,$2,'details_added','franchisee',$3,$4)`,
      [request.id, line.id, `${by} confirmed the size of ${line.name}: ${value}`, JSON.stringify({ field: 'sizing', value })],
    );
  });
}

export async function addLeaseExhibit(
  token: string,
  file: StoredObject | null,
  landlord: { name: string; email: string; phone: string } | null,
  by: string,
): Promise<void> {
  const contact = landlord && (landlord.name.trim() || landlord.email.trim() || landlord.phone.trim()) ? landlord : null;
  if (!file && !contact) throw new CompleteError('Upload the lease sign exhibit or add the property manager.');
  const request = await openRequest(token);
  await transaction(async (exec) => {
    if (file) {
      const stored = toRequestFile('landlord_criteria', file);
      await exec.query(
        `insert into request_files
           (request_id, line_item_id, kind, storage_path, file_name, content_type, size_bytes, uploaded_by)
         values ($1,null,$2,$3,$4,$5,$6,'franchisee')`,
        [request.id, stored.kind, stored.storagePath, stored.fileName, stored.contentType, stored.sizeBytes],
      );
    }
    if (contact) {
      await exec.query(`update requests set landlord_contact = $2 where id = $1`, [
        request.id,
        JSON.stringify({ name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone.trim() }),
      ]);
    }
    const what = [file && 'the lease sign exhibit', contact && 'the property manager’s contact'].filter(Boolean).join(' and ');
    await exec.query(
      `insert into request_events (request_id, kind, actor, summary, detail)
       values ($1,'details_added','franchisee',$2,$3)`,
      [request.id, `${by} added ${what}`, JSON.stringify({ field: 'landlord', file: Boolean(file), contact: Boolean(contact) })],
    );
  });
}

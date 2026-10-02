'use server';

// Uploading a photo before the request it belongs to exists.
//
// The setup, add and replace screens all collect photos while the franchisee is
// still filling the form, so the file lands in storage first and the
// request_files row is written at submission from the returned values
// (src/lib/db/create-request.ts). An abandoned form therefore leaves an orphan
// object and no row — cheap, and the alternative is writing draft rows for
// requests that may never be submitted.
//
// Who may upload (a Server Action is reachable by direct POST, so it decides
// for itself): Signage.com; anyone with an active role on the brand named by
// `prefix`; or the holder of one of that brand's request links, which is how a
// signed-out franchisee answers a change request (ResubmitPanel). Nobody else —
// before, this stored any file for anyone.

import { getViewer, owesSecondFactor, platformMembership } from '@/lib/auth/access';
import { queryOne } from '@/lib/db/pool';
import { putUpload, UploadRejectedError, type StoredObject } from '@/lib/storage';

export type UploadResult =
  | { ok: true; file: StoredObject }
  | { ok: false; error: string };

async function mayUpload(brandSlug: string, token: string | null): Promise<boolean> {
  const brand = await queryOne<{ id: string }>(`select id from brands where slug = $1`, [brandSlug]);
  if (!brand) return false;

  const viewer = await getViewer();
  if (viewer && !owesSecondFactor(viewer)) {
    if (platformMembership(viewer)) return true;
    if (viewer.memberships.some((membership) => membership.brandId === brand.id)) return true;
  }

  if (token) {
    const request = await queryOne<{ id: string }>(
      `select id from requests where access_token = $1 and brand_id = $2`,
      [token, brand.id],
    );
    if (request) return true;
  }
  return false;
}

export async function uploadPhoto(formData: FormData): Promise<UploadResult> {
  const file = formData.get('file');
  const prefix = String(formData.get('prefix') ?? '');
  const token = formData.get('token');
  if (!(file instanceof File)) return { ok: false, error: 'No file received.' };

  if (!(await mayUpload(prefix, typeof token === 'string' && token ? token : null))) {
    return { ok: false, error: 'Sign in again to upload files.' };
  }

  try {
    return { ok: true, file: await putUpload(file, prefix) };
  } catch (error) {
    if (error instanceof UploadRejectedError) return { ok: false, error: error.message };
    console.error('upload failed', error);
    return { ok: false, error: 'That upload failed. Try again.' };
  }
}

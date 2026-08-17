'use server';

// Uploading a photo before the request it belongs to exists.
//
// The setup, add and replace screens all collect photos while the franchisee is
// still filling the form, so the file lands in storage first and the
// request_files row is written at submission from the returned values
// (src/lib/db/create-request.ts). An abandoned form therefore leaves an orphan
// object and no row — cheap, and the alternative is writing draft rows for
// requests that may never be submitted.

import { putUpload, UploadRejectedError, type StoredObject } from '@/lib/storage';

export type UploadResult =
  | { ok: true; file: StoredObject }
  | { ok: false; error: string };

export async function uploadPhoto(formData: FormData): Promise<UploadResult> {
  const file = formData.get('file');
  const prefix = String(formData.get('prefix') ?? 'uploads');
  if (!(file instanceof File)) return { ok: false, error: 'No file received.' };

  try {
    return { ok: true, file: await putUpload(file, prefix) };
  } catch (error) {
    if (error instanceof UploadRejectedError) return { ok: false, error: error.message };
    console.error('upload failed', error);
    return { ok: false, error: 'That upload failed. Try again.' };
  }
}

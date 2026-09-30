// Sign pictures (DECISIONS #157): a brand sign's own picture, and a catalog
// sign type's icon. Images only — a thumbnail is drawn in an <img>, so a PDF
// or HEIC, which the request-photo uploads accept, would show nothing.

import { putUpload, UploadRejectedError } from '../storage';
import { CatalogError } from './manage';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Store an uploaded sign picture and return its storage path. */
export async function storeSignImage(formData: FormData): Promise<string> {
  const file = formData.get('file');
  if (!(file instanceof File)) throw new CatalogError('No picture received.');
  if (!IMAGE_TYPES.has(file.type)) throw new CatalogError('Upload a PNG, JPG or WEBP picture.');
  if (file.size > MAX_IMAGE_BYTES) throw new CatalogError('Pictures are limited to 5 MB.');
  try {
    return (await putUpload(file, 'catalog')).storagePath;
  } catch (error) {
    if (error instanceof UploadRejectedError) throw new CatalogError(error.message);
    throw error;
  }
}

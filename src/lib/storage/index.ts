// File storage behind one interface.
//
// SPEC §5.5 stores files as a `storage_path` inside a Supabase Storage bucket.
// There is no Supabase project on this machine yet (docs/STATE.md), so the dev
// driver writes the same paths to the local filesystem. Nothing above this file
// knows which driver it is talking to: a request_files row is a path either way,
// and switching is a matter of setting SUPABASE_STORAGE_BUCKET.
//
// Uploads arrive from franchisees who have no account (SPEC §10). The guards
// here — extension allowlist, size cap, generated name — are therefore the only
// guards there are: nothing about the uploader is known or trusted.

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Site photos and lease exhibits. Deliberately narrow. */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export interface StoredObject {
  storagePath: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export class UploadRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadRejectedError';
  }
}

/**
 * Store an uploaded file and return the row values for request_files.
 *
 * The stored name is generated, never the browser's: the uploaded name is kept
 * only as a display label on the row, so a hostile filename cannot become a
 * path.
 */
export async function putUpload(file: File, prefix: string): Promise<StoredObject> {
  const contentType = file.type || 'application/octet-stream';
  const extension = ALLOWED_TYPES[contentType];
  if (!extension) {
    throw new UploadRejectedError('Upload a JPG, PNG, WEBP, HEIC or PDF.');
  }
  if (file.size === 0) throw new UploadRejectedError('That file is empty.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadRejectedError(
      `Files are limited to ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
    );
  }

  const storagePath = `${safeSegment(prefix)}/${randomUUID()}.${extension}`;
  await driver().put(storagePath, Buffer.from(await file.arrayBuffer()), contentType);

  return {
    storagePath,
    fileName: displayName(file.name, extension),
    contentType,
    sizeBytes: file.size,
  };
}

export async function getUpload(storagePath: string): Promise<{
  body: Buffer;
  contentType: string;
} | null> {
  return driver().get(storagePath);
}

// Re-exported so server code has one import for storage; client components must
// import it from './url' directly, since this module reaches for node:fs.
export { fileUrl } from './url';

// --------------------------------------------------------------------- drivers

interface StorageDriver {
  put(storagePath: string, body: Buffer, contentType: string): Promise<void>;
  get(storagePath: string): Promise<{ body: Buffer; contentType: string } | null>;
}

function driver(): StorageDriver {
  if (process.env.SUPABASE_STORAGE_BUCKET) {
    // Deliberately a hard failure rather than a silent fallback to local disk:
    // files written to a container's filesystem in production are lost, and
    // losing a franchisee's site photo silently is worse than not booting.
    throw new Error(
      'SUPABASE_STORAGE_BUCKET is set but the Supabase Storage driver is not built yet ' +
        '(docs/STATE.md). Unset it to use local file storage.',
    );
  }
  return localDriver;
}

/**
 * Local disk, under .storage/ at the repo root.
 *
 * Paired with the dev database the same way: identical call sites, a different
 * thing on the other end.
 */
const localDriver: StorageDriver = {
  // No content type: on disk the extension carries it, and get() maps it back.
  async put(storagePath, body) {
    const target = localPath(storagePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  },

  async get(storagePath) {
    try {
      const body = await readFile(localPath(storagePath));
      return { body, contentType: contentTypeFor(storagePath) };
    } catch {
      return null;
    }
  },
};

const LOCAL_ROOT = resolve(process.env.LOCAL_STORAGE_DIR ?? '.storage');

function localPath(storagePath: string): string {
  const target = resolve(join(LOCAL_ROOT, storagePath));
  // Paths come back from the database, but a traversal reaching the filesystem
  // is worth one comparison to rule out for good.
  if (target !== LOCAL_ROOT && !target.startsWith(LOCAL_ROOT + sep)) {
    throw new Error('Refusing to read outside the storage root');
  }
  return target;
}

function contentTypeFor(storagePath: string): string {
  const extension = storagePath.split('.').pop()?.toLowerCase() ?? '';
  const match = Object.entries(ALLOWED_TYPES).find(([, ext]) => ext === extension);
  return match?.[0] ?? 'application/octet-stream';
}

// --------------------------------------------------------------------- helpers

/** One path segment, stable per input, with nothing that can escape a directory. */
function safeSegment(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return cleaned || createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function displayName(name: string, extension: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^\w. -]/g, '').trim().slice(0, 80);
  return `${base || 'upload'}.${extension}`;
}

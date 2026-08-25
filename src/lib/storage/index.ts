// File storage behind one interface.
//
// SPEC §5.5 stores files as a `storage_path` inside a Supabase Storage bucket.
// There is no Supabase project on this machine (docs/STATE.md), so the dev
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

import type { SupabaseClient } from '@supabase/supabase-js';

/** Only the storage half of the client is used here. */
type SupabaseStorageClient = Pick<SupabaseClient, 'storage'>;

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

/**
 * Which driver is in play, and why it is never guessed.
 *
 * Setting SUPABASE_STORAGE_BUCKET selects Supabase; unsetting it selects local
 * disk. There is no fallback in either direction, and that is deliberate: a
 * deployment whose bucket is misconfigured must fail loudly rather than write a
 * franchisee's site photo to a container filesystem that is discarded on the
 * next deploy. Losing a lease exhibit silently is worse than not booting.
 */
function driver(): StorageDriver {
  return process.env.SUPABASE_STORAGE_BUCKET ? supabaseDriver : localDriver;
}

/**
 * Supabase Storage, through the service role.
 *
 * Service role rather than the anon key, and the bucket is PRIVATE. The
 * alternative — a public bucket — would make every stored path a permanent
 * anonymous URL for a photograph of a franchisee's building and, worse, for the
 * lease exhibit that sits beside it in the same table. Reads therefore keep
 * going through /api/files, which is the one place that can be given a rule
 * later; see that route's header.
 *
 * Authorization happens above this layer, as it does for every other
 * service-role caller in the build (src/lib/supabase/clients.ts): by the time a
 * put() runs, a server action has already resolved the token that permits it.
 */
const supabaseDriver: StorageDriver = {
  async put(storagePath, body, contentType) {
    const { client, bucket } = await storageClient();
    const { error } = await client.storage.from(bucket).upload(storagePath, body, {
      contentType,
      // The path carries a fresh UUID, so a collision means something is wrong
      // rather than something is being replaced. Overwriting silently is how a
      // photo goes missing without an error anywhere.
      upsert: false,
    });
    if (error) {
      throw new Error(`Supabase Storage refused the upload: ${error.message}`);
    }
  },

  async get(storagePath) {
    const { client, bucket } = await storageClient();
    const { data, error } = await client.storage.from(bucket).download(storagePath);
    // A missing object and a broken bucket are different answers: null means
    // "no such file", which /api/files turns into a 404, and anything else
    // should surface rather than be reported as a missing photo.
    if (error) {
      if (isNotFound(error)) return null;
      throw new Error(`Supabase Storage could not read ${storagePath}: ${error.message}`);
    }
    if (!data) return null;

    return {
      body: Buffer.from(await data.arrayBuffer()),
      // The bucket echoes what put() stored; the extension is the fallback, and
      // agrees with it because both come from the same allowlist.
      contentType: data.type || contentTypeFor(storagePath),
    };
  },
};

/**
 * The storage client, built once.
 *
 * Imported dynamically so that a local-disk deployment never loads
 * supabase-js at all, the same way src/lib/email/send.ts defers Resend.
 *
 * It reads the two variables it needs directly rather than through
 * `serverEnv()`, which validates the whole configuration at once: storing a
 * file must not require a Resend key to be present, and a validator that
 * demands one would make this throw for the wrong reason.
 */
let cachedStorage: { client: SupabaseStorageClient; bucket: string } | null = null;

async function storageClient(): Promise<{ client: SupabaseStorageClient; bucket: string }> {
  if (cachedStorage) return cachedStorage;

  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    !bucket && 'SUPABASE_STORAGE_BUCKET',
    !url && 'NEXT_PUBLIC_SUPABASE_URL',
    !serviceRole && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `Supabase Storage is selected but ${missing.join(' and ')} ${
        missing.length === 1 ? 'is' : 'are'
      } not set. Unset SUPABASE_STORAGE_BUCKET to use local file storage instead.`,
    );
  }

  const { createClient } = await import('@supabase/supabase-js');
  cachedStorage = {
    client: createClient(url!, serviceRole!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    bucket: bucket!,
  };
  return cachedStorage;
}

/** Storage reports a missing object as a 404 rather than as a typed error. */
function isNotFound(error: { message: string; status?: number }): boolean {
  return (
    error.status === 404 ||
    /not[_ ]?found/i.test(error.message) ||
    /does not exist/i.test(error.message)
  );
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

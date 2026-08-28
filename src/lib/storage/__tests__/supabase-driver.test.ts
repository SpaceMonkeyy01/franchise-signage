// The Supabase Storage driver, against a stubbed bucket.
//
// This is the one module in the build that cannot be exercised end to end here:
// there is no Supabase project on this machine, and there is no honest way to
// fake one. So what is pinned is the part that would be silent if it were
// wrong — how the driver treats what Storage tells it.
//
// Three failures are worth more than any success:
//
//   · an upload that Storage refused must NOT return quietly, because the row
//     in request_files is written afterwards and would point at nothing;
//   · a missing object must read as "no file" (a 404 from /api/files), not as
//     an outage;
//   · a broken bucket must NOT read as a missing object, or a
//     misconfigured deployment looks exactly like a franchisee who never
//     uploaded a photo.
//
// The last one is the reason this file exists. Both of those states end with an
// empty page, and only one of them is somebody's mistake.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upload = vi.fn();
const download = vi.fn();
const from = vi.fn(() => ({ upload, download }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ storage: { from } })),
}));

const ENV_KEYS = [
  'SUPABASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const original: Record<string, string | undefined> = {};

/** Import fresh so the driver's memoised client does not leak between tests. */
async function storage() {
  vi.resetModules();
  return import('../index');
}

const png = () => new File([new Uint8Array([1, 2, 3, 4])], 'storefront.png', { type: 'image/png' });

beforeEach(() => {
  for (const key of ENV_KEYS) original[key] = process.env[key];
  process.env.SUPABASE_STORAGE_BUCKET = 'request-files';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  upload.mockReset();
  download.mockReset();
  from.mockClear();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('putUpload against Supabase Storage', () => {
  it('writes to the configured bucket, and never overwrites', async () => {
    upload.mockResolvedValue({ error: null });
    const { putUpload } = await storage();

    const stored = await putUpload(png(), 'REQ-0001');

    expect(from).toHaveBeenCalledWith('request-files');
    const [path, body, options] = upload.mock.calls[0];
    expect(path).toBe(stored.storagePath);
    expect(path).toMatch(/^req-0001\/[0-9a-f-]{36}\.png$/);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(options).toMatchObject({ contentType: 'image/png', upsert: false });
  });

  it('throws when Storage refuses it, rather than returning a path to nothing', async () => {
    // The row in request_files is written after this returns. A swallowed error
    // here is a photo the franchisee believes they sent and nobody can open.
    upload.mockResolvedValue({ error: { message: 'bucket not found', status: 404 } });
    const { putUpload } = await storage();

    await expect(putUpload(png(), 'REQ-0001')).rejects.toThrow(/bucket not found/);
  });

  it('rejects a disallowed type before it ever reaches the bucket', async () => {
    const { putUpload, UploadRejectedError } = await storage();
    const script = new File(['#!/bin/sh'], 'run.sh', { type: 'application/x-sh' });

    await expect(putUpload(script, 'REQ-0001')).rejects.toBeInstanceOf(UploadRejectedError);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('getUpload against Supabase Storage', () => {
  it('returns the object with the content type the bucket reports', async () => {
    download.mockResolvedValue({
      data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, type: 'image/png' },
      error: null,
    });
    const { getUpload } = await storage();

    const file = await getUpload('req-0001/abc.png');

    expect(file?.contentType).toBe('image/png');
    expect(file?.body.length).toBe(3);
  });

  it('falls back to the extension when the bucket reports no type', async () => {
    download.mockResolvedValue({
      data: { arrayBuffer: async () => new Uint8Array([1]).buffer, type: '' },
      error: null,
    });
    const { getUpload } = await storage();

    expect((await getUpload('req-0001/abc.pdf'))?.contentType).toBe('application/pdf');
  });

  // The three shapes below were read off the live service on 28 Aug 2026 rather
  // than imagined, after the imagined ones passed while the real behaviour was
  // the opposite. Supabase answers all three with status 400 / statusCode "404",
  // so only the message separates them — and a wrong KEY reports the BUCKET as
  // missing, because a caller who cannot authenticate cannot see it.
  it('reads a missing object as no file', async () => {
    download.mockResolvedValue({
      data: null,
      error: { message: 'Object not found', status: 400, statusCode: '404' },
    });
    const { getUpload } = await storage();

    expect(await getUpload('req-0001/gone.png')).toBeNull();
  });

  it('but does NOT read a missing bucket as a missing file', async () => {
    // The distinction this file exists for. Both end in an empty page; only one
    // of them is our mistake, and it must not be reported as the franchisee's.
    download.mockResolvedValue({
      data: null,
      error: { message: 'Bucket not found', status: 400, statusCode: '404' },
    });
    const { getUpload } = await storage();

    await expect(getUpload('req-0001/abc.png')).rejects.toThrow(/Bucket not found/);
  });

  it('and does NOT read a bad service-role key as a missing file', async () => {
    // Indistinguishable from the case above at the API — a key that cannot
    // authenticate is told the bucket does not exist. Pinned separately anyway,
    // because it is a different mistake to make and the next person will look
    // for it by name.
    download.mockResolvedValue({
      data: null,
      error: { message: 'Bucket not found', status: 400, statusCode: '404' },
    });
    const { getUpload } = await storage();

    await expect(getUpload('req-0001/abc.png')).rejects.toThrow(
      /Supabase Storage could not read/,
    );
  });
});

describe('choosing a driver', () => {
  it('names exactly what is missing rather than failing obscurely', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { putUpload } = await storage();

    await expect(putUpload(png(), 'REQ-0001')).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('uses local disk when no bucket is configured, and touches Supabase not at all', async () => {
    delete process.env.SUPABASE_STORAGE_BUCKET;
    process.env.LOCAL_STORAGE_DIR = '.storage-test';
    const { putUpload, getUpload } = await storage();

    const stored = await putUpload(png(), 'REQ-0001');
    const read = await getUpload(stored.storagePath);

    expect(upload).not.toHaveBeenCalled();
    expect(read?.body.length).toBe(4);
    expect(read?.contentType).toBe('image/png');
  });
});

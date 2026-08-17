// Serving an uploaded file.
//
// The path is the credential, exactly as the request access token is: stored
// paths are generated UUIDs, so knowing one means having been given it. That is
// the same bargain the rest of the franchisee surface makes (SPEC §10) — no
// accounts, unguessable links — and it is why nothing here consults a session.
//
// When the Supabase Storage driver lands, this route can be replaced by signed
// URLs; call sites go through fileUrl() precisely so that is a one-file change.

import { getUpload } from '@/lib/storage';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const file = await getUpload(path.join('/'));
  if (!file) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(file.body), {
    headers: {
      'content-type': file.contentType,
      'content-length': String(file.body.byteLength),
      // Immutable: a stored path is never rewritten, only replaced.
      'cache-control': 'private, max-age=31536000, immutable',
      'content-disposition': 'inline',
    },
  });
}

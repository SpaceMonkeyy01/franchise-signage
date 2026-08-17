// The temporary operator console — one request.
//
// TEMPORARY, for the reasons in ../../page.tsx. Both action groups are on one
// screen: what the Signage.com team does to move a request down its tail, and
// what a corporate reviewer decides per item.

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getRequestById } from '@/lib/db/queries';

import { assertDevConsole } from '../../guard';
import { Banner } from '../../page';
import { Console } from './Console';

export default async function DevRequestDetail({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  assertDevConsole();
  const { requestId } = await params;
  const request = await getRequestById(requestId);
  if (!request) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <Banner />

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{request.code}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {request.brand.name} · {request.location.name} · package v{request.package_version}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/dev" className="text-gray-500 underline-offset-2 hover:underline">
            ← Queue
          </Link>
          <Link
            href={`/${request.brand.slug}/request/${request.access_token}`}
            className="text-gray-500 underline-offset-2 hover:underline"
          >
            Franchisee view ↗
          </Link>
        </div>
      </div>

      <Console request={request} />
    </main>
  );
}

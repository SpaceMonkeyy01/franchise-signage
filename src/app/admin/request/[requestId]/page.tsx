// One request, as the Signage.com team sees it (SPEC §9 interface 2).

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireTeamMember } from '@/lib/auth/team';
import { getRequestById } from '@/lib/db/queries';

import { RequestConsole } from './RequestConsole';

export default async function AdminRequestDetail({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  await requireTeamMember();

  const { requestId } = await params;
  const request = await getRequestById(requestId);
  if (!request) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{request.code}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {request.brand.name} · {request.location.name} · {request.location.format}
            {request.package_version > 1 && ` · package v${request.package_version}`}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin" className="text-gray-500 underline-offset-2 hover:underline">
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

      <RequestConsole request={request} />
    </main>
  );
}

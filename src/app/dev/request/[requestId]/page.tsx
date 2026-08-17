// The corporate reviewer's view of one request.
//
// TEMPORARY — the web stand-in for Session 4's approval email. See ../../page.tsx.

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getRequestById } from '@/lib/db/queries';

import { assertDevConsole } from '../../guard';
import { Banner } from '../../page';
import { Console } from './Console';

export default async function DevReviewerDetail({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  assertDevConsole();
  const { requestId } = await params;
  const request = await getRequestById(requestId);
  if (!request) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <Banner />

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {request.brand.name} · {request.code}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {request.location.name}
            {request.package_version > 1 && ` · resubmitted, package v${request.package_version}`}
          </p>
        </div>
        <Link href="/dev" className="text-sm text-gray-500 underline-offset-2 hover:underline">
          ← All approvals
        </Link>
      </div>

      <Console request={request} />
    </main>
  );
}

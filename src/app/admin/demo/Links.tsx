// Every way in, in one list (was /admin/entry-points; DECISIONS #191).
//
// Support calls are "open what they are looking at, now", not "forward me the
// email". These are live credentials, the same ones the outbox renders, so the
// page sits behind the same team guard. Reviewer approval links are not listed:
// they are single-use and carry the authority to approve, so they stay only in
// the outbox email that carries them (#75).

import Link from 'next/link';

import { getBrandsWithPackages, getRegistrations, getRequestQueue } from '@/lib/db/queries';

const INTENT_LABEL: Record<string, string> = {
  initial_setup: 'Initial setup',
  add: 'New signs',
  replace_like: 'Replacement',
  modify: 'Modification',
  remove: 'Removal',
  rebrand: 'Rebrand',
};

export async function Links() {
  const [queue, registrations, brands] = await Promise.all([
    getRequestQueue(),
    getRegistrations(),
    getBrandsWithPackages(),
  ]);

  return (
    <main className="mx-auto w-full page-wide flex-1 px-4 py-8 sm:px-6">
      <Link href="/admin/demo" className="text-xs text-gray-500 underline-offset-2 hover:underline">
        ← Walkthrough
      </Link>
      <h1 className="mt-2 text-xl font-bold text-gray-900">All links</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-500">
        Open what a franchisee or a brand is looking at. The request and welcome links are live
        credentials; don&rsquo;t paste them anywhere public.
      </p>

      <Section title="Sign-in pages">
        {brands.map((brand) => (
          <div key={brand.id} className="space-y-2">
            <Row label={`${brand.name} · franchisee home`} detail={`/${brand.slug}`} href={`/${brand.slug}`} />
            <Row
              label={`${brand.name} · corporate dashboard`}
              detail={`/${brand.slug}/corporate`}
              href={`/${brand.slug}/corporate`}
            />
          </div>
        ))}
      </Section>

      <Section title={`Request links (${queue.length})`}>
        {queue.length === 0 && <Empty>No requests yet.</Empty>}
        {queue.map((row) => (
          <Row
            key={row.id}
            label={`${row.code} · ${row.location_name}`}
            detail={`${row.brand_name} · ${INTENT_LABEL[row.intent] ?? row.intent} · ${row.status.replace(/_/g, ' ')}`}
            href={`/${row.brand_slug}/request/${row.access_token}`}
            aside={
              <Link href={`/admin/request/${row.id}`} className="text-xs text-gray-500 underline-offset-2 hover:underline">
                Team view
              </Link>
            }
          />
        ))}
      </Section>

      <Section title={`Welcome pages (${registrations.length})`}>
        {registrations.length === 0 && <Empty>Nobody registered yet.</Empty>}
        {registrations.map((reg) => (
          <Row
            key={reg.id}
            label={reg.name ? `${reg.name} · ${reg.email}` : reg.email}
            detail={`${reg.brand_name}${reg.welcome_sent_at ? '' : ' · welcome not sent'}`}
            href={`/${reg.brand_slug}/welcome/${reg.access_token}`}
          />
        ))}
      </Section>

      <p className="mt-8 text-xs text-gray-500">
        Approval links for reviewers are only in the{' '}
        <Link href="/admin/outbox" className="font-medium text-gray-700 underline underline-offset-2">
          outbox
        </Link>
        , inside the email that carries them.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, detail, href, aside }: { label: string; detail: string; href: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-gray-300">
      <div className="min-w-0 flex-1">
        <Link href={href} className="block text-sm font-medium text-gray-900 hover:underline">
          {label}
        </Link>
        <p className="mt-0.5 truncate text-xs text-gray-500">{detail}</p>
      </div>
      {aside}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">{children}</p>;
}

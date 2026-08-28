// Every way into the product, in one place.
//
// The access model (SPEC §10) is deliberate and stays: franchisees and corporate
// hold tokenized links, nobody signs up, and nothing at the bare origin lists
// them. That is right for the world and hostile to the person operating it —
// Signage.com runs this white-glove, and a support call is "open what they are
// looking at, now", not "ask them to forward you the email".
//
// So this is the operator's index of live links, and it is exactly as guarded as
// it must be: the team allowlist, the same one that decides who may route a
// package or mark a sign installed. That is not a new exposure. /admin/outbox
// already renders these same credentials in full — a franchisee's status token,
// a corporate dashboard link, a reviewer's signed approval link — which is why
// Session 6c moved it behind this guard rather than an environment flag (#97).
// This page is a shortcut to things a signed-in operator can already read.
//
// Two things it deliberately does NOT do:
//
//   · It does not mint reviewer links. Those are single-use, expire in 7 days,
//     and die when the package version changes, because they carry the authority
//     to approve signage. A second, standing way to obtain one would quietly
//     widen the narrowest credential in the build (#75). They are listed in the
//     outbox, where the email that carries them is, and that is the only place
//     they should be gettable.
//
//   · It is not a "portal". Three of the five participants have no accounts by
//     design, and a screen offering to log in as them would misdescribe the
//     product to the first franchisor who saw it.

import Link from 'next/link';

import { requireTeamMember } from '@/lib/auth/team';
import { getBrandsWithPackages, getRegistrations, getRequestQueue } from '@/lib/db/queries';

import { CorporateLinkPanel } from './CorporateLinkPanel';

const INTENT_LABEL: Record<string, string> = {
  initial_setup: 'Initial setup',
  add: 'New signs',
  replace_like: 'Replacement',
  modify: 'Modification',
  remove: 'Removal',
  rebrand: 'Rebrand',
};

export default async function EntryPoints() {
  await requireTeamMember();

  const [queue, registrations, brands] = await Promise.all([
    getRequestQueue(),
    getRegistrations(),
    getBrandsWithPackages(),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-xl font-bold text-gray-900">Entry points</h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500">
        Every live link, so you can open what a franchisee or a franchisor is looking at without
        asking them to forward an email. These are real credentials — the same ones the outbox
        renders — so treat this screen the way you treat that one.
      </p>

      {/* ------------------------------------------------------------ public */}
      <Section
        title="Open to anyone"
        blurb="Addresses, not credentials. Safe to put in a message or on a slide."
      >
        {brands.map((brand) => (
          <div key={brand.id} className="space-y-2">
            <Row
              label={`${brand.name} — franchisee home`}
              detail="Where a franchisee starts a request"
              href={`/${brand.slug}`}
            />
            <Row
              label={`${brand.name} — corporate sign-in`}
              detail="Asks for a dashboard link by email; says the same thing whichever address is given"
              href={`/${brand.slug}/corporate`}
            />
          </div>
        ))}
        <Row label="Signage.com team" detail="This console" href="/admin" />
      </Section>

      {/* -------------------------------------------------------- franchisee */}
      <Section
        title="Franchisee"
        blurb={`One per request — the tokenized status page, scoped to that request alone. ${queue.length} live.`}
      >
        {queue.length === 0 && <Empty>No requests yet. Start one from a franchisee home above.</Empty>}
        {queue.map((row) => (
          <Row
            key={row.id}
            label={`${row.code} · ${row.location_name}`}
            detail={`${row.brand_name} · ${INTENT_LABEL[row.intent] ?? row.intent} · ${row.status.replace(/_/g, ' ')}`}
            href={`/${row.brand_slug}/request/${row.access_token}`}
            aside={
              <Link
                href={`/admin/request/${row.id}`}
                className="text-xs text-gray-500 underline-offset-2 hover:underline"
              >
                operator view
              </Link>
            }
          />
        ))}
      </Section>

      {/* ------------------------------------------------------- §8d level 1 */}
      <Section
        title="Franchisee — before there is a site (§8d level 1)"
        blurb="The welcome landing page, opened by the link in the welcome email. Budget figures only; ordering is not hidden here, it is absent."
      >
        {registrations.length === 0 && (
          <Empty>Nobody registered yet. Register a franchisee from the queue or the corporate dashboard.</Empty>
        )}
        {registrations.map((reg) => (
          <Row
            key={reg.id}
            label={reg.name ? `${reg.name} — ${reg.email}` : reg.email}
            detail={`${reg.brand_name}${reg.welcome_sent_at ? '' : ' · welcome not sent'}`}
            href={`/${reg.brand_slug}/welcome/${reg.access_token}`}
          />
        ))}
      </Section>

      {/* --------------------------------------------------------- corporate */}
      <Section
        title="Corporate dashboard"
        blurb="A 30-day, read-only link. Only an address already configured on the brand can be issued one, and that rule is not relaxed here."
      >
        {brands.map((brand) => (
          <CorporateLinkPanel key={brand.id} brandSlug={brand.slug} brandName={brand.name} />
        ))}
      </Section>

      {/* ---------------------------------------------------------- reviewer */}
      <Section
        title="Corporate reviewer"
        blurb="Not listed here, on purpose."
      >
        <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-600">
          An approval link is single-use, expires in seven days, and is revoked the moment the
          package changes — because it carries the authority to approve signage. A standing list of
          them would undo that. Open the approval email in the{' '}
          <Link href="/admin/outbox" className="font-medium text-gray-900 underline underline-offset-2">
            outbox
          </Link>{' '}
          and click through exactly as the reviewer would, or re-send it to them from the request.
        </p>
      </Section>
    </main>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-gray-500">{blurb}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  detail,
  href,
  aside,
}: {
  label: string;
  detail: string;
  href: string;
  aside?: React.ReactNode;
}) {
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
  return (
    <p className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
      {children}
    </p>
  );
}

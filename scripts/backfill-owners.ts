// Attach existing stores to franchisee companies (SPEC v2.3 §10.6).
//
//   npm run backfill-owners            — print the plan; change nothing
//   npm run backfill-owners -- --apply — do it
//
// Stores created before accounts belong to nobody. The spec's rule: infer each
// one's owner from the requester of its EARLIEST request, and have the team
// review that list before it is applied — because an inferred owner is a guess,
// and a wrong one would show a stranger someone else's store. So the default is
// a dry run, and --apply is a separate, deliberate step.
//
// On --apply, per inferred owner: reuse the company they already own on that
// brand if they have an account, otherwise create a company and an owner
// invitation INTO it (so accepting does not ask for a company name). Nobody is
// emailed (§10.6): the accept links are printed for the team to send, or the
// brand can register the franchisee and the welcome email carries a fresh one.
// Stores with no requester on any request are listed and left unowned — they
// stay visible to the brand and the team until someone is attached.

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

interface Unowned {
  location_id: string;
  location_name: string;
  brand_id: string;
  brand_slug: string;
  requester_email: string | null;
  requester_name: string | null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { query, queryOne, closePool } = await import('../src/lib/db/pool');
  const { createInvitation } = await import('../src/lib/auth/invitations');

  try {
    const unowned = await query<Unowned>(
      `select l.id as location_id, l.name as location_name, l.brand_id, b.slug as brand_slug,
              first.requester_email, first.requester_name
         from locations l
         join brands b on b.id = l.brand_id
         left join lateral (
           select r.requester_email, r.requester_name from requests r
            where r.location_id = l.id and r.requester_email is not null
            order by r.created_at limit 1
         ) first on true
        where l.franchisee_id is null
        order by b.slug, first.requester_email, l.name`,
    );

    if (unowned.length === 0) {
      console.log('Every store already belongs to a franchisee company. Nothing to do.');
      return;
    }

    const groups = new Map<string, Unowned[]>();
    const orphans: Unowned[] = [];
    for (const row of unowned) {
      if (!row.requester_email) {
        orphans.push(row);
        continue;
      }
      const key = `${row.brand_id}|${row.requester_email.toLowerCase()}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    console.log(apply ? 'Applying:\n' : 'Plan (dry run — nothing changes without --apply):\n');
    for (const rows of groups.values()) {
      const { brand_slug, requester_email, requester_name } = rows[0];
      console.log(`  ${brand_slug} · ${requester_name ?? '(no name)'} <${requester_email}>`);
      for (const row of rows) console.log(`      owns ${row.location_name}`);
    }
    for (const row of orphans) {
      console.log(`  ${row.brand_slug} · ${row.location_name} — no requester on file; left unowned`);
    }
    if (!apply) {
      console.log('\nCheck every line, then run again with --apply.');
      return;
    }

    console.log('');
    for (const rows of groups.values()) {
      const { brand_id, requester_email, requester_name } = rows[0];
      const email = requester_email!;

      const existing = await queryOne<{ franchisee_id: string }>(
        `select m.franchisee_id from memberships m join profiles p on p.id = m.profile_id
          where lower(p.email) = lower($1) and m.brand_id = $2
            and m.role = 'franchisee_owner' and m.active`,
        [email, brand_id],
      );

      const franchiseeId =
        existing?.franchisee_id ??
        (
          await queryOne<{ id: string }>(
            `insert into franchisees (brand_id, name) values ($1, $2) returning id`,
            [brand_id, requester_name ? `${requester_name} (franchisee)` : email],
          )
        )!.id;

      await query(`update locations set franchisee_id = $1 where id = any($2) and franchisee_id is null`, [
        franchiseeId,
        rows.map((row) => row.location_id),
      ]);

      if (existing) {
        console.log(`  ${email}: stores attached to their existing account.`);
        continue;
      }
      const invitation = await createInvitation({
        brandId: brand_id,
        email,
        role: 'franchisee_owner',
        franchiseeId,
        invitedBy: null,
        send: false,
      });
      console.log(`  ${email}: company created; accept link (14 days, single use):\n    ${invitation.url}`);
    }
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

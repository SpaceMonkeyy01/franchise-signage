// Mint an invitation from the command line (SPEC v2.3 §10.3.1).
//
//   npm run invite -- someone@signage.com
//   npm run invite -- owner@example.com --role brand_admin --brand freshbites
//
// Accounts exist only by invitation, which leaves one account nobody can
// invite: the first Signage.com admin on a fresh project. This is how that
// account comes to exist — and, since it works for any role, how the team
// migrates off the old allowlist (§10.6): one invitation each.
//
// The link is printed as well as mailed, because on a new deployment the mail
// may well not be configured yet. It is a working credential: run this in a
// terminal nobody is screen-sharing.

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const ROLES = ['platform_admin', 'brand_admin', 'brand_reviewer', 'franchisee_owner'] as const;

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((arg) => !arg.startsWith('--') && arg.includes('@'));
  const flag = (name: string) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const role = (flag('role') ?? 'platform_admin') as (typeof ROLES)[number];
  const brandSlug = flag('brand');

  if (!email || !ROLES.includes(role) || (role !== 'platform_admin' && !brandSlug)) {
    console.error(
      'Usage: npm run invite -- <email> [--role platform_admin|brand_admin|brand_reviewer|franchisee_owner] [--brand <slug>]',
    );
    process.exit(1);
  }

  const { queryOne, closePool } = await import('../src/lib/db/pool');
  const { createInvitation } = await import('../src/lib/auth/invitations');

  try {
    let brandId: string | null = null;
    if (role !== 'platform_admin') {
      const brand = await queryOne<{ id: string }>(`select id from brands where slug = $1`, [brandSlug]);
      if (!brand) throw new Error(`No brand with slug "${brandSlug}".`);
      brandId = brand.id;
    }

    const invitation = await createInvitation({ brandId, email, role, invitedBy: null });
    console.log(`Invited ${email} as ${role}${brandSlug ? ` on ${brandSlug}` : ''}.`);
    console.log(`Accept link (valid 14 days, single use):\n  ${invitation.url}`);
    if (invitation.domainWarning) console.warn(invitation.domainWarning);
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

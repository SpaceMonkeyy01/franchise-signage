// Catalog notifications (SPEC v2.4 §2.3).
//
// Two moments: a brand proposes a sign (to every active Signage.com admin),
// and the team decides it (to the brand admin who proposed it). Called after
// the change has committed; like every sender here, a mail failure never
// undoes the change — the proposal is on the team's catalog page either way.

import { appUrl, brandUrl } from '../auth/tokens';
import { SIGNAGE_BRAND } from '../auth/invitations';
import { attributeLabel, getSign } from '../catalog/manage';
import { query, queryOne } from '../db/pool';
import { render } from './layout';
import { sendEmail } from './send';
import { brandSender, platformSender } from './sender';
import { SignProposedEmail } from './templates/sign-proposed';
import { SignReviewedEmail } from './templates/sign-reviewed';

export async function notifySignProposed(itemId: string): Promise<void> {
  const sign = await getSign(itemId);
  if (!sign) return;
  const team = await query<{ email: string }>(
    `select p.email from memberships m join profiles p on p.id = m.profile_id
      where m.role = 'platform_admin' and m.active`,
  );
  if (team.length === 0) return;

  const html = await render(
    <SignProposedEmail
      signage={SIGNAGE_BRAND}
      brandName={sign.brand_name}
      signName={sign.name}
      signType={sign.variant ? `${sign.sign_type} — ${sign.variant}` : sign.sign_type}
      proposedBy={sign.submitted_by ?? sign.brand_name}
      choices={Object.entries(sign.pinned_attributes).map(([k, v]) => [attributeLabel(k), String(v)])}
      note={sign.submission_note}
      catalogUrl={appUrl('/admin/catalog')}
    />,
  );
  for (const { email } of team) {
    await sendEmail({
      kind: 'catalog_sign_proposed',
      to: email,
      subject: `${sign.brand_name} proposed a sign: ${sign.name}`,
      html,
      from: platformSender(),
      requestId: null,
    });
  }
}

export async function notifySignReviewed(itemId: string): Promise<void> {
  const sign = await getSign(itemId);
  if (!sign || sign.review_status === 'pending') return;
  const submitter = await queryOne<{ email: string; brand_colors: { primary?: string } | null }>(
    `select p.email, b.brand_colors
       from brand_items bi
       join brands b on b.id = bi.brand_id
       join memberships m on m.id = bi.submitted_by
       join profiles p on p.id = m.profile_id
      where bi.id = $1 and m.active`,
    [itemId],
  );
  if (!submitter) return;
  const approved = sign.review_status === 'approved';

  const html = await render(
    <SignReviewedEmail
      brand={{ name: sign.brand_name, brand_colors: submitter.brand_colors }}
      signName={sign.name}
      approved={approved}
      price={sign.est_price}
      note={sign.review_note}
      signsUrl={brandUrl(sign.brand_slug, '/corporate?tab=signs')}
    />,
  );
  await sendEmail({
    kind: approved ? 'catalog_sign_approved' : 'catalog_sign_declined',
    to: submitter.email,
    subject: approved ? `${sign.name} is live` : `${sign.name} was not approved`,
    html,
    from: brandSender(sign.brand_name),
    requestId: null,
  });
}

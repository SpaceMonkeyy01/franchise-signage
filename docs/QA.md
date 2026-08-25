# QA pass — the whole storyline, by hand

What `npm run smoke` proves automatically, a person still has to *see*. This is
the demo script: one franchisee, one location, both fulfillment tails, and every
document and email the program produces along the way. Run it before showing the
product to anyone, and after any change that touches status, routing, or mail.

**Time:** about 25 minutes end to end. **Automated equivalent:** `npm run smoke`
(165 checks) covers most assertions but sees none of the layout, copy, or
timing — which is exactly what this pass is for.

---

## Before you start

```bash
npm run dev:db:reset     # wipe .pglite/ and re-seed — do this, or you are testing yesterday
npm run dev              # dev database (5433) + Next (3000)
```

Four windows, one per participant, is the fastest way to run this:

| Window | URL | Who they are |
|---|---|---|
| Franchisee | http://localhost:3000/freshbites | No login, ever. Tokenized links. |
| Team | http://localhost:3000/admin | Sign in as `team@signage.com`. |
| Corporate | http://localhost:3000/freshbites/corporate | No login. Magic link. |
| Outbox | http://localhost:3000/admin/outbox | Every message that was or would be sent. Team sign-in required. |

**No mail is delivered.** With no `RESEND_API_KEY` every message is rendered and
recorded instead of sent, and `/admin/outbox` is where you read it — including clicking
the links a reviewer would click. That is the intended way to run this pass.

> Anything that talks SQL directly must connect, work and disconnect: the dev
> database serves one connection at a time. If it starts refusing every
> connection, restart `npm run dev:db`.

---

## 1 · Before there is a building (§8d level 1, §8b)

Corporate registers a franchisee at agreement signing. This is the front door.

1. **Corporate → Franchisee registrations.** You need a dashboard link first:
   at `/freshbites/corporate`, enter `brand@freshbites.com` (the brand's
   configured reviewer) and press **Email me a link**. Open `/admin/outbox`, find
   *Your Freshbites signage dashboard*, and follow the link inside it.
   - ✅ The page says it is read-only and names who opened it.
   - ✅ An address that is *not* on file gets the identical "check your inbox"
     message and no email. Try `nobody@example.com` and confirm nothing appears
     in `/admin/outbox`.
2. In **Franchisee registrations**, register any address (`you@example.com` is
   fine) and press **Register & welcome**.
   - ✅ The row appears marked `welcomed`, immediately — saving *is* the send.
   - ✅ `/admin/outbox` holds a **welcome** email, from *Freshbites*, not Signage.com.
   - ✅ It contains a signage number and says nothing about ordering signs.
   - ✅ Its only link is the franchisee's own page.
3. Follow that link.
   - ✅ Budget figures per location format, each with a downloadable sheet.
   - ✅ **No way to order anything.** Not a disabled button — absent. There is
     no building yet.
   - ✅ Download one sheet: a branded PDF, totals excluding custom-quote items,
     which are listed but not priced.

## 2 · The lease is signed — initial setup (§9 interface 1)

4. **Franchisee → `/freshbites` → Set up a new location.** Work through the four
   steps: basics and format, the pre-loaded package checklist, add-ons, review.
   - ✅ The standard package arrives pre-checked. This is the point of the
     program: they confirm rather than compose.
   - ✅ Toggle a field to **TBD**. It flags follow-up and never blocks submit.
   - ✅ Flag one item as an **exception** with a reason.
   - ✅ Add one **add-on** from the catalog.
   - ✅ Answer **yes** to the financing question (§8b) — it is the norm.
   - ✅ The review step totals only priced items and names the vendor policy.
5. Submit, and keep the status-page URL. That token is their whole credential.
   - ✅ `/admin/outbox` holds a **submitted** confirmation addressed to the requester.
   - ✅ The status page shows per-item status, prices and vendor chips.

## 3 · The team prepares it (§9 interface 2)

6. **Team → `/admin`.** The request is in **Needs prep**.
   - ✅ Buckets are organised by whose move it is, not by raw status.
   - ✅ Rollups count items with corporate and TBD fields to chase.
7. Open it and **Prepare package**.
   - ✅ Standard items are already auto-approved; only the add-on and the
     exception go to corporate.
   - ✅ The landlord-criteria check is offered, and tracked rather than enforced.
   - ✅ The status moves to `needs_review` and an approval email appears in
     `/admin/outbox`.

## 4 · Corporate decides (§9 interface 3, §7)

8. Open the approval email in `/admin/outbox`.
   - ✅ It leads with how many items are proceeding **without** corporate.
   - ✅ One card per pending item: spec, origin, vendor, price, exception text.
9. Click **Request changes** on one item.
   - ✅ Opening the link decides nothing — the decision happens on the page.
     (Mail scanners follow links; a scanner must not approve a sign.)
   - ✅ A note is required before the button works.
10. Click **Approve** on the other.
    - ✅ Declines and change loops never block siblings — the approved item is
      not waiting on the reopened one.
11. **Corporate dashboard → Approvals tab** (§9 interface 6):
    - ✅ It shows what the reviewer sees.
    - ✅ It offers **no way to approve, decline, or request changes**. The
      dashboard link is a 30-day multi-use bookmark; approvals stay in the
      signed, single-use, 7-day links sent by email.
    - ✅ **Send the approval email again** works, and the new message replaces
      the previous link.

## 5 · The franchisee fixes it (§6 change loop)

12. Back on the status page, the flagged item is reopened for editing with
    corporate's note attached.
    - ✅ Edit and resubmit. The package version increments.
    - ✅ `/admin/outbox` holds a **re-review** email, and the previous approval link is
      now dead — open it and confirm it says so.
13. Approve the resubmitted item from the new email.
    - ✅ The request reaches `approved`.

## 6 · Routing, and both tails at once (§4, §6 as amended)

14. **Team → Route for quote.**
    - ✅ Freshbites routes to Signage.com by default, but the **pylon** carries
      an `approved_vendor` override — so this request splits into **two**
      packages with two recipients.
    - ✅ `/admin/outbox` holds one vendor email per recipient. Neither mentions the
      other, and neither carries a credential of any kind.
    - ✅ Corporate is CC'd per the brand's policy.
    - ✅ The franchisee's status page shows **one card per package**.
15. Price and deliver the Signage.com package (standin-priced items are priced
    by hand — the banner says so).
    - ✅ `/admin/outbox` holds a **quote ready** email carrying that package's numbers,
      not the request's.
16. **Franchisee → Accept** on the Signage.com card.
    - ✅ Only that package moves. The vendor's half is untouched.
    - ✅ The request status is the rollup — it sits at the stage of its **least
      advanced** package.
17. **Franchisee → download the budgetary quote** from the status page.
    - ✅ It covers the whole site, and names Signage.com as payee for our items
      and the vendor as payee for theirs. A lender document that blurs that is
      wrong about the one thing it exists to state.

## 7 · Money, on paper only (§8b)

18. **Team → Issue invoice** on the accepted Signage.com package.
    - ✅ An invoice number is assigned once and never regenerated.
    - ✅ The external package offers no invoice — that vendor bills the
      franchisee directly.
19. **Team → Record payment** (write what a bank statement would say).
    - ✅ The receipt downloads marked PAID, with date and method.
    - ✅ Nothing anywhere took a payment. There is no processor in this build.

## 8 · Production, install, and the record (§6, §5.6)

20. Drive the Signage.com package: **production → shipped → installed**.
    - ✅ Each step emails the franchisee.
    - ✅ The install notice does not claim the site is finished while the
      vendor's half is open.
21. **Verify the location record** — the whole point of the model:
    - ✅ The franchisee's home page shows the newly installed signs against the
      location, with specs and sizing pinned.
    - ✅ Only the Signage.com package's items landed. The vendor's are still
      outstanding.
22. Log the external vendor's milestones by hand, through to installed.
    - ✅ Now the location record is complete.
    - ✅ **Corporate dashboard** shows the location as **Package complete**, and
      program spend has moved.

## 9 · The fast lane (§7)

23. **Franchisee → a location with installed signs → Replace a sign.**
    - ✅ Brand spec and sizing come from the installed-sign record. No forms.
    - ✅ It skips corporate entirely and lands in **Ready to route**, badged
      `⚡ fast lane` on the queue.
    - ✅ On completion the replacement **updates** the existing installed-sign
      row rather than adding a second one.

## 10 · Credentials, checked deliberately

24. Take any tokenized URL and change one character.
    - ✅ You get the "that link did not open anything" page, with a **404**, not
      somebody else's data and not a stack trace.
25. On the corporate dashboard, wait for or force an expiry
    (`update corporate_links set expires_at = now() - interval '1 day'`).
    - ✅ The page explains that it expired and offers a new one.
    - ✅ The budget sheet stops downloading on that token too.
26. Sign out of `/admin` and reload it.
    - ✅ Straight to the sign-in screen. The allowlist is re-checked on every
      request, so deactivating a `team_members` row logs someone out.

---

## What this pass does not prove

Each of these is a known gap, not an oversight — `docs/STATE.md` keeps the
current list:

- **RLS is exercised, but not through Supabase's own plumbing.** The dev
  database connects as the table owner, so nothing you click above consults a
  policy. `npm run db:verify` does: 20 behavioural checks run as the `anon` and
  `authenticated` roles and ask whether one credential can reach what belongs to
  another. What they cannot exercise is GoTrue and PostgREST — no real JWT is
  minted and no real `x-access-token` header is forwarded, so the tests supply
  both directly. Re-run them through a real project when one exists.
- **No mail has ever been delivered.** Everything above goes to the outbox.
- **The Supabase Auth path has never run**, and neither has the seed against a
  real project.
- **No mockups come from Design Studio.** Every thumbnail is the generic render
  for its `render_key`, or a file the team uploaded by hand.

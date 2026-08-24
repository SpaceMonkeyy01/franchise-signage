-- Fulfillment moves to the package (SPEC §6, amended v2.2).
--
-- §4 has always been able to split one request across recipients, and Session 5
-- already moved the MONEY to the package: `accepted_at`, `invoice_number`,
-- `paid_at` and the payment record all live on `quotes`, because Signage.com
-- invoices only its own half. The lifecycle never followed, so a split request
-- had one status and two tails and could be neither accepted nor invoiced
-- (DECISIONS #51, #57).
--
-- Three timestamps finish the shape. No status enum: `delivered_at` and
-- `accepted_at` were already the idiom here, the stage is derived from them in
-- src/lib/status/machine.ts, and a derived stage cannot drift from the dates the
-- documents and the timeline are written from.

alter table quotes
  add column in_production_at timestamptz,
  add column shipped_at       timestamptz,
  add column completed_at     timestamptz;

-- The external tail has no in-portal production: the package is emailed out,
-- fabrication happens off-platform, and the team logs the quote, the order and
-- the install. Writing a production date on one would claim Signage.com was
-- making a sign it never touched. Same shape as
-- `quotes_only_internal_is_invoiced`, and here for the same reason — the kind of
-- mistake that survives a UI rewrite.
alter table quotes add constraint quotes_external_has_no_production check (
  external = false or (in_production_at is null and shipped_at is null)
);

-- The package's own tail, in order. Each check is one edge of SPEC §6's
-- package-level machine, so an out-of-order write is refused by the database
-- rather than producing a package that shipped before it was accepted.
alter table quotes add constraint quotes_accepted_after_delivered check (
  accepted_at is null or delivered_at is not null
);
alter table quotes add constraint quotes_production_after_accepted check (
  in_production_at is null or accepted_at is not null
);
alter table quotes add constraint quotes_shipped_after_production check (
  shipped_at is null or in_production_at is not null
);
alter table quotes add constraint quotes_completed_after_accepted check (
  completed_at is null or accepted_at is not null
);

-- ------------------------------------------------------------------ backfill
-- Requests that already ran the old request-level lifecycle. Without this their
-- packages would derive back to `quote_ready` and the seeded demo storyline
-- would appear to un-complete itself — an additive migration must not rewrite
-- history it did not cause.
--
-- `updated_at` is the closest honest timestamp available: the real transition
-- dates live in request_events, but a package that was never a first-class
-- object has no per-package trail to recover, and inventing distinct dates
-- would be worse than reusing the one the row actually carries.
update quotes q set
  accepted_at = coalesce(
    q.accepted_at,
    case when r.status in ('accepted', 'in_production', 'shipped', 'completed')
         then r.updated_at end
  ),
  in_production_at = case
    when q.external then null
    when r.status in ('in_production', 'shipped', 'completed') then r.updated_at
  end,
  shipped_at = case
    when q.external then null
    when r.status in ('shipped', 'completed') then r.updated_at
  end,
  completed_at = case when r.status = 'completed' then r.updated_at end
from requests r
where r.id = q.request_id;

-- delivered_at is implied by everything above it and may be missing on a row
-- whose quote was logged rather than delivered.
update quotes set delivered_at = accepted_at
 where delivered_at is null and accepted_at is not null;

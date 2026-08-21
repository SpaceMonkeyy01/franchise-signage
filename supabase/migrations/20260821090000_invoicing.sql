-- Invoicing and payment records for the §8b lender documents.
--
-- SPEC §11 keeps payment processing out of MVP, and this does not add any: no
-- charge is made, no card is stored, nothing talks to a processor. What it adds
-- is the RECORD of an invoice having been issued and a payment having been
-- received, because the two remaining §8b documents cannot be generated without
-- it — "marked PAID with date and method" is the spec's own description of the
-- receipt, and a date and a method have to live somewhere.
--
-- On `quotes` rather than `requests`, because a request split across two
-- recipients (SPEC §4) has two packages and Signage.com invoices only its own.
-- The external package's money never passes through Signage.com at all.

create sequence invoice_number_seq start 1;

alter table quotes
  -- Assigned once, when the team issues the invoice, and never regenerated. A
  -- lender files a document by its number; a number that changed between two
  -- downloads of "the same" invoice would be a different document each time.
  add column invoice_number text unique,
  add column invoiced_at    timestamptz,
  add column paid_at        timestamptz,
  -- Free text on purpose. "Check 4417", "ACH", "wire" — the team writes what
  -- the bank statement says, and an enum here would only be wrong for the
  -- payment method nobody thought of.
  add column payment_method text,
  add column payment_reference text;

-- An invoice is issued or it is not: a number without a date, or a date without
-- a number, is a half-issued document that one of the two documents would then
-- render with a gap in it.
alter table quotes add constraint quotes_invoice_issued_together check (
  (invoice_number is null) = (invoiced_at is null)
);

-- Nothing is paid before it is billed, and a payment with no date is not a
-- payment. `payment_reference` stays optional — cash has no reference.
alter table quotes add constraint quotes_paid_needs_invoice check (
  paid_at is null or invoice_number is not null
);
alter table quotes add constraint quotes_payment_recorded_together check (
  (paid_at is null) = (payment_method is null)
);

-- Signage.com invoices its own work. An external package is quoted, ordered and
-- invoiced by the brand's vendor directly (DECISIONS #46), so an invoice number
-- on one would name the wrong payee on a lender's desk.
alter table quotes add constraint quotes_only_internal_is_invoiced check (
  invoice_number is null or external = false
);

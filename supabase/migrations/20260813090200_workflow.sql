-- Core workflow objects (SPEC §5) plus the §8b financing and landlord fields.
--
-- Shape of the model: locations are PERMANENT entities carrying a record of
-- installed signs; requests are events against a location. The first request is
-- a form, every later one is a lookup. `completed` is the only transition that
-- writes installed_signs.

-- Human-facing ids, matching docs/flow-demo.jsx ("LOC-0007", "REQ-0018"). The
-- uuid stays the key; these exist so franchisees and the team can say a request
-- number out loud.
create sequence location_code_seq start 1;
create sequence request_code_seq start 1;

-- -------------------------------------------------------------- §5.1 locations
create table locations (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references brands (id) on delete cascade,
  code         text not null unique default 'LOC-' || lpad(nextval('location_code_seq')::text, 4, '0'),
  name         text not null,
  -- {line1, line2, city, state, zip}. Requests FK to locations; addresses are
  -- never embedded in a request.
  address      jsonb not null default '{}'::jsonb,
  format       location_format not null,
  opening_date date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index locations_brand_idx on locations (brand_id);

-- --------------------------------------------------------------- §5.3 requests
create table requests (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references brands (id) on delete cascade,
  location_id        uuid not null references locations (id) on delete cascade,
  code               text not null unique default 'REQ-' || lpad(nextval('request_code_seq')::text, 4, '0'),
  intent             request_intent not null,
  -- Scopes the franchisee's secure link to THIS request (SPEC §10). No accounts,
  -- no passwords: possession of the token is the authorization.
  access_token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  status             request_status not null default 'draft',
  requester_name     text,
  requester_email    text,
  requester_phone    text,
  -- §8b: franchisee indicates a lender is funding this signage. Flags the team
  -- that formal quote / invoice / receipt documents will be needed. Nullable
  -- because "not asked yet" and "answered no" are different states.
  financing_involved boolean,
  -- §8b: {name, email, phone} of the property manager, for landlord-approval
  -- routing. Tracked, never automated.
  landlord_contact   jsonb,
  -- Increments on every franchisee resubmission after a change request (§6).
  package_version    integer not null default 1 check (package_version > 0),
  submitted_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index requests_location_idx on requests (location_id);
create index requests_brand_status_idx on requests (brand_id, status);
create index requests_token_idx on requests (access_token);

-- ------------------------------------------------------------- §5.4 line_items
-- Approval is line-item level. Declines and change loops never block siblings.
create table line_items (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references requests (id) on delete cascade,
  brand_item_id      uuid not null references brand_items (id) on delete restrict,
  origin             line_item_origin not null,
  item_status        line_item_status not null,
  -- The site-variable values as captured, e.g. "22' frontage · 30\" letters".
  sizing             text,
  site_notes         text,
  -- Field names the franchisee marked TBD. TBD is ALWAYS allowed and never
  -- blocks submission — it flags team follow-up (SPEC §5.4).
  tbd_fields         text[] not null default '{}',
  -- Why a standard sign won't work at this site. Set ⟺ origin = 'exception'.
  exception_issue    text,
  replaces_sign_id   uuid,        -- → installed_signs, FK added below
  replace_reason     replace_reason,
  mockup_file_id     uuid,        -- → request_files, FK added below
  -- Snapshot of brand_items.est_price at submission. The catalog price can move;
  -- the number a franchisee saw, a reviewer approved, and a lender document
  -- quotes (§8b) must not. Null mirrors a standin item's "Custom quote".
  est_price_snapshot numeric(12, 2) check (est_price_snapshot is null or est_price_snapshot >= 0),
  -- Reviewer's optional condition, e.g. "approved — matte finish".
  review_note        text,
  reviewed_at        timestamptz,
  reviewed_via_token text,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint line_items_exception_has_issue check (
    (origin = 'exception') = (exception_issue is not null)
  ),
  -- A replacement points at the installed sign it replaces and says why;
  -- nothing else may.
  constraint line_items_replacement_fields check (
    case when origin = 'replacement'
      then replaces_sign_id is not null and replace_reason is not null
      else replaces_sign_id is null and replace_reason is null
    end
  )
);

create index line_items_request_idx on line_items (request_id, sort_order);
create index line_items_status_idx on line_items (item_status);

-- ---------------------------------------------------------- §5.5 request_files
create table request_files (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references requests (id) on delete cascade,
  -- Set when the file belongs to one item (placement photo, mockup, condition
  -- photo); null for request-level files (landlord criteria, site plan).
  line_item_id uuid references line_items (id) on delete cascade,
  kind         request_file_kind not null,
  -- Path within the Supabase Storage bucket. Never a hot-link to an external
  -- engine: Design Studio output is copied into our storage
  -- (docs/design-studio-findings.md §7).
  storage_path text not null,
  file_name    text,
  content_type text,
  size_bytes   bigint,
  uploaded_by  event_actor not null default 'franchisee',
  created_at   timestamptz not null default now()
);

create index request_files_request_idx on request_files (request_id, kind);
create index request_files_line_item_idx on request_files (line_item_id);

-- -------------------------------------------------------- §5.2 installed_signs
-- The permanent record. This is what makes every future request a lookup
-- instead of a project, and it is written by exactly one transition: completed.
create table installed_signs (
  id                  uuid primary key default gen_random_uuid(),
  location_id         uuid not null references locations (id) on delete cascade,
  brand_item_id       uuid not null references brand_items (id) on delete restrict,
  sizing              text,
  -- The location's actual mockup, cascaded from the fulfilling line item.
  -- Fallback is the generic render for the brand item's render_key.
  mockup_file_id      uuid,   -- → request_files, FK added below
  source_line_item_id uuid,   -- → line_items, FK added below (provenance)
  installed_at        date not null default current_date,
  status              installed_sign_status not null default 'active',
  -- Set when a replacement supersedes this row rather than updating it.
  replaced_by         uuid references installed_signs (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index installed_signs_location_idx on installed_signs (location_id) where status = 'active';

-- Cross-references, added after both sides exist.
alter table line_items
  -- restrict, NOT set null: a replacement item must always name the sign it
  -- replaces (line_items_replacement_fields below enforces that), so deleting
  -- the target would fire an update that violates the item's own invariant.
  -- An installed sign a request points at is history and stays put; retiring
  -- one is a status change to 'removed', never a delete.
  add constraint line_items_replaces_sign_fk
    foreign key (replaces_sign_id) references installed_signs (id) on delete restrict,
  add constraint line_items_mockup_file_fk
    foreign key (mockup_file_id) references request_files (id) on delete set null;

alter table installed_signs
  add constraint installed_signs_mockup_file_fk
    foreign key (mockup_file_id) references request_files (id) on delete set null,
  add constraint installed_signs_source_line_item_fk
    foreign key (source_line_item_id) references line_items (id) on delete set null;

-- --------------------------------------------------------- §5.5 request_events
-- Append-only. Every status transition writes one; these power all timelines.
create table request_events (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references requests (id) on delete cascade,
  line_item_id uuid references line_items (id) on delete cascade,
  -- Deliberately TEXT and deliberately unconstrained. SPEC §8b's phase-2 permit
  -- stages (drawings_prepared, landlord_approved, permit_submitted,
  -- permit_issued) must be loggable without a schema change, and the §8b
  -- landlord_approval events are already logged manually today. The known kinds
  -- are enumerated and validated in src/lib/status/events.ts, not here.
  kind         text not null,
  actor        event_actor not null,
  -- The human line a timeline renders, phrased as docs/flow-demo.jsx phrases it.
  summary      text not null,
  detail       jsonb not null default '{}'::jsonb,
  from_status  request_status,
  to_status    request_status,
  created_at   timestamptz not null default now()
);

create index request_events_request_idx on request_events (request_id, created_at);

-- Append-only is enforced in the database, not by convention: the event log is
-- the audit trail behind every approval and every lender document.
create or replace function app.reject_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'request_events is append-only (attempted %)', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger request_events_append_only
  before update or delete on request_events
  for each row execute function app.reject_event_mutation();

-- -------------------------------------------------------- §5.5 change_requests
-- The revision loop: a reviewer comment plus the line items it flags. ONLY
-- flagged items reopen for the franchisee; everything else keeps its status.
create table change_requests (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references requests (id) on delete cascade,
  line_item_ids   uuid[] not null default '{}',
  -- Required by SPEC §7: request-changes without a note is not a valid action.
  comment         text not null check (length(btrim(comment)) > 0),
  raised_by       event_actor not null default 'reviewer',
  -- Which package version this was raised against.
  package_version integer not null default 1,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),

  constraint change_requests_has_items check (array_length(line_item_ids, 1) > 0)
);

create index change_requests_request_idx on change_requests (request_id) where resolved_at is null;

-- ----------------------------------------------------------------- §5.6 quotes
-- One row per recipient package. A single request MAY split into several quotes
-- when per-item vendor overrides disagree with the brand policy (SPEC §4).
create table quotes (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references requests (id) on delete cascade,
  -- The resolved policy that produced this recipient.
  recipient_kind vendor_policy not null,
  recipient_email text not null,
  cc_email       text,
  -- Which approved items are in this package.
  line_item_ids  uuid[] not null default '{}',
  priced_total   numeric(12, 2) check (priced_total is null or priced_total >= 0),
  priced_count   integer not null default 0 check (priced_count >= 0),
  -- Standin-priced items awaiting manual team pricing.
  manual_count   integer not null default 0 check (manual_count >= 0),
  -- Selects the lifecycle tail: false → Signage.com fulfills end to end;
  -- true → the package is emailed out and milestones are logged by hand.
  external       boolean not null default false,
  tat            text,
  sent_at        timestamptz,
  delivered_at   timestamptz,
  accepted_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index quotes_request_idx on quotes (request_id);

create trigger locations_touch before update on locations
  for each row execute function app.touch_updated_at();
create trigger requests_touch before update on requests
  for each row execute function app.touch_updated_at();
create trigger line_items_touch before update on line_items
  for each row execute function app.touch_updated_at();
create trigger installed_signs_touch before update on installed_signs
  for each row execute function app.touch_updated_at();
create trigger quotes_touch before update on quotes
  for each row execute function app.touch_updated_at();

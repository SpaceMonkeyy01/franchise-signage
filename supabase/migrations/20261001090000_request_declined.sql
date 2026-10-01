-- Two status-machine corrections (DECISIONS #162).
--
-- 1. A request whose every item corporate declined has somewhere to go: a
--    terminal `declined`. Before, it derived to nothing and sat in
--    `needs_review` forever, counted as open on every dashboard (DECISIONS
--    #1 left it to be closed by hand; nothing could close it).
--
-- 2. A resubmission lands on `needs_review`, which is what it is: the
--    re-review email has already gone to corporate. It used to go back to
--    `submitted`, the state that means "Signage.com has not prepared this yet".
--    Requests already sitting there are moved, each with the event every
--    status change writes.
--
-- Additive: one enum value, and a data correction that only moves rows to a
-- status they could legally have reached.

alter type request_status add value if not exists 'declined';

with moved as (
  update requests r
     set status = 'needs_review'
   where r.status = 'submitted'
     and r.package_version > 1
     and exists (
       select 1 from line_items li
        where li.request_id = r.id and li.item_status = 'pending_review'
     )
  returning r.id, r.package_version
)
insert into request_events (request_id, kind, actor, summary, detail, from_status, to_status)
select id,
       'status_changed',
       'system',
       'Back with corporate for re-review · package v' || package_version,
       jsonb_build_object('reason', 'resubmission_returns_to_review'),
       'submitted',
       'needs_review'
  from moved;

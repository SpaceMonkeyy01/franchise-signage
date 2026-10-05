-- Team confirmation of quotes, per brand (SPEC v2.6 §8 point 5, DECISIONS #172).
--
-- In the MVP the team confirms each Signage.com quote before the franchisee
-- sees it ("Deliver quote to franchisee"). The owner expects to drop that step
-- once the engine's prices have a track record, brand by brand, so it is a
-- setting rather than a rule in the status machine. Off: a Signage.com package
-- whose every item is priced is delivered the moment it is routed. A package
-- with a custom-quote item still waits for the team, who price it by hand.
--
-- Default on: nothing changes for any brand until the team turns it off.

alter table brands add column team_confirms_quotes boolean not null default true;

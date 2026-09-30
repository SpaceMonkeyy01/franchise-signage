-- Sign pictures (DECISIONS #157).
--
-- A brand sign already had `thumbnail_url` (SPEC §2.2: "falls back to generic
-- render by render_key") and nothing ever wrote it. Now a brand admin or the
-- team uploads one, and it holds the storage path. The master catalog gains
-- the same for a sign type — an icon the team uploads, shown for every brand
-- sign built on it that has no picture of its own. Order everywhere: the
-- sign's picture, then its type's icon, then the drawn schematic.

alter table master_catalog add column icon_path text;

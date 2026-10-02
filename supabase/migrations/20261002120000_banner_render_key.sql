-- Vinyl banners had no mockup style, so the Design Studio could not draw one
-- (DECISIONS #171). Signize's mockup engine has no banner style; the old
-- Studio drew banners as a full vinyl wrap (reference/design-studio
-- renderKeyMap: out_banner → vinyl-graphics-wall-wraps-full), the nearest it
-- has. Only fills a key that is empty, so a team edit on /admin/catalog wins.

update master_catalog
   set render_key = 'vinyl-graphics-wall-wraps-full'
 where sign_type = 'Banners & Flags'
   and variant = 'Vinyl Banners'
   and render_key is null;

-- The sign quote sheet (DECISIONS #168): a one-page PDF per Studio-designed
-- line — mockup, side view, size, options, turnaround and Signage.com's
-- estimated price — generated at submission and kept with the request, so the
-- franchisee, corporate and the team read the same record of what was chosen.
--
-- Additive: one enum value. It is per line (request_files.line_item_id), not
-- per request; `package_pdf` remains the whole-package document.

alter type request_file_kind add value if not exists 'quote_sheet';

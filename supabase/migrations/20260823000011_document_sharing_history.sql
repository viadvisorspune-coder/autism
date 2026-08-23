-- Who a document has actually been shared with.
--
-- The frontend has always read `sharing_history` off each document and shown
-- it on the patient's document page, under "who has seen this". The column did
-- not exist. So every document on the live record answered that question with
-- "not shared with anyone" — on the one screen in the product whose entire job
-- is telling somebody where their information has gone.
--
-- A privacy screen that under-reports is worse than one that does not exist,
-- because it is believed. This adds the column and fills it from what the
-- disclosure log already knows.
--
-- Kept alongside `disclosures` rather than replacing it, deliberately: the
-- disclosure log is the account of every release, ordered by time and readable
-- as a history. This is the same facts indexed by document, which is how a
-- person asks the question — they open the report and want to know who has it.

alter table documents
  add column if not exists sharing_history jsonb not null default '[]'::jsonb;

comment on column documents.sharing_history is
  'Releases of THIS document, as [{date, recipient, purpose}]. The authoritative '
  'log is the disclosures table; this is the per-document index of it.';

update documents set sharing_history = '[
  {"date":"2026-08-18","recipient":"Anil Fernandes — Northline Technologies (HR)","purpose":"Workplace accommodation request"}
]'::jsonb where id = 'doc-16';

update documents set sharing_history = '[
  {"date":"2026-05-06","recipient":"Dr Vikram Rao — Kothrud Family Practice","purpose":"Care coordination"}
]'::jsonb where id = 'doc-13';

update documents set sharing_history = '[
  {"date":"2026-06-02","recipient":"Pune Institute of Design — Accessibility","purpose":"Reasonable adjustment plan"}
]'::jsonb where id = 'doc-12';

update documents set sharing_history = '[
  {"date":"2026-08-06","recipient":"Pune Institute of Design — Accessibility","purpose":"Study support plan"}
]'::jsonb where id = 'doc-17';

-- Everything else has been read inside ORCA and released to nobody. That is
-- the common case and it should stay visibly empty rather than be filled in
-- for symmetry.

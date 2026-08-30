-- A role for the system itself.
--
-- The seed needs somewhere to put what ORCA noticed rather than what a person
-- reported — a pattern observed across entries, offered as a pattern and not a
-- finding. Every such item carries source_type 'ai_derived' and is_ai_derived
-- true, but reporter_role had no honest value: calling it 'admin' would put a
-- person's name on a machine's inference, which is the exact confusion the
-- provenance columns exist to prevent.
--
-- Alone in its own migration on purpose. Postgres will not let a value added
-- to an enum be used in the same transaction that added it, and Supabase runs
-- each migration file as one transaction — so any file that both adds this and
-- inserts a row using it fails.

alter type stakeholder_role add value if not exists 'system';

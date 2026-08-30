-- A seventh purpose: a person asking for their own data under a legal right.
--
-- The access matrix lists `rights_request` alongside care, support_planning,
-- accommodation, coordination, statutory and personal_understanding. It is a
-- distinct purpose rather than a flavour of personal_understanding: a subject
-- exercising a right of access is not the same act as a subject trying to
-- understand themselves, and a system that cannot tell them apart cannot
-- record that a rights request was ever made.
--
-- Alone in its own file, because Postgres will not let a value added to an
-- enum be used in the transaction that added it.

alter type purpose_type add value if not exists 'rights_request';

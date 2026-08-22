-- Conversations that survive signing out, and knowing what changed while away.
--
-- An assistant that greets you identically every time has not been listening,
-- it has been performing listening. Everything a person said to ORCA and
-- everything it said back belongs in the record like anything else — visible in
-- the audit trail, subject to the same scope, and there when they come back.

-- One thread per person, per record. A clinician talking about Ananya and
-- Ananya talking about herself are different conversations even though they
-- concern the same record.
create table conversations (
  id              text primary key default gen_random_uuid()::text,
  patient_id      text not null references patients (id) on delete cascade,
  actor_id        text not null references app_users (id) on delete cascade,
  started_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (patient_id, actor_id)
);

create index on conversations (actor_id, last_message_at desc);

create table conversation_messages (
  id              text primary key default gen_random_uuid()::text,
  conversation_id text not null references conversations (id) on delete cascade,
  -- 'person' is whoever owns the thread; 'orca' is the system speaking.
  author          text not null check (author in ('person', 'orca')),
  author_id       text references app_users (id) on delete set null,
  text            text not null,
  -- Set when this line came from a workflow rather than from typing, so the
  -- conversation can be traced back to the run that produced it.
  workflow_run_id text references workflow_runs (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index on conversation_messages (conversation_id, created_at);

comment on table conversation_messages is
  'Append-only. ORCA does not revise what it said earlier, because a record of '
  'advice that quietly changes is worse than no record of it.';

-- ------------------------------------------------------------- what is new

-- When each person last looked, so ORCA can answer "what happened while I was
-- away" rather than making everyone re-read a page they have already read.
create table user_visits (
  user_id      text not null references app_users (id) on delete cascade,
  patient_id   text not null references patients (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, patient_id)
);

-- ------------------------------------------------------------------- access

alter table conversations         enable row level security;
alter table conversation_messages enable row level security;
alter table user_visits           enable row level security;

-- A conversation belongs to the person having it. Not to their clinician, not
-- to an administrator: what someone typed while working out what they needed
-- is theirs, and reading it is not a lesser act because it is text.
create policy conversations_own on conversations for select using (
  actor_id = orca_user_id()
);

create policy conversation_messages_own on conversation_messages for select using (
  exists (
    select 1 from conversations c
    where c.id = conversation_messages.conversation_id and c.actor_id = orca_user_id()
  )
);

create policy user_visits_own on user_visits for all using (
  user_id = orca_user_id()
) with check (
  user_id = orca_user_id()
);

-- Seed Ananya's thread so the first sign-in has something to come back to,
-- rather than an assistant with no memory of a four-month relationship.
insert into conversations (id, patient_id, actor_id, started_at, last_message_at)
values ('cv-ananya', 'pt-ananya', 'u-ananya', '2026-08-18T18:20:00Z', '2026-08-18T18:41:00Z')
on conflict (patient_id, actor_id) do nothing;

insert into conversation_messages (conversation_id, author, author_id, text, created_at) values
  ('cv-ananya', 'person', 'u-ananya',
   'They moved the sprint review again this morning, twenty minutes before it started. I lost the whole afternoon.',
   '2026-08-18T18:20:00Z'),
  ('cv-ananya', 'orca', null,
   'That is the third time this month. Two of those were announced inside the same hour, and both of those days cost you time — the one in July that came the evening before did not. I think the difference is how much warning you get, not that the meeting moved.',
   '2026-08-18T18:22:00Z'),
  ('cv-ananya', 'person', 'u-ananya',
   'So is the advance notice thing not working?',
   '2026-08-18T18:26:00Z'),
  ('cv-ananya', 'orca', null,
   'It works when it happens. It has not been tested against same-hour changes, and that is what is going wrong now. I would rather say that than tell you it has failed, because the two need different fixes.',
   '2026-08-18T18:28:00Z'),
  ('cv-ananya', 'person', 'u-ananya',
   'Can you ask my employer for something?',
   '2026-08-18T18:34:00Z'),
  ('cv-ananya', 'orca', null,
   'I have drafted a request for written notice by end of the previous working day, plus twenty minutes of protected time after an unplanned meeting. Your diagnostic report and your session notes are not in it. Nothing goes to Anil until you have read it and said yes.',
   '2026-08-18T18:41:00Z')
on conflict do nothing;

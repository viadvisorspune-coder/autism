-- A notification that knows which review it is about.
--
-- `notify()` took a review id and threw it away — literally `void reviewId`,
-- with a comment explaining that a notification is for people to read and the
-- id belongs in the audit trail. That reasoning was fine right up until the
-- review got decided, because nothing could then find the notification that
-- had asked for the decision. So it stayed in the inbox:
--
--   22 Aug 09:22  APPROVAL REQUIRED   Meera Joshi has asked for a decision
--   22 Aug 09:23  Professional response  Dr Kavita Nair decided: Approved with changes
--
-- Forty-six seconds apart, both live, the first one still asking for something
-- the second one had already answered. Marking the receipt correctly was only
-- half the job; the question has to be retired when it is answered.
--
-- The column is what makes that possible, and it is nullable because plenty of
-- notifications are about no review at all.

alter table notifications
  add column if not exists review_id text references review_items (id) on delete cascade;

comment on column notifications.review_id is
  'The review this notification is about, so an unanswered ask can be retired '
  'once somebody answers it. Null for notifications that are not about a review.';

create index if not exists notifications_review_id_idx on notifications (review_id);

-- The rows already written cannot be linked back: the id was discarded at the
-- point of writing and nothing else on the row identifies the review. So the
-- two that are actually stale are removed by the thing that does identify
-- them — their exact text and timestamp. Narrow on purpose. Every other open
-- ask in this inbox is genuinely open and stays.
delete from notifications
where category = 'Approval required'
  and what = 'Meera Joshi has asked for a decision'
  and created_at = '2026-08-22T09:22:58.248826+00:00';

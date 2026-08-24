-- Notifications that announce a decision, no longer labelled as asking for one.
--
-- `notify()` stamped every row "Approval required" and told the reader to
-- approve, edit or decline it. That is right for the row raised when a review
-- opens. It is wrong for the row written when the review closes, so the inbox
-- filled up with entries reading
--
--   APPROVAL REQUIRED · Ananya Rao decided: Approved
--   Open it, read what is proposed, and approve, edit or decline.
--
-- asking her to go and decide a thing she had just decided. The code no longer
-- writes those. This repairs the ones already written, because an inbox is
-- judged on what is in it, not on what it will do next time.
--
-- Matched on `what`, which `notify()` composes as "<name> decided: <decision>"
-- at the close of a review and nowhere else. Narrow on purpose: a row that is
-- genuinely waiting for somebody must not be quietly marked settled.

update notifications
set
  category = 'Professional response',
  todo = 'Nothing to do. Open it if you want to see what was decided and why.'
where
  category = 'Approval required'
  and what like '%decided:%';

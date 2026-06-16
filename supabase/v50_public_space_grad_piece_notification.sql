-- v50_public_space_grad_piece_notification
-- One-time Public Space notification seed for the newly published grad piece.
-- Safe to rerun: it will not duplicate per user because of the NOT EXISTS guard.

begin;

insert into public.public_space_notifications (
  recipient_user_id,
  actor_user_id,
  type,
  details
)
select
  u.id,
  null,
  'admin',
  jsonb_build_object(
    'kind', 'new_piece',
    'piece_slug', 'grad',
    'piece_title', 'When it ends, New Begins',
    'url', 'poem.html?piece=grad',
    'title', 'New piece uploaded',
    'message', 'New piece uploaded: When it ends, New Begins. Check it out.'
  )
from public.public_space_users u
where coalesce(u.is_disabled, false) is false
  and not exists (
    select 1
    from public.public_space_notifications existing
    where existing.recipient_user_id = u.id
      and existing.type = 'admin'
      and existing.details->>'kind' = 'new_piece'
      and existing.details->>'piece_slug' = 'grad'
  );

notify pgrst, 'reload schema';

select
  'v50_public_space_grad_piece_notification_applied' as status,
  count(*) filter (
    where type = 'admin'
      and details->>'kind' = 'new_piece'
      and details->>'piece_slug' = 'grad'
  ) as grad_notifications_total,
  count(*) filter (
    where type = 'admin'
      and details->>'kind' = 'new_piece'
      and details->>'piece_slug' = 'grad'
      and is_read is false
  ) as grad_unread_notifications
from public.public_space_notifications;

commit;

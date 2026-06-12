-- V31 Public Space clear notifications
-- Clears notification records only for the current logged-in user.
-- It does not delete posts, comments, hearts/reactions, or admin actions.

begin;

create or replace function public.clear_public_space_notifications(input_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  deleted_count integer := 0;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  delete from public.public_space_notifications
  where recipient_user_id = active_user.id;

  get diagnostics deleted_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'deleted_count', deleted_count
  );
end;
$$;

grant execute on function public.clear_public_space_notifications(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select
  'v31_clear_public_space_notifications_applied' as status,
  count(*) as remaining_notifications
from public.public_space_notifications;

-- V49 Public Space notifications type check update
-- Allows comment_reaction notifications inserted by v48.

begin;

alter table public.public_space_notifications
drop constraint if exists public_space_notifications_type_check;

alter table public.public_space_notifications
add constraint public_space_notifications_type_check
check (type in ('heart', 'comment', 'admin', 'comment_reaction'));

notify pgrst, 'reload schema';

commit;

select
  'v49_public_space_notifications_allow_comment_reaction_type_applied' as status,
  pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.public_space_notifications'::regclass
  and conname = 'public_space_notifications_type_check';

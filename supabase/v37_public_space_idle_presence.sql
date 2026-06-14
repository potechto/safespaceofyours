-- V37 Public Space idle presence
-- Updates active presence threshold from 2 minutes to 3 minutes.

begin;

create or replace function public.public_space_is_active(input_last_seen_at timestamptz)
returns boolean
language sql
stable
as $$
  select input_last_seen_at is not null
    and input_last_seen_at >= now() - interval '3 minutes';
$$;

grant execute on function public.public_space_is_active(timestamptz) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select 'v37_public_space_idle_presence_applied' as status;

begin;

-- Q73A Public real piece analytics stats
-- Exposes safe public counts only. No visitor keys, unlock codes, or private event rows are exposed.

create or replace function public.list_public_piece_analytics_stats()
returns table (
  piece_slug text,
  read_count bigint,
  unlock_count bigint,
  unlock_rate numeric,
  last_read_at timestamptz,
  last_unlock_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    ps.slug::text as piece_slug,
    count(e.id) filter (where e.event_type = 'view')::bigint as read_count,
    count(e.id) filter (where e.event_type = 'unlock')::bigint as unlock_count,
    case
      when count(e.id) filter (where e.event_type = 'view') = 0 then 0::numeric
      else round(
        (
          count(e.id) filter (where e.event_type = 'unlock')
        )::numeric
        /
        nullif(count(e.id) filter (where e.event_type = 'view'), 0)::numeric
        * 100,
        2
      )
    end as unlock_rate,
    max(e.created_at) filter (where e.event_type = 'view') as last_read_at,
    max(e.created_at) filter (where e.event_type = 'unlock') as last_unlock_at
  from public.piece_settings ps
  left join public.piece_analytics_events e
    on e.piece_slug = ps.slug
   and e.event_type in ('view', 'unlock')
  where coalesce(ps.is_enabled, true) is true
  group by ps.slug
  order by read_count desc, unlock_count desc, ps.slug asc;
end;
$$;

create or replace function public.get_public_piece_analytics_stats(input_piece_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_slug text := lower(trim(coalesce(input_piece_slug, '')));
  stats record;
begin
  if clean_slug = '' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Missing piece slug.'
    );
  end if;

  if not exists (
    select 1
    from public.piece_settings ps
    where ps.slug = clean_slug
      and coalesce(ps.is_enabled, true) is true
  ) then
    return jsonb_build_object(
      'ok', false,
      'message', 'Selected piece is not available.'
    );
  end if;

  select
    clean_slug as piece_slug,
    count(e.id) filter (where e.event_type = 'view')::bigint as read_count,
    count(e.id) filter (where e.event_type = 'unlock')::bigint as unlock_count,
    case
      when count(e.id) filter (where e.event_type = 'view') = 0 then 0::numeric
      else round(
        (
          count(e.id) filter (where e.event_type = 'unlock')
        )::numeric
        /
        nullif(count(e.id) filter (where e.event_type = 'view'), 0)::numeric
        * 100,
        2
      )
    end as unlock_rate,
    max(e.created_at) filter (where e.event_type = 'view') as last_read_at,
    max(e.created_at) filter (where e.event_type = 'unlock') as last_unlock_at
  into stats
  from public.piece_analytics_events e
  where e.piece_slug = clean_slug
    and e.event_type in ('view', 'unlock');

  return jsonb_build_object(
    'ok', true,
    'piece_slug', clean_slug,
    'read_count', coalesce(stats.read_count, 0),
    'unlock_count', coalesce(stats.unlock_count, 0),
    'unlock_rate', coalesce(stats.unlock_rate, 0),
    'last_read_at', stats.last_read_at,
    'last_unlock_at', stats.last_unlock_at
  );
end;
$$;

grant execute on function public.list_public_piece_analytics_stats() to anon, authenticated;
grant execute on function public.get_public_piece_analytics_stats(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select
  'v38_public_piece_analytics_stats_ready' as status,
  count(*) as enabled_piece_count
from public.piece_settings
where coalesce(is_enabled, true) is true;

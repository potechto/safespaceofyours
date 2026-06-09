-- @safespaceofyours V2.0D private analytics foundation
-- Purpose:
-- 1. Track one view per browser/device per piece.
-- 2. Track one unlock/purchase per browser/device per piece.
-- 3. Give Private Space a safe admin-only analytics summary.
-- Notes:
-- - This starts tracking only after the matching JS patch is deployed.
-- - visitor_key is browser/device based, not a real person/account identity.
-- - unlock_count is treated as "purchase/unlock" count for analytics.

create extension if not exists pgcrypto;

create table if not exists public.piece_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('view', 'unlock')),
  piece_slug text not null,
  visitor_key text not null,
  unlock_code_id text,
  unlock_code_snapshot text,
  source text not null default 'public_site',
  created_at timestamptz not null default now(),
  constraint piece_analytics_events_once_per_device
    unique (event_type, piece_slug, visitor_key)
);

create index if not exists piece_analytics_events_piece_slug_idx
on public.piece_analytics_events (piece_slug);

create index if not exists piece_analytics_events_event_type_idx
on public.piece_analytics_events (event_type);

create index if not exists piece_analytics_events_created_at_idx
on public.piece_analytics_events (created_at desc);

alter table public.piece_analytics_events enable row level security;

drop policy if exists "Admins can read piece analytics" on public.piece_analytics_events;
drop policy if exists "Admins can manage piece analytics" on public.piece_analytics_events;

create policy "Admins can read piece analytics"
on public.piece_analytics_events
for select
to authenticated
using (public.is_admin());

create policy "Admins can manage piece analytics"
on public.piece_analytics_events
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.record_piece_analytics_event(
  p_event_type text,
  p_piece_slug text,
  p_visitor_key text,
  p_unlock_code_id text default null,
  p_unlock_code_snapshot text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_event_type text := lower(trim(coalesce(p_event_type, '')));
  clean_piece_slug text := lower(trim(coalesce(p_piece_slug, '')));
  clean_visitor_key text := trim(coalesce(p_visitor_key, ''));
  inserted_id uuid;
begin
  if clean_event_type not in ('view', 'unlock') then
    return jsonb_build_object(
      'success', false,
      'recorded', false,
      'message', 'Invalid analytics event.'
    );
  end if;

  if clean_piece_slug = '' then
    return jsonb_build_object(
      'success', false,
      'recorded', false,
      'message', 'Missing piece slug.'
    );
  end if;

  if clean_visitor_key = '' then
    return jsonb_build_object(
      'success', false,
      'recorded', false,
      'message', 'Missing visitor key.'
    );
  end if;

  insert into public.piece_analytics_events (
    event_type,
    piece_slug,
    visitor_key,
    unlock_code_id,
    unlock_code_snapshot
  )
  values (
    clean_event_type,
    clean_piece_slug,
    clean_visitor_key,
    nullif(trim(coalesce(p_unlock_code_id, '')), ''),
    nullif(trim(coalesce(p_unlock_code_snapshot, '')), '')
  )
  on conflict (event_type, piece_slug, visitor_key) do nothing
  returning id into inserted_id;

  return jsonb_build_object(
    'success', true,
    'recorded', inserted_id is not null,
    'message', case
      when inserted_id is not null then 'Analytics recorded.'
      else 'Analytics already recorded for this browser/device.'
    end
  );
end;
$$;

grant execute on function public.record_piece_analytics_event(text, text, text, text, text)
to anon, authenticated;

create or replace function public.get_private_piece_analytics()
returns table (
  piece_slug text,
  view_count bigint,
  unlock_count bigint,
  unlock_rate numeric,
  last_view_at timestamptz,
  last_unlock_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() is not true then
    raise exception 'Not allowed';
  end if;

  return query
  select
    e.piece_slug,
    count(*) filter (where e.event_type = 'view') as view_count,
    count(*) filter (where e.event_type = 'unlock') as unlock_count,
    case
      when count(*) filter (where e.event_type = 'view') = 0 then 0
      else round(
        (
          count(*) filter (where e.event_type = 'unlock')
        )::numeric
        /
        nullif(count(*) filter (where e.event_type = 'view'), 0)::numeric
        * 100,
        2
      )
    end as unlock_rate,
    max(e.created_at) filter (where e.event_type = 'view') as last_view_at,
    max(e.created_at) filter (where e.event_type = 'unlock') as last_unlock_at
  from public.piece_analytics_events e
  group by e.piece_slug
  order by unlock_count desc, view_count desc, e.piece_slug asc;
end;
$$;

grant execute on function public.get_private_piece_analytics()
to authenticated;

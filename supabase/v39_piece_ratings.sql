-- @safespaceofyours V39 public piece star ratings
-- Purpose:
-- 1. Store one half-star rating per browser/device visitor key per piece.
-- 2. Show public rating stats for free pieces only.
-- 3. Allow paid piece rating only when a valid unlock code is provided.
-- 4. Keep old ratings when a piece changes from free to paid; hide them publicly until unlocked.

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.piece_ratings (
  id uuid primary key default gen_random_uuid(),
  piece_slug text not null references public.piece_settings(slug) on delete cascade,
  visitor_key text not null,
  rating_value numeric(2, 1) not null check (
    rating_value in (0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)
  ),
  source text not null default 'public_site',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint piece_ratings_once_per_visitor unique (piece_slug, visitor_key)
);

create index if not exists piece_ratings_piece_slug_idx
on public.piece_ratings (piece_slug);

create index if not exists piece_ratings_rating_value_idx
on public.piece_ratings (rating_value);

create index if not exists piece_ratings_updated_at_idx
on public.piece_ratings (updated_at desc);

drop trigger if exists set_piece_ratings_updated_at on public.piece_ratings;
create trigger set_piece_ratings_updated_at
before update on public.piece_ratings
for each row
execute function public.set_updated_at();

alter table public.piece_ratings enable row level security;

drop policy if exists "Admins can read piece ratings" on public.piece_ratings;
drop policy if exists "Admins can manage piece ratings" on public.piece_ratings;

create policy "Admins can read piece ratings"
on public.piece_ratings
for select
to authenticated
using (public.is_admin());

create policy "Admins can manage piece ratings"
on public.piece_ratings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on table public.piece_ratings from anon, authenticated;
grant select, insert, update, delete on table public.piece_ratings to authenticated;

create or replace function public.rating_unlock_code_is_valid(
  input_piece_slug text,
  input_unlock_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_slug text := lower(trim(coalesce(input_piece_slug, '')));
  clean_code text := upper(trim(coalesce(input_unlock_code, '')));
  code_row public.unlock_codes%rowtype;
  target_match boolean := false;
begin
  if clean_slug = '' or clean_code = '' then
    return false;
  end if;

  select *
  into code_row
  from public.unlock_codes
  where upper(code) = clean_code
    and coalesce(is_active, true) is true
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return false;
  end if;

  if code_row.piece_slug is not null and trim(code_row.piece_slug) <> '' then
    target_match := lower(trim(code_row.piece_slug)) = clean_slug;
  else
    select exists (
      select 1
      from public.unlock_code_targets
      where unlock_code_id = code_row.id::text
        and lower(trim(piece_slug)) = clean_slug
    )
    into target_match;
  end if;

  return target_match is true;
end;
$$;

revoke all on function public.rating_unlock_code_is_valid(text, text) from public, anon, authenticated;

create or replace function public.list_public_piece_rating_stats()
returns table (
  piece_slug text,
  rating_average numeric,
  rating_count bigint,
  rating_sum numeric,
  last_rated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    s.slug::text as piece_slug,
    coalesce(round(avg(r.rating_value)::numeric, 1), 0)::numeric as rating_average,
    count(r.id)::bigint as rating_count,
    coalesce(sum(r.rating_value), 0)::numeric as rating_sum,
    max(r.updated_at) as last_rated_at
  from public.piece_settings s
  left join public.piece_ratings r
    on r.piece_slug = s.slug
  where s.is_enabled = true
    and s.access_type = 'free'
  group by s.slug
  order by
    coalesce(round(avg(r.rating_value)::numeric, 1), 0) desc,
    count(r.id) desc,
    s.slug asc;
end;
$$;

grant execute on function public.list_public_piece_rating_stats()
to anon, authenticated;

create or replace function public.get_public_piece_rating_stats(
  input_piece_slug text,
  input_visitor_key text default null,
  input_unlock_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_slug text := lower(trim(coalesce(input_piece_slug, '')));
  clean_visitor text := left(trim(coalesce(input_visitor_key, '')), 256);
  clean_code text := upper(trim(coalesce(input_unlock_code, '')));
  selected_piece public.piece_settings%rowtype;
  can_show boolean := false;
  is_unlocked boolean := false;
  avg_rating numeric := 0;
  total_ratings bigint := 0;
  total_rating_sum numeric := 0;
  last_rating_at timestamptz := null;
  selected_user_rating numeric := null;
begin
  if clean_slug = '' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Missing piece slug.'
    );
  end if;

  select *
  into selected_piece
  from public.piece_settings
  where slug = clean_slug
    and is_enabled = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'Selected piece is not available.'
    );
  end if;

  is_unlocked := selected_piece.access_type = 'free'
    or public.rating_unlock_code_is_valid(clean_slug, clean_code);

  can_show := selected_piece.access_type = 'free' or is_unlocked is true;

  if can_show is not true then
    return jsonb_build_object(
      'ok', true,
      'piece_slug', clean_slug,
      'access_type', selected_piece.access_type,
      'requires_unlock', true,
      'unlocked', false,
      'show_ratings', false
    );
  end if;

  select
    coalesce(round(avg(r.rating_value)::numeric, 1), 0)::numeric,
    count(r.id)::bigint,
    coalesce(sum(r.rating_value), 0)::numeric,
    max(r.updated_at)
  into avg_rating, total_ratings, total_rating_sum, last_rating_at
  from public.piece_ratings r
  where r.piece_slug = clean_slug;

  if clean_visitor <> '' then
    select rating_value
    into selected_user_rating
    from public.piece_ratings
    where piece_slug = clean_slug
      and visitor_key = clean_visitor
    limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'piece_slug', clean_slug,
    'access_type', selected_piece.access_type,
    'requires_unlock', selected_piece.access_type = 'paid',
    'unlocked', is_unlocked,
    'show_ratings', true,
    'rating_average', avg_rating,
    'rating_count', total_ratings,
    'rating_sum', total_rating_sum,
    'last_rated_at', last_rating_at,
    'user_rating', selected_user_rating
  );
end;
$$;

grant execute on function public.get_public_piece_rating_stats(text, text, text)
to anon, authenticated;

create or replace function public.rate_public_piece(
  input_piece_slug text,
  input_visitor_key text,
  input_rating_value numeric,
  input_unlock_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_slug text := lower(trim(coalesce(input_piece_slug, '')));
  clean_visitor text := left(trim(coalesce(input_visitor_key, '')), 256);
  clean_code text := upper(trim(coalesce(input_unlock_code, '')));
  selected_piece public.piece_settings%rowtype;
  clean_rating numeric := round((coalesce(input_rating_value, 0) * 2)::numeric) / 2;
  stats_result jsonb;
begin
  if clean_slug = '' then
    return jsonb_build_object(
      'ok', false,
      'saved', false,
      'message', 'Missing piece slug.'
    );
  end if;

  if length(clean_visitor) < 8 then
    return jsonb_build_object(
      'ok', false,
      'saved', false,
      'message', 'Missing reader key.'
    );
  end if;

  if clean_rating < 0.5 or clean_rating > 5 or clean_rating <> input_rating_value then
    return jsonb_build_object(
      'ok', false,
      'saved', false,
      'message', 'Choose a rating from 0.5 to 5 stars.'
    );
  end if;

  select *
  into selected_piece
  from public.piece_settings
  where slug = clean_slug
    and is_enabled = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'saved', false,
      'message', 'Selected piece is not available.'
    );
  end if;

  if selected_piece.access_type = 'paid'
    and public.rating_unlock_code_is_valid(clean_slug, clean_code) is not true then
    return jsonb_build_object(
      'ok', false,
      'saved', false,
      'piece_slug', clean_slug,
      'access_type', selected_piece.access_type,
      'requires_unlock', true,
      'unlocked', false,
      'show_ratings', false,
      'message', 'Unlock this piece before rating.'
    );
  end if;

  insert into public.piece_ratings (
    piece_slug,
    visitor_key,
    rating_value
  )
  values (
    clean_slug,
    clean_visitor,
    clean_rating
  )
  on conflict (piece_slug, visitor_key) do update
  set
    rating_value = excluded.rating_value,
    updated_at = now();

  stats_result := public.get_public_piece_rating_stats(clean_slug, clean_visitor, clean_code);

  return stats_result || jsonb_build_object(
    'saved', true,
    'message', 'Rating saved.'
  );
end;
$$;

grant execute on function public.rate_public_piece(text, text, numeric, text)
to anon, authenticated;

notify pgrst, 'reload schema';

select
  'v39_piece_ratings_ready' as status,
  count(*) as enabled_pieces
from public.piece_settings
where is_enabled = true;

commit;

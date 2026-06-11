begin;

create table if not exists public.piece_full_text (
  slug text primary key references public.piece_settings(slug) on delete cascade,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table public.piece_full_text enable row level security;

revoke all on public.piece_full_text from anon, authenticated;

create or replace function public.admin_list_piece_text_status()
returns table (
  slug text,
  has_protected_text boolean,
  protected_characters integer,
  protected_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() is not true then
    raise exception 'Admin access required.';
  end if;

  return query
  select
    ps.slug,
    pft.slug is not null as has_protected_text,
    coalesce(length(pft.body), 0)::integer as protected_characters,
    pft.updated_at as protected_updated_at
  from public.piece_settings ps
  left join public.piece_full_text pft
    on pft.slug = ps.slug
  order by ps.category, ps.title;
end;
$$;

create or replace function public.admin_get_piece_full_text(input_piece_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_slug text := lower(trim(coalesce(input_piece_slug, '')));
  selected_text public.piece_full_text%rowtype;
begin
  if public.is_admin() is not true then
    raise exception 'Admin access required.';
  end if;

  if clean_slug = '' then
    raise exception 'Missing piece slug.';
  end if;

  if not exists (
    select 1
    from public.piece_settings
    where slug = clean_slug
  ) then
    raise exception 'Selected piece does not exist in piece settings.';
  end if;

  select *
  into selected_text
  from public.piece_full_text
  where slug = clean_slug
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'slug', clean_slug,
      'exists', false,
      'body', '',
      'characters', 0
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'slug', clean_slug,
    'exists', true,
    'body', selected_text.body,
    'characters', length(selected_text.body),
    'updated_at', selected_text.updated_at
  );
end;
$$;

create or replace function public.admin_save_piece_full_text(
  input_piece_slug text,
  input_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_slug text := lower(trim(coalesce(input_piece_slug, '')));
  clean_body text := coalesce(input_body, '');
begin
  if public.is_admin() is not true then
    raise exception 'Admin access required.';
  end if;

  if clean_slug = '' then
    raise exception 'Missing piece slug.';
  end if;

  if length(trim(clean_body)) < 20 then
    raise exception 'Protected full text must be at least 20 characters.';
  end if;

  if not exists (
    select 1
    from public.piece_settings
    where slug = clean_slug
  ) then
    raise exception 'Selected piece does not exist in piece settings.';
  end if;

  insert into public.piece_full_text (slug, body)
  values (clean_slug, clean_body)
  on conflict (slug) do update
  set body = excluded.body,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'slug', clean_slug,
    'characters', length(clean_body),
    'message', 'Protected full text saved.'
  );
end;
$$;

grant execute on function public.admin_list_piece_text_status() to authenticated;
grant execute on function public.admin_get_piece_full_text(text) to authenticated;
grant execute on function public.admin_save_piece_full_text(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
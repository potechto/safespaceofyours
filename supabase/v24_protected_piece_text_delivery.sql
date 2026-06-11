begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.piece_full_text (
  slug text primary key references public.piece_settings(slug) on delete cascade,
  body text not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_piece_full_text_updated_at on public.piece_full_text;
create trigger set_piece_full_text_updated_at
before update on public.piece_full_text
for each row
execute function public.set_updated_at();

alter table public.piece_full_text enable row level security;

revoke all on public.piece_full_text from anon, authenticated;

create or replace function public.get_public_piece_text(
  input_piece_slug text,
  input_unlock_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_slug text := lower(trim(coalesce(input_piece_slug, '')));
  clean_code text := upper(trim(coalesce(input_unlock_code, '')));
  selected_piece public.piece_settings%rowtype;
  selected_text public.piece_full_text%rowtype;
  code_row public.unlock_codes%rowtype;
  target_match boolean := false;
  unlocked boolean := false;
  safe_preview_limit integer := 700;
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

  select *
  into selected_text
  from public.piece_full_text
  where slug = clean_slug
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'Protected piece text is not ready yet.'
    );
  end if;

  safe_preview_limit := greatest(coalesce(selected_piece.preview_char_limit, 700), 120);

  if selected_piece.access_type = 'free' then
    return jsonb_build_object(
      'ok', true,
      'requires_unlock', false,
      'unlocked', true,
      'access_type', selected_piece.access_type,
      'full_text', selected_text.body,
      'preview_text', selected_text.body
    );
  end if;

  if clean_code <> '' then
    select *
    into code_row
    from public.unlock_codes
    where upper(code) = clean_code
      and coalesce(is_active, true) is true
      and (expires_at is null or expires_at > now())
    limit 1;

    if found then
      if code_row.piece_slug is not null and trim(code_row.piece_slug) <> '' then
        target_match := code_row.piece_slug = clean_slug;
      else
        select exists (
          select 1
          from public.unlock_code_targets
          where unlock_code_id = code_row.id::text
            and piece_slug = clean_slug
        )
        into target_match;
      end if;

      unlocked := target_match is true;
    end if;
  end if;

  if unlocked is true then
    return jsonb_build_object(
      'ok', true,
      'requires_unlock', true,
      'unlocked', true,
      'access_type', selected_piece.access_type,
      'full_text', selected_text.body,
      'preview_text', left(selected_text.body, safe_preview_limit)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'requires_unlock', true,
    'unlocked', false,
    'access_type', selected_piece.access_type,
    'preview_text', left(selected_text.body, safe_preview_limit),
    'message', 'Unlock this piece to read the full text.'
  );
end;
$$;

grant execute on function public.get_public_piece_text(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
-- @safespaceofyours V40 immutable confirmed piece ratings
-- Purpose:
-- 1. Ratings are saved only after the reader confirms.
-- 2. Once saved, a visitor/device rating for a piece is permanent.
-- 3. Backend prevents later updates even if frontend is bypassed.

begin;

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
  existing_rating numeric := null;
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

  select rating_value
  into existing_rating
  from public.piece_ratings
  where piece_slug = clean_slug
    and visitor_key = clean_visitor
  limit 1;

  if existing_rating is not null then
    stats_result := public.get_public_piece_rating_stats(clean_slug, clean_visitor, clean_code);

    return stats_result || jsonb_build_object(
      'saved', false,
      'already_saved', true,
      'message', 'Your rating is already saved permanently.'
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
  on conflict (piece_slug, visitor_key) do nothing;

  stats_result := public.get_public_piece_rating_stats(clean_slug, clean_visitor, clean_code);

  return stats_result || jsonb_build_object(
    'saved', true,
    'already_saved', false,
    'message', 'Rating saved permanently.'
  );
end;
$$;

grant execute on function public.rate_public_piece(text, text, numeric, text)
to anon, authenticated;

notify pgrst, 'reload schema';

select
  'v40_piece_ratings_immutable_ready' as status,
  count(*) as saved_ratings
from public.piece_ratings;

commit;

-- safespaceofsyours V17 unlock claim function
-- Run this in Supabase SQL Editor after V16.
-- It lets readers enter an unlock code on a paid piece page.
-- If valid, it increments used_count and returns success to the browser.

begin;

create or replace function public.claim_unlock_code(
  input_code text,
  input_piece_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  code_row public.unlock_codes%rowtype;
  normalized_code text := upper(trim(coalesce(input_code, '')));
  requested_slug text := trim(coalesce(input_piece_slug, ''));
  target_match boolean := false;
begin
  if normalized_code = '' or requested_slug = '' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Enter the unlock code for this piece.'
    );
  end if;

  select *
  into code_row
  from public.unlock_codes
  where upper(code) = normalized_code
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'Unlock code was not found.'
    );
  end if;

  if coalesce(code_row.is_active, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'message', 'This unlock code is no longer active.'
    );
  end if;

  if code_row.expires_at is not null and code_row.expires_at < now() then
    return jsonb_build_object(
      'ok', false,
      'message', 'This unlock code has expired.'
    );
  end if;

  if code_row.max_uses is not null and coalesce(code_row.used_count, 0) >= code_row.max_uses then
    return jsonb_build_object(
      'ok', false,
      'message', 'This unlock code has already reached its use limit.'
    );
  end if;

  if code_row.piece_slug is not null and trim(code_row.piece_slug) <> '' then
    target_match := code_row.piece_slug = requested_slug;
  else
    select exists (
      select 1
      from public.unlock_code_targets
      where unlock_code_id = code_row.id::text
        and piece_slug = requested_slug
    )
    into target_match;
  end if;

  if target_match is not true then
    return jsonb_build_object(
      'ok', false,
      'message', 'This unlock code is not for this piece.'
    );
  end if;

  update public.unlock_codes
  set used_count = coalesce(used_count, 0) + 1
  where id = code_row.id;

  return jsonb_build_object(
    'ok', true,
    'message', 'Piece unlocked. This browser will remember it.',
    'piece_slug', requested_slug
  );
end;
$$;

grant execute on function public.claim_unlock_code(text, text) to anon, authenticated;

commit;

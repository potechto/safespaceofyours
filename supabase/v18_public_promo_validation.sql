-- safespaceofsyours V18 public promo validation
-- Run this in Supabase SQL Editor after committing/deploying this patch.
-- This checks promo codes without exposing write access or consuming the code yet.

begin;

create or replace function public.validate_promo_code(
  input_code text,
  input_piece_slug text,
  input_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  promo_row public.promo_codes%rowtype;
  normalized_code text := upper(trim(coalesce(input_code, '')));
  requested_slug text := trim(coalesce(input_piece_slug, ''));
  base_amount numeric := greatest(coalesce(input_amount, 0), 0);
  discount_amount numeric := 0;
  final_amount numeric := 0;
  target_match boolean := false;
  qty_left integer;
begin
  if normalized_code = '' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Enter a promo code first.'
    );
  end if;

  select *
  into promo_row
  from public.promo_codes
  where upper(code) = normalized_code
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'Promo code not recognized.'
    );
  end if;

  if coalesce(promo_row.is_active, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'message', 'This promo code is currently disabled.'
    );
  end if;

  if promo_row.max_uses is not null and coalesce(promo_row.used_count, 0) >= promo_row.max_uses then
    return jsonb_build_object(
      'ok', false,
      'message', 'This promo code has already been used up.'
    );
  end if;

  if coalesce(promo_row.applies_to_all, false) is true then
    target_match := true;
  else
    select exists (
      select 1
      from public.promo_code_targets
      where promo_code_id = promo_row.id::text
        and piece_slug = requested_slug
    )
    into target_match;
  end if;

  if target_match is not true then
    return jsonb_build_object(
      'ok', false,
      'message', 'This promo code is not for the selected piece.'
    );
  end if;

  if promo_row.discount_type = 'percent' then
    discount_amount := base_amount * (coalesce(promo_row.discount_value, 0) / 100);
  else
    discount_amount := coalesce(promo_row.discount_value, 0);
  end if;

  discount_amount := least(greatest(discount_amount, 0), base_amount);
  final_amount := greatest(base_amount - discount_amount, 0);

  if promo_row.max_uses is null then
    qty_left := null;
  else
    qty_left := greatest(promo_row.max_uses - coalesce(promo_row.used_count, 0), 0);
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', promo_row.code,
    'discount_type', promo_row.discount_type,
    'discount_value', promo_row.discount_value,
    'discount_amount', discount_amount,
    'final_amount', final_amount,
    'qty_left', qty_left,
    'message', 'Promo code applied.'
  );
end;
$$;

grant execute on function public.validate_promo_code(text, text, numeric) to anon, authenticated;

commit;

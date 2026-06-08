-- safespaceofsyours V18B public promo list
-- Run this in Supabase SQL Editor after committing this patch.
-- Shows public promo codes without exposing admin write access.

begin;

create or replace function public.list_public_promo_codes()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(item order by item_created_at desc), '[]'::jsonb)
  from (
    select
      pc.created_at as item_created_at,
      jsonb_build_object(
        'id', pc.id::text,
        'code', pc.code,
        'discount_type', pc.discount_type,
        'discount_value', pc.discount_value,
        'created_at', pc.created_at,
        'is_active', pc.is_active,
        'max_uses', pc.max_uses,
        'used_count', coalesce(pc.used_count, 0),
        'qty_left',
          case
            when pc.max_uses is null then null
            else greatest(pc.max_uses - coalesce(pc.used_count, 0), 0)
          end,
        'status',
          case
            when coalesce(pc.is_active, false) is not true then 'Disabled'
            when pc.max_uses is not null and coalesce(pc.used_count, 0) >= pc.max_uses then 'Used up'
            else 'Active'
          end,
        'targets',
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'slug', pct.piece_slug,
                  'title', ps.title,
                  'category', ps.category
                )
                order by ps.title
              )
              from public.promo_code_targets pct
              left join public.piece_settings ps on ps.slug = pct.piece_slug
              where pct.promo_code_id = pc.id::text
            ),
            '[]'::jsonb
          )
      ) as item
    from public.promo_codes pc
    where coalesce(pc.is_public, true) is true
  ) listed;
$$;

grant execute on function public.list_public_promo_codes() to anon, authenticated;

commit;

-- V29 Public Space DB-backed notifications + new piece notice
-- Run this in Supabase SQL Editor after deploying the frontend patch.

begin;

alter table public.public_space_notifications
add column if not exists details jsonb not null default '{}'::jsonb;

create index if not exists public_space_notifications_recipient_read_created_idx
on public.public_space_notifications (recipient_user_id, is_read, created_at desc);

create unique index if not exists public_space_notifications_new_piece_unique_idx
on public.public_space_notifications (recipient_user_id, ((details->>'piece_slug')))
where type = 'admin'
  and details->>'kind' = 'new_piece'
  and details ? 'piece_slug';

create or replace function public.list_public_space_notifications(input_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'type', n.type,
          'is_read', n.is_read,
          'created_at', n.created_at,
          'post_id', n.post_id,
          'comment_id', n.comment_id,
          'details', coalesce(n.details, '{}'::jsonb),
          'actor', case
            when actor.id is null then null
            else jsonb_build_object(
              'id', actor.id,
              'username', actor.username,
              'is_admin', actor.is_admin,
              'is_premium', actor.is_premium,
              'badge_label', actor.badge_label,
              'badge_labels', coalesce(actor.badge_labels, array[]::text[])
            )
          end
        )
        order by n.created_at desc
      )
      from public.public_space_notifications n
      left join public.public_space_users actor on actor.id = n.actor_user_id
      where n.recipient_user_id = active_user.id
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.mark_public_space_notification_read(
  input_session_token text,
  input_notification_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  update public.public_space_notifications
  set is_read = true
  where id = input_notification_id
    and recipient_user_id = active_user.id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mark_public_space_notifications_read(input_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  update public.public_space_notifications
  set is_read = true
  where recipient_user_id = active_user.id
    and is_read is false;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_create_public_space_piece_notification(
  input_session_token text,
  input_piece_slug text,
  input_piece_title text,
  input_piece_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  clean_slug text := lower(trim(coalesce(input_piece_slug, '')));
  clean_title text := trim(coalesce(input_piece_title, ''));
  clean_url text := nullif(trim(coalesce(input_piece_url, '')), '');
  inserted_count integer := 0;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null or active_user.is_admin is not true then
    raise exception 'Admin only.';
  end if;

  if clean_slug = '' or clean_title = '' then
    raise exception 'Piece slug and title are required.';
  end if;

  insert into public.public_space_notifications (
    recipient_user_id,
    actor_user_id,
    type,
    details
  )
  select
    u.id,
    active_user.id,
    'admin',
    jsonb_build_object(
      'kind', 'new_piece',
      'piece_slug', clean_slug,
      'piece_title', clean_title,
      'url', coalesce(clean_url, 'poem.html?slug=' || clean_slug),
      'title', 'Admin uploaded a new piece',
      'message', 'Admin uploaded a new piece: ' || clean_title || '. Check it out.'
    )
  from public.public_space_users u
  where coalesce(u.is_disabled, false) is false
    and not exists (
      select 1
      from public.public_space_notifications existing
      where existing.recipient_user_id = u.id
        and existing.type = 'admin'
        and existing.details->>'kind' = 'new_piece'
        and existing.details->>'piece_slug' = clean_slug
    );

  get diagnostics inserted_count = row_count;

  return jsonb_build_object('ok', true, 'inserted_count', inserted_count);
end;
$$;

-- One-time seed for the current newly published piece.
insert into public.public_space_notifications (
  recipient_user_id,
  actor_user_id,
  type,
  details
)
select
  u.id,
  null,
  'admin',
  jsonb_build_object(
    'kind', 'new_piece',
    'piece_slug', 'lag',
    'piece_title', 'Love is a Gamble',
    'url', 'poem.html?slug=lag',
    'title', 'Admin uploaded a new piece',
    'message', 'Admin uploaded a new piece: Love is a Gamble. Check it out.'
  )
from public.public_space_users u
where coalesce(u.is_disabled, false) is false
  and not exists (
    select 1
    from public.public_space_notifications existing
    where existing.recipient_user_id = u.id
      and existing.type = 'admin'
      and existing.details->>'kind' = 'new_piece'
      and existing.details->>'piece_slug' = 'lag'
  );

grant execute on function public.list_public_space_notifications(text) to anon, authenticated;
grant execute on function public.mark_public_space_notification_read(text, uuid) to anon, authenticated;
grant execute on function public.mark_public_space_notifications_read(text) to anon, authenticated;
grant execute on function public.admin_create_public_space_piece_notification(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

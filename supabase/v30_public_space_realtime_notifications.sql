-- V30 Public Space realtime notification compatibility + backfill
-- Run this in Supabase SQL Editor after deploying Q63J-N V2.

begin;

alter table public.public_space_notifications
add column if not exists details jsonb not null default '{}'::jsonb;

create index if not exists public_space_notifications_recipient_read_created_v30_idx
on public.public_space_notifications (recipient_user_id, is_read, created_at desc);

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
              'is_admin', actor.is_admin
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

create or replace function public.toggle_public_space_heart(
  input_session_token text,
  input_post_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  target_post public.public_space_posts;
  deleted_count integer := 0;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  select *
  into target_post
  from public.public_space_posts
  where id = input_post_id
    and is_deleted is false;

  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  if target_post.is_hidden is true and coalesce(active_user.is_admin, false) is false then
    raise exception 'Post not found.';
  end if;

  delete from public.public_space_reactions
  where post_id = input_post_id
    and user_id = active_user.id
    and reaction_type = 'heart';

  get diagnostics deleted_count = row_count;

  if deleted_count = 0 then
    insert into public.public_space_reactions (post_id, user_id, reaction_type)
    values (input_post_id, active_user.id, 'heart');

    if target_post.user_id <> active_user.id then
      insert into public.public_space_notifications (
        recipient_user_id,
        actor_user_id,
        post_id,
        type,
        details
      )
      values (
        target_post.user_id,
        active_user.id,
        input_post_id,
        'heart',
        jsonb_build_object(
          'kind', 'heart',
          'title', '@' || active_user.username || ' reacted to your post',
          'message', '@' || active_user.username || ' reacted to your post.',
          'post_id', input_post_id
        )
      );
    end if;
  end if;

  return jsonb_build_object('ok', true, 'hearted', deleted_count = 0);
end;
$$;

create or replace function public.create_public_space_comment(
  input_session_token text,
  input_post_id uuid,
  input_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  target_post public.public_space_posts;
  new_comment public.public_space_comments;
  clean_body text := trim(coalesce(input_body, ''));
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  if char_length(clean_body) < 1 or char_length(clean_body) > 500 then
    raise exception 'Comment must be 1 to 500 characters.';
  end if;

  select *
  into target_post
  from public.public_space_posts
  where id = input_post_id
    and is_deleted is false;

  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  if target_post.is_hidden is true and coalesce(active_user.is_admin, false) is false then
    raise exception 'Post not found.';
  end if;

  if target_post.visibility <> 'public'
    and target_post.user_id <> active_user.id
    and coalesce(active_user.is_admin, false) is false then
    raise exception 'Post not found.';
  end if;

  insert into public.public_space_comments (post_id, user_id, body)
  values (input_post_id, active_user.id, clean_body)
  returning * into new_comment;

  if target_post.user_id <> active_user.id then
    insert into public.public_space_notifications (
      recipient_user_id,
      actor_user_id,
      post_id,
      comment_id,
      type,
      details
    )
    values (
      target_post.user_id,
      active_user.id,
      input_post_id,
      new_comment.id,
      'comment',
      jsonb_build_object(
        'kind', 'comment',
        'title', '@' || active_user.username || ' commented on your post',
        'message', '@' || active_user.username || ' commented: ' || left(clean_body, 120),
        'post_id', input_post_id,
        'comment_id', new_comment.id
      )
    );
  end if;

  return jsonb_build_object('ok', true, 'comment_id', new_comment.id);
end;
$$;

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
grant execute on function public.toggle_public_space_heart(text, uuid) to anon, authenticated;
grant execute on function public.create_public_space_comment(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select
  'v30_public_space_realtime_notifications_applied' as status,
  count(*) filter (
    where type = 'admin'
      and details->>'kind' = 'new_piece'
      and details->>'piece_slug' = 'lag'
  ) as love_is_a_gamble_notifications,
  count(*) filter (where is_read is false) as unread_notifications
from public.public_space_notifications;

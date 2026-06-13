-- V32 public space comment limits and edit window
-- Enforces one active comment per user per post and adds 30-minute owner editing.
-- Apply this in Supabase SQL Editor after Q64A frontend is deployed.

begin;

with ranked_active_comments as (
  select
    id,
    row_number() over (
      partition by post_id, user_id
      order by created_at desc, updated_at desc, id desc
    ) as rn
  from public.public_space_comments
  where is_deleted is false
)
update public.public_space_comments c
set is_deleted = true,
    updated_at = now()
from ranked_active_comments ranked
where c.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists public_space_comments_one_active_user_post_idx
on public.public_space_comments (post_id, user_id)
where is_deleted is false;

create or replace function public.list_public_space_comments(
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
begin
  active_user := public.public_space_current_user(input_session_token);

  select *
  into target_post
  from public.public_space_posts
  where id = input_post_id
    and is_deleted is false;

  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  if coalesce(target_post.visibility, 'public') <> 'public'
    and (
      active_user.id is null
      or (
        active_user.id <> target_post.user_id
        and coalesce(active_user.is_admin, false) is false
      )
    ) then
    raise exception 'Not allowed.';
  end if;

  if target_post.is_hidden is true and coalesce(active_user.is_admin, false) is false then
    raise exception 'Post not found.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,

          'user_id', c.user_id,
          'post_id', c.post_id,
          'body', c.body,
          'is_hidden', c.is_hidden,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'author', jsonb_build_object(
            'id', u.id,
            'username', u.username,
            'is_premium', u.is_premium,
            'badge_label', u.badge_label,
            'is_admin', u.is_admin
          ),
          'can_manage', (
            active_user.id = c.user_id
            or coalesce(active_user.is_admin, false)
          ),
          'can_hide', coalesce(active_user.is_admin, false),
          'can_edit', (
            active_user.id = c.user_id
            and c.is_hidden is false
            and c.is_deleted is false
            and c.created_at >= now() - interval '30 minutes'
          )
        )
        order by c.created_at asc
      )
      from public.public_space_comments c
      join public.public_space_users u on u.id = c.user_id
      where c.post_id = input_post_id
        and c.is_deleted is false
        and (
          c.is_hidden is false
          or coalesce(active_user.is_admin, false)
        )
    ),
    '[]'::jsonb
  );
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
  if exists (
    select 1
    from public.public_space_comments c
    where c.post_id = input_post_id
      and c.user_id = active_user.id
      and c.is_deleted is false
  ) then
    raise exception 'You already commented on this post. Delete your comment before adding another.';
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

create or replace function public.edit_public_space_comment(
  input_session_token text,
  input_comment_id uuid,
  input_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  target_comment public.public_space_comments;
  target_post public.public_space_posts;
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
  into target_comment
  from public.public_space_comments
  where id = input_comment_id
    and is_deleted is false;

  if target_comment.id is null then
    raise exception 'Comment not found.';
  end if;

  if target_comment.user_id <> active_user.id then
    raise exception 'Not allowed.';
  end if;

  if target_comment.is_hidden is true then
    raise exception 'Hidden comments cannot be edited.';
  end if;

  if target_comment.created_at < now() - interval '30 minutes' then
    raise exception 'Comment edit window has expired.';
  end if;

  select *
  into target_post
  from public.public_space_posts
  where id = target_comment.post_id
    and is_deleted is false;

  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  update public.public_space_comments
  set body = clean_body,
      updated_at = now()
  where id = input_comment_id
    and user_id = active_user.id
    and is_deleted is false
    and is_hidden is false
    and created_at >= now() - interval '30 minutes';

  if not found then
    raise exception 'Comment could not be updated.';
  end if;

  return jsonb_build_object('ok', true, 'comment_id', input_comment_id);
end;
$$;

grant execute on function public.list_public_space_comments(text, uuid) to anon, authenticated;
grant execute on function public.create_public_space_comment(text, uuid, text) to anon, authenticated;
grant execute on function public.edit_public_space_comment(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select
  'v32_public_space_comment_limits_edit_applied' as status,
  count(*) filter (where is_deleted is false) as active_comments
from public.public_space_comments;

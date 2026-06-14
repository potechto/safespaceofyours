-- V43 Pause Public Space comment replies
-- Restores stable flat comments behavior while preserving reply data.

begin;

alter table public.public_space_comments
  add column if not exists parent_comment_id uuid references public.public_space_comments(id) on delete cascade;

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

  if target_post.visibility <> 'public'
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
          'is_deleted', c.is_deleted,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'author', jsonb_build_object(
            'id', u.id,
            'username', u.username,
            'badge_label', u.badge_label,
            'is_admin', u.is_admin,
            'is_premium', u.is_premium,
            'last_seen_at', u.last_seen_at,
            'is_active', public.public_space_is_active(u.last_seen_at)
          ),
          'can_manage', (
            active_user.id = c.user_id
            or coalesce(active_user.is_admin, false)
          ),
          'can_hide', coalesce(active_user.is_admin, false),
          'can_edit', (
            coalesce(active_user.is_admin, false)
            or (
              active_user.id = c.user_id
              and c.is_hidden is false
              and c.is_deleted is false
              and c.created_at >= now() - interval '30 minutes'
            )
          )
        )
        order by c.created_at asc
      )
      from public.public_space_comments c
      join public.public_space_users u on u.id = c.user_id
      where c.post_id = input_post_id
        and c.parent_comment_id is null
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
  input_body text,
  input_parent_comment_id uuid default null
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
  if input_parent_comment_id is not null then
    raise exception 'Comment replies are temporarily paused while the reply layout is being improved.';
  end if;

  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  if coalesce(active_user.is_disabled, false) is true then
    raise exception 'Account disabled.';
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
      and c.parent_comment_id is null
      and c.is_deleted is false
  ) then
    raise exception 'You already commented on this post. Delete your comment before adding another.';
  end if;

  insert into public.public_space_comments (
    post_id,
    user_id,
    parent_comment_id,
    body
  )
  values (
    input_post_id,
    active_user.id,
    null,
    clean_body
  )
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

  return jsonb_build_object(
    'ok', true,
    'comment_id', new_comment.id,
    'parent_comment_id', null
  );
end;
$$;

create or replace function public.create_public_space_comment(
  input_session_token text,
  input_post_id uuid,
  input_body text
)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select public.create_public_space_comment(input_session_token, input_post_id, input_body, null::uuid);
$$;

grant execute on function public.list_public_space_comments(text, uuid) to anon, authenticated;
grant execute on function public.create_public_space_comment(text, uuid, text) to anon, authenticated;
grant execute on function public.create_public_space_comment(text, uuid, text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

select
  'v43_public_space_comment_replies_paused' as status,
  count(*) filter (where parent_comment_id is null and is_deleted is false) as visible_root_comments,
  count(*) filter (where parent_comment_id is not null and is_deleted is false) as hidden_replies
from public.public_space_comments;

commit;

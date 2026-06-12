-- V27 Public Space comments UI RPCs
-- Run this in Supabase SQL Editor before testing real comment create/delete/hide actions.

begin;

create table if not exists public.public_space_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.public_space_posts(id) on delete cascade,
  user_id uuid not null references public.public_space_users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  is_hidden boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_space_comments_post_created_idx
on public.public_space_comments (post_id, created_at)
where is_deleted is false;

create table if not exists public.public_space_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.public_space_users(id) on delete cascade,
  actor_user_id uuid references public.public_space_users(id) on delete set null,
  post_id uuid references public.public_space_posts(id) on delete cascade,
  comment_id uuid references public.public_space_comments(id) on delete cascade,
  type text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists public_space_notifications_recipient_created_idx
on public.public_space_notifications (recipient_user_id, created_at desc);

create table if not exists public.public_space_moderation_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.public_space_users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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
    and (active_user.id is null or (active_user.id <> target_post.user_id and coalesce(active_user.is_admin, false) is false)) then
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
            'badge_labels', coalesce(u.badge_labels, array[]::text[]),
            'is_admin', u.is_admin
          ),
          'can_manage', (
            active_user.id = c.user_id or coalesce(active_user.is_admin, false)
          ),
          'can_hide', coalesce(active_user.is_admin, false)
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

  if coalesce(target_post.visibility, 'public') <> 'public'
    and active_user.id <> target_post.user_id
    and coalesce(active_user.is_admin, false) is false then
    raise exception 'Not allowed.';
  end if;

  insert into public.public_space_comments (post_id, user_id, body)
  values (input_post_id, active_user.id, clean_body)
  returning * into new_comment;

  if target_post.user_id <> active_user.id then
    insert into public.public_space_notifications (recipient_user_id, actor_user_id, post_id, comment_id, type)
    values (target_post.user_id, active_user.id, input_post_id, new_comment.id, 'comment');
  end if;

  return jsonb_build_object('ok', true, 'comment_id', new_comment.id);
end;
$$;

create or replace function public.delete_public_space_comment(
  input_session_token text,
  input_comment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  target_comment public.public_space_comments;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  select *
  into target_comment
  from public.public_space_comments
  where id = input_comment_id
    and is_deleted is false;

  if target_comment.id is null then
    raise exception 'Comment not found.';
  end if;

  if active_user.id <> target_comment.user_id and coalesce(active_user.is_admin, false) is false then
    raise exception 'Not allowed.';
  end if;

  update public.public_space_comments
  set is_deleted = true,
      updated_at = now()
  where id = input_comment_id;

  if coalesce(active_user.is_admin, false) then
    insert into public.public_space_moderation_log (admin_user_id, action, target_type, target_id, details)
    values (active_user.id, 'delete_comment', 'comment', input_comment_id, '{}'::jsonb);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_public_space_comment_hidden(
  input_session_token text,
  input_comment_id uuid,
  input_is_hidden boolean
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

  if active_user.id is null or active_user.is_admin is not true then
    raise exception 'Admin only.';
  end if;

  update public.public_space_comments
  set is_hidden = input_is_hidden,
      updated_at = now()
  where id = input_comment_id
    and is_deleted is false;

  insert into public.public_space_moderation_log (admin_user_id, action, target_type, target_id, details)
  values (
    active_user.id,
    case when input_is_hidden then 'hide_comment' else 'unhide_comment' end,
    'comment',
    input_comment_id,
    jsonb_build_object('is_hidden', input_is_hidden)
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.list_public_space_comments(text, uuid) to anon, authenticated;
grant execute on function public.create_public_space_comment(text, uuid, text) to anon, authenticated;
grant execute on function public.delete_public_space_comment(text, uuid) to anon, authenticated;
grant execute on function public.admin_set_public_space_comment_hidden(text, uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

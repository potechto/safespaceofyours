-- V47 Re-enable Public Space comment replies phase 1
-- Phase 1: root comments + nested replies, one reply per user per root comment.
-- Stickers are intentionally not included yet.

begin;

alter table public.public_space_comments
  add column if not exists parent_comment_id uuid references public.public_space_comments(id) on delete cascade;

create index if not exists public_space_comments_parent_comment_id_idx
on public.public_space_comments (parent_comment_id);

drop index if exists public.public_space_comments_one_active_user_post_idx;
drop index if exists public.public_space_comments_one_active_user_post_root_idx;
drop index if exists public.public_space_comment_replies_one_active_user_parent_idx;

create unique index public_space_comments_one_active_user_post_root_idx
on public.public_space_comments (post_id, user_id)
where is_deleted is false
  and parent_comment_id is null;

create unique index public_space_comment_replies_one_active_user_parent_idx
on public.public_space_comments (parent_comment_id, user_id)
where is_deleted is false
  and parent_comment_id is not null;

create or replace function public.public_space_comment_reactions_payload(
  input_comment_id uuid,
  input_user_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'emoji', grouped.emoji,
          'count', grouped.reaction_count,
          'reacted_by_me', grouped.reacted_by_me
        )
        order by grouped.reaction_count desc, grouped.emoji asc
      )
      from (
        select
          r.emoji,
          count(*)::int as reaction_count,
          coalesce(bool_or(r.user_id = input_user_id), false) as reacted_by_me
        from public.public_space_comment_reactions r
        where r.comment_id = input_comment_id
        group by r.emoji
      ) grouped
    ),
    '[]'::jsonb
  );
$$;

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
          'parent_comment_id', c.parent_comment_id,
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
          'reply_count', (
            select count(*)::int
            from public.public_space_comments r_count
            where r_count.parent_comment_id = c.id
              and r_count.is_deleted is false
              and (
                r_count.is_hidden is false
                or coalesce(active_user.is_admin, false)
              )
          ),
          'replied_by_me', exists (
            select 1
            from public.public_space_comments my_reply
            where my_reply.parent_comment_id = c.id
              and my_reply.user_id = active_user.id
              and my_reply.is_deleted is false
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
          ),
          'can_reply', (
            active_user.id is not null
            and c.parent_comment_id is null
            and c.user_id <> active_user.id
            and c.is_hidden is false
            and c.is_deleted is false
            and not exists (
              select 1
              from public.public_space_comments existing_reply
              where existing_reply.parent_comment_id = c.id
                and existing_reply.user_id = active_user.id
                and existing_reply.is_deleted is false
            )
          ),
          'reactions', public.public_space_comment_reactions_payload(c.id, active_user.id),
          'replies', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', r.id,
                  'user_id', r.user_id,
                  'post_id', r.post_id,
                  'parent_comment_id', r.parent_comment_id,
                  'body', r.body,
                  'is_hidden', r.is_hidden,
                  'is_deleted', r.is_deleted,
                  'created_at', r.created_at,
                  'updated_at', r.updated_at,
                  'author', jsonb_build_object(
                    'id', ru.id,
                    'username', ru.username,
                    'badge_label', ru.badge_label,
                    'is_admin', ru.is_admin,
                    'is_premium', ru.is_premium,
                    'last_seen_at', ru.last_seen_at,
                    'is_active', public.public_space_is_active(ru.last_seen_at)
                  ),
                  'can_manage', (
                    active_user.id = r.user_id
                    or coalesce(active_user.is_admin, false)
                  ),
                  'can_hide', coalesce(active_user.is_admin, false),
                  'can_edit', (
                    coalesce(active_user.is_admin, false)
                    or (
                      active_user.id = r.user_id
                      and r.is_hidden is false
                      and r.is_deleted is false
                      and r.created_at >= now() - interval '30 minutes'
                    )
                  ),
                  'can_reply', false,
                  'reactions', '[]'::jsonb
                )
                order by r.created_at asc
              )
              from public.public_space_comments r
              join public.public_space_users ru on ru.id = r.user_id
              where r.parent_comment_id = c.id
                and r.is_deleted is false
                and (
                  r.is_hidden is false
                  or coalesce(active_user.is_admin, false)
                )
            ),
            '[]'::jsonb
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

drop function if exists public.create_public_space_comment(text, uuid, text);
drop function if exists public.create_public_space_comment(text, uuid, text, uuid);

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
  parent_comment public.public_space_comments;
  new_comment public.public_space_comments;
  clean_body text := trim(coalesce(input_body, ''));
begin
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

  if target_post.visibility <> 'public'
    and target_post.user_id <> active_user.id
    and coalesce(active_user.is_admin, false) is false then
    raise exception 'Post not found.';
  end if;

  if target_post.is_hidden is true and coalesce(active_user.is_admin, false) is false then
    raise exception 'Post not found.';
  end if;

  if input_parent_comment_id is not null then
    select *
    into parent_comment
    from public.public_space_comments
    where id = input_parent_comment_id
      and post_id = input_post_id
      and parent_comment_id is null
      and is_deleted is false
    limit 1;

    if parent_comment.id is null then
      raise exception 'Comment to reply to was not found.';
    end if;

    if parent_comment.is_hidden is true and coalesce(active_user.is_admin, false) is false then
      raise exception 'Comment to reply to was not found.';
    end if;

    if parent_comment.user_id = active_user.id then
      raise exception 'You cannot reply to your own comment.';
    end if;

    if exists (
      select 1
      from public.public_space_comments c
      where c.parent_comment_id = input_parent_comment_id
        and c.user_id = active_user.id
        and c.is_deleted is false
    ) then
      raise exception 'You already replied to this comment. Delete your reply before adding another.';
    end if;
  else
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
    input_parent_comment_id,
    clean_body
  )
  returning * into new_comment;

  if input_parent_comment_id is not null then
    if parent_comment.user_id <> active_user.id then
      insert into public.public_space_notifications (
        recipient_user_id,
        actor_user_id,
        post_id,
        comment_id,
        type,
        details
      )
      values (
        parent_comment.user_id,
        active_user.id,
        input_post_id,
        new_comment.id,
        'comment',
        jsonb_build_object(
          'kind', 'reply',
          'title', '@' || active_user.username || ' replied to your comment',
          'message', '@' || active_user.username || ' replied: ' || left(clean_body, 120),
          'post_id', input_post_id,
          'comment_id', new_comment.id,
          'parent_comment_id', input_parent_comment_id
        )
      );
    end if;
  elsif target_post.user_id <> active_user.id then
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
    'parent_comment_id', new_comment.parent_comment_id
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
grant execute on function public.public_space_comment_reactions_payload(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

select
  'v47_comment_replies_phase1_ready' as status,
  count(*) filter (where parent_comment_id is null and is_deleted is false) as root_comments,
  count(*) filter (where parent_comment_id is not null and is_deleted is false) as replies
from public.public_space_comments;

commit;

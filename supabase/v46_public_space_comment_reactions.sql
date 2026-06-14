-- V46 Public Space comment emoji reactions
-- Discord-style comment reactions:
-- same emoji stacks counts, different emojis render as separate chips.
-- replies remain paused; reactions are for visible comments only.

begin;

create table if not exists public.public_space_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.public_space_comments(id) on delete cascade,
  user_id uuid not null references public.public_space_users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_space_comment_reactions_emoji_check check (
    emoji in ('❤️', '😂', '😮', '😢', '🙏', '🔥', '✨', '🌻')
  )
);

create unique index if not exists public_space_comment_reactions_unique_user_emoji
on public.public_space_comment_reactions (comment_id, user_id, emoji);

create index if not exists public_space_comment_reactions_comment_idx
on public.public_space_comment_reactions (comment_id);

alter table public.public_space_comment_reactions enable row level security;

drop policy if exists "Admins can read comment reactions" on public.public_space_comment_reactions;
create policy "Admins can read comment reactions"
on public.public_space_comment_reactions
for select
using (
  exists (
    select 1
    from public.public_space_users u
    where u.id = public.public_space_comment_reactions.user_id
  )
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
          ),
          'reactions', coalesce(
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
                  bool_or(r.user_id = active_user.id) as reacted_by_me
                from public.public_space_comment_reactions r
                where r.comment_id = c.id
                group by r.emoji
              ) grouped
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

create or replace function public.toggle_public_space_comment_reaction(
  input_session_token text,
  input_comment_id uuid,
  input_emoji text
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
  clean_emoji text := trim(coalesce(input_emoji, ''));
  removed_count integer := 0;
  did_remove boolean := false;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  if coalesce(active_user.is_disabled, false) is true then
    raise exception 'Account disabled.';
  end if;

  if clean_emoji not in ('❤️', '😂', '😮', '😢', '🙏', '🔥', '✨', '🌻') then
    raise exception 'Unsupported reaction.';
  end if;

  select *
  into target_comment
  from public.public_space_comments
  where id = input_comment_id
    and is_deleted is false;

  if target_comment.id is null then
    raise exception 'Comment not found.';
  end if;

  if target_comment.parent_comment_id is not null then
    raise exception 'Reply reactions are paused for now.';
  end if;

  select *
  into target_post
  from public.public_space_posts
  where id = target_comment.post_id
    and is_deleted is false;

  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  if target_post.is_hidden is true and coalesce(active_user.is_admin, false) is false then
    raise exception 'Post not found.';
  end if;

  if target_comment.is_hidden is true and coalesce(active_user.is_admin, false) is false then
    raise exception 'Comment not found.';
  end if;

  if target_post.visibility <> 'public'
    and target_post.user_id <> active_user.id
    and coalesce(active_user.is_admin, false) is false then
    raise exception 'Post not found.';
  end if;

  delete from public.public_space_comment_reactions r
  where r.comment_id = input_comment_id
    and r.user_id = active_user.id
    and r.emoji = clean_emoji;

  get diagnostics removed_count = row_count;
  did_remove := removed_count > 0;

  if did_remove is false then
    insert into public.public_space_comment_reactions (
      comment_id,
      user_id,
      emoji
    )
    values (
      input_comment_id,
      active_user.id,
      clean_emoji
    )
    on conflict (comment_id, user_id, emoji)
    do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'comment_id', input_comment_id,
    'emoji', clean_emoji,
    'removed', did_remove
  );
end;
$$;

grant execute on function public.list_public_space_comments(text, uuid) to anon, authenticated;
grant execute on function public.toggle_public_space_comment_reaction(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';

select
  'v46_public_space_comment_reactions_ready' as status,
  count(*) as total_comment_reactions
from public.public_space_comment_reactions;

commit;

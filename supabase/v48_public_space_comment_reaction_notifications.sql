-- V48 Public Space comment reaction notifications
-- Adds notifications when a user reacts to another user's comment.
-- Existing comments/reactions remain unchanged.

begin;

alter table public.public_space_notifications
add column if not exists details jsonb not null default '{}'::jsonb;

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

    if target_comment.user_id <> active_user.id then
      insert into public.public_space_notifications (
        recipient_user_id,
        actor_user_id,
        post_id,
        comment_id,
        type,
        details
      )
      values (
        target_comment.user_id,
        active_user.id,
        target_comment.post_id,
        input_comment_id,
        'comment_reaction',
        jsonb_build_object(
          'kind', 'comment_reaction',
          'emoji', clean_emoji,
          'title', '@' || active_user.username || ' reacted to your comment',
          'message', '@' || active_user.username || ' reacted ' || clean_emoji || ' to your comment.',
          'post_id', target_comment.post_id,
          'comment_id', input_comment_id
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'comment_id', input_comment_id,
    'emoji', clean_emoji,
    'removed', did_remove
  );
end;
$$;

grant execute on function public.toggle_public_space_comment_reaction(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select 'v48_public_space_comment_reaction_notifications_applied' as status;
